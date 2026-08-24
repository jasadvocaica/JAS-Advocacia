import { describe, it, expect, vi, beforeEach } from "vitest";

type InsertCall = { table: string; payload: any };
const calls: InsertCall[] = [];
let atendimentoInsertResult: { data: any; error: any } = { data: { id: "atd-1" }, error: null };
let interacaoInsertResult: { data: any; error: any } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      return {
        insert(payload: any) {
          calls.push({ table, payload });
          if (table === "cliente_atendimentos") {
            return {
              select: () => ({
                single: () => Promise.resolve(atendimentoInsertResult),
              }),
            };
          }
          // cliente_interacoes
          return Promise.resolve(interacaoInsertResult);
        },
      };
    },
  },
}));

import { registrarAtendimento } from "./atendimentos";

beforeEach(() => {
  calls.length = 0;
  atendimentoInsertResult = { data: { id: "atd-1" }, error: null };
  interacaoInsertResult = { data: null, error: null };
});

describe("registrarAtendimento", () => {
  it("rejeita entrada incompleta sem chamar o banco", async () => {
    const r = await registrarAtendimento({
      clienteId: "",
      titulo: "x",
      resumo: "y",
      ferramenta: "manual",
    });
    expect(r.error).toBeInstanceOf(Error);
    expect(calls.length).toBe(0);
  });

  it("rejeita título e resumo apenas com espaços", async () => {
    const r = await registrarAtendimento({
      clienteId: "c1",
      titulo: "   ",
      resumo: "   ",
      ferramenta: "manual",
    });
    expect(r.error).toBeInstanceOf(Error);
    expect(calls.length).toBe(0);
  });

  it("grava em cliente_atendimentos e espelha em cliente_interacoes como 'sistema' por padrão", async () => {
    await registrarAtendimento({
      clienteId: "c1",
      titulo: "Resumo do caso",
      resumo: "Cliente busca revisão da vida toda.",
      ferramenta: "analisador_caso",
      link: "/ferramentas/analisador-caso?id=abc",
      criadoPor: "user-1",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].table).toBe("cliente_atendimentos");
    expect(calls[0].payload).toMatchObject({
      cliente_id: "c1",
      titulo: "Resumo do caso",
      resumo: "Cliente busca revisão da vida toda.",
      ferramenta: "analisador_caso",
      origem: "sistema",
      criado_por: "user-1",
    });

    expect(calls[1].table).toBe("cliente_interacoes");
    expect(calls[1].payload.cliente_id).toBe("c1");
    expect(calls[1].payload.tipo).toBe("sistema");
    expect(calls[1].payload.criado_por).toBe("user-1");
    // Descrição contém label da ferramenta, título, resumo e link
    expect(calls[1].payload.descricao).toContain("[Analisador de Caso] Resumo do caso");
    expect(calls[1].payload.descricao).toContain("Cliente busca revisão da vida toda.");
    expect(calls[1].payload.descricao).toContain("/ferramentas/analisador-caso?id=abc");
  });

  it("usa tipo 'atendimento' quando origem é manual", async () => {
    await registrarAtendimento({
      clienteId: "c1",
      titulo: "Reunião",
      resumo: "Conversa presencial",
      ferramenta: "manual",
      origem: "manual",
    });
    expect(calls[1].payload.tipo).toBe("atendimento");
  });

  it("trim em título e resumo é aplicado em ambas as tabelas", async () => {
    await registrarAtendimento({
      clienteId: "c1",
      titulo: "   Título com espaços   ",
      resumo: "   Resumo com espaços   ",
      ferramenta: "analise_publicacoes_ia",
    });
    expect(calls[0].payload.titulo).toBe("Título com espaços");
    expect(calls[0].payload.resumo).toBe("Resumo com espaços");
    expect(calls[1].payload.descricao).toContain("Título com espaços");
    expect(calls[1].payload.descricao).toContain("Resumo com espaços");
    // Label correto da ferramenta
    expect(calls[1].payload.descricao).toContain("[Análise de Publicações IA]");
  });

  it("não inclui linha de link quando link não é fornecido", async () => {
    await registrarAtendimento({
      clienteId: "c1",
      titulo: "T",
      resumo: "R",
      ferramenta: "publicacoes_pje",
    });
    expect(calls[1].payload.descricao).not.toContain("Abrir registro:");
  });

  it("retorna erro do insert em cliente_atendimentos sem impedir o espelhamento", async () => {
    atendimentoInsertResult = { data: null, error: { message: "RLS bloqueou" } };
    const r = await registrarAtendimento({
      clienteId: "c1",
      titulo: "T",
      resumo: "R",
      ferramenta: "manual",
    });
    expect(r.error).toEqual({ message: "RLS bloqueou" });
    // Mesmo com erro, o espelhamento foi tentado (linha do tempo continua útil)
    expect(calls.find((c) => c.table === "cliente_interacoes")).toBeTruthy();
  });
});
