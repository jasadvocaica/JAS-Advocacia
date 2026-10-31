import { describe, expect, it } from "vitest";
import { falaDoResumo, montarEquipe, presencaDoPonto, resumoItens, salaDoMembro } from "./logic";

const HOJE = "2026-11-03";

describe("presencaDoPonto", () => {
  it("sem entrada fica fora", () => {
    expect(presencaDoPonto(undefined)).toEqual({ presenca: "fora", status: "Sem ponto hoje" });
  });
  it("com entrada está trabalhando", () => {
    const r = presencaDoPonto({ membro_id: "m", entrada: "08:02:00", saida_almoco: null, retorno_almoco: null, saida: null });
    expect(r).toEqual({ presenca: "trabalhando", status: "Trabalhando · entrada 08:02" });
  });
  it("saiu para o almoço e não voltou", () => {
    const r = presencaDoPonto({ membro_id: "m", entrada: "08:00", saida_almoco: "12:01", retorno_almoco: null, saida: null });
    expect(r.presenca).toBe("almoco");
  });
  it("voltou do almoço", () => {
    const r = presencaDoPonto({ membro_id: "m", entrada: "08:00", saida_almoco: "12:00", retorno_almoco: "13:00", saida: null });
    expect(r.presenca).toBe("trabalhando");
  });
  it("encerrou o dia", () => {
    const r = presencaDoPonto({ membro_id: "m", entrada: "08:00", saida_almoco: null, retorno_almoco: null, saida: "17:10:00" });
    expect(r).toEqual({ presenca: "fora", status: "Encerrou às 17:10" });
  });
});

describe("resumoItens", () => {
  const item = (id: string, data: string) => ({ id, titulo: id, tipo: "prazo_fatal", data_vencimento: data, responsavel_id: "u" });
  it("separa atrasados, hoje e semana e ignora depois de 7 dias", () => {
    const r = resumoItens([item("a", "2026-11-01"), item("b", HOJE), item("c", "2026-11-10T12:00:00Z"), item("d", "2026-11-11")], HOJE);
    expect([r.atrasados, r.hoje, r.semana]).toEqual([1, 1, 1]);
    expect(r.itens.map((i) => i.titulo)).toEqual(["a", "b", "c"]);
    expect(r.itens[0]).toMatchObject({ data: "01/11", atrasado: true, tipo: "Prazo fatal" });
  });
  it("vira a frase do balão", () => {
    expect(falaDoResumo(resumoItens([item("a", "2026-10-30"), item("b", "2026-10-31")], HOJE))).toBe("2 prazos atrasados!");
    expect(falaDoResumo(resumoItens([], HOJE))).toBe("Tudo em dia ✓");
  });
});

describe("montarEquipe", () => {
  const membros = [
    { id: "m1", nome: "Lana Priscila", cargo: "estagiario", user_id: "u1" },
    { id: "m2", nome: "Valeska", cargo: "estagiario", user_id: "u2" },
  ];
  it("põe cada pessoa na sala certa e cria a gestora quando ela não é membro", () => {
    const r = montarEquipe({ membros, ponto: [], itens: [], emails: { u1: "lana@x" }, gestor: { id: "g", nome: "Juliana Araújo" }, hojeISO: HOJE });
    expect(r.map((p) => [p.nome, p.sala, p.presenca])).toEqual([
      ["Juliana Araújo", "diretoria", "trabalhando"],
      ["Lana Priscila", "operacional", "fora"],
      ["Valeska", "diligencias", "fora"],
    ]);
    expect(r[1].email).toBe("lana@x");
  });
  it("a gestora cadastrada como membro vira a dona", () => {
    const r = montarEquipe({
      membros: [...membros, { id: "m3", nome: "Juliana", cargo: "gestor", user_id: "g" }],
      ponto: [], itens: [], emails: {}, gestor: { id: "g", nome: "Juliana" }, hojeISO: HOJE,
    });
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ id: "m3", dona: true, sala: "diretoria" });
  });
  it("salaDoMembro usa o cargo quando o nome não tem regra", () => {
    expect(salaDoMembro({ nome: "Ana", cargo: "administrativo" })).toBe("recepcao");
    expect(salaDoMembro({ nome: "Ana", cargo: "advogado" })).toBe("operacional");
  });
});
