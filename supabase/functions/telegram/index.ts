// Telegram da diretoria: conversar com a Gestora (Manu), criar missões e decidir aprovações pelo celular.
// Três entradas: o webhook do Telegram (segredo no cabeçalho), o JAS logado (vincular/configurar) e o
// aviso de aprovação vindo do banco (segredo das rotinas). O chat só obedece depois de vinculado por código
// de uso único; conversa, missão e aprovação passam pelas funções de sempre, com as mesmas regras.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarInterno } from "../_shared/interno.ts";
import {
  ajuda,
  comando,
  dadosBotao,
  lerBotao,
  textoAprovacao,
  type Aprovacao,
} from "./mensagens.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TOKEN = () => Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SEGREDO = () => Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

async function telegram(metodo: string, corpo: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(`Telegram ${metodo}: ${d.description ?? r.status}`);
  return d.result;
}
const enviar = (chat: number, text: string, extra: Record<string, unknown> = {}) =>
  telegram("sendMessage", { chat_id: chat, text: text.slice(0, 4000), ...extra });

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Gestora que responde no Telegram: a escolhida no motor ou, sem escolha, a Manu / primeira contratada ativa.
async function gestora(db: SupabaseClient, usuario: string): Promise<{ id: string; nome: string } | null> {
  const g = await db.rpc("motor_gatilhos", { _usuario: usuario });
  const { data } = await db.from("agentes_ia").select("id,nome,ativo,executor").eq("ativo", true).eq("executor", "analista_operacional");
  const lista = (data ?? []) as { id: string; nome: string }[];
  return lista.find((a) => a.id === g.data?.gestora_id) ?? lista.find((a) => /manu/i.test(a.nome)) ?? lista[0] ?? null;
}

async function pendentes(usuario: string) {
  const r = await chamarInterno<{ aprovacoes: Aprovacao[] }>("motor-missoes", usuario, { acao: "aprovacoes" });
  return (r.aprovacoes ?? []).filter((a) => a.tipo === "acao");
}

async function mostrarAprovacao(chat: number, a: Aprovacao) {
  return enviar(chat, textoAprovacao(a), {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Aprovar e executar", callback_data: dadosBotao(a.id, true) },
        { text: "✖️ Recusar", callback_data: dadosBotao(a.id, false) },
      ]],
    },
  });
}

async function tratarMensagem(db: SupabaseClient, msg: { chat: { id: number; type: string }; from?: { first_name?: string }; text?: string }) {
  const chat = msg.chat.id;
  if (msg.chat.type !== "private") return enviar(chat, "Por segurança, eu só atendo em conversa privada.");
  const c = comando(msg.text ?? "");
  const vinc = await db.rpc("telegram_usuario", { _chat: chat });
  const usuario = vinc.data as string | null;

  if (c.nome === "vincular") {
    const u = await db.rpc("telegram_vincular", { _chat: chat, _codigo: c.resto, _nome: msg.from?.first_name ?? null });
    return enviar(chat, u.data
      ? "Pronto! Este Telegram está vinculado ao JAS. Escreva para falar com a Gestora ou envie /ajuda."
      : "Código inválido ou vencido. Gere outro no JAS: Escritório › Aprovações › Telegram.");
  }
  if (!usuario) return enviar(chat, ajuda(false));
  if (c.nome === "start" || c.nome === "ajuda") return enviar(chat, ajuda(true));
  if (c.nome === "desvincular") {
    await db.rpc("telegram_desvincular", { _usuario: usuario, _chat: chat });
    return enviar(chat, "Telegram desvinculado. Para voltar, gere um novo código no JAS.");
  }
  if (c.nome === "aprovacoes") {
    const lista = await pendentes(usuario);
    if (!lista.length) return enviar(chat, "Nada esperando a sua aprovação.");
    for (const a of lista.slice(0, 10)) await mostrarAprovacao(chat, a);
    return;
  }
  const g = await gestora(db, usuario);
  if (!g) return enviar(chat, "Ainda não há agente para atender. Crie a Manu no JAS em Escritório › Criar agente.");
  if (c.nome === "missao") {
    if (c.resto.length < 3) return enviar(chat, "Escreva a missão depois do comando. Ex.: /missao Revisar os prazos da semana");
    await chamarInterno("motor-missoes", usuario, {
      acao: "criar_missao", agente_id: g.id, titulo: c.resto.slice(0, 120), objetivo: c.resto.slice(0, 4000), prioridade: 3,
    });
    return enviar(chat, `Missão criada para ${g.nome}. Acompanhe em Escritório › Missões; o que precisar de aprovação chega aqui.`);
  }
  if (c.nome) return enviar(chat, ajuda(true));
  const texto = (msg.text ?? "").trim();
  if (!texto) return enviar(chat, "Por enquanto eu entendo só mensagens de texto.");
  await telegram("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  try {
    const r = await chamarInterno<{ execucao_id: string }>("agentes-escritorio", usuario, {
      acao: "conversar", agente_id: g.id, texto: texto.slice(0, 1500),
    });
    const { data } = await db.from("escritorio_mensagens").select("texto")
      .eq("execucao_id", r.execucao_id).eq("origem", "agente").order("criado_em", { ascending: false }).limit(1).maybeSingle();
    return enviar(chat, `${g.nome}: ${data?.texto ?? "(sem resposta registrada)"}`);
  } catch (e) {
    return enviar(chat, `${g.nome} não conseguiu responder agora: ${e instanceof Error ? e.message : "falha"}`);
  }
}

