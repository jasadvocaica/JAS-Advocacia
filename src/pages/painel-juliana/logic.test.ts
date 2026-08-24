import { describe, expect, it } from "vitest";
import {
  agrupar, classificarUrgencia, contagemPorEtapa, dependeDe, dependenciasDe,
  filaRevisao, horasAguardando, itemAtivo, prazosDaSemana, processoAtivo,
  saudeDe, slaOperacional, type ItemPainel,
} from "./logic";

const JULIANA = "juliana-uuid";
const OUTRA = "lana-uuid";

function item(over: Partial<ItemPainel> = {}): ItemPainel {
  return {
    id: Math.random().toString(36).slice(2),
    titulo: "Item",
    tipo: "tarefa",
    status: "pendente",
    prioridade: "media",
    data_vencimento: null,
    criado_em: "2026-08-01T12:00:00Z",
    etapa_workflow: "execucao",
    etapa_atualizada_em: "2026-08-01T12:00:00Z",
    exige_revisao: true,
    responsavel_id: null,
    executor_id: null,
    revisor_id: null,
    corretor_id: null,
    protocolador_id: null,
    sla_previsto_em: null,
    sla_status: null,
    ...over,
  };
}

// Quarta-feira
const AGORA = new Date("2026-08-19T10:00:00-03:00");
const d = (iso: string) => `${iso}T12:00:00-03:00`;

describe("itemAtivo", () => {
  it("exclui concluído, cancelado e finalizado", () => {
    expect(itemAtivo(item({ status: "concluido" }))).toBe(false);
    expect(itemAtivo(item({ status: "cancelado" }))).toBe(false);
    expect(itemAtivo(item({ etapa_workflow: "finalizado" }))).toBe(false);
    expect(itemAtivo(item())).toBe(true);
  });
});

describe("classificarUrgencia", () => {
  it("classifica com base no vencimento existente", () => {
    expect(classificarUrgencia(item({ data_vencimento: d("2026-08-18") }), AGORA)).toBe("atrasado");
    expect(classificarUrgencia(item({ data_vencimento: d("2026-08-19") }), AGORA)).toBe("hoje");
    expect(classificarUrgencia(item({ data_vencimento: d("2026-08-20") }), AGORA)).toBe("amanha");
    expect(classificarUrgencia(item({ data_vencimento: d("2026-08-22") }), AGORA)).toBe("semana");
    expect(classificarUrgencia(item({ data_vencimento: d("2026-08-27") }), AGORA)).toBe("futuro");
    expect(classificarUrgencia(item(), AGORA)).toBe("sem_prazo");
  });
});

describe("fila de revisão", () => {
  it("só inclui etapa revisão com dependência real da Juliana", () => {
    const meu = item({ etapa_workflow: "revisao", revisor_id: JULIANA });
    const deOutra = item({ etapa_workflow: "revisao", revisor_id: OUTRA });
    const execucaoDela = item({ etapa_workflow: "execucao", executor_id: JULIANA });
    const fila = filaRevisao([meu, deOutra, execucaoDela], JULIANA, AGORA);
    expect(fila.map((i) => i.id)).toEqual([meu.id]);
  });

  it("ordena por urgência, prioridade e antiguidade", () => {
    const atrasado = item({ etapa_workflow: "revisao", revisor_id: JULIANA, data_vencimento: d("2026-08-17") });
    const hojeUrgente = item({ etapa_workflow: "revisao", revisor_id: JULIANA, data_vencimento: d("2026-08-19"), prioridade: "urgente" });
    const hojeBaixa = item({ etapa_workflow: "revisao", revisor_id: JULIANA, data_vencimento: d("2026-08-19"), prioridade: "baixa" });
    const fila = filaRevisao([hojeBaixa, hojeUrgente, atrasado], JULIANA, AGORA);
    expect(fila.map((i) => i.id)).toEqual([atrasado.id, hojeUrgente.id, hojeBaixa.id]);
  });
});

