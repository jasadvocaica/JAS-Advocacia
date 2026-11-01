import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AgentEditor from "./AgentEditor";
import { chamarEscritorio } from "../../hooks/useAgentesIA";
vi.mock("../../hooks/useAgentesIA", () => ({ chamarEscritorio: vi.fn() }));
const config = {
  nome: "Sofia",
  missao: "Priorizar",
  cargo: "Analista",
  sala: "operacional",
  prompt_base: "Considere as orientações da base interna.",
  tom: "formal",
  ferramentas: ["indicadores_operacionais", "base_conhecimento"],
  documentos: [],
  intervalo_minutos: null,
  ativo: false,
};
beforeEach(() => {
  vi.mocked(chamarEscritorio).mockReset();
});
describe("Editor de agentes ligado ao executor", () => {
  it("aplica persona com fontes de marketing sem cadastrar nem ativar automaticamente", () => {
    render(
      <MemoryRouter>
        <AgentEditor agentes={[]} recarregar={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Modelo de agente" }),
      { target: { value: "camila" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Aplicar modelo ao rascunho" }),
    );
    expect(screen.getByLabelText("Nome do agente")).toHaveValue("Camila");
    fireEvent.click(screen.getByRole("tab", { name: "Conhecimento" }));
    expect(screen.getByLabelText("Título da fonte 1")).toHaveValue(
      "Diretrizes de publicidade fornecidas pelo escritório",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Ferramentas e rotina" }));
    expect(
      screen.getByRole("checkbox", { name: /Ativar agente/ }),
    ).not.toBeChecked();
    expect(chamarEscritorio).not.toHaveBeenCalled();
  });

  it("salva prompt e fonte como configuração pausada sem disparar IA", async () => {
    vi.mocked(chamarEscritorio).mockResolvedValue({
      agente_id: "novo",
      revisao: 1,
    });
    render(
      <MemoryRouter>
        <AgentEditor
          agentes={[]}
          recarregar={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText("Nome do agente"), {
      target: { value: "Analista de teste" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Conhecimento" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Adicionar fonte de texto" }),
    );
    fireEvent.change(screen.getByLabelText("Conteúdo da fonte 1"), {
      target: { value: "Priorizar tarefas sem responsável." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar agente" }));
    await waitFor(() =>
      expect(chamarEscritorio).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: "salvar_configuracao",
          revisao: 0,
          config: expect.objectContaining({
            ativo: false,
            documentos: [
              expect.objectContaining({
                texto: "Priorizar tarefas sem responsável.",
              }),
            ],
          }),
        }),
      ),
    );
    expect(vi.mocked(chamarEscritorio).mock.calls).toHaveLength(1);
  });
  it("mantém a edição local quando outra versão foi salva no servidor", async () => {
    vi.mocked(chamarEscritorio)
      .mockResolvedValueOnce({ revisao: 3, config })
      .mockRejectedValueOnce(
        new Error("A configuração mudou. Recarregue antes de salvar."),
      );
    render(
      <MemoryRouter>
        <AgentEditor
          agenteId="agente"
          agentes={[]}
          recarregar={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );
    await screen.findByDisplayValue("Sofia");
    fireEvent.click(screen.getByRole("tab", { name: "Instruções" }));
    fireEvent.change(screen.getByLabelText("Prompt base"), {
      target: { value: "Minha alteração local deve ser preservada." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar agente" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Prompt base")).toHaveValue(
      "Minha alteração local deve ser preservada.",
    );
    expect(chamarEscritorio).toHaveBeenLastCalledWith(
      expect.objectContaining({ revisao: 3 }),
    );
  });
});
