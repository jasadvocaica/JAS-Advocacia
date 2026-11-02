import { describe, expect, it, vi } from "vitest";
import {
  executarRodadas,
  ferramentasParaIA,
  lerEntrega,
  motivoAviso,
  simularAumento,
  validarParametros,
  type SituacaoOrcamento,
} from "../../supabase/functions/_shared/motor";

const situacao = (s: Partial<SituacaoOrcamento> = {}): SituacaoOrcamento => ({
  teto_absoluto_usd: 20, orcamento_mensal_usd: 10, extras_mes_usd: 0, gasto_mes_usd: 2,
  gasto_dia_usd: 0.1, limite_dia_usd: 0.33, media_7d_usd: 0.3, dias_restantes: 25, tarefas_na_fila: 0, ...s,
});

const texto = (t: string) => ({ output: [{ type: "message", content: [{ type: "output_text", text: t }] }] });
const chamada = (name: string, args: unknown, id = "c1") => ({
  output: [{ type: "function_call", call_id: id, name, arguments: JSON.stringify(args) }],
});

describe("ferramentas do motor", () => {
  it("só mostra à IA as ferramentas concedidas e conhecidas", () => {
    expect(ferramentasParaIA(["buscar_processo", "apagar_tudo"]).map((f) => f.name)).toEqual(["buscar_processo"]);
  });

  it("normaliza o número CNJ e recusa número incompleto", () => {
    expect(validarParametros("buscar_processo", { numero_cnj: "0001234-56.2024.8.11.0041" })).toEqual({ numero_cnj: "00012345620248110041" });
    expect(() => validarParametros("buscar_processo", { numero_cnj: "123456789012345" })).toThrow();
  });

  it("descarta campos fora do esquema na ação sensível", () => {
    const p = validarParametros("criar_item_controladoria", {
      titulo: "Conferir prazo", descricao: "Ver publicação", data_vencimento: "2026-11-10",
      prioridade: "alta", processo_id: null, responsavel_id: "x", status: "concluido",
    });
    expect(Object.keys(p).sort()).toEqual(["data_vencimento", "descricao", "prioridade", "processo_id", "titulo"]);
    expect(() => validarParametros("criar_item_controladoria", { ...p, data_vencimento: "10/11/2026" })).toThrow();
  });

  it("post no Zernio: só https, agendamento com fuso e antecedência, nada fora do esquema", () => {
    const daqui2dias = new Date(Date.now() + 2 * 86400000).toISOString().replace("Z", "-04:00");
    const p = validarParametros("zernio_publicar_post", {
      conta: "@julianaaraujoadv", texto: "Você sabe quando pedir o BPC?", midia_url: "https://cdn.exemplo.com/a.png",
      agendar_para: daqui2dias, publicar_sem_aprovacao: true,
    });
    expect(Object.keys(p).sort()).toEqual(["agendar_para", "conta", "midia_url", "texto"]);
    expect(p.conta).toBe("julianaaraujoadv");
    expect(validarParametros("zernio_publicar_post", { conta: "x1", texto: "Oi", midia_url: null, agendar_para: null }))
      .toEqual({ conta: "x1", texto: "Oi", midia_url: null, agendar_para: null });
    const base = { conta: "x1", texto: "Oi", midia_url: null, agendar_para: null };
    expect(() => validarParametros("zernio_publicar_post", { ...base, midia_url: "http://inseguro.com/a.png" })).toThrow();
    expect(() => validarParametros("zernio_publicar_post", { ...base, agendar_para: "2026-11-05T09:00:00" })).toThrow();
    expect(() => validarParametros("zernio_publicar_post", { ...base, agendar_para: new Date(Date.now() + 60000).toISOString() })).toThrow();
    expect(() => validarParametros("zernio_publicar_post", { ...base, agendar_para: new Date(Date.now() + 100 * 86400000).toISOString() })).toThrow();
    expect(ferramentasParaIA(["zernio_publicar_post"])[0].parameters.required).toEqual(["conta", "texto", "midia_url", "agendar_para"]);
  });

  it("recusa ferramenta desconhecida", () => {
    expect(() => validarParametros("executar_sql", {})).toThrow("Ferramenta desconhecida");
  });
});

