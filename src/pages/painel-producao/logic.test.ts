import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  classificarUrgencia, ehMeu, filas, itemAtivo, minhasTarefas, minhaVez, ordenar,
  podeVerPainelProducao, precisaDeMimAgora, resumo, revisorParaAtribuir, slaReferencia,
  type ItemProducao,
} from "./logic";
import { podeTransicionar, transicoesPermitidas } from "@/pages/controladoria/workflow";

const EU = "u-prod";
const OUTRO = "u-outro";
const hoje = new Date("2026-08-23T12:00:00Z");
const d = (dias: number) => new Date(hoje.getTime() + dias * 864e5).toISOString();

function item(p: Partial<ItemProducao> = {}): ItemProducao {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    titulo: p.titulo ?? "Peça",
    status: p.status ?? "pendente",
    prioridade: p.prioridade ?? "media",
    data_vencimento: "data_vencimento" in p ? p.data_vencimento! : d(5),
    criado_em: p.criado_em ?? d(-3),
    etapa_workflow: p.etapa_workflow ?? "execucao",
    exige_revisao: p.exige_revisao ?? true,
    responsavel_id: "responsavel_id" in p ? p.responsavel_id! : EU,
    executor_id: "executor_id" in p ? p.executor_id! : EU,
    revisor_id: p.revisor_id ?? null,
    corretor_id: p.corretor_id ?? null,
    protocolador_id: p.protocolador_id ?? null,
    cliente_id: p.cliente_id ?? "c1",
    processo_id: p.processo_id ?? "p1",
    sla_pausado_em: p.sla_pausado_em ?? null,
    sla_pausa_motivo: p.sla_pausa_motivo ?? null,
    sla_minutos_pausados: p.sla_minutos_pausados ?? 0,
    comentario_revisao: p.comentario_revisao ?? null,
    ...p,
  } as ItemProducao;
}

describe("1-2 acesso e isolamento por responsável", () => {
  it("usuário de produção com itens atribuídos acessa o painel; sem usuário, não", () => {
    expect(podeVerPainelProducao({ userId: EU, temItens: true })).toBe(true);
    expect(podeVerPainelProducao({ userId: EU, temItens: false, isGestor: true })).toBe(true);
    expect(podeVerPainelProducao({ userId: null, temItens: true })).toBe(false);
  });

  it("itens de outra pessoa nunca entram na mesa de trabalho", () => {
    const alheio = item({ responsavel_id: OUTRO, executor_id: OUTRO });
    expect(ehMeu(alheio, EU)).toBe(false);
    const f = filas([alheio, item({ id: "meu" })], EU, hoje);
    expect(f.minhas.map((i) => i.id)).toEqual(["meu"]);
  });

  it("estar vinculado não basta: a fila da etapa exige ser o responsável da etapa", () => {
    const revisandoOutro = item({ etapa_workflow: "revisao", revisor_id: OUTRO, responsavel_id: OUTRO, executor_id: EU });
    expect(ehMeu(revisandoOutro, EU)).toBe(true);
    expect(minhaVez(revisandoOutro, EU)).toBe(false);
    const f = filas([revisandoOutro], EU, hoje);
    expect(f.emProducao).toHaveLength(0);
    expect(f.ajustes).toHaveLength(0);
  });
});

describe("3-4 fila de novos e início da produção", () => {
  it("caso novo atribuído aparece em Novos para produção", () => {
    const f = filas([item({ id: "novo", etapa_workflow: "criacao" })], EU, hoje);
    expect(f.novos.map((i) => i.id)).toEqual(["novo"]);
    expect(resumo(f, hoje).novos).toBe(1);
  });

  it("iniciar produção é a transição canônica criacao → execucao", () => {
    expect(podeTransicionar("criacao", "execucao")).toBe(true);
    expect(podeTransicionar("criacao", "protocolo")).toBe(false);
  });
});

