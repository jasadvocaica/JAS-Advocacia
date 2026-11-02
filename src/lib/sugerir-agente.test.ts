import { describe, expect, it } from "vitest";
import { pedidoSugestao, textoDaResposta, validarSugestao } from "../../supabase/functions/agentes-escritorio/sugerir";

describe("criação de agente com IA", () => {
  it("pede resposta estruturada e não oferece delegar tarefa a agentes novos", () => {
    const p = pedidoSugestao("Assistente para publicações do DJEN previdenciárias", "gpt-4.1-mini-2025-04-14");
    const esquema = p.text.format.schema;
    expect(p.text.format.strict).toBe(true);
    const opcoes = esquema.properties.ferramentas_motor.items.enum as string[];
    expect(opcoes).toContain("consultar_publicacoes_djen");
    expect(opcoes).toContain("pesquisar_fontes_oficiais");
    expect(opcoes).not.toContain("delegar_tarefa");
    expect(p.instructions).toContain("Provimento 205/2021");
    expect(p.instructions).toContain("não calcule data fatal");
  });

  it("aceita só ferramentas do catálogo e ajusta campos fora do padrão", () => {
    const s = validarSugestao({
      nome: "Lara", cargo: "Analista de publicações", sala: "cozinha", tom: "engraçado", missao: "Resumir publicações.",
      prompt_base: "## Papel\nVocê é a Lara.", usa_base_conhecimento: true,
      ferramentas_motor: ["consultar_publicacoes_djen", "apagar_tudo", "delegar_tarefa", "consultar_publicacoes_djen"],
      motivo_ferramentas: "Para ler as publicações.", perguntas: ["Quais áreas?", "", "a", "b", "c"],
    });
    expect(s.sala).toBe("operacional");
    expect(s.tom).toBe("objetivo");
    expect(s.ferramentas_motor).toEqual(["consultar_publicacoes_djen"]);
    expect(s.perguntas).toEqual(["Quais áreas?", "a", "b"]);
  });

  it("recusa sugestão incompleta e lê o texto da resposta", () => {
    expect(() => validarSugestao({ nome: "", prompt_base: "" })).toThrow();
    expect(textoDaResposta({ output: [{ content: [{ type: "output_text", text: '{"a":' }, { type: "output_text", text: "1}" }] }] }))
      .toBe('{"a":1}');
  });
});
