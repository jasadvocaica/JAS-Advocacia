// Integração Zernio: credencial, teste, configuração, painel e sincronização.
// A chave nunca volta para o navegador: é cifrada aqui (COFRE_ENCRYPTION_KEY) e guardada só no banco privado.
// Ações: painel | salvar_chave | testar | configurar | revogar | sincronizar (pessoa logada) · processar (cron ou administração).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chaveValida, cifrar, criarCliente, decifrar, ErroZernio, mapConta, mascarar, semSegredos } from "../_shared/zernio.ts";
import { reconciliarPagina } from "../_shared/marketing-leads.ts";
import { normalizarFormularios, consultarMetaSelecionada } from "../_shared/marketing-formularios.ts";
import { sincronizar, type Armazem, type EstadoJob } from "../_shared/zernio-sync.ts";

import {anuncios} from './anuncios.ts';

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djen-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const ABAS = ["visao", "instagram", "anuncios", "sincronizacoes"];
const PRAZO_MS = 40000;

function segredoServidor() {
  const s = Deno.env.get("COFRE_ENCRYPTION_KEY");
  if (!s) throw new Error("Chave de criptografia do servidor não configurada (COFRE_ENCRYPTION_KEY).");
  return s;
}

async function clienteDoBanco(db: SupabaseClient, tentativas = 3) {
  const c = await db.rpc("zernio_conexao", { _com_cifra: true });
  if (c.error) throw c.error;
  if (!c.data?.chave_cifrada) throw new ErroZernio("Aguardando configuração da API.", "autenticacao", 0);
  return criarCliente({ chave: await decifrar(c.data.chave_cifrada, segredoServidor()), tentativas });
}

/** Testa a chave com GET /v1/accounts, registra as contas e descobre quais recursos o plano libera. */
async function testar(db: SupabaseClient) {
  const api = await clienteDoBanco(db);
  try {
    const contas = await api.get<{ accounts: Record<string, unknown>[]; hasAnalyticsAccess?: boolean }>("/v1/accounts", {});
    const lista = (contas.dados.accounts ?? []).map(mapConta);
    if (lista.length) await db.rpc("zernio_gravar", { _recurso: "contas", _linhas: lista });
    const addons: Record<string, boolean | null> = { analytics: contas.dados.hasAnalyticsAccess ?? null, inbox: null, ads: null };
    const sondar = async (caminho: string, chave: "inbox" | "ads", params: Record<string, unknown>) => {
      try { await api.get(caminho, params); addons[chave] = true; }
      catch (e) { if (e instanceof ErroZernio && e.tipo === "addon") addons[chave] = false; else if (e instanceof ErroZernio && e.tipo === "autenticacao") throw e; }
    };
    if (lista.some((c) => c.plataforma === "instagram")) await sondar("/v1/inbox/conversations", "inbox", { platform: "instagram", limit: 1 });
    const ads = lista.find((c) => c.plataforma === "metaads");
    if (ads) await sondar("/v1/ads/campaigns", "ads", { accountId: ads.externo_id, limit: 1 });
    await db.rpc("zernio_registrar_teste", { _estado: "conectado", _erro: null, _addons: addons });
    return { ok: true, contas: lista.length, addons };
  } catch (e) {
    const erro = e instanceof ErroZernio ? e : new ErroZernio(e instanceof Error ? e.message : "Falha", "transitorio", 0);
    await db.rpc("zernio_registrar_teste", {
      _estado: erro.tipo === "autenticacao" ? "erro_autenticacao" : "erro", _erro: semSegredos(erro.message), _addons: {},
    });
    return { ok: false, erro: semSegredos(erro.message), tipo: erro.tipo, status: erro.status };
  }
}

function armazem(db: SupabaseClient, job: EstadoJob): Armazem {
  return {
    async gravar(recurso, linhas) {
      if (!linhas.length) return 0;
      const r = await db.rpc("zernio_gravar", { _recurso: recurso, _linhas: linhas });
      if (r.error) throw new Error(`Gravação de ${recurso}: ${r.error.message}`);
      return Number(r.data ?? 0);
    },
    async salvarProgresso(j) {
      await db.rpc("zernio_job_progresso", { _job: j.id, _etapa: j.etapa_atual, _cursores: j.cursores, _progresso: j.progresso });
    },
    async log(nivel, recurso, mensagem, http) {
      await db.rpc("zernio_log", { _job: job.id, _nivel: nivel, _recurso: recurso, _mensagem: semSegredos(mensagem), _http: http ?? null });
    },
    async contasSelecionadas() {
      const r = await db.rpc("zernio_contas_selecionadas");
      return (r.data ?? []) as { externo_id: string; plataforma: string }[];
    },
    async marcarAddon(recurso, disponivel) {
      await db.rpc("zernio_registrar_teste", { _estado: "conectado", _erro: null, _addons: { [recurso]: disponivel } });
    },
  };
}

