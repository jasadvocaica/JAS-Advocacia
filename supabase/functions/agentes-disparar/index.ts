// Edge Function: agentes-disparar
// Executor nativo DJEN e ponte para agentes externos opcionais.
// O token do webhook do n8n fica em segredo no servidor — nunca no navegador.
//
// Ações:
//   disparar  -> registra a execução e chama o webhook do n8n
//   decidir   -> aprova ou rejeita uma execução pendente
//   cancelar  -> marca a execução como cancelada

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { agenteNativo, destinoN8n, permissaoAgente } from "../_shared/agentes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const N8N_BASE = Deno.env.get("N8N_BASE_URL") ?? "";
const N8N_TOKEN = Deno.env.get("N8N_WEBHOOK_TOKEN") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sem autenticação." }, 401);

    // Identifica o usuário pelo token que veio do navegador.
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Sessão inválida." }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const acao = body.acao as string;
    const permissao = permissaoAgente(acao);
    if (!permissao) return json({ error: "Ação desconhecida." }, 400);
    const [{ data: interno, error: internoErr }, { data: autorizado, error: permErr }] = await Promise.all([
      userClient.rpc("is_interno_ativo", { _user_id: user.id }),
      userClient.rpc("has_permission", { _user_id: user.id, _modulo: "controladoria", _acao: permissao }),
    ]);
    if (internoErr || permErr || interno !== true || autorizado !== true) {
      return json({ error: "Sem permissão para esta ação nos agentes." }, 403);
    }

    // ---------- DISPARAR ----------
    if (acao === "disparar") {
      const { agente_slug, entrada = {}, processo_id, cliente_id, item_id } = body ?? {};
      if (!agente_slug) return json({ error: "Informe o agente." }, 400);
      if (!entrada || typeof entrada !== "object" || Array.isArray(entrada) || JSON.stringify(entrada).length > 65536) {
        return json({ error: "Entrada inválida ou muito grande." }, 400);
      }
      for (const [tabela, id] of [["processos", processo_id], ["clientes", cliente_id], ["controladoria_itens", item_id]]) {
        if (id == null) continue;
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Vínculo inválido." }, 400);
        const { data: vinculo, error } = await userClient.from(tabela).select("id").eq("id", id).maybeSingle();
        if (error || !vinculo) return json({ error: "Sem acesso ao registro vinculado." }, 403);
      }

      const { data: agente, error: agErr } = await admin
        .from("agentes_ia")
        .select("id, nome, slug, webhook_url, exige_aprovacao, timeout_segundos, ativo")
        .eq("slug", agente_slug)
        .maybeSingle();

      if (agErr || !agente) return json({ error: "Agente não encontrado." }, 404);
      if (!agente.ativo) return json({ error: "Agente desativado." }, 400);
      const nativo = agenteNativo(agente.slug);
      if (!nativo && !agente.webhook_url) {
        return json({ error: "Este agente ainda não tem webhook configurado no n8n." }, 400);
      }

      // Valida o destino antes de registrar a execução ou enviar credenciais.
      const url = nativo ? null : destinoN8n(agente.webhook_url!, N8N_BASE);
      const { data: exec, error: execErr } = await admin
        .from("agente_execucoes")
        .insert({
          agente_id: agente.id,
          disparado_por: user.id,
          origem: "manual",
          status: "executando",
          entrada,
          processo_id: processo_id ?? null,
          cliente_id: cliente_id ?? null,
          item_id: item_id ?? null,
        })
        .select("id")
        .single();

      if (execErr) return json({ error: execErr.message }, 500);

      // Limita chamadas externas à duração suportada pela função.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(120, agente.timeout_segundos ?? 90)) * 1000);
      const t0 = Date.now();

      try {
        if (nativo) {
          let saida: Record<string, unknown>;
          if (agente.slug === "monitor-djen") {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/pje-comunica-sync`, {
              method: "POST", redirect: "error", signal: controller.signal,
              headers: { Authorization: authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" },
              body: JSON.stringify({ modo: "manual", dias: 7 }),
            });
            saida = await response.json();
            if (!response.ok || saida.ok === false || saida.error) throw new Error(String(saida.error ?? "Falha ao consultar o DJEN"));
            const totais = saida.totais as { erros?: number } | undefined;
            if (totais?.erros) throw new Error("Consulta DJEN com falhas. Confira o histórico de sincronização.");
          } else {
            const { data, error } = await admin.rpc("djen_reprocessar_pendencias");
            if (error) throw error;
            saida = data;
            if (saida.erros) throw new Error("Há publicações pendentes de correção. Confira o histórico de triagem.");
          }
          const { data: status, error: updateError } = await admin.rpc("agentes_finalizar_execucao", {
            _id: exec.id, _saida: saida,
            _resumo: agente.slug === "monitor-djen" ? "Consulta DJEN concluída. Publicações disponíveis para triagem."
              : `Triagem concluída: ${saida.processadas ?? 0} publicações tratadas.`,
          });
          if (updateError) throw updateError;
          return json({ ok: true, execucao_id: exec.id, status });
        }
        const resp = await fetch(url!, {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            ...(N8N_TOKEN ? { "x-webhook-token": N8N_TOKEN } : {}),
          },
          body: JSON.stringify({
            execucao_id: exec.id,
            agente: agente.slug,
            entrada,
            usuario: { id: user.id, email: user.email },
            processo_id: processo_id ?? null,
            cliente_id: cliente_id ?? null,
            item_id: item_id ?? null,
          }),
          signal: controller.signal,
        });

        const texto = await resp.text();
        let payload: any = null;
        try {
          payload = texto ? JSON.parse(texto) : null;
        } catch {
          payload = { bruto: texto };
        }

        const duracao = Date.now() - t0;

        if (!resp.ok) {
          await admin
            .from("agente_execucoes")
            .update({
              status: "erro",
              erro: `n8n respondeu ${resp.status}`,
              saida: payload,
              finalizado_em: new Date().toISOString(),
              duracao_ms: duracao,
            })
            .eq("id", exec.id).eq("status", "executando");
          return json({ error: `O n8n respondeu com erro ${resp.status}.`, execucao_id: exec.id }, 502);
        }

        const { data: status, error: finalizarError } = await admin.rpc("agentes_finalizar_execucao", {
          _id: exec.id, _saida: payload, _resumo: payload?.resumo ?? null,
        });
        if (finalizarError) throw finalizarError;
        return json({ ok: true, execucao_id: exec.id, status });
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError"
          ? "O agente demorou demais para responder."
          : `Falha no agente ${agente.nome}: ${e instanceof Error ? e.message : "erro desconhecido"}`;

        await admin
          .from("agente_execucoes")
          .update({
            status: "erro",
            erro: msg,
            finalizado_em: new Date().toISOString(),
            duracao_ms: Date.now() - t0,
          })
          .eq("id", exec.id).eq("status", "executando");

        return json({ error: msg, execucao_id: exec.id }, 502);
      } finally {
        clearTimeout(timer);
      }
    }

    // ---------- DECIDIR ----------
    if (acao === "decidir") {
      const { execucao_id, decisao, observacao } = body ?? {};
      if (!execucao_id) return json({ error: "Informe a execução." }, 400);
      if (decisao !== "aprovado" && decisao !== "rejeitado") {
        return json({ error: "Decisão inválida." }, 400);
      }

      const { error: decisaoError } = await admin.rpc("agentes_registrar_decisao", {
        _id: execucao_id, _decisao: decisao, _usuario: user.id, _observacao: observacao ?? null,
      });
      if (decisaoError) return json({ error: decisaoError.message }, 409);

      return json({ ok: true, decisao });
    }

    // ---------- CANCELAR ----------
    if (acao === "cancelar") {
      const { execucao_id } = body ?? {};
      if (!execucao_id) return json({ error: "Informe a execução." }, 400);
      const { data: cancelada, error: cancelarError } = await admin.from("agente_execucoes")
        .update({ status: "cancelada", finalizado_em: new Date().toISOString() })
        .eq("id", execucao_id).in("status", ["pendente", "aguardando_aprovacao"]).select("id").maybeSingle();
      if (cancelarError) throw cancelarError;
      if (!cancelada) return json({ error: "Execução já finalizada ou em processamento; não pode ser cancelada agora." }, 409);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
