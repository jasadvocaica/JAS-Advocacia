import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgenteIA } from "../../hooks/useAgentesIA";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import CentralAutomacoes, { descreverFrequencia } from "./CentralAutomacoes";

const agentes = [
  { id: "manu", slug: "m", nome: "Manu", ativo: true, executor: "analista_operacional" },
  { id: "sofia", slug: "s", nome: "Sofia · Operações", ativo: true, executor: "analista_operacional" },
  { id: "djen", slug: "monitor-djen", nome: "Monitor DJEN", ativo: true, executor: null },
] as AgenteIA[];
const automacao = {
  id: "a1", nome: "Relatório diário da Controladoria", setor: "controladoria", agente_id: "sofia", agente: "Sofia · Operações",
  instrucoes: "Liste vencidos.", frequencia: "diaria", intervalo_minutos: null, hora: "07:30", dias_semana: null, prioridade: 2,
  ativa: false, proxima_execucao: null, ultima_execucao: null, ultima_missao_estado: null,
};
const falha = { tarefa_id: "t1", titulo: "Relatório", agente: "Sofia · Operações", missao: "Relatório", tentativas: 2, erro: "OpenAI fora do ar", quando: "2026-11-02T12:00:00Z" };

function responder() {
  invoke.mockImplementation((_f: string, o?: { body?: { acao?: string } }) =>
    Promise.resolve({ data: o?.body?.acao === "automacoes" ? { automacoes: [automacao], falhas: [falha] } : { ok: true }, error: null }));
}

describe("Central de Automações", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("descreve a frequência em português", () => {
    expect(descreverFrequencia({ frequencia: "diaria", hora: "07:30", intervalo_minutos: null, dias_semana: null })).toBe("Todo dia às 07:30");
    expect(descreverFrequencia({ frequencia: "semanal", hora: "07:00", intervalo_minutos: null, dias_semana: [1, 5] })).toBe("Seg, Sex às 07:00");
    expect(descreverFrequencia({ frequencia: "intervalo", hora: null, intervalo_minutos: 240, dias_semana: null })).toBe("A cada 4 h");
  });

  it("liga, executa agora e retenta a falha pelo motor", async () => {
    responder();
    render(<CentralAutomacoes agentes={agentes} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ligar Relatório diário da Controladoria" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("motor-missoes", { body: { acao: "alternar_automacao", id: "a1", ativa: true } }));
    fireEvent.click(screen.getByRole("button", { name: "Executar agora Relatório diário da Controladoria" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("motor-missoes", { body: { acao: "executar_automacao", id: "a1" } }));
    expect(screen.getByText("OpenAI fora do ar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo Relatório" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("motor-missoes", { body: { acao: "retentar_tarefa", id: "t1" } }));
  });

  it("modelo da Controladoria já escolhe a Sofia e salva desligado", async () => {
    responder();
    render(<CentralAutomacoes agentes={agentes} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tarefas vencidas — fim do dia" }));
    const agente = screen.getByLabelText("Agente") as HTMLSelectElement;
    expect(agente.value).toBe("sofia");
    expect(Array.from(agente.options).map((o) => o.text)).not.toContain("Monitor DJEN");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("motor-missoes", {
        body: expect.objectContaining({
          acao: "salvar_automacao", id: null,
          dados: expect.objectContaining({ nome: "Tarefas vencidas — fim do dia", agente_id: "sofia", frequencia: "diaria", hora: "17:00" }),
        }),
      }),
    );
  });
});
