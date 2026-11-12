// Telegram da diretoria: conversar com a Gestora (Manu), criar missões e decidir aprovações pelo celular.
// Três entradas: o webhook do Telegram (segredo no cabeçalho), o JAS logado (vincular/configurar) e o
// aviso de aprovação vindo do banco (segredo das rotinas). O chat só obedece depois de vinculado por código
// de uso único; conversa, missão e aprovação passam pelas funções de sempre, com as mesmas regras.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarInterno } from "../_shared/interno.ts";
import {enviarResumos,FalhaTelegram} from './resumos.ts';
import {processarPedidos} from './pedidos.ts';
import {validarAudio} from './audio.ts';
import {textoAndamento} from './inteligencia.ts';
import {enviarManu,enviarDocumento} from './entregas.ts';
import {formatarDocumento,modeloTexto,type DocumentoManu} from './modelos.ts';
import {
  ajuda,
  comando,
  dadosBotao,
  lerBotao,
  segredoValido,
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

// trim: ao colar no painel de segredos é comum vir espaço ou quebra de linha junto.
const TOKEN = () => (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim();
const SEGREDO = () => (Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "").trim();

async function telegram(metodo: string, corpo: Record<string, unknown>) {
  let r:Response;
  try { r = await fetch(`https://api.telegram.org/bot${TOKEN()}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  }); } catch {throw new FalhaTelegram('telegram_transporte_incerto',true);}
  const d = await r.json().catch(() => ({}));
  if (!d.ok){const codigo=Number.isSafeInteger(d.error_code)?d.error_code:r.status;throw new FalhaTelegram(`telegram_http_${codigo}`,codigo>=500||(r.ok&&!Number.isSafeInteger(d.error_code)),codigo===429?Math.min(3600,Math.max(5,Number(d.parameters?.retry_after)||60)):undefined);}
  return d.result;
}
async function enviar(db:SupabaseClient,chat:number,text:string,extra:Record<string,unknown>={}){
 const vinculo=await db.rpc('telegram_usuario',{_chat:chat});
 if(!vinculo.data){let ultima:{message_id?:number}={};for(const parte of formatarDocumento(modeloTexto(text,{tipo:'ℹ️ Atendimento',status:'pendente'})))ultima=await telegram('sendMessage',{chat_id:chat,text:parte,parse_mode:'HTML'});return ultima;}
 return enviarManu(db,telegram,'sendMessage',{chat_id:chat,text,...extra});
}
const dependenciasPedidos=(db:SupabaseClient)=>({telegram:(metodo:string,corpo:Record<string,unknown>)=>enviarManu(db,telegram,metodo,corpo),key:()=>Deno.env.get('OPENAI_API_KEY')??'',token:TOKEN,aprovacoes:pendentes});

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function pendentes(usuario: string) {
  const r = await chamarInterno<{ aprovacoes: Aprovacao[] }>("motor-missoes", usuario, { acao: "aprovacoes" });
  return (r.aprovacoes ?? []).filter((a) => a.tipo === "acao");
}

async function mostrarAprovacao(db:SupabaseClient,chat: number, a: Aprovacao) {
  return enviar(db,chat, textoAprovacao(a), {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Aprovar e executar", callback_data: dadosBotao(a.id, true) },
        { text: "✖️ Recusar", callback_data: dadosBotao(a.id, false) },
      ]],
    },
  });
}

async function tratarMensagem(db: SupabaseClient, msg: { chat: { id: number; type: string }; from?: { first_name?: string }; text?: string;voice?:Record<string,unknown>;audio?:Record<string,unknown> },updateId:unknown) {
  const chat = msg.chat.id;
  if (msg.chat.type !== "private") return;
  const c = comando(msg.text ?? "");
  const vinc = await db.rpc("telegram_usuario", { _chat: chat });
  const usuario = vinc.data as string | null;

  if (c.nome === "vincular") {
    const u = await db.rpc("telegram_vincular", { _chat: chat, _codigo: c.resto, _nome: msg.from?.first_name ?? null });
    return enviar(db,chat, u.data
      ? "Pronto! Este Telegram está vinculado ao JAS. Escreva para falar com a Gestora ou envie /ajuda."
      : "Código inválido ou vencido. Gere outro no JAS: Escritório › Aprovações › Telegram.");
  }
  if (!usuario) return enviar(db,chat, ajuda(false));
  if (c.nome === "start" || c.nome === "ajuda") return enviar(db,chat, ajuda(true));
  if (c.nome === "desvincular") {
    await db.rpc("telegram_desvincular", { _usuario: usuario, _chat: chat });
    return enviar(db,chat, "Telegram desvinculado. Para voltar, gere um novo código no JAS.");
  }
  if (c.nome === "aprovacoes") {
    const lista = await pendentes(usuario);
    if (!lista.length) return enviar(db,chat, "Nada esperando a sua aprovação.");
    for (const a of lista.slice(0, 10)) await mostrarAprovacao(db,chat, a);
    return;
  }
  if(c.nome==='resumo'||c.nome==='relatorio'){
    const r=await db.rpc('operacao24h_pedir_resumo',{_usuario:usuario});
    if(r.error)return enviar(db,chat,'Não foi possível preparar o resumo agora. Confira o painel do Telegram no JAS.');
    await enviarResumos(db,(destino,texto,meta)=>enviar(db,destino,texto,{_jas:meta}),r.data);
    return;
  }
  if(c.nome==='andamento'){const r=await db.rpc('telegram_andamento',{_chat:chat});return enviar(db,chat,r.error?'Não foi possível consultar os pedidos agora.':textoAndamento(r.data));}
  if(c.nome&&c.nome!=='missao')return enviar(db,chat,ajuda(true));
  const texto=c.nome==='missao'?`Quero que a equipe execute este pedido: ${c.resto}`:(msg.text??'').trim();
  const audio=msg.voice??msg.audio;
  if(texto&&!c.nome){const f=await db.rpc('telegram_manu_feedback',{_chat:chat,_texto:texto});if(f.error)return enviar(db,chat,'Não consegui registrar os ajustes. Confira se a versão mudou no JAS.');if(f.data){await enviar(db,chat,f.data.resposta,{_jas:{tipo:'✍️ Ajustes',status:'pendente'}});await processarPedidos(db,dependenciasPedidos(db));return;}}
  if(!texto&&!audio)return enviar(db,chat,'Envie uma mensagem de texto ou um áudio de até 3 minutos e 5 MB. Documentos, vídeos e imagens ainda não entram neste fluxo.');
  if(!Number.isSafeInteger(updateId)||Number(updateId)<0)return;
  try{
    const r=await db.rpc('telegram_receber_pedido',{_chave:`tg:${updateId}`,_chat:chat,_texto:texto,_audio:audio?validarAudio(audio):null});
    if(r.error)return enviar(db,chat,'Não consegui registrar o pedido agora. Aguarde um minuto e tente novamente.');
    await telegram('sendChatAction',{chat_id:chat,action:'typing'}).catch(()=>{});
    await processarPedidos(db,dependenciasPedidos(db));
  }catch{return enviar(db,chat,'Não consegui processar esta mensagem. Para áudio, use até 3 minutos e 5 MB; você também pode escrever o pedido.');}
}

async function tratarBotao(db: SupabaseClient, q: { id: string; data?: string; message?: { chat: { id: number }; message_id: number } }) {
  const chat = q.message?.chat.id;
  const entrega=q.data?.match(/^en:([0-9a-f-]{36}):([djnp])$/i);
  if(entrega&&chat){
    await telegram('answerCallbackQuery',{callback_query_id:q.id,text:'Consultando o JAS…'});
    try{
      if(entrega[2]==='d'){
        const r=await db.rpc('telegram_manu_consultar',{_chat:chat,_entrega:entrega[1]});if(r.error)throw r.error;
        return enviarDocumento(db,telegram,chat,r.data as DocumentoManu,`detalhes:${crypto.randomUUID()}`);
      }
      const acao=entrega[2]==='j'?'ajustes':entrega[2]==='p'?'aprovar':'nova';
      const r=await db.rpc('telegram_manu_acao',{_chat:chat,_entrega:entrega[1],_acao:acao});if(r.error)throw r.error;
      if(acao==='aprovar')await telegram('editMessageReplyMarkup',{chat_id:chat,message_id:q.message!.message_id,reply_markup:{inline_keyboard:[[{text:'Consultar detalhes',callback_data:`en:${entrega[1]}:d`}],[{text:'Solicitar ajustes',callback_data:`en:${entrega[1]}:j`},{text:'Gerar nova versão',callback_data:`en:${entrega[1]}:n`}]]}}).catch(()=>{});
      await enviar(db,chat,r.data.resposta,{_jas:{tipo:'📋 Decisão no JAS',status:acao==='aprovar'?'concluido':'pendente'}});
      if(r.data.pedido_id)await processarPedidos(db,dependenciasPedidos(db));
      return;
    }catch{return enviar(db,chat,'Não foi possível confirmar a ação. A versão pode ter mudado; consulte o item atual no JAS. Nenhuma aprovação foi presumida.');}
  }

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
  await telegram('editMessageReplyMarkup',{chat_id:chat,message_id:q.message!.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
  return enviar(db,chat,resultado,{_jas:{tipo:'📋 Resultado da decisão',status:resultado.includes('executado')?'concluido':'pendente'}});
}

async function avisarAprovacao(db: SupabaseClient, id: string) {
  const { data: destinos } = await db.rpc("telegram_destinos_aprovacao", { _aprovacao: id });
  for (const d of (destinos ?? []) as { chat_id: number; usuario_id: string }[]) {
    const a = (await pendentes(d.usuario_id)).find((x) => x.id === id);
    if (!a) continue;
    const m = await mostrarAprovacao(db,d.chat_id, a);
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
          if (body.message) await tratarMensagem(db, body.message,body.update_id);
          else if (body.callback_query) await tratarBotao(db, body.callback_query);
        } catch (e) {
          console.error("telegram_processamento_indisponivel");
        }
      })();
      // Responde logo ao Telegram (evita reenvio) e termina o trabalho em segundo plano.
      const rt = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
      if (rt) rt.waitUntil(tarefa);
      else await tarefa;
      return json({ ok: true });
    }

    // 2. Aviso de aprovação vindo do banco.
    if(body.acao==='processar_pedidos'){
      const ok=await db.rpc('validar_djen_cron_secret',{_secret:req.headers.get('x-djen-cron-secret')??''});
      if(ok.error||ok.data!==true)return json({error:'Não autorizado'},401);
      const trabalho=processarPedidos(db,dependenciasPedidos(db)).catch(()=>console.error('telegram_fila_indisponivel'));
      const rt=(globalThis as {EdgeRuntime?:{waitUntil:(p:Promise<unknown>)=>void}}).EdgeRuntime;
      if(rt)rt.waitUntil(trabalho);else await trabalho;
      return json({ok:true});
    }
    if(body.acao==='resumos_automaticos'){
      const ok=await db.rpc('validar_djen_cron_secret',{_secret:req.headers.get('x-djen-cron-secret')??''});
      if(ok.error||ok.data!==true)return json({error:'Não autorizado'},401);
      if(!TOKEN())return json({error:'Telegram não configurado'},503);
      const trabalho=enviarResumos(db,(chat,texto,meta)=>enviar(db,chat,texto,{_jas:meta})).catch(()=>{console.error('resumo_automatico_indisponivel');});
      const rt=(globalThis as {EdgeRuntime?:{waitUntil:(p:Promise<unknown>)=>void}}).EdgeRuntime;
      if(rt)rt.waitUntil(trabalho);else await trabalho;
      return json({ok:true});
    }
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
      case 'resumo_agora': {
        const r=await db.rpc('operacao24h_pedir_resumo',{_usuario:usuario});
        if(r.error)return json({error:r.error.message},403);
        return json(await enviarResumos(db,(chat,texto,meta)=>enviar(db,chat,texto,{_jas:meta}),r.data));
      }
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
        if (!segredoValido(SEGREDO()))
          return json({
            error: "TELEGRAM_WEBHOOK_SECRET só pode ter letras, números, _ e - (até 256). Gere outro com o comando do guia e salve de novo.",
          }, 409);
        await telegram("setWebhook", {
          url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram`,
          secret_token: SEGREDO(),
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: true,
        });
        await telegram("setMyCommands", {
          commands: [
            { command: "aprovacoes", description: "Pedidos esperando a sua aprovação" },
            { command: "resumo", description: "Resumo atual de leads, aprovações e tarefas" },
            { command: "andamento", description: "Etapas dos seus pedidos para a equipe" },
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
