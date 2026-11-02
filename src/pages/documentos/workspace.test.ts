import { describe, expect, it } from "vitest";
import {
  bloqueiosRevisao,
  CHECKLIST_REVISAO,
  normalizarContexto,
  pendenciasDocumento,
  textoDoHtml,
  textoParaHtml,
  urlFonteSegura,
} from "./workspace";

describe("produção de documentos — conferência e conteúdo externo", () => {
  it("converte sugestões em texto seguro sem executar HTML", () => {
    const html = textoParaHtml(
      'Um fato\ncom data.\n\n<script>alert("x")</script>',
    );
    expect(html).not.toContain("<script>");
    expect(textoDoHtml(html)).toContain('<script>alert("x")</script>');
    expect(html).toContain("<br>");
  });
  it("encontra lacunas da IA e variáveis de modelos, inclusive repetidas", () => {
    expect(
      pendenciasDocumento(
        "<p>{{nome}} {{nome}} [INSERIR: data] [CONFERIR: artigo]</p>",
      ),
    ).toEqual(["{{nome}}", "[INSERIR: data]", "[CONFERIR: artigo]"]);
  });
  it("não considera um campo dividido entre marcas como preenchido", () => {
    expect(pendenciasDocumento("<p>{{<strong>nome</strong>}}</p>")).toEqual([
      "{{nome}}",
    ]);
  });
  it("exige conferência do prazo e resolução dos comentários para aprovação", () => {
    const contexto = normalizarContexto({
      intimacao: "Manifeste-se sobre o laudo.",
      checklist: CHECKLIST_REVISAO.map((i) => i.id),
    });
    expect(
      bloqueiosRevisao({
        html: "<p>Manifestação</p>",
        contexto,
        comentariosAbertos: 1,
        proximo: "revisado",
      }),
    ).toHaveLength(2);
    expect(
      bloqueiosRevisao({
        html: "<p>Manifestação</p>",
        contexto: { ...contexto, prazo_conferido: true },
        comentariosAbertos: 0,
        proximo: "revisado",
      }),
    ).toEqual([]);
  });
  it("permite encaminhar uma minuta completa para revisão sem antecipar a aprovação", () => {
    expect(
      bloqueiosRevisao({
        html: "<p>Minuta</p>",
        contexto: normalizarContexto(),
        comentariosAbertos: 2,
        proximo: "em_revisao",
      }),
    ).toEqual([]);
    expect(
      bloqueiosRevisao({
        html: "<p>[PENDENTE: documento]</p>",
        contexto: normalizarContexto(),
        comentariosAbertos: 0,
        proximo: "em_revisao",
      }),
    ).toHaveLength(1);
  });
  it("só oferece links com protocolo HTTP ou HTTPS", () => {
    expect(urlFonteSegura("javascript:alert(1)")).toBe(false);
    expect(urlFonteSegura("data:text/html,oi")).toBe(false);
    expect(urlFonteSegura("https://www.planalto.gov.br/")).toBe(true);
  });
  it("mantém contexto independente para cada documento", () => {
    const a = normalizarContexto();
    a.fontes.push({ id: "1", titulo: "Fonte", url: "", trecho: "" });
    expect(normalizarContexto().fontes).toEqual([]);
  });
});
