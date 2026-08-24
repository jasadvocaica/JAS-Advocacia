import { describe, it, expect } from "vitest";
import { resolverAtivoStatusUnificacao } from "./unificar-clientes-rules";

describe("unificar_clientes — preservação de status/ativo", () => {
  it("ambos ativos permanece ativo", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: true, status: "ativo" },
        { ativo: true, status: "ativo" },
      ),
    ).toEqual({ ativo: true, status: "ativo" });
  });

  it("mantido inativo + removido ativo => ativo (cenário do bug Milena)", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: false, status: "inativo" },
        { ativo: true, status: "ativo" },
      ),
    ).toEqual({ ativo: true, status: "ativo" });
  });

  it("mantido ativo + removido inativo => ativo", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: true, status: "ativo" },
        { ativo: false, status: "inativo" },
      ),
    ).toEqual({ ativo: true, status: "ativo" });
  });

  it("ambos inativos permanece inativo", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: false, status: "inativo" },
        { ativo: false, status: "inativo" },
      ),
    ).toEqual({ ativo: false, status: "inativo" });
  });

  it("ativo + prospecto => ativo (status ativo vence)", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: true, status: "prospecto" },
        { ativo: true, status: "ativo" },
      ),
    ).toEqual({ ativo: true, status: "ativo" });
  });

  it("prospecto + inativo com algum ativo=true => preserva prospecto", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: true, status: "prospecto" },
        { ativo: false, status: "inativo" },
      ),
    ).toEqual({ ativo: true, status: "prospecto" });
  });

  it("inativo + prospecto com algum ativo=true => preserva prospecto (não cai em inativo)", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: false, status: "inativo" },
        { ativo: true, status: "prospecto" },
      ),
    ).toEqual({ ativo: true, status: "prospecto" });
  });

  it("status nulos com ativo=true => default 'ativo'", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: true, status: null },
        { ativo: false, status: null },
      ),
    ).toEqual({ ativo: true, status: "ativo" });
  });

  it("ativo nulo é tratado como false", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: null, status: null },
        { ativo: null, status: null },
      ),
    ).toEqual({ ativo: false, status: "inativo" });
  });

  it("nenhum ativo, status diferentes => mantém o do mantido", () => {
    expect(
      resolverAtivoStatusUnificacao(
        { ativo: false, status: "prospecto" },
        { ativo: false, status: "inativo" },
      ),
    ).toEqual({ ativo: false, status: "prospecto" });
  });
});
