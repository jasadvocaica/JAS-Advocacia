import { describe, expect, it } from "vitest";
import {
  etapaAtualDe,
  exigeObservacao,
  podeTransicionar,
  transicoesPermitidas,
} from "./workflow";

describe("máquina de estados da Controladoria", () => {
  it("mantém o fluxo canônico quando a revisão é obrigatória", () => {
    expect(transicoesPermitidas("criacao", true)).toEqual(["execucao"]);
    expect(transicoesPermitidas("execucao", true)).toEqual(["revisao"]);
    expect(transicoesPermitidas("revisao", true)).toEqual(["correcao", "protocolo"]);
    expect(transicoesPermitidas("correcao", true)).toEqual(["revisao"]);
    expect(transicoesPermitidas("protocolo", true)).toEqual(["finalizado"]);
    expect(transicoesPermitidas("finalizado", true)).toEqual([]);
  });

  it("desvia da execução para protocolo quando a revisão não é exigida", () => {
    expect(transicoesPermitidas("execucao", false)).toEqual(["protocolo"]);
    expect(podeTransicionar("execucao", "protocolo", false)).toBe(true);
    expect(podeTransicionar("execucao", "revisao", false)).toBe(false);
  });

  it("rejeita saltos, repetições e retorno de item finalizado", () => {
    expect(podeTransicionar("criacao", "protocolo", true)).toBe(false);
    expect(podeTransicionar("revisao", "revisao", true)).toBe(false);
    expect(podeTransicionar("finalizado", "execucao", true)).toBe(false);
  });

  it("exige apontamento apenas ao devolver para correção", () => {
    expect(exigeObservacao("correcao")).toBe(true);
    expect(exigeObservacao("revisao")).toBe(false);
    expect(exigeObservacao("protocolo")).toBe(false);
  });

  it("normaliza itens antigos para a etapa canônica", () => {
    expect(etapaAtualDe({ etapa_workflow: "protocolo" })).toBe("protocolo");
    expect(etapaAtualDe({ status: "concluido" })).toBe("finalizado");
    expect(etapaAtualDe({ status: "aguardando_revisao" })).toBe("revisao");
    expect(etapaAtualDe({ status: "em_andamento" })).toBe("execucao");
    expect(etapaAtualDe({ status: "pendente" })).toBe("criacao");
  });
});