async function tratarBotao(db: SupabaseClient, q: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } }) {
  const chat = q.message?.chat.id;
  const botao = lerBotao(q.data ?? "");
  const usuario = chat ? ((await db.rpc("telegram_usuario", { _chat: chat })).data as string | null) : null;
  if (!chat || !botao || !usuario) return telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Não autorizado." });
  const a = (await pendentes(usuario)).find((x) => x.id === botao.id);
  if (!a) {
    await telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Este pedido já foi decidido ou venceu." });
    return telegram("editMessageReplyMarkup", { chat_id: chat, message_id: q.message!.message_id, reply_markup: { inline_keyboard: [] } });
  }
  let resultado: string;
  try {
    const r = await chamarInterno<{ estado: string }>("motor-missoes", usuario, {
      acao: "decidir", id: a.id, aprovar: botao.aprovar, hash: a.escopo_hash, observacao: "Decidido pelo Telegram",
    });
    resultado = botao.aprovar ? (r.estado === "executada" ? "✅ Aprovado e executado." : `Aprovado (${r.estado}).`) : "✖️ Recusado.";
  } catch (e) {
    resultado = `Não foi possível decidir: ${e instanceof Error ? e.message : "falha"}`;
  }
  await telegram("answerCallbackQuery", { callback_query_id: q.id, text: resultado.slice(0, 190) });
  return telegram("editMessageText", {
    chat_id: chat, message_id: q.message!.message_id, text: `${textoAprovacao(a)}\n\n${resultado}`.slice(0, 4000),
  });
}

async function avisarAprovacao(db: SupabaseClient, id: string) {
  const { data: destinos } = await db.rpc("telegram_destinos_aprovacao", { _aprovacao: id });
  for (const d of (destinos ?? []) as { chat_id: number; usuario_id: string }[]) {
    const a = (await pendentes(d.usuario_id)).find((x) => x.id === id);
    if (!a) continue;
    const m = await mostrarAprovacao(d.chat_id, a);
    await db.rpc("telegram_registrar_aviso", { _aprovacao: id, _chat: d.chat_id, _mensagem: m.message_id });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const raw = await req.text();
    if (raw.length > 100000) return json({ error: "Requisição muito grande" }, 413);
    const body = JSON.parse(raw || "{}");

    // 1. Webhook do Telegram: só com o segredo combinado no setWebhook.
    const segredoTg = req.headers.get("x-telegram-bot-api-secret-token");
    if (segredoTg !== null) {
      if (!SEGREDO() || !TOKEN()) return json({ error: "Telegram não configurado" }, 503);
      if (!iguais(segredoTg, SEGREDO())) return json({ error: "Não autorizado" }, 401);
      const tarefa = (async () => {
        try {
          if (body.message) await tratarMensagem(db, body.message);
          else if (body.callback_query) await tratarBotao(db, body.callback_query);
        } catch (e) {
          console.error("telegram", e instanceof Error ? e.message : e);
        }
      })();
      // Responde logo ao Telegram (evita reenvio) e termina o trabalho em segundo plano.
      const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (rt) rt.waitUntil(tarefa);
      else await tarefa;
      return json({ ok: true });
    }

    // 2. Aviso de aprovação vindo do banco.
    if (body.acao === "avisar_aprovacao") {
      const ok = await db.rpc("validar_djen_cron_secret", { _secret: req.headers.get("x-djen-cron-secret") ?? "" });
      if (ok.error || ok.data !== true) return json({ error: "Não autorizado" }, 401);
      if (!TOKEN() || typeof body.aprovacao_id !== "string") return json({ ok: true, motivo: "sem Telegram" });
      await avisarAprovacao(db, body.aprovacao_id);
      return json({ ok: true });
    }

    // 3. JAS logado (gestor): estado, código de vínculo, desvincular e ligar o webhook.
    const auth = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer /i, ""));
    if (auth.error || !auth.data.user) return json({ error: "Sessão inválida" }, 401);
    const usuario = auth.data.user.id;
    switch (body.acao) {
      case "estado": {
        const v = await db.rpc("telegram_estado", { _usuario: usuario });
        if (v.error) return json({ error: v.error.message }, 403);
        let bot: string | null = null;
        let webhook = false;
        if (TOKEN()) {
          try {
            bot = (await telegram("getMe", {})).username ?? null;
            const info = await telegram("getWebhookInfo", {});
            webhook = info.url === `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram`;
          } catch { /* token inválido: aparece como não configurado */ }
        }
        return json({ configurado: !!TOKEN() && !!SEGREDO() && !!bot, bot, webhook, vinculos: v.data });
      }
      case "gerar_codigo": {
        const r = await db.rpc("telegram_gerar_codigo", { _usuario: usuario });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ codigo: r.data, expira_em_minutos: 10 });
      }
      case "desvincular": {
        const r = await db.rpc("telegram_desvincular", {
          _usuario: usuario, _chat: Number.isSafeInteger(body.chat_id) ? body.chat_id : null,
        });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ ok: true, removidos: r.data });
      }
      case "configurar_webhook": {
        const g = await db.rpc("is_gestor", { _user_id: usuario });
        if (g.data !== true) return json({ error: "Gestor ativo necessário" }, 403);
        if (!TOKEN() || !SEGREDO()) return json({ error: "Cadastre TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET nos segredos das funções." }, 409);
        await telegram("setWebhook", {
          url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram`,
          secret_token: SEGREDO(),
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: true,
        });
        await telegram("setMyCommands", {
          commands: [
            { command: "aprovacoes", description: "Pedidos esperando a sua aprovação" },
            { command: "missao", description: "Criar missão para a Gestora" },
            { command: "ajuda", description: "Como usar" },
            { command: "desvincular", description: "Desligar este Telegram do JAS" },
          ],
        });
        return json({ ok: true });
      }
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Falha no Telegram" }, 500);
  }
});
