import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PecaForm from "./PecaForm";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  toast: vi.fn(),
  aprova: true,
}));
const documento = {
  id: "peca-1",
  titulo: "Manifestação sobre laudo",
  categoria: "manifestacao",
  cliente_id: "cliente-1",
  processo_id: "processo-1",
  conteudo_html: "<p>Minuta original</p>",
  status: "rascunho",
  versao_atual: 1,
  fonte: "Arial",
  tamanho_fonte: 12,
  espacamento_entre_linhas: 1.5,
  atualizado_em: "2026-11-02T12:00:00Z",
  contexto_producao: {},
};
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "usuario-1" },
    hasPermission: () => true,
    isGestor: mocks.aprova,
    roles: mocks.aprova ? ["advogado"] : ["estagiario"],
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));
vi.mock("@/lib/documentos-export", () => ({
  exportarDocx: vi.fn(),
  imprimirParaPDF: vi.fn(),
}));
vi.mock("./editor/PecaEditor", () => ({
  PecaEditor: ({
    value,
    onChange,
    readOnly,
  }: {
    value: string;
    onChange: (s: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="Documento"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
    />
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    from: (table: string) => {
      const data =
        table === "clientes"
          ? [{ id: "cliente-1", nome: "Cliente de teste" }]
          : table === "processos"
            ? [
                {
                  id: "processo-1",
                  cliente_id: "cliente-1",
                  numero_cnj: "0000000-00.2026.8.11.0000",
                },
              ]
            : table === "doc_pecas_versoes"
              ? [
                  {
                    id: "versao-1",
                    numero_versao: 1,
                    nome_versao: "Inicial",
                    conteudo_html: "<p>Versão antiga</p>",
                    salvo_em: "2026-11-01T12:00:00Z",
                  },
                ]
              : [];
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: documento, error: null }),
        then: (resolve: (r: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve),
      };
      return query;
    },
  },
}));

function abrir() {
  return render(
    <MemoryRouter initialEntries={["/documentos/pecas/peca-1"]}>
      <Routes>
        <Route path="/documentos/pecas/:id" element={<PecaForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  cleanup();
  documento.contexto_producao = {};
  vi.clearAllMocks();
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue({
    data: { provedores: { openai: true, anthropic: false } },
    error: null,
  });
  mocks.aprova = true;
  vi.spyOn(window, "confirm").mockReturnValue(true);
  // Radix Select/scroll usa APIs que não existem no jsdom.
  HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.rpc.mockImplementation(async (_nome, args) => ({
    data: {
      ...documento,
      ...args.p_dados,
      atualizado_em: "2026-11-02T12:01:00Z",
      versao_atual: args.p_nova_versao ? 3 : 1,
    },
    error: null,
  }));
});

describe("área de produção — salvamento e sugestões", () => {
  it("salva o contexto junto ao documento e preserva a edição ao alternar tela cheia", async () => {
    abrir();
    await screen.findByLabelText("Documento");
    fireEvent.change(screen.getByLabelText("Documento"), {
      target: { value: "<p>Alteração humana</p>" },
    });
    fireEvent.change(screen.getByLabelText("Providência / objetivo"), {
      target: { value: "Responder ao laudo" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Tela cheia" }),
    );
    expect(screen.getByLabelText("Documento")).toHaveValue(
      "<p>Alteração humana</p>",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar" }),
    );
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(mocks.rpc.mock.calls[0][1].p_dados.contexto_producao.objetivo).toBe(
      "Responder ao laudo",
    );
    expect(mocks.rpc.mock.calls[0][1].p_dados.cliente_id).toBe("cliente-1");
    fireEvent.click(screen.getByRole("button", { name: "Sair da tela cheia" }));
    await screen.findByText("Todas as alterações salvas");
  });

  it("visualizar o histórico não altera a minuta; restaurar preserva o rascunho antes", async () => {
    abrir();
    await screen.findByLabelText("Documento");
    fireEvent.change(screen.getByLabelText("Documento"), {
      target: { value: "<p>Texto ainda não salvo</p>" },
    });
    fireEvent.click(screen.getByRole("button", { name: "v1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Visualizar" }));
    expect(screen.getByLabelText("Documento")).toHaveValue(
      "<p>Texto ainda não salvo</p>",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Restaurar como nova versão" }),
    );
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(mocks.rpc.mock.calls[0][1].p_dados.conteudo_html).toBe(
      "<p>Texto ainda não salvo</p>",
    );
    expect(mocks.rpc.mock.calls[1][1].p_nova_versao).toBe(true);
    expect(mocks.rpc.mock.calls[1][1].p_dados.conteudo_html).toBe(
      "<p>Versão antiga</p>",
    );
  });

  it("não aplica a sugestão da IA quando a preservação do rascunho falha", async () => {
    mocks.invoke.mockResolvedValue({
      data: { texto: "Nova minuta sugerida", pendencias: [] },
      error: null,
    });
    abrir();
    await screen.findByLabelText("Documento");
    fireEvent.change(screen.getByLabelText("Documento"), {
      target: { value: "<p>Trabalho da estagiária</p>" },
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Assistente IA" }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Consultar assistente" }),
    );
    await screen.findByText("Nova minuta sugerida");
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "O documento foi alterado em outra sessão." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Substituir minuta" }));
    await screen.findByText("Falha no salvamento");
    expect(screen.getByLabelText("Documento")).toHaveValue(
      "<p>Trabalho da estagiária</p>",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("outra sessão");
  });

  it("usa somente GPT, mesmo quando há preferência antiga por Claude", async () => {
    documento.contexto_producao = { provedor_ia: "anthropic" };
    mocks.invoke.mockImplementation(async (_nome, args) =>
      args.method === "GET"
        ? {
            data: { provedores: { openai: true, anthropic: true } },
            error: null,
          }
        : {
            data: {
              texto: "Sugestão do GPT",
              pendencias: [],
              modelo: "gpt-4.1",
            },
            error: null,
          },
    );
    abrir();
    await screen.findByLabelText("Documento");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Assistente IA" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.queryByLabelText("Provedor de IA")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Consultar assistente" }),
    );
    await screen.findByText("Sugestão do GPT");
    const consultas = mocks.invoke.mock.calls.filter((c) => c[1]?.body);
    expect(consultas).toHaveLength(1);
    expect(consultas[0][1].body.provedor).toBe("openai");
  });

  it("aguarda a configuração do GPT sem alternar para outro provedor", async () => {
    mocks.invoke.mockResolvedValue({
      data: { provedores: { openai: false, anthropic: true } },
      error: null,
    });
    abrir();
    await screen.findByLabelText("Documento");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Assistente IA" }), {
      button: 0,
      ctrlKey: false,
    });
    await screen.findByText(/Este provedor aguarda configuração/);
    expect(
      screen.getByRole("button", { name: "Consultar assistente" }),
    ).toBeDisabled();
    expect(mocks.invoke.mock.calls.filter((c) => c[1]?.body)).toHaveLength(0);
  });
});
