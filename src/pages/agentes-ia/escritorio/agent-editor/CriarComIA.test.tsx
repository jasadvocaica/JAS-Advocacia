import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamarEscritorio = vi.fn();
vi.mock("../../hooks/useAgentesIA", () => ({ chamarEscritorio: (...a: unknown[]) => chamarEscritorio(...a) }));

import CriarComIA, { configDaSugestao, type Sugestao } from "./CriarComIA";
import type { ConfigAgente } from "../../../../../supabase/functions/_shared/agentes-config";

const base: ConfigAgente = {
  nome: "", missao: "", cargo: "Analista do escritório", sala: "operacional", prompt_base: "Analise.", tom: "objetivo",
  ferramentas: ["indicadores_operacionais", "base_conhecimento"], documentos: [], intervalo_minutos: null, ativo: false,
};
const sugestao: Sugestao = {
  nome: "Lara", cargo: "Analista de publicações", sala: "operacional", tom: "formal", missao: "Resumir publicações do DJEN.",
  prompt_base: "## Papel\nVocê é a Lara, analista de publicações.", usa_base_conhecimento: false,
  ferramentas_motor: ["consultar_publicacoes_djen", "criar_item_controladoria"], motivo_ferramentas: "Ler e propor tarefas.",
  perguntas: ["Quais áreas priorizar?"],
};

function Tela({ aplicar }: { aplicar: (c: ConfigAgente) => void }) {
  const [f, setF] = useState<string[]>([]);
  return (
    <>
      <CriarComIA config={base} aplicar={aplicar} ferramentas={f} setFerramentas={setF} />
      <output data-testid="ferramentas">{f.join(",")}</output>
    </>
  );
}

describe("Criar agente com IA", () => {
  beforeEach(() => {
    chamarEscritorio.mockReset();
  });

  it("monta o rascunho, sugere ferramentas e deixa desmarcar antes de salvar", async () => {
    chamarEscritorio.mockResolvedValue({ ok: true, sugestao });
    const aplicar = vi.fn();
    render(<Tela aplicar={aplicar} />);
    const botao = screen.getByRole("button", { name: /Criar com IA/ });
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Descreva o agente/), {
      target: { value: "Uma assistente para resumir publicações do DJEN previdenciárias" },
    });
    fireEvent.click(botao);
    await waitFor(() => expect(aplicar).toHaveBeenCalled());
    expect(chamarEscritorio).toHaveBeenCalledWith({
      acao: "sugerir_agente", relato: "Uma assistente para resumir publicações do DJEN previdenciárias",
    });
    expect(aplicar.mock.calls[0][0]).toMatchObject({ nome: "Lara", tom: "formal", ferramentas: ["indicadores_operacionais"] });
    expect(screen.getByText("Quais áreas priorizar?")).toBeInTheDocument();
    expect(screen.getByTestId("ferramentas")).toHaveTextContent("consultar_publicacoes_djen,criar_item_controladoria");
    fireEvent.click(screen.getByLabelText("Criar item na Controladoria (com aprovação)"));
    expect(screen.getByTestId("ferramentas")).toHaveTextContent(/^consultar_publicacoes_djen$/);
  });

  it("mostra o erro do servidor (ex.: sem orçamento)", async () => {
    chamarEscritorio.mockImplementation(async () => { throw new Error("Sem orçamento de IA hoje para sugerir o agente."); });
    render(<Tela aplicar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Descreva o agente/), { target: { value: "Um agente qualquer para testar o erro" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar com IA/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem orçamento");
  });

  it("base de conhecimento entra quando a IA indica", () => {
    expect(configDaSugestao({ ...sugestao, usa_base_conhecimento: true }, base).ferramentas)
      .toEqual(["indicadores_operacionais", "base_conhecimento"]);
  });
});
