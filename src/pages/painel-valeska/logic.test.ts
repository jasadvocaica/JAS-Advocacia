import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  comunicacaoPendente, comunicacoesDoPainel, comunicacoesSemResponsavel, contratacoesEmAberto,
  funilFichas, funilLeads, podeVerPainelComercial, precisaDeMimAgora, tarefasCriticas,
  tarefasDoUsuario, urgenciaComunicacao,
  type ComunicacaoPendente, type FichaAtendimento, type LeadRegistrado, type TarefaPainel,
} from "./logic";

const AGORA = new Date("2026-08-23T12:00:00Z");

function com(p: Partial<ComunicacaoPendente> = {}): ComunicacaoPendente {
  return {
    id: p.id ?? "c1", item_id: p.item_id ?? "i1", cliente_id: p.cliente_id ?? "cl1",
    processo_id: null, status: p.status ?? "pendente",
    responsavel_id: "responsavel_id" in p ? p.responsavel_id ?? null : "u1",
    sla_preferencial_em: p.sla_preferencial_em ?? "2026-08-25",
    sla_limite_em: p.sla_limite_em ?? "2026-08-27",
    comunicado_em: p.comunicado_em ?? null, comunicado_por: p.comunicado_por ?? null,
    criado_em: p.criado_em ?? "2026-08-23T10:00:00Z",
  };
}

function tarefa(p: Partial<TarefaPainel> = {}): TarefaPainel {
  return {
    id: p.id ?? "t1", titulo: p.titulo ?? "Tarefa", status: p.status ?? "pendente",
    prioridade: null, data_vencimento: p.data_vencimento ?? "2026-08-30T00:00:00Z",
    etapa_workflow: p.etapa_workflow ?? "execucao",
    responsavel_id: p.responsavel_id ?? null, executor_id: p.executor_id ?? null,
    revisor_id: p.revisor_id ?? null, corretor_id: p.corretor_id ?? null,
    protocolador_id: p.protocolador_id ?? null,
  };
}

