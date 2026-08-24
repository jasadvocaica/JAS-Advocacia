import { describe, it, expect } from "vitest";
import { particionarInteracoes } from "./historico-utils";

const make = (id: string, tipo: string) =>
  ({ id, tipo, descricao: "x", data: "2026-01-01T00:00:00Z" });

describe("particionarInteracoes", () => {
  it("retorna listas vazias para entrada nula/undefined", () => {
    expect(particionarInteracoes(null)).toEqual({ automaticas: [], manuais: [] });
    expect(particionarInteracoes(undefined)).toEqual({ automaticas: [], manuais: [] });
  });

  it("retorna listas vazias quando não há itens", () => {
    expect(particionarInteracoes([])).toEqual({ automaticas: [], manuais: [] });
  });

  it("separa 'sistema' em automáticas e mantém o resto em manuais", () => {
    const itens = [
      make("1", "sistema"),
      make("2", "whatsapp"),
      make("3", "sistema"),
      make("4", "email"),
      make("5", "outro"),
    ];
    const r = particionarInteracoes(itens);
    expect(r.automaticas.map((i) => i.id)).toEqual(["1", "3"]);
    expect(r.manuais.map((i) => i.id)).toEqual(["2", "4", "5"]);
  });

  it("preserva a ordem original dentro de cada grupo", () => {
    const itens = [make("a", "telefone"), make("b", "sistema"), make("c", "telefone")];
    const r = particionarInteracoes(itens);
    expect(r.manuais.map((i) => i.id)).toEqual(["a", "c"]);
    expect(r.automaticas.map((i) => i.id)).toEqual(["b"]);
  });

  it("ignora entradas falsy dentro do array", () => {
    const itens = [make("1", "sistema"), null as any, undefined as any, make("2", "email")];
    const r = particionarInteracoes(itens);
    expect(r.automaticas).toHaveLength(1);
    expect(r.manuais).toHaveLength(1);
  });

  it("trata tipo desconhecido como manual", () => {
    const r = particionarInteracoes([make("1", "qualquer-coisa")]);
    expect(r.manuais).toHaveLength(1);
    expect(r.automaticas).toHaveLength(0);
  });
});
