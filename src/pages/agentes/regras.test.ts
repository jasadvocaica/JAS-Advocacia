import { describe, expect, it } from "vitest";
import {
  ajustarInterno, decidir, escolherResponsavel, prioridadePara, somarDias, tituloItem,
  type Extracao, type MembroCarga,
} from "../../../supabase/functions/agente-prazos/regras";

const HOJE = "2026-11-03";
const base: Extracao = {
  exige_providencia: true,
  tipo_item: "prazo_fatal",
  providencia: "Apresentar contrarrazões à apelação",
  prazo_dias: 15,
  prazo_tipo: "dias_uteis",
  base_legal: "art. 1.010, §1º, CPC",
  data_evento: null,
  hora_evento: null,
  confianca: 0.9,
  justificativa: "Intimação para contrarrazões.",
};

describe("decidir", () => {
  it("lança prazo claro", () => {
    expect(decidir(base, 0.75, HOJE)).toEqual({ acao: "lancar", modo: "prazo" });
  });
  it("mantém na triagem quando a confiança é baixa", () => {
    expect(decidir({ ...base, confianca: 0.6 }, 0.75, HOJE)).toEqual({ acao: "triagem", motivo: "Confiança baixa (60%)" });
  });
  it("mantém na triagem quando é só ciência", () => {
    expect(decidir({ ...base, exige_providencia: false }, 0.75, HOJE).acao).toBe("triagem");
  });
  it("não lança prazo sem dias ou com dias absurdos", () => {
    expect(decidir({ ...base, prazo_dias: null }, 0.75, HOJE).acao).toBe("triagem");
    expect(decidir({ ...base, prazo_dias: 400 }, 0.75, HOJE).acao).toBe("triagem");
    expect(decidir({ ...base, prazo_tipo: null }, 0.75, HOJE).acao).toBe("triagem");
  });
  it("audiência só com data futura válida", () => {
    const aud = { ...base, tipo_item: "audiencia" as const, prazo_dias: null, prazo_tipo: null };
    expect(decidir({ ...aud, data_evento: "2026-11-20" }, 0.75, HOJE)).toEqual({ acao: "lancar", modo: "evento" });
    expect(decidir({ ...aud, data_evento: "2026-10-01" }, 0.75, HOJE).acao).toBe("triagem");
    expect(decidir({ ...aud, data_evento: "20/11/2026" }, 0.75, HOJE).acao).toBe("triagem");
  });
  it("resposta vazia vai para a triagem", () => {
    expect(decidir(null, 0.75, HOJE)).toEqual({ acao: "triagem", motivo: "Resposta da IA incompleta" });
  });
});

describe("escolherResponsavel", () => {
  const equipe: MembroCarga[] = [
    { user_id: "lana", nome: "Lana Priscila", cargo: "estagiario", status: "ativo", abertos: 10 },
    { user_id: "esther", nome: "Esther", cargo: "estagiario", status: "ativo", abertos: 3 },
    { user_id: "valeska", nome: "Valeska", cargo: "estagiario", status: "ativo", abertos: 8 },
    { user_id: "ju", nome: "Juliana Araújo", cargo: "gestor", status: "ativo", abertos: 0 },
  ];
  it("prazo vai para a Lana e audiência para a Valeska", () => {
    expect(escolherResponsavel("prazo_fatal", equipe, 25, null).user_id).toBe("lana");
    expect(escolherResponsavel("audiencia", equipe, 25, null).user_id).toBe("valeska");
    expect(escolherResponsavel("tarefa", equipe, 25, null).user_id).toBe("esther");
  });
  it("Lana sobrecarregada: vai para quem tem menos itens, nunca para a gestora", () => {
    const r = escolherResponsavel("prazo_fatal", equipe, 10, null);
    expect(r.user_id).toBe("esther");
    expect(r.motivo).toContain("Lana Priscila com 10 itens abertos");
  });
  it("pessoa afastada não recebe", () => {
    const comLanaAfastada = equipe.map((m) => (m.user_id === "lana" ? { ...m, status: "afastado" } : m));
    expect(escolherResponsavel("prazo_fatal", comLanaAfastada, 25, null).user_id).toBe("esther");
  });
  it("sem equipe cai no responsável do processo", () => {
    expect(escolherResponsavel("prazo_fatal", [], 25, "resp")).toEqual({ user_id: "resp", motivo: "responsável pelo processo" });
  });
});

describe("datas e prioridade", () => {
  it("meta interna nunca fica no passado nem depois do prazo judicial", () => {
    expect(ajustarInterno("2026-11-10", "2026-11-12", HOJE)).toBe("2026-11-10");
    expect(ajustarInterno("2026-11-01", "2026-11-05", HOJE)).toBe(HOJE);
    expect(ajustarInterno("2026-10-28", "2026-10-30", HOJE)).toBe("2026-10-30");
  });
  it("prioridade pela distância do prazo judicial", () => {
    expect(prioridadePara("2026-11-05", HOJE)).toBe("urgente");
    expect(prioridadePara("2026-11-08", HOJE)).toBe("alta");
    expect(prioridadePara("2026-11-30", HOJE)).toBe("media");
  });
  it("soma dias corridos atravessando o mês", () => {
    expect(somarDias("2026-10-30", 5)).toBe("2026-11-04");
  });
  it("título com providência e processo", () => {
    expect(tituloItem(base, "0001234-56.2026.8.11.0041")).toBe("Apresentar contrarrazões à apelação — 0001234-56.2026.8.11.0041");
  });
});