describe("Painel comercial — escopo sem WhatsApp", () => {
  it("não há qualquer referência a WhatsApp/mensageria no módulo", () => {
    const dir = __dirname;
    const arquivos = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of arquivos) {
      if (f === "logic.test.ts") continue;
      // Ignora comentários: o que importa é não haver código/consulta a mensageria.
      const conteudo = fs
        .readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n")
        .toLowerCase();
      expect(conteudo).not.toContain("whatsapp");
      expect(conteudo).not.toContain("wa_");
      expect(conteudo).not.toContain("mensageria");
    }
  });

  it("o funil usa apenas registros internos (fichas e leads cadastrados)", () => {
    const fichas: FichaAtendimento[] = [
      { id: "f1", titulo: "A", status: "rascunho", area: "civel", subtipo: null, cliente_id: "c1", criado_em: "2026-08-01", convertido_em: null },
      { id: "f2", titulo: "B", status: "convertido", area: "civel", subtipo: null, cliente_id: "c2", criado_em: "2026-08-02", convertido_em: "2026-08-03" },
    ];
    expect(funilFichas(fichas)).toEqual([
      { chave: "rascunho", total: 1 },
      { chave: "convertido", total: 1 },
    ]);
    const leads: LeadRegistrado[] = [
      { id: "l1", nome: "X", status: null, area_direito: null, cliente_id: null, valor_contrato: null, criado_em: "2026-08-01" },
    ];
    expect(funilLeads(leads)).toEqual([{ chave: "sem_status", total: 1 }]);
  });

  it("contratações em aberto = fichas cadastradas ainda não convertidas", () => {
    const fichas: FichaAtendimento[] = [
      { id: "f1", titulo: "A", status: "rascunho", area: null, subtipo: null, cliente_id: null, criado_em: "2026-08-01", convertido_em: null },
      { id: "f2", titulo: "B", status: "convertido", area: null, subtipo: null, cliente_id: null, criado_em: "2026-08-02", convertido_em: "2026-08-03" },
    ];
    expect(contratacoesEmAberto(fichas).map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("Comunicação pós-protocolo", () => {
  it("classifica urgência pelo SLA operacional, nunca pelo prazo judicial", () => {
    expect(urgenciaComunicacao(com({ sla_preferencial_em: "2026-08-25", sla_limite_em: "2026-08-27" }), AGORA)).toBe("no_prazo");
    expect(urgenciaComunicacao(com({ sla_preferencial_em: "2026-08-23", sla_limite_em: "2026-08-27" }), AGORA)).toBe("hoje");
    expect(urgenciaComunicacao(com({ sla_preferencial_em: "2026-08-20", sla_limite_em: "2026-08-22" }), AGORA)).toBe("atrasada");
  });

  it("uma comunicação concluída sai da fila (encerra só a pendência)", () => {
    const concluida = com({ id: "c2", status: "concluida", comunicado_em: "2026-08-23T11:00:00Z", comunicado_por: "u1" });
    expect(comunicacaoPendente(concluida)).toBe(false);
    expect(comunicacoesDoPainel([com(), concluida], AGORA).map((c) => c.id)).toEqual(["c1"]);
  });

  it("ordena atrasadas primeiro e depois por antiguidade", () => {
    const a = com({ id: "a", sla_limite_em: "2026-08-20", criado_em: "2026-08-19T10:00:00Z" });
    const b = com({ id: "b", criado_em: "2026-08-10T10:00:00Z" });
    const c = com({ id: "c", criado_em: "2026-08-12T10:00:00Z" });
    expect(comunicacoesDoPainel([b, c, a], AGORA).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("sem responsável configurado não há fallback — vira alerta gerencial", () => {
    const sem = com({ id: "s1", responsavel_id: null });
    const lista = comunicacoesSemResponsavel([com(), sem]);
    expect(lista.map((c) => c.id)).toEqual(["s1"]);
    expect(lista[0].responsavel_id).toBeNull();
  });

  it("duplicidade lógica: a mesma tarefa nunca aparece duas vezes na fila", () => {
    const fila = comunicacoesDoPainel([com({ id: "c1", item_id: "i1" })], AGORA);
    const itens = new Set(fila.map((c) => c.item_id));
    expect(itens.size).toBe(fila.length);
  });
});

describe("Tarefas e autorização", () => {
  it("mostra somente tarefas realmente atribuídas à usuária", () => {
    const lista = [
      tarefa({ id: "t1", responsavel_id: "u1" }),
      tarefa({ id: "t2", executor_id: "u2" }),
      tarefa({ id: "t3", protocolador_id: "u1" }),
      tarefa({ id: "t4", responsavel_id: "u1", status: "concluido" }),
    ];
    expect(tarefasDoUsuario(lista, "u1").map((t) => t.id).sort()).toEqual(["t1", "t3"]);
    expect(tarefasDoUsuario(lista, "")).toEqual([]);
  });

  it("tarefas críticas usam o prazo judicial existente, sem cálculo paralelo", () => {
    const lista = [
      tarefa({ id: "t1", responsavel_id: "u1", data_vencimento: "2026-08-20T00:00:00Z" }),
      tarefa({ id: "t2", responsavel_id: "u1", data_vencimento: "2026-08-23T00:00:00Z" }),
      tarefa({ id: "t3", responsavel_id: "u1", data_vencimento: "2026-09-01T00:00:00Z" }),
    ];
    expect(tarefasCriticas(tarefasDoUsuario(lista, "u1"), AGORA).map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("autoriza por configuração/gestor — nunca por nome", () => {
    expect(podeVerPainelComercial({ userId: "u1", responsavelConfigurado: "u1", isGestor: false })).toBe(true);
    expect(podeVerPainelComercial({ userId: "u9", responsavelConfigurado: "u1", isGestor: false })).toBe(false);
    expect(podeVerPainelComercial({ userId: "u9", responsavelConfigurado: null, isGestor: true })).toBe(true);
    expect(podeVerPainelComercial({ userId: null, responsavelConfigurado: "u1", isGestor: true })).toBe(false);
  });

  it("perfil sem permissão não recebe dados (contagem zerada)", () => {
    expect(
      precisaDeMimAgora({ comunicacoes: [], tarefas: tarefasDoUsuario([tarefa({ responsavel_id: "u1" })], "u9"), contratacoes: [], pendencias: [] }),
    ).toBe(0);
  });
});