describe("rodadas com ferramentas", () => {
  it("executa a ferramenta pedida e devolve o resultado à IA", async () => {
    const executar = vi.fn().mockResolvedValue([{ id: "1", titulo: "Prazo" }]);
    const chamarIA = vi.fn()
      .mockResolvedValueOnce(chamada("listar_itens_controladoria", { status: null, processo_id: null }))
      .mockResolvedValueOnce(texto('{"resumo":"1 item","entrega":"Prazo","pendencias":[]}'));
    const r = await executarRodadas({ entrada: {}, concedidas: ["listar_itens_controladoria"], chamarIA, executar });
    expect(executar).toHaveBeenCalledWith("listar_itens_controladoria", { status: null, processo_id: null });
    expect(r.rodadas).toBe(2);
    const segundaEntrada = chamarIA.mock.calls[1][1];
    expect(segundaEntrada.at(-1)).toMatchObject({ type: "function_call_output", call_id: "c1" });
  });

  it("não executa ferramenta que o agente não recebeu", async () => {
    const executar = vi.fn();
    const chamarIA = vi.fn()
      .mockResolvedValueOnce(chamada("criar_item_controladoria", {}))
      .mockResolvedValueOnce(texto("sem permissão"));
    await executarRodadas({ entrada: {}, concedidas: ["buscar_processo"], chamarIA, executar });
    expect(executar).not.toHaveBeenCalled();
    expect(chamarIA.mock.calls[1][1].at(-1).output).toContain("não disponível");
  });

  it("para depois do máximo de rodadas", async () => {
    const chamarIA = vi.fn().mockResolvedValue(chamada("consultar_indicadores", {}));
    await expect(
      executarRodadas({ entrada: {}, concedidas: ["consultar_indicadores"], chamarIA, executar: async () => ({}) }),
    ).rejects.toThrow("rodadas");
    expect(chamarIA).toHaveBeenCalledTimes(4);
  });

  it("lê a entrega em JSON ou texto solto", () => {
    expect(lerEntrega('```json\n{"resumo":"ok","entrega":"x","pendencias":["a"]}\n```')).toEqual({ resumo: "ok", entrega: "x", pendencias: ["a"] });
    expect(lerEntrega("texto livre").entrega).toBe("texto livre");
  });
});

describe("orçamento progressivo", () => {
  it("avisa com 80% do dia usado e fila esperando", () => {
    expect(motivoAviso(situacao({ gasto_dia_usd: 0.3, tarefas_na_fila: 2 }))).toMatch(/80%/);
    expect(motivoAviso(situacao({ gasto_dia_usd: 0.3, tarefas_na_fila: 0 }))).toBeNull();
  });

  it("avisa quando a média projeta passar do mês", () => {
    expect(motivoAviso(situacao({ media_7d_usd: 0.6 }))).toMatch(/média/);
  });

  it("simula opções sem passar do teto de US$ 20", () => {
    const opcoes = simularAumento(situacao());
    expect(opcoes.map((o) => o.tipo)).toEqual(["extra_dia", "mensal"]);
    expect(opcoes[1].valor_usd).toBe(15);
    for (const o of simularAumento(situacao({ orcamento_mensal_usd: 18, extras_mes_usd: 1 }))) {
      expect(o.tipo === "mensal" ? o.valor_usd + 1 : 18 + 1 + o.valor_usd).toBeLessThanOrEqual(20);
    }
  });

  it("não oferece aumento quando já está no teto", () => {
    expect(simularAumento(situacao({ orcamento_mensal_usd: 20 }))).toEqual([]);
  });
});
