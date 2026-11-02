import { describe, expect, it } from "vitest";
import {
  caminhoNorma,
  converterNorma,
  textoSemRedacoesTachadas,
} from "../../supabase/functions/_shared/legislacao";
import {
  buscarFundamentos,
  fontesCitadas,
  type FonteLegal,
} from "../../supabase/functions/_shared/fundamentos";

const commit = "a".repeat(40);
const path = "federal/leis-ordinarias/2020/lei-123-2020-01-01.md";
const norma = `---\ntitulo: "Lei nº 123"\nnumero: "123"\ntipo: "Lei Ordinária"\nfonte: "https://www.planalto.gov.br/teste.htm"\nversao_texto: "compilada"\nbaixado_em: 2026-10-13\n---\n# Lei\n\n**Art. 1º** Direito antigo: ~~redação anterior~~ redação atual.\n\n**Art. 2º** *(Revogado).*\n\n**Art. 3º-A** Outra regra.`;
const fonte: FonteLegal = {
  id: "b".repeat(64),
  norma_id: path,
  titulo: "Lei nº 123",
  artigo: "Art. 1",
  trecho: "Texto recuperado.",
  fonte_oficial: "https://www.planalto.gov.br/teste.htm",
  fonte_repositorio: `https://github.com/ctresb/leis/blob/${commit}/${path}`,
  versao_sha: "c".repeat(64),
  commit,
  versao_texto: "compilada",
  capturado_em: "2026-10-13",
  importado_em: "2026-11-02T12:00:00Z",
  notas: "",
};

describe("biblioteca jurídica — importação e referências", () => {
  it("remove redações tachadas, identifica revogação e preserva o original", async () => {
    const n = await converterNorma(
      norma,
      { path, apelidos: ["Teste"] },
      commit,
    );
    expect(n.dispositivos).toHaveLength(3);
    expect(n.dispositivos[0].texto).not.toContain("redação anterior");
    expect(n.dispositivos[1].revogado).toBe(true);
    expect(n.dispositivos[2].artigo_numero).toBe("3-A");
    expect(n.texto_original).toBe(norma);
    expect(n.fonte_repositorio).toContain(commit);
    expect((await converterNorma(norma, { path }, commit)).sha256).toBe(
      n.sha256,
    );
    expect(
      (await converterNorma(norma + "\nAlteração", { path }, commit)).sha256,
    ).not.toBe(n.sha256);
  });
  it("não importa conteúdo sem origem oficial ou sem artigo", async () => {
    await expect(
      converterNorma(
        norma.replace("www.planalto.gov.br", "exemplo.com"),
        { path },
        commit,
      ),
    ).rejects.toThrow("Fonte oficial");
    await expect(
      converterNorma(norma.replace(/Art\./g, "Texto"), { path }, commit),
    ).rejects.toThrow("Nenhum artigo");
    expect(() => textoSemRedacoesTachadas("~~redação sem fechamento")).toThrow(
      "incompleta",
    );
  });
  it("não confunde texto citado em bloco com um novo artigo", async () => {
    const n = await converterNorma(
      norma.replace("**Art. 2º**", " > Art. 99. Citação.\n\n**Art. 2º**"),
      { path },
      commit,
    );
    expect(n.dispositivos).toHaveLength(3);
  });
  it("identifica ADCT e fragmenta artigos longos preservando a referência", async () => {
    const texto =
      "# Constituição\n> Fonte: [Planalto](https://www.planalto.gov.br/constituicao.htm), obtido em 2026-10-20.\n\n**Art. 1º** " +
      "Regra longa. ".repeat(1000) +
      "\n\n## ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS\n\n**Art. 1º** Disposição transitória.";
    const n = await converterNorma(texto, { path: "constituicao.md" }, commit);
    expect(n.dispositivos.every((d) => d.texto.length <= 6500)).toBe(true);
    expect(n.dispositivos.at(-1)?.artigo).toContain("ADCT");
  });
  it("não classifica referências ao ADCT dentro de lei ordinária como seção constitucional", async () => {
    const n = await converterNorma(
      norma.replace(
        "Direito antigo:",
        "Referência ao ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS. Direito antigo:",
      ),
      { path },
      commit,
    );
    expect(n.dispositivos.every((d) => !d.artigo.startsWith("ADCT"))).toBe(
      true,
    );
    expect(n.parser_versao).toBe(2);
  });
  it("restringe importação ao repositório e impede travessia de diretórios", () => {
    expect(
      caminhoNorma(`https://github.com/ctresb/leis/blob/main/${path}`),
    ).toBe(path);
    expect(() => caminhoNorma("https://outro.site/norma.md")).toThrow();
    expect(() => caminhoNorma("federal/../scripts/segredo.md")).toThrow();
  });
  it("recupera o texto do banco e não aceita referência inventada pela IA", async () => {
    const consultas: unknown[] = [];
    const banco = {
      rpc: async (_n: string, args: Record<string, unknown>) => {
        consultas.push(args);
        return { data: [fonte], error: null };
      },
    };
    const r = await buscarFundamentos(banco, {
      consulta: "BPC",
      selecionados: [fonte.id],
    });
    expect(r.fontes).toHaveLength(1);
    expect(r.fontes[0].referencia).toBe("L1");
    expect(consultas).toHaveLength(2);
    expect(fontesCitadas(["L1"], r.fontes)[0].id).toBe(fonte.id);
    expect(() => fontesCitadas(["L99"], r.fontes)).toThrow(
      "não foi recuperada",
    );
  });
  it("distingue falta de cobertura de inexistência de direito e registra versão antiga selecionada", async () => {
    const r = await buscarFundamentos(
      { rpc: async () => ({ data: [], error: null }) },
      { consulta: "benefício", selecionados: [fonte.id] },
    );
    expect(r.fontes).toEqual([]);
    expect(r.avisos.join(" ")).toContain("não significa inexistência");
    expect(r.avisos.join(" ")).toContain("fora da versão ativa");
  });
  it("falha explicitamente quando a pesquisa está indisponível", async () => {
    await expect(
      buscarFundamentos(
        { rpc: async () => ({ data: null, error: { message: "falhou" } }) },
        { consulta: "BPC" },
      ),
    ).rejects.toThrow("Não foi possível pesquisar");
  });
});