describe("5-6 aguardando documentos e retomada", () => {
  it("item pausado sai de Em produção e entra em Aguardando documentos", () => {
    const i = item({ id: "x", sla_pausado_em: d(-2), sla_pausa_motivo: "CNIS", status: "aguardando" });
    const f = filas([i], EU, hoje);
    expect(f.emProducao).toHaveLength(0);
    expect(f.aguardandoDocumentos.map((v) => v.id)).toEqual(["x"]);
    expect(slaReferencia(i, hoje).emPausa).toBe(true);
  });

  it("a retomada preserva o tempo aguardado para o desconto futuro do SLA", () => {
    const retomado = item({ sla_pausado_em: null, sla_minutos_pausados: 2880 });
    const sla = slaReferencia(retomado, hoje);
    expect(sla.emPausa).toBe(false);
    expect(sla.minutosPausados).toBe(2880);
    expect(sla.preparado).toBe(true);
  });
});

describe("7-8-12 envio para revisão e saída da fila ativa", () => {
  it("finalizar a peça é enviar para revisão, nunca concluir", () => {
    expect(transicoesPermitidas("execucao", true)).toEqual(["revisao"]);
    expect(podeTransicionar("execucao", "finalizado")).toBe(false);
  });

  it("não é possível pular a revisão quando o item a exige", () => {
    expect(podeTransicionar("execucao", "protocolo", true)).toBe(false);
    expect(podeTransicionar("execucao", "protocolo", false)).toBe(true);
  });

  it("em revisão com outro revisor, o item some das filas de produção", () => {
    const f = filas([item({ etapa_workflow: "revisao", revisor_id: OUTRO })], EU, hoje);
    expect(f.emProducao).toHaveLength(0);
    expect(f.ajustes).toHaveLength(0);
    expect(f.aguardandoProtocolo).toHaveLength(0);
  });

  it("revisor só é atribuído a partir de configuração válida — sem fallback", () => {
    expect(revisorParaAtribuir(null)).toBeNull();
    expect(revisorParaAtribuir({ configurado: false, user_id: null, nome: null, ativo: false })).toBeNull();
    expect(revisorParaAtribuir({ configurado: true, user_id: "r1", nome: "Revisor", ativo: false })).toBeNull();
    expect(revisorParaAtribuir({ configurado: true, user_id: "r1", nome: "Revisor", ativo: true })).toBe("r1");
  });
});

describe("9-10 ajustes e reenvio", () => {
  it("devolvido pela revisão volta para quem produziu e aparece em Ajustes", () => {
    const i = item({ id: "aj", etapa_workflow: "correcao", corretor_id: EU, comentario_revisao: "Corrigir pedido" });
    const f = filas([i], EU, hoje);
    expect(f.ajustes.map((v) => v.id)).toEqual(["aj"]);
    expect(precisaDeMimAgora(f, hoje)[0].id).toBe("aj");
  });

  it("reenvio é a transição canônica correcao → revisao", () => {
    expect(transicoesPermitidas("correcao")).toEqual(["revisao"]);
  });
});

describe("11 protocolo", () => {
  it("aparece em Aguardando protocolo somente se o protocolador for o usuário", () => {
    const meu = item({ id: "prot", etapa_workflow: "protocolo", protocolador_id: EU });
    const alheio = item({ id: "outro", etapa_workflow: "protocolo", protocolador_id: OUTRO, responsavel_id: EU });
    const f = filas([meu, alheio], EU, hoje);
    expect(f.aguardandoProtocolo.map((i) => i.id)).toEqual(["prot"]);
  });

  it("concluir o protocolo é finalizar via transição canônica", () => {
    expect(transicoesPermitidas("protocolo")).toEqual(["finalizado"]);
  });
});

describe("13-14 histórico e itens antigos", () => {
  it("itens antigos e sem prazo continuam visíveis e ordenados por último", () => {
    const antigo = item({ id: "antigo", data_vencimento: null, criado_em: d(-400) });
    const vencido = item({ id: "venc", data_vencimento: d(-1) });
    expect(ordenar([antigo, vencido], hoje).map((i) => i.id)).toEqual(["venc", "antigo"]);
    expect(itemAtivo(antigo)).toBe(true);
  });

  it("item encerrado sai da mesa de trabalho, sem apagar nada", () => {
    expect(itemAtivo(item({ status: "concluido" }))).toBe(false);
    expect(itemAtivo(item({ etapa_workflow: "finalizado", status: "concluido" }))).toBe(false);
  });
});