/** Processa jobs da fila até o prazo. Um job interrompido volta para a fila e retoma do cursor salvo. */
async function processar(db: SupabaseClient) {
  const fim = Date.now() + PRAZO_MS;
  const feitos: unknown[] = [];
  while (Date.now() < fim - 5000) {
    const r = await db.rpc("zernio_job_reservar", { _lease_segundos: 120 });
    if (r.error) throw r.error;
    if (!r.data) break;
    const j = r.data;
    if (j.cursores?.consulta_meta === true) {
      try {
        const selecionadas = await db.rpc("zernio_contas_selecionadas");
        if (selecionadas.error) throw new Error("consulta_meta_invalida");
        const api = await clienteDoBanco(db);
        const resultado = await consultarMetaSelecionada(selecionadas.data ?? [], async (path, params) => (await api.get(path, params)).dados);
        const gravado = await db.rpc("mkt_consulta_meta_finalizar", { _job: j.id, _resultado: resultado, _erro: null });
        if (gravado.error || gravado.data !== true) throw new Error("consulta_meta_invalida");
        feitos.push({ job: j.id, estado: "concluido", recurso: "consulta_meta" });
      } catch {
        await db.rpc("mkt_consulta_meta_finalizar", { _job: j.id, _resultado: null, _erro: "consulta_meta_falhou" });
        feitos.push({ job: j.id, estado: "falhou", recurso: "consulta_meta" });
      }
      break;
    }
    const job: EstadoJob = { id: j.id, etapa_atual: j.etapa_atual, cursores: j.cursores ?? {}, progresso: j.progresso ?? {} };
    try {
      const api = await clienteDoBanco(db);
      const res = await sincronizar({ api, armazem: armazem(db, job), job, ultimoOk: j.ultimo_ok, prazoMs: fim - Date.now() - 3000 });
      const erro = res.falhas.length ? `Falhas em: ${res.falhas.join(", ")}` : null;
      await db.rpc("zernio_job_finalizar", { _job: job.id, _estado: res.estado, _erro: erro, _esperar: 0 });
      feitos.push({ job: job.id, estado: res.estado, progresso: job.progresso, indisponiveis: res.indisponiveis });
      if (res.estado === "continua") break;
    } catch (e) {
      const erro = e instanceof ErroZernio ? e : null;
      const msg = semSegredos(e instanceof Error ? e.message : "Falha");
      await db.rpc("zernio_log", { _job: job.id, _nivel: "erro", _recurso: job.etapa_atual, _mensagem: msg, _http: erro?.status ?? null });
      if (erro?.tipo === "autenticacao") {
        await db.rpc("zernio_registrar_teste", { _estado: "erro_autenticacao", _erro: msg, _addons: {} });
        await db.rpc("zernio_job_finalizar", { _job: job.id, _estado: "falhou", _erro: `Chave recusada: ${msg}`, _esperar: 0 });
      } else if (erro?.tipo === "limite") {
        await db.rpc("zernio_job_finalizar", { _job: job.id, _estado: "adiado", _erro: msg, _esperar: erro.esperarSegundos ?? 60 });
      } else if (Number(j.tentativas) < Number(j.max_tentativas)) {
        await db.rpc("zernio_job_finalizar", { _job: job.id, _estado: "adiado", _erro: msg, _esperar: 60 * 2 ** Number(j.tentativas) });
      } else {
        await db.rpc("zernio_job_finalizar", { _job: job.id, _estado: "falhou", _erro: msg, _esperar: 0 });
      }
      feitos.push({ job: job.id, estado: "erro", erro: msg });
      break;
    }
  }
  await db.rpc("mkt_alertas_integracao");
  await db.rpc("mkt_purgar_eventos_lead");
  return feitos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const raw = await req.text();
    if (raw.length > 200000) return json({ error: "Requisição muito grande" }, 413);
    const body = JSON.parse(raw || "{}");

    if (body.acao === "processar" && req.headers.get("x-djen-cron-secret")) {
      const ok = await db.rpc("validar_djen_cron_secret", { _secret: req.headers.get("x-djen-cron-secret") ?? "" });
      if (ok.error || ok.data !== true) return json({ error: "Não autorizado" }, 401);
      return json({ ok: true, processados: await processar(db) });
    }

    const auth = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer /i, ""));
    if (auth.error || !auth.data.user) return json({ error: "Sessão inválida" }, 401);
    const usuario = auth.data.user.id;
    const [gestor, interno, ver] = await Promise.all([
      db.rpc("is_gestor", { _user_id: usuario }),
      db.rpc("is_interno_ativo", { _user_id: usuario }),
      db.rpc("has_permission", { _user_id: usuario, _modulo: "marketing", _acao: "visualizar" }),
    ]);
    if (interno.data !== true) return json({ error: "Usuário inativo" }, 403);
    const admin = gestor.data === true;

    if (body.acao === "painel") {
      if (!admin && ver.data !== true) return json({ error: "Sem acesso ao Marketing" }, 403);
      const aba = ABAS.includes(body.aba) ? body.aba : "visao";
      const r = await db.rpc("zernio_painel", { _aba: aba, _dias: Number.isInteger(body.dias) ? body.dias : 30 });
      if (r.error) throw r.error;
      return json({ ...r.data, pode_administrar: admin });
    }

    if (!admin) return json({ error: "Só a administração configura a integração" }, 403);
    if(body.acao==='ads_contexto'||body.acao==='ads_executar')return json(await anuncios(db,await clienteDoBanco(db,1),usuario,body));
    switch (body.acao) {
      case "descobrir_formularios": {
        if (typeof body.conta_id !== "string" || !body.conta_id || body.conta_id.length > 200 ||
            (body.cursor != null && (typeof body.cursor !== "string" || body.cursor.length > 1000)))
          return json({ error: "Conta ou cursor inválido" }, 400);
        const contas = await db.rpc("zernio_painel", { _aba: "visao", _dias: 30 });
        if (contas.error) throw contas.error;
        if (!contas.data?.contas?.some((c: { externo_id: string; plataforma: string; ativa: boolean; selecionada: boolean; precisa_reconectar: boolean }) =>
          c.externo_id === body.conta_id && c.ativa && c.selecionada && !c.precisa_reconectar && ["facebook", "metaads", "instagram"].includes(c.plataforma)))
          return json({ error: "Selecione uma conta Meta ativa da integração" }, 403);
        const api = await clienteDoBanco(db);
        const pagina = await api.get("/v1/ads/lead-forms", {
          accountId: body.conta_id, limit: 25, cursor: body.cursor ?? undefined,
        });
        return json({ ok: true, conta_id: body.conta_id, ...normalizarFormularios(pagina.dados) });
      }
      case "reconciliar_leads": {
        if (Deno.env.get("MARKETING_LEADS_HABILITADO") !== "true") return json({ error: "Receptor de leads desativado; homologação necessária" }, 409);
        if (typeof body.conta_id !== "string" || typeof body.formulario_id !== "string" || body.conta_id.length > 200 || body.formulario_id.length > 200 || (body.cursor != null && (typeof body.cursor !== "string" || body.cursor.length > 1000))) return json({ error: "Parâmetros inválidos" }, 400);
        const cfg = await db.rpc("mkt_formulario_reconciliar", { _conta: body.conta_id, _formulario: body.formulario_id });
        if (cfg.error || !cfg.data) return json({ error: "Formulário não homologado" }, 403);
        const api = await clienteDoBanco(db);
        const resultado = await reconciliarPagina(body.conta_id, body.formulario_id, cfg.data.teste, body.cursor ?? undefined,
          async params => (await api.get(`/v1/ads/lead-forms/${encodeURIComponent(body.formulario_id)}/leads`, params)).dados,
          async dados => { const r = await db.rpc("mkt_receber_lead", { _dados: dados }); if (r.error) throw new Error("Falha ao gravar lead; retome a mesma página com segurança"); });
        await db.rpc("mkt_purgar_eventos_lead");
        return json({ ok: true, ...resultado });
      }
      case "salvar_chave": {
        const chave = typeof body.chave === "string" ? body.chave.trim() : "";
        if (!chaveValida(chave)) return json({ error: "Formato de chave inválido: a chave do Zernio começa com sk_ e tem 67 caracteres." }, 400);
        const r = await db.rpc("zernio_salvar_chave", {
          _usuario: usuario, _cifrada: await cifrar(chave, segredoServidor()), _mascara: mascarar(chave),
        });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ ok: true, mascara: mascarar(chave), teste: await testar(db) });
      }
      case "testar":
        return json(await testar(db));
      case "configurar": {
        const r = await db.rpc("zernio_configurar", { _usuario: usuario, _cfg: body.config ?? {} });
        if (r.error) return json({ error: r.error.message }, 400);
        return json({ ok: true, conexao: r.data });
      }
      case "revogar": {
        const r = await db.rpc("zernio_revogar", { _usuario: usuario });
        if (r.error) return json({ error: r.error.message }, 403);
        return json({ ok: true });
      }
      case "sincronizar": {
        const r = await db.rpc("zernio_job_criar", { _usuario: usuario, _origem: "manual" });
        if (r.error) return json({ error: r.error.message }, 409);
        return json({ ok: true, job: r.data, processados: await processar(db) });
      }
      case "processar":
        return json({ ok: true, processados: await processar(db) });
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: semSegredos(e instanceof Error ? e.message : "Falha na integração") }, 500);
  }
});
