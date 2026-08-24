import { describe, it, expect } from "vitest";
import {
  formatarMensagemSync,
  MENSAGEM_PADRAO_SEM_TOTAIS,
} from "./sync-message";

describe("formatarMensagemSync — resposta sem totais", () => {
  it("usa mensagem padrão quando resposta é apenas { ok: true }", () => {
    const out = formatarMensagemSync({ ok: true });
    expect(out.title).toBe("Sincronização concluída");
    expect(out.description).toBe(MENSAGEM_PADRAO_SEM_TOTAIS);
    expect(out.precisaCadastrar).toBe(true);
  });

  it("preserva `message` quando vem sem totais", () => {
    const out = formatarMensagemSync({
      ok: true,
      message: "Nenhum monitoramento ativo",
    });
    expect(out.description).toBe("Nenhum monitoramento ativo");
    expect(out.precisaCadastrar).toBe(true);
  });

  it("não quebra com resposta null", () => {
    expect(() => formatarMensagemSync(null)).not.toThrow();
    const out = formatarMensagemSync(null);
    expect(out.description).toBe(MENSAGEM_PADRAO_SEM_TOTAIS);
    expect(out.precisaCadastrar).toBe(true);
  });

  it("não quebra com resposta undefined", () => {
    expect(() => formatarMensagemSync(undefined)).not.toThrow();
    expect(formatarMensagemSync(undefined).description).toBe(
      MENSAGEM_PADRAO_SEM_TOTAIS,
    );
  });

  it("não quebra com objeto vazio", () => {
    expect(() => formatarMensagemSync({})).not.toThrow();
    expect(formatarMensagemSync({}).description).toBe(
      MENSAGEM_PADRAO_SEM_TOTAIS,
    );
  });

  it("não quebra com ok=false e sem totais", () => {
    const out = formatarMensagemSync({ ok: false, message: "indisponível" });
    expect(out.description).toBe("indisponível");
    expect(out.precisaCadastrar).toBe(true);
  });

  it("mensagem padrão cita os 4 tipos de campo aceitos", () => {
    expect(MENSAGEM_PADRAO_SEM_TOTAIS).toMatch(/OAB/);
    expect(MENSAGEM_PADRAO_SEM_TOTAIS).toMatch(/nome/i);
    expect(MENSAGEM_PADRAO_SEM_TOTAIS).toMatch(/CPF\/CNPJ/);
    expect(MENSAGEM_PADRAO_SEM_TOTAIS).toMatch(/CNJ/);
  });
});

describe("formatarMensagemSync — resposta com totais", () => {
  it("formata totais completos", () => {
    const out = formatarMensagemSync({
      ok: true,
      totais: { consultadas: 10, novas: 3, vinculadas: 2, erros: 1 },
    });
    expect(out.description).toBe("3 nova(s) · 2 vinculada(s) · 1 erro(s)");
    expect(out.precisaCadastrar).toBe(false);
  });

  it("usa zero para campos numéricos faltantes em totais", () => {
    const out = formatarMensagemSync({ ok: true, totais: {} });
    expect(out.description).toBe("0 nova(s) · 0 vinculada(s) · 0 erro(s)");
    expect(out.precisaCadastrar).toBe(false);
  });

  it("formata apenas com `novas`", () => {
    const out = formatarMensagemSync({ ok: true, totais: { novas: 5 } });
    expect(out.description).toBe("5 nova(s) · 0 vinculada(s) · 0 erro(s)");
  });
});