describe("ordem e resumo", () => {
  it("ordem: vencido → hoje → ajustes → prioridade → antiguidade", () => {
    const lista = [
      item({ id: "futuro", data_vencimento: d(9) }),
      item({ id: "hoje", data_vencimento: d(0) }),
      item({ id: "vencido", data_vencimento: d(-2) }),
      item({ id: "urgente-futuro", data_vencimento: d(9), prioridade: "urgente" }),
    ];
    expect(ordenar(lista, hoje).map((i) => i.id)).toEqual(["vencido", "hoje", "urgente-futuro", "futuro"]);
  });

  it("resumo conta cada fila e os atrasados do usuário", () => {
    const f = filas(
      [
        item({ etapa_workflow: "criacao" }),
        item({ data_vencimento: d(-1) }),
        item({ sla_pausado_em: d(-1) }),
        item({ etapa_workflow: "correcao", corretor_id: EU }),
        item({ etapa_workflow: "protocolo", protocolador_id: EU }),
      ],
      EU,
      hoje,
    );
    const r = resumo(f, hoje);
    expect(r).toMatchObject({ novos: 1, emProducao: 1, aguardandoDocumentos: 1, ajustes: 1, aguardandoProtocolo: 1 });
    expect(r.atrasados).toBe(1);
  });

  it("minhas tarefas separa vencidas, hoje e próximas sem duplicar", () => {
    const f = filas([item({ data_vencimento: d(-1) }), item({ data_vencimento: d(0) }), item({ data_vencimento: d(4) })], EU, hoje);
    const t = minhasTarefas(f, hoje);
    expect([t.vencidas.length, t.hoje.length, t.proximas.length]).toEqual([1, 1, 1]);
    expect(classificarUrgencia(item({ data_vencimento: null }), hoje)).toBe("sem_prazo");
  });
});

describe("15-16 escopo do módulo", () => {
  const dir = __dirname;
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  const semComentarios = (f: string) =>
    fs
      .readFileSync(path.join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n")
      .toLowerCase();

  it("nenhum dado financeiro, de honorários ou de mensageria é lido no módulo", () => {
    for (const f of arquivos) {
      if (f === "logic.test.ts") continue;
      const c = semComentarios(f);
      for (const proibido of ["whatsapp", "honorarios", "financeiro_", "comissoes", "pagamentos_", "contratos_"]) {
        expect(c, `${f} referencia ${proibido}`).not.toContain(proibido);
      }
    }
  });

  it("nenhum UUID, e-mail ou nome fixo de pessoa no módulo", () => {
    for (const f of arquivos) {
      if (f === "logic.test.ts") continue;
      const c = semComentarios(f);
      expect(c).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
      expect(c).not.toMatch(/@[a-z0-9.-]+\.(com|br)/);
      for (const nome of ["matheus", "juliana", "valeska", "lana", "esther"]) {
        expect(c, `${f} cita ${nome}`).not.toContain(nome);
      }
    }
  });

  it("a leitura é filtrada por usuário no servidor (sem carregar a Controladoria inteira)", () => {
    const hook = fs.readFileSync(path.join(dir, "usePainelProducaoData.ts"), "utf8");
    expect(hook).toContain(".or(filtro)");
    expect(hook).toContain("responsavel_id.eq.");
    expect(hook).toContain("protocolador_id.eq.");
  });

  it("todas as mudanças de etapa usam a transição canônica", () => {
    const acoes = fs.readFileSync(path.join(dir, "acoes.ts"), "utf8");
    expect(acoes).toContain("transicionarEtapa");
    expect(acoes).not.toContain('.from("controladoria_itens")');
    expect(acoes).not.toMatch(/\.update\(/);
  });
});

describe("17-18 layout responsivo", () => {
  const tela = fs.readFileSync(path.join(__dirname, "PainelProducao.tsx"), "utf8");

  it("desktop: resumo em grade larga e tarefas em 3 colunas", () => {
    expect(tela).toContain("lg:grid-cols-6");
    expect(tela).toContain("lg:grid-cols-3");
  });

  it("mobile: grade reduzida e ordem prioriza Precisa de mim, Ajustes, Novos, Em produção, Protocolo", () => {
    expect(tela).toContain("grid-cols-2");
    const ordem = ["agora", "ajustes", "novos", "producao", "documentos", "protocolo", "tarefas"].map((id) =>
      tela.indexOf(`id="${id}"`),
    );
    expect(ordem.every((p) => p > 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });
});
