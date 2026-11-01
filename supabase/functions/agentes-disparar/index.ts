// Edge Function: agentes-disparar
// Ponte segura entre o sistema e o n8n.
// O token do webhook do n8n fica em segredo no servidor — nunca no navegador.
//
// Ações:
//   disparar  -> registra a execução e chama o webhook do n8n
//   decidir   -> aprova ou rejeita uma execução pendente
//   cancelar  -> marca a execução como cancelada

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    // ---------- DISPARAR ----------
    if (acao === "disparar") {
      const { agente_slug, entrada = {}, processo_id, cliente_id, item_id } = body ?? {};
      if (!agente_slug) return json({ error: "Informe o agente." }, 400);

      const { data: agente, error: agErr } = await admin
        .from("agentes_ia")
        .select("id, nome, slug, webhook_url, exige_aprovacao, timeout_segundos, ativo")
        .eq("slug", agente_slug)
        .maybeSingle();

      if (agErr || !agente) return json({ error: "Agente não encontrado." }, 404);
      if (!agente.ativo) return json({ error: "Agente desativado." }, 400);
      if (!agente.webhook_url) {
        return json({ error: "Este agente ainda não tem webhook configurado no n8n." }, 400);
      }

      const { data: exec, error: execErr } = await admin
        .from("agente_execucoes")
        .insert({
          agente_id: agente.id,
          disparado_por: user.id,
          origem: body.origem ?? "manual",
          status: "executando",
          entrada,
          processo_id: processo_id ?? null,
          cliente_id: cliente_id ?? null,
          item_id: item_id ?? null,
        })
        .select("id")
        .single();

      if (execErr) return json({ error: execErr.message }, 500);

      const url = agente.webhook_url.startsWith("http")
        ? agente.webhook_url
        : `${N8N_BASE.replace(/\/$/, "")}${agente.webhook_url}`;

      // Chama o n8n sem travar a resposta por muito tempo.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), (agente.timeout_segundos ?? 300) * 1000);
      const t0 = Date.now();

      try {
        const resp = await fetch(url, {
          method: "POST",
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
            .eq("id", exec.id);
          return json({ error: `O n8n respondeu com erro ${resp.status}.`, execucao_id: exec.id }, 502);
        }

        // Se o agente devolveu algo para revisão, abre uma aprovação.
        const precisaAprovar = agente.exige_aprovacao && payload?.resultado;
        if (precisaAprovar) {
          await admin.from("agente_aprovacoes").insert({
            execucao_id: exec.id,
            conteudo: payload.resultado,
          });
        }

        await admin
          .from("agente_execucoes")
          .update({
            status: precisaAprovar ? "aguardando_aprovacao" : "concluida",
            saida: payload,
            resumo: payload?.resumo ?? null,
            finalizado_em: new Date().toISOString(),
            duracao_ms: duracao,
          })
          .eq("id", exec.id);

        return json({ ok: true, execucao_id: exec.id, status: precisaAprovar ? "aguardando_aprovacao" : "concluida" });
      } catch (e) {
        const msg = e instanceof Error && e.name === "AbortError"
          ? "O agente demorou demais para responder."
          : `Falha ao chamar o n8n: ${e instanceof Error ? e.message : "erro desconhecido"}`;

        await admin
          .from("agente_execucoes")
          .update({
            status: "erro",
            erro: msg,
            finalizado_em: new Date().toISOString(),
            duracao_ms: Date.now() - t0,
          })
          .eq("id", exec.id);

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

      const { data: aprov } = await admin
        .from("agente_aprovacoes")
        .select("id")
        .eq("execucao_id", execucao_id)
        .is("decisao", null)
        .maybeSingle();

      if (!aprov) return json({ error: "Nada pendente de aprovação nesta execução." }, 404);

      await admin
        .from("agente_aprovacoes")
        .update({
          decisao,
          decidido_por: user.id,
          decidido_em: new Date().toISOString(),
          observacao: observacao ?? null,
        })
        .eq("id", aprov.id);

      await admin
        .from("agente_execucoes")
        .update({ status: decisao === "aprovado" ? "concluida" : "rejeitada" })
        .eq("id", execucao_id);

      await admin.from("agente_execucao_logs").insert({
        execucao_id,
        nivel: "info",
        mensagem: `Execução ${decisao} por ${user.email ?? user.id}`,
      });

      return json({ ok: true, decisao });
    }

    // ---------- CANCELAR ----------
    if (acao === "cancelar") {
      const { execucao_id } = body ?? {};
      if (!execucao_id) return json({ error: "Informe a execução." }, 400);
      await admin
        .from("agente_execucoes")
        .update({ status: "cancelada", finalizado_em: new Date().toISOString() })
        .eq("id", execucao_id);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
