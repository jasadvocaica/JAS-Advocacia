import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { supabase } from "@/integrations/supabase/client";
import CentralComando from "./CentralComando";
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
const tarefa = {
  id: "1",
  estado: "queued",
  arquivo: "clara-m1-ficticio.txt",
  hash: "a".repeat(64),
  candidato: null,
  evidencias: null,
  pendencias: [],
  numero_cnj: null,
  cliente_id: null,
  tentativas: 1,
  tokens_entrada: 0,
  tokens_saida: 0,
  custo_estimado_usd: 0,
  erro: null,
  eventos: [],
  criado_em: "2026-11-01T18:00:00Z",
  atualizado_em: "2026-11-01T18:00:00Z",
};
beforeEach(() => {
  localStorage.clear();
  vi.mocked(supabase.functions.invoke).mockReset();
});
describe("Central de Comando M1", () => {
  it("informa homologação não instalada e não permite execução", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("Não instalada"),
    } as never);
    render(<CentralComando />);
    await screen.findByText(/ainda não está habilitada/);
    expect(
      screen.getByRole("button", { name: "Enviar comando" }),
    ).toBeDisabled();
  });
  it("encaminha o TXT para Clara sem selecionar agente e aguarda aprovação", async () => {
    vi.mocked(supabase.functions.invoke).mockImplementation(
      async (_fn, options) => {
        const body = options?.body as Record<string, unknown>;
        const data =
          body.acao === "status"
            ? { habilitado: true }
            : body.acao === "receber"
              ? { tarefa }
              : {
                  tarefa: {
                    ...tarefa,
                    estado: "awaiting_approval",
                    candidato: { nome: "Cliente Ficticia Clara Teste" },
                    evidencias: {
                      nome: "Cliente: Cliente Ficticia Clara Teste",
                    },
                    tokens_entrada: 100,
                    tokens_saida: 50,
                  },
                };
        return { data, error: null } as never;
      },
    );
    render(<CentralComando />);
    fireEvent.click(
      screen.getByRole("button", { name: "Usar exemplo fictício" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enviar comando" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar comando" }));
    await screen.findByRole("button", { name: "Aprovar cadastro fictício" });
    expect(
      screen.getByText("Cliente Ficticia Clara Teste"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Conversar com")).not.toBeInTheDocument();
    expect(
      vi
        .mocked(supabase.functions.invoke)
        .mock.calls.filter(
          ([, o]) => (o?.body as Record<string, unknown>).acao === "aprovar",
        ),
    ).toHaveLength(0);
  });
  it("não chama IA novamente quando o mesmo TXT já está concluído", async () => {
    vi.mocked(supabase.functions.invoke).mockImplementation(
      async (_fn, options) =>
        ({
          data:
            (options?.body as Record<string, unknown>).acao === "status"
              ? { habilitado: true }
              : {
                  tarefa: {
                    ...tarefa,
                    estado: "completed",
                    cliente_id: "cliente-homologacao",
                  },
                },
          error: null,
        }) as never,
    );
    render(<CentralComando />);
    fireEvent.click(
      screen.getByRole("button", { name: "Usar exemplo fictício" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enviar comando" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Enviar comando" }));
    await screen.findByText("Cadastro confirmado na homologação.");
    expect(
      vi
        .mocked(supabase.functions.invoke)
        .mock.calls.some(
          ([, o]) => (o?.body as Record<string, unknown>).acao === "executar",
        ),
    ).toBe(false);
  });
});
