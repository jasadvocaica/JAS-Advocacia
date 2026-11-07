import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AgentesMarketing from "./AgentesMarketing";
const mock = vi.hoisted(() => ({ gestor: true, rpc: vi.fn(), motor: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "usuario-teste" }, isGestor: mock.gestor }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
vi.mock("@/pages/agentes-ia/escritorio/missoes/motor", () => ({ chamarMotor: mock.motor }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const agente = { id: "agente-teste", nome: "Camila", descricao: "Conteúdo", ativo: true, executor: "analista_operacional", ferramentas: ["zernio_indicadores"] };
function abrir() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AgentesMarketing /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  cleanup(); mock.gestor = true; mock.rpc.mockReset(); mock.motor.mockReset();
  mock.rpc.mockResolvedValue({ data: [agente], error: null }); mock.motor.mockResolvedValue({ missao_id: "missao-teste" });
});
describe("equipe real do Marketing", () => {
  it("mostra agentes cadastrados e solicita uma missão pelo motor existente", async () => {
    abrir(); expect(await screen.findByText("Camila")).toBeInTheDocument();
    expect(screen.queryByText("Nina")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Solicitar entrega" }));
    fireEvent.change(screen.getByLabelText("O que precisa ser feito"), { target: { value: "Conferir indicadores da conta de teste em novembro" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar missão" }));
    await waitFor(() => expect(mock.motor).toHaveBeenCalledTimes(1));
    expect(mock.motor).toHaveBeenCalledWith(expect.objectContaining({ acao: "criar_missao", agente_id: agente.id, prioridade: 3, chave: expect.stringMatching(/^marketing-/) }));
  });
  it("não oferece criação de missão para quem apenas visualiza", async () => {
    mock.gestor = false; abrir(); await screen.findByText("Camila");
    expect(screen.queryByRole("button", { name: "Solicitar entrega" })).not.toBeInTheDocument();
  });
  it("não permite solicitar execução de agente desativado", async () => {
    mock.rpc.mockResolvedValue({ data: [{ ...agente, ativo: false }], error: null }); abrir();
    expect(await screen.findByRole("button", { name: "Solicitar entrega" })).toBeDisabled();
  });
  it("mostra falha de permissão sem apresentar uma equipe fictícia", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error("Sem permissão") }); abrir();
    expect(await screen.findByRole("alert")).toHaveTextContent("confira seu acesso");
    expect(screen.queryByText("Camila")).not.toBeInTheDocument();
  });
});
