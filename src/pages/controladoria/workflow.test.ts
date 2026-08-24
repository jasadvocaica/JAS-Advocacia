import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import {
  transicoesPermitidas, podeTransicionar, transicionarEtapa,
  etapaAtualDe, exigeObservacao, labelTransicao,
} from "./workflow";

describe("máquina de estados do fluxo (POP 01)", () => {
  it("criação só avança para execução", () => {
    expect(transicoesPermitidas("criacao")).toEqual(["execucao"]);
  });

  it("execução vai para revisão quando a tarefa exige revisão", () => {
    expect(transicoesPermitidas("execucao", true)).toEqual(["revisao"]);
    expect(podeTransicionar("execucao", "protocolo", true)).toBe(false);
  });

  it("execução pode ir direto ao protocolo quando não exige revisão", () => {
    expect(transicoesPermitidas("execucao", false)).toEqual(["protocolo"]);
    expect(podeTransicionar("execucao", "revisao", false)).toBe(false);
  });

  it("revisão devolve para correção ou aprova para protocolo", () => {
    expect(transicoesPermitidas("revisao")).toEqual(["correcao", "protocolo"]);
  });

  it("correção volta obrigatoriamente para revisão", () => {
    expect(transicoesPermitidas("correcao")).toEqual(["revisao"]);
    expect(podeTransicionar("correcao", "protocolo")).toBe(false);
  });

  it("protocolo finaliza e finalizado é terminal", () => {
    expect(transicoesPermitidas("protocolo")).toEqual(["finalizado"]);
    expect(transicoesPermitidas("finalizado")).toEqual([]);
  });

  it("não permite pular etapas", () => {
    expect(podeTransicionar("criacao", "protocolo")).toBe(false);
    expect(podeTransicionar("criacao", "finalizado")).toBe(false);
    expect(podeTransicionar("execucao", "finalizado")).toBe(false);
  });

  it("normaliza etapa ausente ou inválida para criação", () => {
    expect(etapaAtualDe({})).toBe("criacao");
    expect(etapaAtualDe({ etapa_workflow: "xpto" })).toBe("criacao");
    expect(etapaAtualDe({ etapa_workflow: "revisao" })).toBe("revisao");
  });

  it("exige observação apenas ao devolver para correção", () => {
    expect(exigeObservacao("correcao")).toBe(true);
    expect(exigeObservacao("protocolo")).toBe(false);
  });

  it("usa rótulos de ação claros", () => {
    expect(labelTransicao("revisao", "protocolo")).toBe("Aprovar para protocolo");
    expect(labelTransicao("correcao", "revisao")).toBe("Reenviar para revisão");
  });
});

describe("transicionarEtapa", () => {
  beforeEach(() => { rpcMock.mockReset(); rpcMock.mockResolvedValue({ error: null }); });

  it("bloqueia transição inválida sem chamar o banco", async () => {
    const r = await transicionarEtapa({ itemId: "1", etapaAtual: "criacao", novaEtapa: "protocolo" });
    expect(r.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("bloqueia devolução para correção sem observação", async () => {
    const r = await transicionarEtapa({ itemId: "1", etapaAtual: "revisao", novaEtapa: "correcao" });
    expect(r.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("chama a RPC canônica em transição válida", async () => {
    const r = await transicionarEtapa({
      itemId: "1", etapaAtual: "execucao", novaEtapa: "revisao", responsavelId: "u2",
    });
    expect(r.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("controladoria_transicionar_etapa", {
      _item_id: "1",
      _nova_etapa: "revisao",
      _responsavel_id: "u2",
      _observacao: null,
    });
  });

  it("propaga erro do banco", async () => {
    rpcMock.mockResolvedValue({ error: { message: "Transição inválida" } });
    const r = await transicionarEtapa({ itemId: "1", etapaAtual: "protocolo", novaEtapa: "finalizado" });
    expect(r).toEqual({ ok: false, erro: "Transição inválida" });
  });
});
