// Motor de missões (Fase 2). Nasce desligado: só trabalha depois que a gestão liga o motor.
// Ações:
//  - pulso (cron/worker com segredo): reserva tarefas prontas e executa com ferramentas;
//  - painel, criar_missao, aprovacoes, decidir, orcamento, decidir_orcamento, ajustar, ferramenta (pessoa logada).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  executarRodadas,
  instrucoesDoAgente,
  lerEntrega,
  motivoAviso,
  simularAumento,
  type RespostaIA,
  type SituacaoOrcamento,
} from "../_shared/motor.ts";
import { validarConfigAgente } from "../_shared/agentes-config.ts";
import { usuarioInterno } from "../_shared/interno.ts";
import { ACOES_AMPLAS, CONSULTAS_AMPLAS, consultarAmplo, executarAmplo, proporAmplo, type ContextoIA } from "./ferramentas-amplas.ts";
import { criarCliente, decifrar, semSegredos } from "../_shared/zernio.ts";
import {formatoRoteiro} from '../telegram/modelos.ts';

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djen-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SAIDA = 1800;

class SemOrcamento extends Error {}

/** Mede a entrada, reserva o custo em dólar no banco, chama a IA e confirma o consumo real. */
async function chamarComOrcamento(db: SupabaseClient, a: {
  key: string; id: string; rodada: number; agente: string; tarefa: string; payload: Record<string, unknown>;
}): Promise<RespostaIA> {
  const init = {
    method: "POST",
    redirect: "error" as const,
    signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${a.key}`, "Content-Type": "application/json" },
  };
  const count = await fetch("https://api.openai.com/v1/responses/input_tokens", { ...init, body: JSON.stringify(a.payload) });
  if (!count.ok) throw new Error("Não foi possível medir os tokens. A chamada não foi feita.");
  const { input_tokens } = await count.json();
  const reserva = await db.rpc("ia_reservar", {
    _id: a.id, _rodada: a.rodada, _agente: a.agente, _tarefa: a.tarefa,
    _modelo: a.payload.model, _entrada: input_tokens, _saida_max: MAX_SAIDA,
  });
  if (reserva.error) throw new Error(reserva.error.message);
  if (reserva.data?.ok !== true) throw new SemOrcamento(String(reserva.data?.motivo ?? "orcamento"));
  const resp = await fetch("https://api.openai.com/v1/responses", {
    ...init,
    body: JSON.stringify({ ...a.payload, store: false, max_output_tokens: MAX_SAIDA, parallel_tool_calls: false }),
  });
  if (!resp.ok) throw new Error(resp.status === 429 ? "Limite da API OpenAI atingido" : "Falha da API OpenAI");
  const ai = await resp.json();
  const confirmado = await db.rpc("ia_confirmar", {
    _id: a.id, _rodada: a.rodada, _entrada: ai.usage?.input_tokens ?? -1, _saida: ai.usage?.output_tokens ?? -1,
  });
  if (confirmado.error || confirmado.data !== true) throw new Error("Consumo acima do reservado: o motor foi desligado.");
  return ai;
}

/** Ferramentas executadas pelo backend. O banco confere a permissão do agente antes de cada uma. */
async function executarFerramenta(db: SupabaseClient, tarefa: { tarefa_id: string; missao_id: string },
  slug: string, p: Record<string, unknown>, ctx: ContextoIA) {
  const classe = await db.rpc("motor_ferramenta_permitida", { _tarefa: tarefa.tarefa_id, _ferramenta: slug });
  if (classe.error || !classe.data) throw new Error("Ferramenta não permitida para este agente.");
  if (slug === "pesquisar_concorrentes_publicos") {
    try { return await consultarAmplo(db, slug, p, ctx); }
    catch (e) {
      const codigo = e instanceof Error && /^pesquisa_publica_[a-z_0-9]+$/i.test(e.message) ? e.message : "pesquisa_publica_indisponivel";
      await db.from("agente_execucao_logs").insert({ execucao_id: ctx.execucao_id, mensagem: codigo });
      throw e;
    }
  }
  if (CONSULTAS_AMPLAS.has(slug)) return consultarAmplo(db, slug, p, ctx);
  if (ACOES_AMPLAS.has(slug)) return proporAmplo(db, tarefa.tarefa_id, slug, p);
  switch (slug) {
    case 'consultar_operacao_continua': {
      const r=await db.rpc('operacao24h_contexto',{_tarefa:tarefa.tarefa_id});
      if(r.error)throw new Error('Contexto operacional indisponível');
      return r.data;
    }
    case "consultar_indicadores": {
      const r = await db.rpc("escritorio_contexto_analista");
      if (r.error) throw new Error("Indicadores indisponíveis");
      return r.data;
    }
    case "listar_itens_controladoria": {
      let q = db.from("controladoria_itens")
        .select("id,tipo,titulo,data_vencimento,status,prioridade,processo_id")
        .in("status", p.status ? [p.status as string] : ["pendente", "em_andamento", "aguardando"])
        .order("data_vencimento", { ascending: true })
        .limit(20);
      if (p.processo_id) q = q.eq("processo_id", p.processo_id as string);
      const r = await q;
      if (r.error) throw new Error("Controladoria indisponível");
      return r.data;
    }
    case "buscar_processo": {
      const r = await db.from("processos")
        .select("id,numero_cnj,tipo,area_direito,tipo_acao,tribunal,vara,comarca,status")
        .or(`numero_cnj.eq.${p.numero_cnj},numero_cnj.eq.${formatarCnj(p.numero_cnj as string)}`)
        .limit(1);
      if (r.error) throw new Error("Processos indisponíveis");
      return r.data?.[0] ?? { encontrado: false };
    }
    case "delegar_tarefa": {
      // Os agentes contratados têm slug técnico (analista-<uuid>): aceita o nome (sem acento/maiúscula) ou o slug.
      const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      const lista = await db.from("agentes_ia").select("id,nome,slug").eq("ativo", true);
      const alvo = sem(p.agente as string);
      const ag = { data: (lista.data ?? []).find((x) => x.slug === alvo || sem(x.nome) === alvo || sem(x.nome).split(/[\s·]+/)[0] === alvo) };
      if (lista.error || !ag.data) throw new Error(`Agente "${p.agente}" não encontrado ou desligado.`);
      const r = await db.rpc("motor_delegar", {
        _tarefa: tarefa.tarefa_id, _agente: ag.data.id, _titulo: p.titulo, _instrucoes: p.instrucoes, _depende_de: [], _chave: p.chave,
      });
      if (r.error) throw new Error(r.error.message);
      return { tarefa_criada: r.data };
    }
    case "zernio_indicadores":
    case "zernio_publicacoes":
    case "zernio_comentarios":
    case "zernio_conversas":
    case "zernio_anuncios":
    case "zernio_saude": {
      const r = await db.rpc("zernio_consulta_agente", { _tipo: slug.replace("zernio_", ""), _dias: p.dias });
      if (r.error) throw new Error("Dados do Zernio indisponíveis");
      return r.data;
    }
    case "zernio_responder_comentario": {
      // Conferido no banco: o comentário existe e pode ser respondido. O pedido leva tudo que será enviado.
      const c = await db.rpc("zernio_comentario_para_resposta", { _externo: p.comentario_id });
      if (c.error || !c.data) throw new Error("Comentário não encontrado ou sem permissão de resposta.");
      const parametros = { post_id: c.data.post_externo_id, conta_id: c.data.conta_externa_id, comentario_id: c.data.comentario_id,
        autor: c.data.autor_usuario, comentario: c.data.texto, mensagem: p.mensagem };
      const r = await db.rpc("motor_pedir_aprovacao", {
        _tarefa: tarefa.tarefa_id, _ferramenta: slug, _parametros: parametros,
        _resumo: `Responder no Instagram a @${c.data.autor_usuario ?? "seguidor"}`,
        _riscos: "Publica uma resposta pública em nome do escritório. Confira o texto e as regras da OAB antes de aprovar.",
      });
      if (r.error) throw new Error(r.error.message);
      return { pedido_aprovacao: r.data, situacao: "aguardando aprovação humana; nada foi enviado" };
    }
    case "zernio_publicar_post": {
      // Conferido no banco: a conta está conectada e selecionada. O pedido leva exatamente o que será publicado.
      const c = await db.rpc("zernio_conta_para_post", { _conta: p.conta });
      if (c.error || !c.data) throw new Error("Conta não encontrada, desconectada ou fora da seleção do Zernio.");
      const parametros = {
        conta_id: c.data.conta_id, plataforma: c.data.plataforma, conta: c.data.usuario ? `@${c.data.usuario}` : c.data.nome,
        texto: p.texto, midia_url: p.midia_url, agendar_para: p.agendar_para,
      };
      const quando = p.agendar_para
        ? new Date(p.agendar_para as string).toLocaleString("pt-BR", { timeZone: "America/Cuiaba", dateStyle: "short", timeStyle: "short" })
        : "assim que aprovado";
      const r = await db.rpc("motor_pedir_aprovacao", {
        _tarefa: tarefa.tarefa_id, _ferramenta: slug, _parametros: parametros,
        _resumo: `Publicar no ${c.data.plataforma} (${parametros.conta}) ${quando}`,
        _riscos: "Publica em nome do escritório. Confira o texto, a imagem e o Provimento 205/2021 da OAB (sem promessa de resultado nem captação).",
      });
      if (r.error) throw new Error(r.error.message);
      return { pedido_aprovacao: r.data, situacao: "aguardando aprovação humana; nada foi publicado" };
    }
    case "criar_item_controladoria": {
      const r = await db.rpc("motor_pedir_aprovacao", {
        _tarefa: tarefa.tarefa_id, _ferramenta: slug, _parametros: p,
        _resumo: `Criar na Controladoria: ${p.titulo} (vence ${p.data_vencimento})`,
        _riscos: "Cria uma atividade visível para a equipe. Não calcula prazo judicial.",
      });
      if (r.error) throw new Error(r.error.message);
      return { pedido_aprovacao: r.data, situacao: "aguardando aprovação humana; nada foi gravado" };
    }
  }
  throw new Error("Ferramenta desconhecida");
}

function formatarCnj(n: string) {
  return `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n.slice(13, 14)}.${n.slice(14, 16)}.${n.slice(16)}`;
}

/** Cliente do Zernio para ação aprovada: só com credencial e ações externas liberadas na integração. */
async function clienteParaAcao(db: SupabaseClient) {
  const c = await db.rpc("zernio_conexao", { _com_cifra: true });
  if (c.error || !c.data?.chave_cifrada) throw new Error("Integração Zernio sem credencial.");
  if (!c.data.acoes_externas_com_aprovacao) throw new Error("Ações externas estão desligadas na integração Zernio.");
  const segredo = Deno.env.get("COFRE_ENCRYPTION_KEY");
  if (!segredo) throw new Error("Chave de criptografia do servidor ausente.");
  return criarCliente({ chave: await decifrar(c.data.chave_cifrada, segredo) });
}

/** Post aprovado. Idempotency-Key = id do pedido: repetir nunca publica duas vezes. */
async function publicarPost(db: SupabaseClient, id: string, p: Record<string, string | null>) {
  const api = await clienteParaAcao(db);
  try {
    const r = await api.post<{ post?: { _id?: string; status?: string; platforms?: { platformPostUrl?: string }[] } }>("/v1/posts", {
      content: p.texto,
      platforms: [{ platform: p.plataforma, accountId: p.conta_id }],
      ...(p.midia_url ? { mediaItems: [{ url: p.midia_url }] } : {}),
      ...(p.agendar_para ? { scheduledFor: p.agendar_para } : { publishNow: true }),
    }, id);
    const post = r.dados?.post;
    if (post?.status === "failed") throw new Error("O Zernio não conseguiu publicar (status failed).");
    return { post_id: post?._id ?? null, status: post?.status ?? null, url: post?.platforms?.[0]?.platformPostUrl ?? null };
  } catch (e) {
    throw new Error(semSegredos(e instanceof Error ? e.message : "Falha ao publicar"));
  }
}

/** Resposta aprovada: só sai com ações externas liberadas na integração. Idempotency-Key = id do pedido. */
async function responderComentario(db: SupabaseClient, id: string, p: Record<string, string>) {
  const api = await clienteParaAcao(db);
  try {
    const r = await api.post<{ data?: { commentId?: string } }>(`/v1/inbox/comments/${encodeURIComponent(p.post_id)}`,
      { accountId: p.conta_id, message: p.mensagem, commentId: p.comentario_id }, id);
    return { resposta_id: r.dados?.data?.commentId ?? null };
  } catch (e) {
    throw new Error(semSegredos(e instanceof Error ? e.message : "Falha ao responder"));
  }
}

/** Executa a ação sensível já aprovada. O id do item é o id do pedido: repetir nunca duplica. */
async function executarAprovada(db: SupabaseClient, id: string) {
  const ini = await db.rpc("aprovacao_iniciar_execucao", { _id: id });
  if (ini.error) throw new Error(ini.error.message);
  const a = ini.data?.[0];
  if (!a) return { executada: false };
  try {
    if (a.ferramenta === "mkt_campanha_simular" || a.ferramenta === "mkt_editorial_simular") {
      const r = await db.rpc(a.ferramenta === "mkt_campanha_simular" ? "mkt_simular_campanha" : "mkt_simular_editorial", { _aprovacao: id });
      if (r.error) throw new Error(r.error.message);
      const fim = await db.rpc("aprovacao_finalizar_execucao", { _id: id, _ok: true, _resultado: r.data });
      if (fim.error) throw new Error(fim.error.message);
      return { executada: true, ...r.data };
    }
    if (a.ferramenta === "zernio_responder_comentario") {
      const resultado = await responderComentario(db, id, a.parametros);
      await db.rpc("aprovacao_finalizar_execucao", { _id: id, _ok: true, _resultado: resultado });
      return { executada: true, ...resultado };
    }
    if (ACOES_AMPLAS.has(a.ferramenta)) {
      const resultado = await executarAmplo(db, id, a);
      await db.rpc("aprovacao_finalizar_execucao", { _id: id, _ok: true, _resultado: resultado });
      return { executada: true, ...resultado };
    }
    if (a.ferramenta === "zernio_publicar_post") {
      const resultado = await publicarPost(db, id, a.parametros);
      await db.rpc("aprovacao_finalizar_execucao", { _id: id, _ok: true, _resultado: resultado });
      return { executada: true, ...resultado };
    }
    if (a.ferramenta !== "criar_item_controladoria") throw new Error("Ferramenta sem execução registrada");
    const p = a.parametros;
    const r = await db.from("controladoria_itens").upsert({
      id, tipo: "tarefa", titulo: p.titulo, descricao: `${p.descricao}\n\nProposto por agente de IA; aprovado na Central de Aprovações.`,
      processo_id: p.processo_id, data_vencimento: `${p.data_vencimento}T21:00:00Z`, prioridade: p.prioridade,
      status: "pendente", criado_por: a.decidida_por,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (r.error) throw new Error(r.error.message);
    await db.rpc("aprovacao_finalizar_execucao", { _id: id, _ok: true, _resultado: { item_id: id } });
    return { executada: true, item_id: id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha";
    await db.rpc("aprovacao_finalizar_execucao", { _id: id, _ok: false, _resultado: { erro: msg } });
    throw e;
  }
}

interface TarefaReservada {
  tarefa_id: string; missao_id: string; agente_id: string; execucao_id: string; titulo: string; instrucoes: string;
  profundidade: number; tentativa: number; objetivo_missao: string; solicitada_por: string;
  dependencias: unknown[]; ferramentas: string[];
}

async function processarTarefa(db: SupabaseClient, key: string, modelo: string, t: TarefaReservada) {
  const log = (mensagem: string) => db.from("agente_execucao_logs").insert({ execucao_id: t.execucao_id, mensagem });
  const [ag, cfg] = await Promise.all([
    db.from("agentes_ia").select("id,nome,descricao,supervisor_id").eq("id", t.agente_id).single(),
    db.rpc("escritorio_ler_config", { _usuario: t.solicitada_por, _agente: t.agente_id }),
  ]);
  let perfil: ReturnType<typeof validarConfigAgente> | null = null;
  try { perfil = cfg.data?.revisao > 0 ? validarConfigAgente(cfg.data.config) : null; } catch { perfil = null; }
  const escopo = await db.rpc("mkt_rotina_ferramentas", { _tarefa: t.tarefa_id });
  if (escopo.error) throw new Error("Não foi possível conferir o escopo da rotina");
  if (Array.isArray(escopo.data)) t.ferramentas = t.ferramentas.filter(slug => escopo.data.includes(slug));
  const instrucoes = instrucoesDoAgente({ nome: ag.data?.nome ?? "Agente", cargo: perfil?.cargo, prompt_base: perfil?.prompt_base });
  const roteiroEstruturado=ag.data?.nome==='Camila'&&/roteiro|grava|reels|v[ií]deo/i.test(t.objetivo_missao+' '+t.titulo);
  const escopoTelegram=await db.rpc('telegram_ferramentas_tarefa',{_tarefa:t.tarefa_id});
  if(escopoTelegram.error)throw new Error('Escopo do pedido Telegram indisponível');
  if(Array.isArray(escopoTelegram.data))t.ferramentas=t.ferramentas.filter(slug=>escopoTelegram.data.includes(slug));
  let rotina24=false;
  if(t.ferramentas.includes('consultar_operacao_continua')){
    const escopo24=await db.rpc('operacao24h_ferramentas',{_tarefa:t.tarefa_id});
    if(escopo24.error)throw new Error('Escopo operacional indisponível');
    if(Array.isArray(escopo24.data)){rotina24=true;t.ferramentas=t.ferramentas.filter(slug=>escopo24.data.includes(slug));}
  }
  await log(`Tarefa da missão reservada (tentativa ${t.tentativa}). Ferramentas: ${t.ferramentas.join(", ") || "nenhuma"}.`);
  // Rodadas 0–3 são da conversa com a IA; 4–7 ficam para pesquisas em fontes oficiais.
  let pesquisas = 4;
  const ctx: ContextoIA = {
    key, modelo, execucao_id: t.execucao_id, agente_id: t.agente_id, tarefa_id: t.tarefa_id, proximaRodada: () => pesquisas++,
  };
  try {
    const r = await executarRodadas({
      entrada: {
        objetivo_da_missao: t.objetivo_missao,
        sua_tarefa: { titulo: t.titulo, instrucoes: t.instrucoes },
        resultados_de_tarefas_anteriores: t.dependencias,
        data_de_hoje: new Date().toISOString().slice(0, 10),
      },
      concedidas: t.ferramentas,
      chamarIA: (rodada, input, tools) =>
        chamarComOrcamento(db, {
          key, id: t.execucao_id, rodada, agente: t.agente_id, tarefa: t.tarefa_id,
          payload: {
            model: modelo,
            instructions: instrucoes+(roteiroEstruturado?' Para esta resposta, siga o contrato JSON estruturado do servidor: entrega é um OBJETO editorial com todos os campos, não uma string. A fala deve ser integral, natural e pronta para gravar.':''),
            input, tools,
            ...(roteiroEstruturado?{text:{format:formatoRoteiro()}}:{}),
          },
        }),
      executar: (slug, p) => executarFerramenta(db, t, slug, p, ctx),
      aoUsar: async (slug, ok) => { await log(`${ok ? "Usou" : "Tentou usar"} a ferramenta ${slug}.`); },
    });
    if (Array.isArray(escopo.data) && t.ferramentas.includes("pesquisar_concorrentes_publicos") && !r.ferramentasUsadas.includes("pesquisar_concorrentes_publicos")) throw new Error("Pesquisa pública não executada; etapa de pesquisa não pode ser marcada como concluída");
    const entrega = lerEntrega(r.texto);
    if(rotina24&&!r.ferramentasUsadas.includes('consultar_operacao_continua'))throw new Error('Consulta operacional não executada');
    if (Array.isArray(escopo.data) && t.ferramentas.includes('pesquisar_tendencias_marketing') && !r.ferramentasUsadas.includes('pesquisar_tendencias_marketing')) throw new Error('Pesquisa de mercado não executada');
    const conclusao=await db.rpc("motor_concluir_tarefa", {
      _tarefa: t.tarefa_id, _ok: true,
      _resultado: { ...entrega, rodadas: r.rodadas, ferramentas: r.ferramentasUsadas },
    });
    if(conclusao.error){
      const motivo=String(conclusao.error.message??'');
      if(motivo.includes('Roteiro incompleto'))throw new Error('Roteiro incompleto: faltam campos obrigatórios do padrão Manu');
      if(motivo.includes('Roteiro deve usar'))throw new Error('Roteiro fora do formato editorial esperado');
      if(motivo.includes('Rascunho não cadastrado'))throw new Error('Rascunho não cadastrado no Marketing');
      if(motivo.includes('Brief não cadastrado'))throw new Error('Brief não cadastrado no Marketing');
      throw new Error('Não foi possível confirmar a tarefa e cadastrar sua entrega');
    }
    return { tarefa: t.tarefa_id, ok: true };
  } catch (e) {
    if (e instanceof SemOrcamento) {
      const msg = `Sem orçamento (${e.message}); a tarefa voltou para a fila.`;
      await log(msg);
      await db.rpc("motor_devolver_tarefa", { _tarefa: t.tarefa_id, _motivo: msg });
      return { tarefa: t.tarefa_id, ok: false, semOrcamento: true };
    }
    const msg = e instanceof Error ? e.message : "Falha";
    await log(msg);
    await db.rpc("motor_concluir_tarefa", { _tarefa: t.tarefa_id, _ok: false, _resultado: null, _erro: msg });
    return { tarefa: t.tarefa_id, ok: false, semOrcamento: false };
  }
}

async function avisarOrcamento(db: SupabaseClient, bloqueou: boolean) {
  const s = await db.rpc("ia_situacao");
  if (s.error) return;
  const situacao = s.data as SituacaoOrcamento;
  const motivo = motivoAviso(situacao, bloqueou);
  const opcoes = simularAumento(situacao);
  if (motivo && opcoes.length) await db.rpc("ia_pedir_aumento", { _motivo: motivo, _opcoes: opcoes });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const raw = await req.text();
    if (raw.length > 20000) return json({ error: "Requisição muito grande" }, 413);
    const body = JSON.parse(raw || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Corpo inválido" }, 400);

    if (body.acao === "pulso") {
      const ok = await db.rpc("validar_djen_cron_secret", { _secret: req.headers.get("x-djen-cron-secret") ?? "" });
      if (ok.error || ok.data !== true) return json({ error: "Não autorizado" }, 401);
      const key = Deno.env.get("OPENAI_API_KEY");
      const cfg = await db.from("assistente_config").select("modelo,habilitado").single();
      if (!key || cfg.error || !cfg.data?.habilitado) return json({ ok: true, motivo: "IA desativada" });
      const situacao = await db.rpc("ia_situacao");
      if (situacao.error) throw situacao.error;
      if (situacao.data.gasto_dia_usd >= situacao.data.limite_dia_usd) {
        await avisarOrcamento(db, true);
        return json({ ok: true, motivo: "Limite do dia atingido; a fila espera." });
      }
      const tarefas = await db.rpc("motor_reservar_tarefas", { _limite: 3 });
      if (tarefas.error) throw tarefas.error;
      const resultados = [];
      for (const t of tarefas.data ?? []) resultados.push(await processarTarefa(db, key, cfg.data.modelo, t));
      await avisarOrcamento(db, resultados.some((r) => r.semOrcamento));
      return json({ ok: true, processadas: resultados });
    }

    // Telegram age em nome do usuário vinculado, só para aprovações e criar missão.
    const viaTelegram = ["aprovacoes", "decidir", "criar_missao"].includes(body.acao) ? usuarioInterno(req, body) : null;
    const auth = viaTelegram ? null : await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer /i, ""));
    if (!viaTelegram && (auth?.error || !auth?.data.user)) return json({ error: "Sessão inválida" }, 401);
    const usuario = viaTelegram ?? auth!.data.user!.id;
    const [gestor, interno] = await Promise.all([
      db.rpc("is_gestor", { _user_id: usuario }),
      db.rpc("is_interno_ativo", { _user_id: usuario }),
    ]);
    if (interno.data !== true) return json({ error: "Usuário inativo" }, 403);

    switch (body.acao) {
      case "aprovacoes": {
        const r = await db.rpc("aprovacao_listar", { _usuario: usuario });
        if (r.error) throw r.error;
        return json({ aprovacoes: r.data });
      }
      case "decidir": {
        if (!UUID.test(body.id ?? "") || typeof body.aprovar !== "boolean" || typeof body.hash !== "string")
          return json({ error: "Pedido inválido" }, 400);
        const r = await db.rpc("aprovacao_decidir", {
          _usuario: usuario, _id: body.id, _aprovar: body.aprovar, _hash: body.hash,
          _observacao: typeof body.observacao === "string" ? body.observacao.slice(0, 1000) : null,
        });
        if (r.error) return json({ error: r.error.message }, r.error.code === "40001" ? 409 : 403);
        const execucao = r.data === "aprovada" ? await executarAprovada(db, body.id) : null;
        return json({ ok: true, estado: execucao?.executada ? "executada" : r.data, execucao });
      }
    }

    if (gestor.data !== true) return json({ error: "Gestor ativo necessário" }, 403);
    switch (body.acao) {
      case "painel": {
        const r = await db.rpc("motor_painel", { _usuario: usuario });
        if (r.error) throw r.error;
        return json(r.data);
      }
      case "gatilhos": {
        const r = await db.rpc("motor_gatilhos", { _usuario: usuario });
        if (r.error) return json({ error: r.error.message }, 403);
        return json(r.data);
      }
      case "ajustar_gatilhos": {
        if (body.gestora_id != null && !UUID.test(body.gestora_id)) return json({ error: "Agente inválido" }, 400);
        const r = await db.rpc("motor_ajustar_gatilhos", {
          _usuario: usuario,
          _djen_automatico: typeof body.djen_automatico === "boolean" ? body.djen_automatico : null,
          _gestora: body.gestora_id ?? null,
          _djen_max_dia: Number.isInteger(body.djen_max_dia) ? body.djen_max_dia : null,
        });
        if (r.error) return json({ error: r.error.message }, 400);
        return json(r.data);
      }
      case "automacoes": {
        const [a, f] = await Promise.all([
          db.rpc("motor_automacoes", { _usuario: usuario }),
          db.rpc("motor_falhas", { _usuario: usuario }),
        ]);
        if (a.error || f.error) return json({ error: (a.error ?? f.error)!.message }, 403);
        return json({ automacoes: a.data, falhas: f.data });
      }
      case "salvar_automacao": {
        if (body.id != null && !UUID.test(body.id)) return json({ error: "Automação inválida" }, 400);
        const d = body.dados ?? {};
        if (!UUID.test(d.agente_id ?? "") || !["intervalo", "diaria", "semanal"].includes(d.frequencia))
          return json({ error: "Escolha o agente e a frequência." }, 400);
        const r = await db.rpc("motor_salvar_automacao", {
          _usuario: usuario, _id: body.id ?? null,
          _dados: {
            nome: String(d.nome ?? "").trim().slice(0, 120), setor: d.setor, agente_id: d.agente_id,
            instrucoes: String(d.instrucoes ?? "").trim().slice(0, 4000), frequencia: d.frequencia,
            hora: typeof d.hora === "string" && /^\d{2}:\d{2}$/.test(d.hora) ? d.hora : null,
            intervalo_minutos: Number.isInteger(d.intervalo_minutos) ? d.intervalo_minutos : null,
            dias_semana: Array.isArray(d.dias_semana) ? d.dias_semana.filter((x: unknown) => Number.isInteger(x)) : [],
            prioridade: Number.isInteger(d.prioridade) ? d.prioridade : 3,
          },
        });
        if (r.error) return json({ error: r.error.message }, 400);
        return json({ ok: true, id: r.data });
      }
      case "alternar_automacao":
      case "executar_automacao":
      case "retentar_tarefa":
      case "cancelar_missao": {
        if (!UUID.test(body.id ?? "")) return json({ error: "Pedido inválido" }, 400);
        const r = body.acao === "alternar_automacao"
          ? await db.rpc("motor_alternar_automacao", { _usuario: usuario, _id: body.id, _ativa: body.ativa === true })
          : body.acao === "executar_automacao"
          ? await db.rpc("motor_executar_automacao", { _usuario: usuario, _id: body.id })
          : body.acao === "retentar_tarefa"
          ? await db.rpc("motor_retentar_tarefa", { _usuario: usuario, _tarefa: body.id })
          : await db.rpc("motor_cancelar_missao", { _usuario: usuario, _missao: body.id });
        if (r.error) return json({ error: r.error.message }, 400);
        return json({ ok: true, resultado: r.data });
      }
      case "ferramentas": {
        if (!UUID.test(body.agente_id ?? "")) return json({ error: "Agente inválido" }, 400);
        const r = await db.rpc("motor_ferramentas_agente", { _usuario: usuario, _agente: body.agente_id });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ ferramentas: r.data });
      }
      case "criar_missao": {
        if (!UUID.test(body.agente_id ?? "")) return json({ error: "Agente inválido" }, 400);
        const r = await db.rpc("motor_criar_missao", {
          _usuario: usuario, _titulo: String(body.titulo ?? "").trim(), _objetivo: String(body.objetivo ?? "").trim(),
          _agente: body.agente_id, _origem: "central", _prioridade: Number.isInteger(body.prioridade) ? body.prioridade : 3,
          _chave: typeof body.chave === "string" ? body.chave.slice(0, 100) : null,
        });
        if (r.error) return json({ error: r.error.message }, 400);
        return json({ ok: true, missao_id: r.data });
      }
      case "orcamento": {
        const r = await db.rpc("ia_situacao");
        if (r.error) throw r.error;
        return json({ situacao: r.data, simulacao: simularAumento(r.data as SituacaoOrcamento) });
      }
      case "decidir_orcamento": {
        if (!UUID.test(body.id ?? "")) return json({ error: "Aviso inválido" }, 400);
        const r = await db.rpc("ia_decidir_aumento", {
          _usuario: usuario, _id: body.id,
          _opcao: Number.isInteger(body.opcao) ? body.opcao : null,
          _tipo: ["extra_dia", "mensal"].includes(body.tipo) ? body.tipo : null,
          _valor: typeof body.valor_usd === "number" ? body.valor_usd : null,
        });
        if (r.error) return json({ error: r.error.message }, 400);
        return json({ ok: true, estado: r.data });
      }
      case "ajustar": {
        const r = await db.rpc("motor_ajustar", {
          _usuario: usuario,
          _ligado: typeof body.ligado === "boolean" ? body.ligado : null,
          _orcamento_mensal: typeof body.orcamento_mensal_usd === "number" ? body.orcamento_mensal_usd : null,
          _teto: typeof body.teto_absoluto_usd === "number" ? body.teto_absoluto_usd : null,
        });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ ok: true, situacao: r.data });
      }
      case "ferramenta": {
        if (!UUID.test(body.agente_id ?? "") || typeof body.ferramenta !== "string" || typeof body.conceder !== "boolean")
          return json({ error: "Pedido inválido" }, 400);
        const r = await db.rpc("motor_conceder_ferramenta", {
          _usuario: usuario, _agente: body.agente_id, _ferramenta: body.ferramenta, _conceder: body.conceder,
        });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ ok: true });
      }
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Falha no motor" }, 500);
  }
});
