import { describe, it, expect } from "vitest";
import {
  normalizarChave,
  indicadoresServico,
  validarServico,
  agruparPorArea,
  rotuloArea,
  STATUS_HOMOLOGACAO_LABEL,
} from "./catalogo-servicos";

describe("catálogo — normalização (idempotência de chave)", () => {
  it("normaliza acentos, caixa e pontuação", () => {
    expect(normalizarChave("Divórcio Consensual")).toBe("divorcio consensual");
    expect(normalizarChave("BPC/LOAS — negativa")).toBe("bpc loas negativa");
  });

  it("é idempotente: normalizar duas vezes não muda o resultado", () => {
    const a = normalizarChave("Bloqueio, suspensão ou desativação de conta");
    expect(normalizarChave(a)).toBe(a);
  });

  it("trata nulos", () => {
    expect(normalizarChave(null)).toBe("");
    expect(normalizarChave(undefined)).toBe("");
  });
});

describe("catálogo — indicadores", () => {
  const semNada = { template_id: null, responsavel_id: null };

  it("marca SEM POP e SEM RESPONSÁVEL quando ausentes", () => {
    const codigos = indicadoresServico(semNada, 0, 0).map((i) => i.codigo);
    expect(codigos).toContain("incompleto");
    expect(codigos).toContain("sem_pop");
    expect(codigos).toContain("sem_responsavel");
    expect(codigos).toContain("sem_triagem");
    expect(codigos).toContain("sem_documentos");
  });

  it("marca CONFIGURADO somente com POP, responsável, triagem e documentos", () => {
    const ind = indicadoresServico({ template_id: "t1", responsavel_id: "u1" }, 3, 2);
    expect(ind).toHaveLength(1);
    expect(ind[0].codigo).toBe("configurado");
  });

  it("piloto com 9 perguntas e sem POP/responsável continua INCOMPLETO", () => {
    const codigos = indicadoresServico(semNada, 9, 0).map((i) => i.codigo);
    expect(codigos).toContain("incompleto");
    expect(codigos).not.toContain("sem_triagem");
    expect(codigos).toContain("sem_pop");
    expect(codigos).toContain("sem_responsavel");
  });
});

describe("catálogo — validações", () => {
  it("exige nome e área", () => {
    const erros = validarServico({ nome: "  ", area: "" });
    expect(erros.map((e) => e.campo)).toEqual(["nome", "area"]);
  });

  it("impede ativar operacionalmente um serviço A CONFIRMAR", () => {
    const erros = validarServico({
      nome: "Serviço",
      area: "civil",
      status_homologacao: "a_confirmar",
      ativo_operacional: true,
    });
    expect(erros.some((e) => e.campo === "ativo_operacional")).toBe(true);
  });

  it("aceita ativo operacional quando homologado", () => {
    const erros = validarServico({
      nome: "Serviço",
      area: "civil",
      status_homologacao: "ativo",
      ativo_operacional: true,
    });
    expect(erros).toHaveLength(0);
  });

  it("rejeita status inválido e SLA negativo", () => {
    const erros = validarServico({
      nome: "X",
      area: "civil",
      status_homologacao: "qualquer",
      sla_dias_uteis: -3,
    });
    expect(erros.map((e) => e.campo).sort()).toEqual(["sla_dias_uteis", "status_homologacao"]);
  });

  it("conhece exatamente os 6 status de homologação", () => {
    expect(Object.keys(STATUS_HOMOLOGACAO_LABEL).sort()).toEqual(
      ["a_confirmar", "ativo", "descartar", "inativo", "renomear", "unificar"],
    );
  });
});

describe("catálogo — agrupamento por área", () => {
  it("agrupa e ordena por rótulo da área e nome", () => {
    const grupos = agruparPorArea([
      { area: "previdenciario", nome: "BPC/LOAS" },
      { area: "civil", nome: "Usucapião" },
      { area: "civil", nome: "Cobrança" },
    ]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Cível", "Previdenciário"]);
    expect(grupos[0].itens.map((i) => i.nome)).toEqual(["Cobrança", "Usucapião"]);
  });

  it("rotula áreas desconhecidas com o próprio texto", () => {
    expect(rotuloArea("Inventário e Sucessões")).toBe("Inventário e Sucessões");
    expect(rotuloArea(null)).toBe("Sem área");
  });
});

// ============================================================
// FASE DE HOMOLOGAÇÃO — sugestão x decisão
// ============================================================
import {
  montarPatchHomologacao,
  podeAtivarOperacional,
  validarServicoPrincipal,
  filtrarPorClassificacao,
  CLASSIFICACAO_LABEL,
  ACAO_RECOMENDADA_LABEL,
  type Classificacao,
} from "./catalogo-servicos";

const base = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "s1",
  classificacao: "a_confirmar" as Classificacao,
  classificacao_sugerida: "servico_juridico" as Classificacao,
  status_homologacao: "a_confirmar" as const,
  ativo_operacional: false,
  area: "civil",
  modalidade: null,
  servico_principal_id: null,
  possivel_duplicidade: false,
  duplicidade_justificativa: null,
  ...over,
});

