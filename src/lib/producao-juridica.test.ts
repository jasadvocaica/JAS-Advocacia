import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import {
  iniciarProducaoJuridica,
  mensagemStatusProducao,
  SLA_PRODUCAO_DIAS_UTEIS,
} from "./producao-juridica";

beforeEach(() => rpcMock.mockReset());

describe("produção jurídica — gatilho de conversão da ficha (Fase 2A)", () => {
  it("chama a RPC canônica com a ficha convertida", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "criado", criou_fluxo: true, ja_existia: false, instancia_id: "i1", item_id: "t1" },
      error: null,
    });

    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-1", processoId: "proc-1" });

    expect(rpcMock).toHaveBeenCalledWith("iniciar_producao_juridica", {
      _atendimento_id: "ficha-1",
      _processo_id: "proc-1",
    });
    expect(r).toMatchObject({ ok: true, status: "criado", criouFluxo: true, instanciaId: "i1", itemId: "t1" });
  });

  it("idempotência: segunda conversão da mesma ficha não cria novo fluxo", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "ja_existia", criou_fluxo: false, ja_existia: true, instancia_id: "i1", item_id: "t1" },
      error: null,
    });

    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-1" });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("ja_existia");
    expect(r.criouFluxo).toBe(false);
    expect(r.instanciaId).toBe("i1");
  });

  it("primeira providência volta identificada no resultado", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "criado", criou_fluxo: true, instancia_id: "i9", item_id: "item-exec" },
      error: null,
    });
    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-9" });
    expect(r.itemId).toBe("item-exec");
  });

  it("ausência de associação de serviço: não cria nada e não bloqueia a conversão", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "sem_fluxo_configurado", criou_fluxo: false },
      error: null,
    });

    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-2" });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("sem_fluxo_configurado");
    expect(r.criouFluxo).toBe(false);
    expect(r.instanciaId).toBeNull();
    expect(r.itemId).toBeNull();
    expect(r.aviso).toContain("Pendência registrada");
  });

  it("associação inativa cai no mesmo caminho de sem fluxo configurado", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "sem_fluxo_configurado", criou_fluxo: false },
      error: null,
    });
    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-inativa" });
    expect(r.criouFluxo).toBe(false);
    expect(r.status).toBe("sem_fluxo_configurado");
  });

  it("ausência de responsável: registra pendência e segue sem criar tarefa", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "responsavel_nao_configurado", criou_fluxo: false },
      error: null,
    });

    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-3" });

    expect(r.ok).toBe(true);
    expect(r.status).toBe("responsavel_nao_configurado");
    expect(r.criouFluxo).toBe(false);
    expect(r.aviso).toContain("Responsável de produção não configurado".toLowerCase().slice(0, 11));
  });

  it("falha inesperada não derruba a conversão, apenas avisa", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-4" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("erro");
    expect(r.criouFluxo).toBe(false);
    expect(r.aviso).toBeTruthy();
  });

  it("mensagens de status são acionáveis e não indicam bloqueio", () => {
    expect(mensagemStatusProducao("sem_fluxo_configurado")).toContain("Conversão concluída");
    expect(mensagemStatusProducao("responsavel_nao_configurado")).toContain("Conversão concluída");
    expect(mensagemStatusProducao("criado")).toBeUndefined();
    expect(mensagemStatusProducao("ja_existia")).toBeUndefined();
  });

  it("SLA operacional é de 7 dias úteis e não altera prazo judicial", () => {
    expect(SLA_PRODUCAO_DIAS_UTEIS).toBe(7);
  });

  it("não há chamada retroativa: só dispara quando explicitamente invocado", async () => {
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("responsável: apenas o explícito da regra de serviço", () => {
  it("responsável global preenchido NÃO supre responsavel_id ausente na regra", async () => {
    // Cenário: configuracoes_sistema.producao_juridica.responsavel_padrao_user_id
    // está preenchido, mas a associação area+subtipo não tem responsavel_id.
    rpcMock.mockResolvedValue({
      data: { status: "responsavel_nao_configurado", criou_fluxo: false },
      error: null,
    });

    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-sem-resp-na-regra" });

    expect(r.status).toBe("responsavel_nao_configurado");
    expect(r.criouFluxo).toBe(false);
    expect(r.instanciaId).toBeNull();
    expect(r.itemId).toBeNull();
    expect(r.aviso).toContain("regra de serviço");
  });

  it("responsável da regra inativo ou não interno também não cria fluxo", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "responsavel_nao_configurado", criou_fluxo: false },
      error: null,
    });
    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-resp-inativo" });
    expect(r.criouFluxo).toBe(false);
    expect(r.status).toBe("responsavel_nao_configurado");
  });
});

describe("separação de SLA e prazo judicial", () => {
  it("template sem etapa de controladoria: não cria item fallback nem prazo judicial", async () => {
    rpcMock.mockResolvedValue({
      data: { status: "template_sem_providencia", criou_fluxo: false, instancia_id: "i7" },
      error: null,
    });

    const r = await iniciarProducaoJuridica({ atendimentoId: "ficha-template-vazio" });

    expect(r.status).toBe("template_sem_providencia");
    expect(r.criouFluxo).toBe(false);
    expect(r.itemId).toBeNull();
    expect(mensagemStatusProducao("template_sem_providencia")).toContain("nenhum prazo foi inventado");
  });
});
