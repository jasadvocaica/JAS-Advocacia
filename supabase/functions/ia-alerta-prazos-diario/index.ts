// Alerta diário de prazos — analisa controladoria_itens próximos e gera briefing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const hoje = new Date();
    const em7 = new Date(Date.now() + 7 * 86400000);

    const { data: prazos, error } = await admin
      .from("controladoria_itens")
      .select(`
        id, titulo, tipo, prioridade, data_vencimento, status,
        processo:processos(numero_cnj, area_direito, vara, comarca),
        cliente:clientes(nome, cpf_cnpj)
      `)
      .in("status", ["pendente", "em_andamento", "aguardando", "atrasado"])
      .lte("data_vencimento", em7.toISOString())
      .gte("data_vencimento", new Date(hoje.getTime() - 86400000).toISOString())
      .order("data_vencimento", { ascending: true })
      .limit(50);
    if (error) throw error;

    if (!prazos || prazos.length === 0) {
      await admin.from("ia_execucoes_log").insert({
        funcao: "ia-alerta-prazos-diario", status: "vazio",
      });
      return new Response(JSON.stringify({ ok: true, total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sysPrompt = `Você é a "Bia", assistente jurídica do escritório.
Gere um briefing diário CONCISO de prazos em markdown, com seções:
1. 🚨 CRÍTICO HOJE/AMANHÃ
2. ⚠️ URGENTE (até 5 dias)
3. 💡 AÇÃO RECOMENDADA por prazo crítico
Máximo 400 palavras. Tom direto. Use folga de 3 dias úteis para alertas.
Datas em DD/MM/AAAA. Cite o número CNJ quando houver.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 1500,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: `Hoje: ${hoje.toLocaleDateString("pt-BR")}\n\nPrazos:\n${JSON.stringify(prazos, null, 2)}\n\nGere o briefing.` },
        ],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI gateway ${aiResp.status}: ${t.slice(0, 200)}`);
    }
    const data = await aiResp.json();
    const briefing = data?.choices?.[0]?.message?.content ?? "Sem conteúdo";

    // Salva como relatório
    await admin.from("ia_relatorios").insert({
      tipo: "briefing_prazos_diario",
      mes_referencia: hoje.toISOString().slice(0, 10),
      titulo: `Briefing de Prazos — ${hoje.toLocaleDateString("pt-BR")}`,
      conteudo: briefing,
      dados: { total_prazos: prazos.length, prazos_ids: prazos.map((p: any) => p.id) },
    });

    // Notifica gestores e advogados
    const { data: destinatarios } = await admin
      .from("user_roles")
      .select("user_id")
      .in("role", ["gestor", "advogado"]);
    if (destinatarios?.length) {
      const rows = destinatarios.map((d: any) => ({
        user_id: d.user_id,
        tipo: "briefing_diario_prazos",
        titulo: `📅 Briefing de prazos — ${prazos.length} item(ns)`,
        descricao: briefing.slice(0, 240),
        link: "/ia/automacoes",
      }));
      await admin.from("notificacoes").insert(rows);
    }

    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-alerta-prazos-diario",
      status: "sucesso",
      detalhes: { total: prazos.length },
    });

    return new Response(JSON.stringify({ ok: true, total: prazos.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ia-alerta-prazos-diario]", msg);
    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-alerta-prazos-diario", status: "erro", erro: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
