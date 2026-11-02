import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AgentesIA from "./AgentesIA";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { nome: "Juliana Araújo" },
    user: null,
    hasPermission: () => true,
    signOut: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: { message: "indisponível" } }) } },
}));
vi.mock("./hooks/useAgentesIA", () => ({
  chamarEscritorio: vi.fn(),
  LABEL_STATUS_EXECUCAO: {},
  useAgentesIA: () => ({
    agentes: [{ id: "a1", slug: "rafael", nome: "Rafael", ativo: true, sala: "operacional", executor: "analista_operacional", descricao: "Análise de CNIS", exige_aprovacao: true }],
    execucoes: [],
    consultas: [],
    tokens: { limite: 50000, usados: 0, reservados: 0, disponiveis: 50000 },
    atualizadoEm: null,
    passos: [],
    mensagens: [],
    operacaoDjen: null,
    pendentesAprovacao: [],
    loading: false,
    error: null,
    recarregar: vi.fn(),
    disparar: vi.fn(),
    decidir: vi.fn(),
  }),
}));
const abrir = (url = "/escritorio") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/escritorio/*" element={<AgentesIA />} />
      </Routes>
    </MemoryRouter>,
  );
describe("Escritório Virtual unificado", () => {
  it("abre o escritório isométrico por padrão, com controles e chat real", () => {
    abrir();
    expect(screen.getByRole("region", { name: "Escritório isométrico" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Controles do escritório" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Isométrico/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("log")).toHaveTextContent("Nenhuma conversa ou execução registrada ainda.");
    expect(screen.queryByText("Consumo OpenAI hoje")).not.toBeInTheDocument();
  });
  it("endereços antigos do 3D e do isométrico abrem o mesmo Escritório Virtual", () => {
    abrir("/escritorio/planta");
    expect(screen.getByRole("main", { name: "Escritório Virtual" })).toBeInTheDocument();
  });
  it("a barra do escritório não repete módulos do JAS", () => {
    abrir();
    const barra = screen.getByRole("navigation", { name: "Áreas do escritório" });
    for (const nome of ["Escritório", "Agentes", "Missões", "Aprovações", "Conversas", "Comando", "Operação"])
      expect(barra).toHaveTextContent(nome);
    for (const nome of ["Processos e Clientes", "Agenda e Prazos", "Publicações DJEN", "Financeiro", "Marketing", "Documentos"])
      expect(screen.queryByRole("link", { name: nome })).not.toBeInTheDocument();
  });
  it("modo imersivo esconde a barra e Esc volta", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Imersivo/ }));
    expect(screen.queryByRole("navigation", { name: "Áreas do escritório" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("navigation", { name: "Áreas do escritório" })).toBeInTheDocument();
  });
  it("fecha e reabre o chat lateral", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Fechar painel de conversas" }));
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Conversas/ }));
    expect(screen.getByRole("log")).toBeInTheDocument();
  });
  it("navega para conversas completas pela barra", () => {
    abrir();
    fireEvent.click(screen.getByRole("link", { name: "Conversas" }));
    expect(screen.getByRole("main", { name: "Conversas" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Escritório isométrico" })).not.toBeInTheDocument();
  });
  it("abre operação diretamente por URL e mantém os diagnósticos nessa área", () => {
    abrir("/escritorio/operacao");
    expect(screen.getByText("Consumo OpenAI hoje")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Escritório isométrico" })).not.toBeInTheDocument();
  });
  it("oferece entregas sem pendências e retorno explícito ao JAS", () => {
    abrir("/escritorio/entregas");
    expect(screen.getByText("Entregas em dia")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao sistema JAS" })).toHaveAttribute("href", "/");
  });
  it("Central de Agentes: gestão individual e contratação", () => {
    abrir("/escritorio/agentes");
    expect(screen.getByRole("region", { name: "Agente Rafael" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Instruções e perfil" })).toBeInTheDocument();
    expect(screen.getByText("Análise de CNIS")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Contratar agente/ }));
    expect(screen.getByRole("region", { name: "Editor de agentes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do agente")).toBeInTheDocument();
  });
});
