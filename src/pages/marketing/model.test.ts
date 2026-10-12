import { describe, it, expect } from "vitest";
import {
  MENUS,
  SECOES,
  linkSeguro,
  podePublicar,
  ordenarRotina,
  type Item,
} from "./model";
const item = (patch: Partial<Item> = {}) =>
  ({
    id: "teste",
    tipo: "conteudo",
    status: "aprovado",
    versao: 3,
    versao_aprovada: 3,
    prioridade: "normal",
    prazo: null,
    ...patch,
  }) as Item;
describe("Marketing: navegação e regras visuais", () => {
  it("organiza todos os submenus em cinco grupos, sem concorrentes", () => {
    expect(MENUS).toHaveLength(5);
    expect(new Set(SECOES.map((s) => s[0])).size).toBe(SECOES.length);
    expect(SECOES.some((s) => /concorrente|pesquisa/.test(s[0]))).toBe(false);
    expect(SECOES.map((s) => s[0])).toEqual(
      expect.arrayContaining(["pacotes", "modelos", "oportunidades", "resumo"]),
    );
  });
  it("exige aprovação da versão atual antes da publicação", () => {
    expect(podePublicar(item())).toBe(true);
    expect(podePublicar(item({ versao_aprovada: 2 }))).toBe(false);
    expect(podePublicar(item({ status: "aguardando_aprovacao" }))).toBe(false);
  });
  it("aprovação de roteiro não autoriza publicação do vídeo", () => {
    expect(
      podePublicar(
        item({
          tipo: "roteiro",
          status: "aguardando_gravacao",
          roteiro_aprovado: 3,
          versao_aprovada: null,
        }),
      ),
    ).toBe(false);
  });
  it("valida Drive sem aceitar domínios semelhantes ou scripts", () => {
    expect(linkSeguro("https://drive.google.com/file/d/x", true)).toBe(true);
    expect(
      linkSeguro("https://drive.google.com.evil.invalid/file/d/x", true),
    ).toBe(false);
    expect(linkSeguro("javascript:alert(1)")).toBe(false);
    expect(linkSeguro("http://drive.google.com/x", true)).toBe(false);
  });
  it("ordena atividades por prioridade e prazo", () => {
    const r = ordenarRotina([
      item({ id: "normal" }),
      item({ id: "urgente", prioridade: "urgente" }),
      item({ id: "cedo", prazo: "2026-10-01" }),
      item({ id: "tarde", prazo: "2026-10-20" }),
    ]);
    expect(r.map((i) => i.id)).toEqual(["urgente", "cedo", "tarde", "normal"]);
  });
});
