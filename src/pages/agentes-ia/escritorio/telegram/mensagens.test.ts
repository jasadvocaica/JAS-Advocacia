import { describe, expect, it } from "vitest";
import { ajuda, comando, dadosBotao, lerBotao, segredoValido, textoAprovacao } from "../../../../../supabase/functions/telegram/mensagens";

describe("Telegram · mensagens", () => {
  it("aceita só os caracteres que o Telegram permite no segredo do webhook", () => {
    expect(segredoValido("Abc123_xyz-9")).toBe(true);
    expect(segredoValido("@JulianaBot")).toBe(false);
    expect(segredoValido("senha com espaço")).toBe(false);
    expect(segredoValido("a+b/c=")).toBe(false);
    expect(segredoValido("")).toBe(false);
  });

  it("separa comandos, inclusive com o nome do bot e acento", () => {
    expect(comando("/vincular  ab12cd34ef ")).toEqual({ nome: "vincular", resto: "ab12cd34ef" });
    expect(comando("/missao@JasBot Revisar prazos\nda semana")).toEqual({ nome: "missao", resto: "Revisar prazos\nda semana" });
    expect(comando("/missão Revisar")).toEqual({ nome: "missao", resto: "Revisar" });
    expect(comando("  oi Manu  ")).toEqual({ nome: "", resto: "oi Manu" });
  });

  it("botão leva só o id e a decisão, dentro do limite de 64 bytes", () => {
    const id = "0f8b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
    const d = dadosBotao(id, true);
    expect(new TextEncoder().encode(d).length).toBeLessThanOrEqual(64);
    expect(lerBotao(d)).toEqual({ id, aprovar: true });
    expect(lerBotao(dadosBotao(id, false))).toEqual({ id, aprovar: false });
    expect(lerBotao("ap:nao-e-uuid:s")).toBeNull();
    expect(lerBotao("outra coisa")).toBeNull();
  });

  it("descreve o pedido com os campos que a pessoa precisa ver", () => {
    const t = textoAprovacao({
      id: "x", tipo: "acao", agente: "Manu", resumo: "Criar na Controladoria: Conferir prazo", riscos: "Cria uma atividade visível.",
      parametros: { titulo: "Conferir prazo", data_vencimento: "2026-11-10", processo_id: "oculto" }, escopo_hash: "h",
      valida_ate: "2026-11-09T12:00:00Z",
    });
    expect(t).toContain("Pedido de aprovação · Manu");
    expect(t).toContain("• Vencimento: 10/11/2026");
    expect(t).not.toContain("oculto");
    expect(t).toContain("⚠️ Cria uma atividade visível.");
  });

  it("antes de vincular, só explica como vincular", () => {
    expect(ajuda(false)).toContain("/vincular");
    expect(ajuda(false)).not.toContain("/missao");
    expect(ajuda(true)).toContain("/aprovacoes");
  });

  it("mostra o post inteiro que será publicado, sem o id interno da conta", () => {
    const t = textoAprovacao({
      id: "x", tipo: "acao", agente: "Nina", resumo: "Publicar no instagram (@julianaaraujoadv) assim que aprovado", riscos: null,
      parametros: { conta_id: "acc_123", plataforma: "instagram", conta: "@julianaaraujoadv", texto: "Você sabe quando pedir o BPC?",
        midia_url: "https://cdn.exemplo.com/a.png", agendar_para: "2026-11-05T13:00:00.000Z" },
      escopo_hash: "h", valida_ate: "2026-11-09T12:00:00Z",
    });
    expect(t).toContain("• Texto do post: Você sabe quando pedir o BPC?");
    expect(t).toContain("• Quando: 05/11/2026, 09:00");
    expect(t).not.toContain("acc_123");
  });
});
