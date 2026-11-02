import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LiveOperations from "./LiveOperations";
import { agentVisualStates, latestExecution } from "./agentState";
import type { AgenteIA, ExecucaoAgente } from "../hooks/useAgentesIA";
const agent: AgenteIA = {
  id: "sofia",
  nome: "Sofia",
  slug: "sofia",
  executor: "analista_operacional",
  area: "gestao",
  descricao: "Análise",
  ativo: true,
  ordem: 1,
  exige_aprovacao: true,
  webhook_url: null,
};
const native = {
  ...agent,
  id: "djen",
  nome: "DJEN",
  slug: "monitor-djen",
  executor: null,
};
const execution = (
  status: ExecucaoAgente["status"],
  age = 0,
): ExecucaoAgente => ({
  id: `execution-${age}`,
  agente_id: agent.id,
  status,
  iniciado_em: new Date(Date.now() - age).toISOString(),
  finalizado_em: null,
  origem: "manual",
  resumo: null,
  erro: null,
  entrada: null,
  saida: null,
  duracao_ms: null,
});
function open(
  execucoes: ExecucaoAgente[],
  updated: string | null = new Date().toISOString(),
) {
  const rodar = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <LiveOperations
        agentes={[agent, native]}
        execucoes={execucoes}
        passos={[]}
        atualizadoEm={updated}
        erro={false}
        ocupado={false}
        rodar={rodar}
      />
    </MemoryRouter>,
  );
  return rodar;
}
describe("Operação visível com estado real", () => {
  it("oferece criação e edição do analista sem oferecer prompt para rotina nativa", () => {
    const rodar = open([]);
    expect(
      screen.getByRole("link", { name: "Criar novo agente" }),
    ).toHaveAttribute("href", "/escritorio/equipe/novo");
    expect(
      screen.getByRole("link", { name: "Editar agente Sofia" }),
    ).toHaveAttribute("href", "/escritorio/equipe/sofia/editar");
    expect(
      screen.queryByRole("link", { name: "Editar agente DJEN" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Executar Sofia" }));
    expect(rodar).toHaveBeenCalledWith(agent);
  });
  it("direciona a entrega pendente para revisão em vez de gerar outra", () => {
    open([execution("aguardando_aprovacao")]);
    expect(screen.getByRole("link", { name: "Revisar" })).toHaveAttribute(
      "href",
      "/escritorio/entregas",
    );
    expect(
      screen.queryByRole("button", { name: "Executar Sofia" }),
    ).not.toBeInTheDocument();
  });
  it("suspende a indicação de trabalho e execução manual quando os dados envelhecem", () => {
    open([execution("executando")], new Date(Date.now() - 40000).toISOString());
    expect(screen.queryByText("Trabalhando")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Executar Sofia" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Aguardando confirmação do servidor"),
    ).toBeInTheDocument();
  });
  it("escolhe a última execução mesmo quando a lista chega fora de ordem", () => {
    const old = execution("executando", 60000),
      last = execution("concluida");
    expect(latestExecution([old, last], agent.id)).toBe(last);
    expect(
      agentVisualStates([agent], [old, last], new Date().toISOString())[0]
        .status,
    ).toBe("Disponível");
  });
  it("limita a animação à confirmação recente e à duração máxima da execução", () => {
    const updated = new Date().toISOString(),
      old = execution("executando", 590000);
    const state = agentVisualStates([agent], [old], updated)[0];
    expect(state.status).toBe("Trabalhando");
    expect(state.expiresAt).toBe(Date.parse(old.iniciado_em) + 600000);
    expect(agentVisualStates([agent], [old], null)[0].expiresAt).toBe(0);
  });
});