describe("homologação — separação entre sugestão e decisão", () => {
  it("o patch de homologação só grava campos de decisão", () => {
    const patch = montarPatchHomologacao({
      ...base({ classificacao: "pop_auxiliar", modalidade: "Extrajudicial" }),
      // campos que jamais podem vazar na homologação
      ativo_operacional: true,
      template_id: "t1",
      responsavel_id: "u1",
      sla_dias_uteis: 7,
      status_homologacao: "ativo",
      classificacao_sugerida: "servico_juridico",
    } as never);

    expect(Object.keys(patch).sort()).toEqual([
      "area", "classificacao", "duplicidade_justificativa",
      "modalidade", "possivel_duplicidade", "servico_principal_id",
    ]);
    expect(patch).not.toHaveProperty("ativo_operacional");
    expect(patch).not.toHaveProperty("template_id");
    expect(patch).not.toHaveProperty("responsavel_id");
    expect(patch).not.toHaveProperty("sla_dias_uteis");
    expect(patch).not.toHaveProperty("classificacao_sugerida");
    expect(patch.classificacao).toBe("pop_auxiliar");
  });

  it("a sugestão nunca é copiada automaticamente para a decisão", () => {
    const s = base();
    const patch = montarPatchHomologacao(s as never);
    expect(patch.classificacao).toBe("a_confirmar");
    expect(s.classificacao_sugerida).toBe("servico_juridico");
  });

  it("montar o patch é idempotente", () => {
    const s = base({ classificacao: "modelo_documento", modalidade: "Recurso" });
    expect(montarPatchHomologacao(s as never)).toEqual(montarPatchHomologacao(s as never));
  });
});

describe("homologação — ausência de ativação", () => {
  it("não permite ativar item a confirmar", () => {
    expect(podeAtivarOperacional({ status_homologacao: "a_confirmar", classificacao: "servico_juridico" })).toBe(false);
    expect(podeAtivarOperacional({ status_homologacao: "ativo", classificacao: "a_confirmar" })).toBe(false);
  });

  it("permite apenas quando status e classificação estão homologados", () => {
    expect(podeAtivarOperacional({ status_homologacao: "ativo", classificacao: "servico_juridico" })).toBe(true);
  });

  it("homologar classificação não muda ativo_operacional", () => {
    const s = base({ classificacao: "servico_juridico", ativo_operacional: false });
    const patch = montarPatchHomologacao(s as never);
    expect("ativo_operacional" in patch).toBe(false);
  });
});

describe("homologação — self-FK do serviço principal", () => {
  it("rejeita o próprio serviço como principal", () => {
    expect(validarServicoPrincipal("s1", "s1")?.campo).toBe("servico_principal_id");
  });
  it("rejeita referência circular direta", () => {
    expect(validarServicoPrincipal("s1", "s2", { s2: "s1" })?.campo).toBe("servico_principal_id");
  });
  it("aceita principal válido ou nulo", () => {
    expect(validarServicoPrincipal("s1", null)).toBeNull();
    expect(validarServicoPrincipal("s1", "s2", { s2: null })).toBeNull();
  });
});

describe("homologação — filtros por classificação", () => {
  const itens = [
    { classificacao: "a_confirmar", classificacao_sugerida: "servico_juridico" },
    { classificacao: "pop_auxiliar", classificacao_sugerida: "pop_auxiliar" },
    { classificacao: "a_confirmar", classificacao_sugerida: "modelo_documento" },
  ] as { classificacao: Classificacao; classificacao_sugerida: Classificacao }[];

  it("filtra pela decisão homologada", () => {
    expect(filtrarPorClassificacao(itens, "a_confirmar", "homologada")).toHaveLength(2);
    expect(filtrarPorClassificacao(itens, "pop_auxiliar", "homologada")).toHaveLength(1);
  });

  it("filtra pela sugestão", () => {
    expect(filtrarPorClassificacao(itens, "servico_juridico", "sugerida")).toHaveLength(1);
    expect(filtrarPorClassificacao(itens, "modelo_documento", "sugerida")).toHaveLength(1);
  });

  it("'todas' devolve tudo", () => {
    expect(filtrarPorClassificacao(itens, "todas", "sugerida")).toHaveLength(3);
  });

  it("expõe exatamente as 5 classificações e as 7 ações recomendadas", () => {
    expect(Object.keys(CLASSIFICACAO_LABEL)).toHaveLength(5);
    expect(Object.keys(ACAO_RECOMENDADA_LABEL)).toHaveLength(7);
  });
});

describe("homologação — modalidades", () => {
  it("modalidade é campo livre e independente da sugerida", () => {
    const s = base({ modalidade: "Requerimento administrativo" });
    const patch = montarPatchHomologacao({ ...s, modalidade_sugerida: "Pós-concessão" } as never);
    expect(patch.modalidade).toBe("Requerimento administrativo");
    expect(patch).not.toHaveProperty("modalidade_sugerida");
  });

  it("permite limpar a modalidade", () => {
    expect(montarPatchHomologacao(base({ modalidade: null }) as never).modalidade).toBeNull();
  });
});
