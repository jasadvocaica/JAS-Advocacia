// Edge function: agente-prazos (Vanessa, gestora de prazos)
// Roda nos dias úteis depois do djen-diario (cron com segredo do Vault) ou
// manualmente pela gestão. Para cada publicação DJEN com triagem pendente:
//   1. a IA (OpenAI, mesmo modelo do assistente) identifica providência e prazo;
//   2. as datas são contadas no banco (adicionar/subtrair_dias_uteis + feriados);
//   3. o prazo entra na Controladoria como NÃO conferido e é distribuído;
//   4. a triagem é concluída com o resultado, e tudo fica registrado.
// O que não estiver claro continua na triagem humana.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ajustarInterno, dataBR, decidir, escolherResponsavel, prioridadePara, somarDias, tituloItem,
  type Extracao, type MembroCarga,
} from "./regras.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agentes-cron-secret",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AGENTE = "vanessa_prazos";
const MODELO = "gpt-4.1-mini-2025-04-14";
const PRECO_ENTRADA = 0.40 / 1e6, PRECO_SAIDA = 1.60 / 1e6;
const FUSO = "-04:00"; // America/Cuiaba

const INSTRUCOES = `Você é a Vanessa, gestora de prazos do escritório Juliana Araújo Advocacia (OAB/MT 34182), que representa partes privadas.
Leia a publicação do DJEN e responda somente com o JSON pedido.
- exige_providencia: true se o escritório precisa fazer algo (manifestar, recorrer, cumprir, comparecer, juntar documento). false se for só ciência.
- tipo_item: prazo_fatal (recurso, contestação, contrarrazões, embargos, impugnação, cumprimento sob pena de preclusão/revelia), prazo_processual (demais manifestações), audiencia, pericia, reuniao, diligencia ou tarefa.
- providencia: o que fazer, curto e no infinitivo (ex.: "Apresentar contrarrazões à apelação").
- prazo_dias e prazo_tipo: o número de dias do prazo e se são dias_uteis ou dias_corridos. Regras: CPC e Juizados (Lei 9.099, art. 12-A) e CLT (art. 775) em dias úteis; processo penal (CPP art. 798) em dias corridos. Use o prazo fixado no texto quando houver; senão, o prazo legal. Não aplique prazo em dobro (o escritório não é Fazenda Pública nem Defensoria). NÃO calcule datas.
- data_evento e hora_evento: só para audiência, perícia ou reunião designadas (YYYY-MM-DD e HH:MM).
- base_legal: dispositivo que fundamenta o prazo, se souber.
- confianca: de 0 a 1. Use menos de 0.75 se o texto for ambíguo, incompleto ou se você não tiver certeza do prazo.
- justificativa: 1 ou 2 frases explicando sua leitura.
Nunca invente. Na dúvida, baixa confiança.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["exige_providencia", "tipo_item", "providencia", "prazo_dias", "prazo_tipo", "base_legal", "data_evento", "hora_evento", "confianca", "justificativa"],
  properties: {
    exige_providencia: { type: "boolean" },
    tipo_item: { type: "string", enum: ["prazo_fatal", "prazo_processual", "audiencia", "pericia", "reuniao", "diligencia", "tarefa"] },
    providencia: { type: "string" },
    prazo_dias: { type: ["integer", "null"] },
    prazo_tipo: { type: ["string", "null"], enum: ["dias_uteis", "dias_corridos", null] },
    base_legal: { type: ["string", "null"] },
    data_evento: { type: ["string", "null"] },
    hora_evento: { type: ["string", "null"] },
    confianca: { type: "number" },
    justificativa: { type: "string" },
  },
};

interface Publicacao {
  id: string;
  numero_processo: string | null;
  numero_processo_limpo: string | null;
  sigla_tribunal: string | null;
  nome_orgao: string | null;
  tipo_comunicacao: string | null;
  texto_publicacao: string | null;
  data_disponibilizacao: string | null;
  link_certidao: string | null;
  processo_id: string;
  item_controladoria_id: string;
}

const hojeCuiaba = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);

async function rpcData(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.rpc(fn, args);
  if (error || !data) throw new Error(`Falha em ${fn}: ${error?.message ?? "sem retorno"}`);
  return String(data).slice(0, 10);
}

async function lerPublicacao(key: string, p: Publicacao) {
  const texto = [
    `Processo: ${p.numero_processo ?? p.numero_processo_limpo ?? "não informado"}`,
    `Tribunal/órgão: ${p.sigla_tribunal ?? ""} ${p.nome_orgao ?? ""}`.trim(),
    `Tipo de comunicação: ${p.tipo_comunicacao ?? "não informado"}`,
    `Disponibilizada em: ${p.data_disponibilizacao ?? "não informado"}`,
    "",
    (p.texto_publicacao ?? "").slice(0, 12000),
  ].join("\n");
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      store: false,
      instructions: INSTRUCOES,
      input: texto,
      max_output_tokens: 600,
      text: { format: { type: "json_schema", name: "leitura_publicacao", strict: true, schema: SCHEMA } },
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const body = await resp.json();
  const saida = (body.output ?? [])
    .flatMap((o: any) => o.content ?? [])
    .find((c: any) => c.type === "output_text")?.text;
  const entrada = Number(body.usage?.input_tokens ?? 0), gerado = Number(body.usage?.output_tokens ?? 0);
  let extracao: Extracao | null = null;
  try { extracao = JSON.parse(saida ?? "null"); } catch { extracao = null; }
  return { extracao, entrada, gerado };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Quem chamou: o cron (segredo do Vault) ou alguém da gestão.
  let origem: "agendado" | "manual";
  let iniciadoPor: string | null = null;
  const segredo = req.headers.get("x-agentes-cron-secret");
  if (segredo) {
    const { data: ok } = await db.rpc("validar_agentes_cron_secret", { _secret: segredo });
    if (ok !== true) return json({ error: "Chamada agendada não autorizada" }, 401);
    origem = "agendado";
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado" }, 401);
    const { data: { user } } = await createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      global: { headers: { Authorization: auth } },
    }).auth.getUser();
    if (!user) return json({ error: "Token inválido" }, 401);
    const { data: gestor } = await db.rpc("has_role", { _user_id: user.id, _role: "gestor" });
    if (!gestor) return json({ error: "Somente a gestão pode acionar agentes" }, 403);
    origem = "manual";
    iniciadoPor = user.id;
  }

  const { data: agente } = await db.from("agentes_ia").select("*").eq("codigo", AGENTE).single();
  if (!agente?.contratado) return json({ ok: false, motivo: "A Vanessa não está contratada" }, 200);
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return json({ error: "OPENAI_API_KEY não configurada no servidor" }, 503);

  const { data: emCurso } = await db.from("agentes_execucoes").select("id")
    .eq("agente", AGENTE).eq("status", "rodando")
    .gte("iniciado_em", new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1);
  if (emCurso?.length) return json({ error: "A Vanessa já está trabalhando. Aguarde alguns minutos." }, 409);

  const cfg = agente.config ?? {};
  const antecedencia = Number(cfg.antecedencia_interna_dias ?? 2);
  const confiancaMinima = Number(cfg.confianca_minima ?? 0.75);
  const limiteAbertos = Number(cfg.limite_itens_abertos ?? 25);
  const maxPorExecucao = Number(cfg.max_publicacoes_por_execucao ?? 40);

  const { data: execucao, error: execErr } = await db.from("agentes_execucoes")
    .insert({ agente: AGENTE, origem, iniciado_por: iniciadoPor }).select("id").single();
  if (execErr || !execucao) return json({ error: `Falha ao registrar execução: ${execErr?.message}` }, 500);

  const r = { lidas: 0, lancadas: 0, triagem: 0, erros: 0, tokens_entrada: 0, tokens_saida: 0, custo: 0 };
  const registrar = (a: Record<string, unknown>) =>
    db.from("agentes_acoes").insert({ execucao_id: execucao.id, agente: AGENTE, ...a });

  try {
    const hoje = hojeCuiaba();

    // Orçamento do mês
    const inicioMes = `${hoje.slice(0, 7)}-01T00:00:00${FUSO}`;
    const { data: gastos } = await db.from("agentes_execucoes").select("custo_estimado_usd")
      .eq("agente", AGENTE).gte("iniciado_em", inicioMes);
    const gastoMes = (gastos ?? []).reduce((s: number, g: any) => s + Number(g.custo_estimado_usd ?? 0), 0);

    // Publicações com triagem pendente e ainda não tratadas
    const { data: pubs } = await db.from("pje_publicacoes")
      .select("id, numero_processo, numero_processo_limpo, sigla_tribunal, nome_orgao, tipo_comunicacao, texto_publicacao, data_disponibilizacao, link_certidao, processo_id, item_controladoria_id")
      .not("processo_id", "is", null).not("item_controladoria_id", "is", null)
      .gte("capturada_em", new Date(Date.now() - 15 * 86400000).toISOString())
      .order("capturada_em", { ascending: true }).limit(300);
    const lista = (pubs ?? []) as Publicacao[];
    const ids = lista.map((p) => p.id);
    const triagemIds = lista.map((p) => p.item_controladoria_id);
    const [{ data: feitas }, { data: triagens }] = await Promise.all([
      ids.length
        ? db.from("agentes_acoes").select("publicacao_id").eq("agente", AGENTE).in("tipo", ["prazo_lancado", "mantida_triagem"]).in("publicacao_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      triagemIds.length
        ? db.from("controladoria_itens").select("id, status, cliente_id, responsavel_id").in("id", triagemIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const jaFeitas = new Set((feitas ?? []).map((f: any) => f.publicacao_id));
    const triagemPorId = new Map((triagens ?? []).map((t: any) => [t.id, t]));
    const fila = lista
      .filter((p) => !jaFeitas.has(p.id) && triagemPorId.get(p.item_controladoria_id)?.status === "pendente")
      .slice(0, maxPorExecucao);

    // Equipe e carga atual
    const [{ data: membros }, { data: abertos }] = await Promise.all([
      db.from("equipe_membros").select("user_id, nome, cargo, status"),
      db.from("controladoria_itens").select("responsavel_id").not("status", "in", "(concluido,cancelado)").limit(10000),
    ]);
    const carga = new Map<string, number>();
    (abertos ?? []).forEach((i: any) => i.responsavel_id && carga.set(i.responsavel_id, (carga.get(i.responsavel_id) ?? 0) + 1));
    const equipe: MembroCarga[] = (membros ?? []).map((m: any) => ({ ...m, abertos: carga.get(m.user_id) ?? 0 }));

    for (const pub of fila) {
      if (gastoMes + r.custo + 0.01 > Number(agente.limite_mensal_usd)) {
        await registrar({ tipo: "erro", publicacao_id: pub.id, resumo: "Limite mensal de custo atingido; publicações restantes ficam para a próxima execução." });
        r.erros++;
        break;
      }
      const triagem = triagemPorId.get(pub.item_controladoria_id)!;
      const processoTxt = pub.numero_processo ?? pub.numero_processo_limpo ?? "processo";
      r.lidas++;
      try {
        const leitura = await lerPublicacao(key, pub);
        r.tokens_entrada += leitura.entrada;
        r.tokens_saida += leitura.gerado;
        r.custo += leitura.entrada * PRECO_ENTRADA + leitura.gerado * PRECO_SAIDA;
        const e = leitura.extracao;
        const decisao = decidir(e, confiancaMinima, hoje);

        if (decisao.acao === "triagem") {
          await registrar({
            tipo: "mantida_triagem", publicacao_id: pub.id, item_triagem_id: triagem.id,
            resumo: `${processoTxt}: ${decisao.motivo}`, detalhes: { leitura: e },
          });
          await db.from("controladoria_itens").update({
            proximo_passo: `Vanessa (IA) não lançou automaticamente: ${decisao.motivo}. Faça a triagem manual.`,
          }).eq("id", triagem.id);
          r.triagem++;
          continue;
        }

        const ext = e!;
        const disp = pub.data_disponibilizacao?.slice(0, 10) ?? hoje;
        let judicial: string;
        let vencimento: string;
        if (decisao.modo === "evento") {
          judicial = ext.data_evento!;
          const hora = /^\d{2}:\d{2}$/.test(ext.hora_evento ?? "") ? ext.hora_evento : "09:00";
          vencimento = `${judicial}T${hora}:00${FUSO}`;
        } else {
          // DJEN: publicação no 1º dia útil após a disponibilização; o prazo começa no dia útil seguinte.
          const publicacao = await rpcData(db, "adicionar_dias_uteis", { _data_inicio: disp, _dias: 1 });
          judicial = ext.prazo_tipo === "dias_uteis"
            ? await rpcData(db, "adicionar_dias_uteis", { _data_inicio: publicacao, _dias: ext.prazo_dias })
            : await rpcData(db, "adicionar_dias_uteis", { _data_inicio: somarDias(publicacao, ext.prazo_dias! - 1), _dias: 1 });
          vencimento = "";
        }
        const internoBruto = await rpcData(db, "subtrair_dias_uteis", { _data_fim: judicial, _dias: antecedencia });
        const interno = ajustarInterno(internoBruto, judicial, hoje);
        if (!vencimento) vencimento = `${interno}T18:00:00${FUSO}`;

        const escolha = escolherResponsavel(ext.tipo_item, equipe, limiteAbertos, triagem.responsavel_id);
        const contagem = decisao.modo === "prazo"
          ? `${ext.prazo_dias} ${ext.prazo_tipo === "dias_uteis" ? "dias úteis" : "dias corridos"}${ext.base_legal ? ` (${ext.base_legal})` : ""}`
          : `${rotuloEvento(ext)} em ${dataBR(judicial)}${ext.hora_evento ? ` às ${ext.hora_evento}` : ""}`;

        const { data: item, error: itemErr } = await db.from("controladoria_itens").insert({
          tipo: ext.tipo_item,
          titulo: tituloItem(ext, processoTxt),
          descricao: [
            `Lançado pela Vanessa (IA) a partir da publicação DJEN disponibilizada em ${dataBR(disp)}.`,
            "CONFIRA a contagem antes de marcar o prazo como conferido.",
            "",
            `Providência: ${ext.providencia}`,
            `Contagem: ${contagem}`,
            `Prazo judicial: ${dataBR(judicial)} · meta interna: ${dataBR(interno)}`,
            `Leitura da IA: ${ext.justificativa} (confiança ${Math.round(ext.confianca * 100)}%)`,
            `Distribuição: ${escolha.motivo}`,
            "",
            (pub.texto_publicacao ?? "").slice(0, 1500),
            pub.link_certidao ? `\nCertidão: ${pub.link_certidao}` : "",
          ].join("\n"),
          processo_id: pub.processo_id,
          cliente_id: triagem.cliente_id,
          responsavel_id: escolha.user_id,
          data_vencimento: vencimento,
          data_prazo_judicial: judicial,
          data_prazo_interno: interno,
          antecedencia_interna_dias: antecedencia,
          data_intimacao: disp,
          prioridade: ext.tipo_item === "prazo_fatal" && prioridadePara(judicial, hoje) === "media" ? "alta" : prioridadePara(judicial, hoje),
          status: "pendente",
          origem: "agente_ia",
          prazo_conferido: false,
        }).select("id").single();
        if (itemErr || !item) throw new Error(`Falha ao lançar na Controladoria: ${itemErr?.message}`);

        await db.from("controladoria_itens").update({
          status: "concluido",
          concluido_em: new Date().toISOString(),
          resultado: `Triada pela Vanessa (IA): "${ext.providencia}", prazo judicial ${dataBR(judicial)}. Item lançado aguardando conferência.`,
        }).eq("id", triagem.id);

        if (escolha.user_id) {
          const m = equipe.find((q) => q.user_id === escolha.user_id);
          if (m) m.abertos++;
          await db.from("notificacoes").insert({
            user_id: escolha.user_id,
            tipo: "agente_prazo_lancado",
            titulo: "A Vanessa lançou um prazo para você",
            descricao: `${tituloItem(ext, processoTxt)} · prazo ${dataBR(judicial)} · confira a contagem`,
            link: "/controladoria",
          }).then(() => undefined, () => undefined);
        }

        await registrar({
          tipo: "prazo_lancado", publicacao_id: pub.id, item_triagem_id: triagem.id, item_criado_id: item.id,
          responsavel_id: escolha.user_id,
          resumo: `${tituloItem(ext, processoTxt)} · prazo ${dataBR(judicial)}`,
          detalhes: { leitura: ext, judicial, interno, distribuicao: escolha.motivo },
        });
        r.lancadas++;
      } catch (err) {
        r.erros++;
        await registrar({ tipo: "erro", publicacao_id: pub.id, item_triagem_id: triagem.id, resumo: `${processoTxt}: ${(err as Error).message}`.slice(0, 500) });
      }
    }

    await db.from("agentes_execucoes").update({
      status: "concluida", finalizado_em: new Date().toISOString(),
      lidas: r.lidas, lancadas: r.lancadas, triagem: r.triagem, erros: r.erros,
      tokens_entrada: r.tokens_entrada, tokens_saida: r.tokens_saida, custo_estimado_usd: r.custo,
    }).eq("id", execucao.id);
    return json({ ok: true, execucao_id: execucao.id, ...r });
  } catch (err) {
    const msg = (err as Error).message;
    await db.from("agentes_execucoes").update({
      status: "falha", finalizado_em: new Date().toISOString(), erro: msg.slice(0, 500),
      lidas: r.lidas, lancadas: r.lancadas, triagem: r.triagem, erros: r.erros,
      tokens_entrada: r.tokens_entrada, tokens_saida: r.tokens_saida, custo_estimado_usd: r.custo,
    }).eq("id", execucao.id);
    return json({ error: msg }, 500);
  }
});

function rotuloEvento(e: Extracao): string {
  return e.tipo_item === "audiencia" ? "Audiência" : e.tipo_item === "pericia" ? "Perícia" : "Reunião";
}
