import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import EscritorioIsometrico, { ORIGEM_ESCRITORIO, enderecoEscritorio } from "./EscritorioIsometrico";
import type { AgenteIA, ExecucaoAgente } from "../hooks/useAgentesIA";

const agente = (o: Partial<AgenteIA>): AgenteIA => ({
  id: "a1", slug: "sofia", nome: "Sofia · Operações", descricao: null, area: "gestao", webhook_url: null,
  exige_aprovacao: true, ativo: true, ordem: 1, sala: "operacional", executor: "analista_operacional", ...o,
});
const exec = (o: Partial<ExecucaoAgente>): ExecucaoAgente => ({
  id: "e1", agente_id: "a1", origem: "manual", status: "aguardando_aprovacao", resumo: "Relatório", erro: null,
  entrada: null, saida: null, iniciado_em: new Date().toISOString(), finalizado_em: null, duracao_ms: null, ...o,
});

const agentes = [agente({}), agente({ id: "a2", slug: "pausado", nome: "Pausado", ativo: false, sala: "marketing" })];
const execucoes = [exec({}), exec({ id: "e2", status: "concluida" })];
const rodar = vi.fn();
const revisar = vi.fn();

function Local() {
  return <span data-testid="local">{useLocation().pathname}</span>;
}

function abrir(ocupado = false) {
  render(
    <MemoryRouter initialEntries={["/escritorio/isometrico"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <EscritorioIsometrico agentes={agentes} execucoes={execucoes} atualizadoEm={null} ocupado={ocupado} rodar={rodar} revisar={revisar} />
              <Local />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTitle("Escritório isométrico com os agentes de IA") as HTMLIFrameElement;
}

/** Simula uma mensagem vinda do escritório (iframe). */
function doEscritorio(frame: HTMLIFrameElement, data: Record<string, unknown>, extra: Partial<MessageEventInit> = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", {
      data: { origem: ORIGEM_ESCRITORIO, ...data },
      origin: window.location.origin,
      source: frame.contentWindow,
      ...extra,
    }));
  });
}

describe("Escritório isométrico", () => {
  beforeEach(() => { rodar.mockClear(); revisar.mockClear(); });

  it("passa os agentes reais no endereço do escritório", () => {
    const frame = abrir();
    const src = decodeURIComponent(frame.getAttribute("src")!);
    expect(src).toContain("/escritorio-isometrico/index.html#d=");
    expect(src).toContain('"id":"a1"');
    expect(src).toContain('"sala":"marketing"');
    expect(enderecoEscritorio([])).toContain(encodeURIComponent('{"agentes":[]}'));
  });

  it("executar só roda agente ligado e quando nada está em andamento", () => {
    let frame = abrir();
    doEscritorio(frame, { tipo: "executar", agente_id: "a1" });
    expect(rodar).toHaveBeenCalledWith(expect.objectContaining({ id: "a1" }));
    doEscritorio(frame, { tipo: "executar", agente_id: "a2" });
    expect(rodar).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
    rodar.mockClear();
    frame = abrir(true);
    doEscritorio(frame, { tipo: "executar", agente_id: "a1" });
    expect(rodar).not.toHaveBeenCalled();
  });

  it("ignora mensagem de outra origem ou de outra janela", () => {
    const frame = abrir();
    doEscritorio(frame, { tipo: "executar", agente_id: "a1" }, { origin: "https://site-estranho.com" });
    doEscritorio(frame, { tipo: "executar", agente_id: "a1" }, { source: window });
    doEscritorio(frame, { origem: "outra-coisa", tipo: "executar", agente_id: "a1" });
    expect(rodar).not.toHaveBeenCalled();
  });

  it("revisar só abre execução que está aguardando aprovação", () => {
    const frame = abrir();
    doEscritorio(frame, { tipo: "revisar", execucao_id: "e2" });
    expect(revisar).not.toHaveBeenCalled();
    doEscritorio(frame, { tipo: "revisar", execucao_id: "e1" });
    expect(revisar).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
  });

  it("personalizar leva ao editor do agente, só para agente conhecido", () => {
    const frame = abrir();
    doEscritorio(frame, { tipo: "editar", agente_id: "nao-existe" });
    expect(screen.getByTestId("local")).toHaveTextContent("/escritorio/isometrico");
    doEscritorio(frame, { tipo: "editar", agente_id: "a1" });
    expect(screen.getByTestId("local")).toHaveTextContent("/escritorio/equipe/a1/editar");
  });

  it("responde 'pronto' mandando o estado para o escritório", () => {
    const frame = abrir();
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    doEscritorio(frame, { tipo: "pronto" });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ destino: ORIGEM_ESCRITORIO, tipo: "estado", execucoes: expect.arrayContaining([expect.objectContaining({ id: "e1", agente_id: "a1" })]) }),
      window.location.origin,
    );
  });
});