describe("dependências", () => {
  it("usa responsável da etapa atual ou titular", () => {
    expect(dependeDe(item({ etapa_workflow: "protocolo", protocolador_id: JULIANA }), JULIANA)).toBe(true);
    expect(dependeDe(item({ etapa_workflow: "protocolo", protocolador_id: OUTRA, responsavel_id: JULIANA }), JULIANA)).toBe(true);
    expect(dependeDe(item({ etapa_workflow: "execucao", executor_id: OUTRA }), JULIANA)).toBe(false);
  });

  it("não vaza itens de outras pessoas", () => {
    const lista = [item({ executor_id: OUTRA }), item({ revisor_id: JULIANA, etapa_workflow: "revisao" })];
    expect(dependenciasDe(lista, JULIANA, AGORA)).toHaveLength(1);
    expect(dependenciasDe(lista, OUTRA, AGORA)).toHaveLength(1);
  });
});

describe("prazos da semana", () => {
  it("agrupa vencidos/hoje/amanhã/resto da semana ignorando concluídos", () => {
    const g = prazosDaSemana([
      item({ data_vencimento: d("2026-08-18") }),
      item({ data_vencimento: d("2026-08-19") }),
      item({ data_vencimento: d("2026-08-20") }),
      item({ data_vencimento: d("2026-08-22") }),
      item({ data_vencimento: d("2026-08-18"), status: "concluido" }),
      item({ data_vencimento: d("2026-09-10") }),
    ], AGORA);
    expect([g.atrasado.length, g.hoje.length, g.amanha.length, g.semana.length]).toEqual([1, 1, 1, 1]);
  });
});

describe("visão da operação", () => {
  it("conta etapas reais somente de itens ativos", () => {
    const c = contagemPorEtapa([
      item({ etapa_workflow: "execucao" }),
      item({ etapa_workflow: "execucao" }),
      item({ etapa_workflow: "revisao" }),
      item({ etapa_workflow: "execucao", status: "concluido" }),
      item({ etapa_workflow: null }),
    ]);
    expect(c.execucao).toBe(2);
    expect(c.revisao).toBe(1);
    expect(c.criacao).toBe(1);
    expect(c.finalizado).toBe(0);
  });
});

describe("SLA operacional", () => {
  it("marca indisponível quando nenhum item tem SLA", () => {
    const r = slaOperacional([item({ data_vencimento: d("2026-08-01") })], AGORA);
    expect(r.disponivel).toBe(false);
    expect(r.estourados).toHaveLength(0);
  });

  it("não usa data_vencimento como SLA", () => {
    const r = slaOperacional([item({ sla_previsto_em: "2026-08-18T10:00:00-03:00" })], AGORA);
    expect(r.disponivel).toBe(true);
    expect(r.estourados).toHaveLength(1);
  });
});

describe("saúde e carteira", () => {
  it("deriva saúde sem métrica artificial", () => {
    expect(saudeDe({ atrasados: 1, hoje: 0, filaRevisao: 0 })).toBe("atrasado");
    expect(saudeDe({ atrasados: 0, hoje: 2, filaRevisao: 0 })).toBe("atencao");
    expect(saudeDe({ atrasados: 0, hoje: 0, filaRevisao: 3 })).toBe("atencao");
    expect(saudeDe({ atrasados: 0, hoje: 0, filaRevisao: 0 })).toBe("normal");
  });

  it("processo ativo ignora encerrado/arquivado", () => {
    expect(processoAtivo("em_andamento")).toBe(true);
    expect(processoAtivo("Encerrado — improcedente")).toBe(false);
    expect(processoAtivo("Arquivado")).toBe(false);
    expect(processoAtivo(null)).toBe(true);
  });

  it("agrupa áreas ignorando vazios", () => {
    const r = agrupar([{ a: "previdenciario" }, { a: "previdenciario" }, { a: "civel" }, { a: null }], (x) => x.a);
    expect(r).toEqual([{ label: "previdenciario", total: 2 }, { label: "civel", total: 1 }]);
  });

  it("calcula horas aguardando na etapa", () => {
    expect(horasAguardando(item({ etapa_atualizada_em: "2026-08-19T07:00:00-03:00" }), AGORA)).toBe(3);
  });
});
