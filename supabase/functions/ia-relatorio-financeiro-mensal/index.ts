// Relatório financeiro mensal — agregados de honorários/parcelas + análise IA.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59);
    const inicioISO = inicio.toISOString().slice(0, 10);
    const fimISO = fim.toISOString().slice(0, 10);

    const [{ data: pagamentos }, { data: parcelasMes }, { count: clientesNovos }, { count: processosNovos }] = await Promise.all([
      admin.from("honorarios_pagamentos")
        .select("valor_recebido, tipo_pagamento, data_pagamento, valor_parceiro")
        .gte("data_pagamento", inicioISO).lte("data_pagamento", fimISO),
      admin.from("honorarios_parcelas")
        .select("valor, status, data_vencimento")
        .gte("data_vencimento", inicioISO).lte("data_vencimento", fimISO),
      admin.from("clientes").select("id", { count: "exact", head: true })
        .gte("criado_em", inicio.toISOString()).lte("criado_em", fim.toISOString()),
      admin.from("processos").select("id", { count: "exact", head: true })
        .gte("criado_em", inicio.toISOString()).lte("criado_em", fim.toISOString()),
    ]);

    const recebido = (pagamentos ?? []).reduce((s: number, p: any) => s + Number(p.valor_recebido || 0), 0);
    const repassado = (pagamentos ?? []).reduce((s: number, p: any) => s + Number(p.valor_parceiro || 0), 0);
    const exito = (pagamentos ?? []).filter((p: any) => p.tipo_pagamento === "exito")
      .reduce((s: number, p: any) => s + Number(p.valor_recebido || 0), 0);
    const inadimplente = (parcelasMes ?? []).filter((p: any) => p.status === "atrasado")
      .reduce((s: number, p: any) => s + Number(p.valor || 0), 0);

    const dados = {
      mes: inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      total_recebido: recebido,
      repassado_parceiros: repassado,
      receita_liquida: recebido - repassado,
      total_exito: exito,
      parcelas_atrasadas_valor: inadimplente,
      parcelas_atrasadas_qtd: (parcelasMes ?? []).filter((p: any) => p.status === "atrasado").length,
      clientes_novos: clientesNovos ?? 0,
      processos_novos: processosNovos ?? 0,
    };

    const sys = `Você é a "Bia", analista financeira do escritório.
Gere relatório mensal CONCISO em markdown:
- Resumo executivo (3 linhas)
- Tabela de KPIs
- Análise de tendência
- 3 insights acionáveis
- Alertas se inadimplência elevada (>10% recebido)
Tom: direto, profissional. Valores em R$. Máx 600 palavras.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview", max_tokens: 2000,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Dados do mês ${dados.mes}:\n${JSON.stringify(dados, null, 2)}\n\nGere o relatório.` },
        ],
      }),
    });
    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}: ${(await aiResp.text()).slice(0, 200)}`);
    const conteudo = (await aiResp.json())?.choices?.[0]?.message?.content ?? "";

    await admin.from("ia_relatorios").insert({
      tipo: "financeiro_mensal",
      mes_referencia: inicioISO,
      titulo: `Relatório Financeiro — ${dados.mes}`,
      conteudo,
      dados,
    });

    const { data: gestores } = await admin.from("user_roles").select("user_id").eq("role", "gestor");
    if (gestores?.length) {
      await admin.from("notificacoes").insert(gestores.map((g: any) => ({
        user_id: g.user_id,
        tipo: "relatorio_mensal",
        titulo: `📊 Relatório financeiro — ${dados.mes}`,
        descricao: `Receita líquida: R$ ${dados.receita_liquida.toFixed(2)}`,
        link: "/ia/automacoes",
      })));
    }

    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-relatorio-financeiro-mensal", status: "sucesso", detalhes: dados,
    });
    return new Response(JSON.stringify({ ok: true, dados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ia-relatorio-financeiro-mensal]", msg);
    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-relatorio-financeiro-mensal", status: "erro", erro: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
