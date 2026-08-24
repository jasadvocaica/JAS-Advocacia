// Relatório de horas de estágio — agrega ponto + análise IA com prompt customizável.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];
const DIA_KEY_TO_DOW: Record<string, number> = {
  dom:0, seg:1, ter:2, qua:3, qui:4, sex:5, sab:6,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { membroId, mes, ano, prompt, horasComplementares } = await req.json();
    if (!membroId || !mes || !ano) {
      return new Response(JSON.stringify({ error: "membroId, mes e ano obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const complementares = Array.isArray(horasComplementares) ? horasComplementares : [];
    const totalComplementares = complementares.reduce((s: number, h: any) => s + Number(h?.horas || 0), 0);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

    const [{ data: membro }, { data: regs }, { data: cfg }] = await Promise.all([
      admin.from("equipe_membros").select("id, nome, cargo, data_admissao").eq("id", membroId).maybeSingle(),
      admin.from("gp_ponto_registros")
        .select("data, entrada, saida, horas_trabalhadas, status, observacao")
        .eq("membro_id", membroId).gte("data", inicio).lte("data", fim)
        .order("data", { ascending: true }),
      admin.from("gp_ponto_config").select("dias_trabalho, horas_diarias").eq("membro_id", membroId).maybeSingle(),
    ]);

    if (!membro) {
      return new Response(JSON.stringify({ error: "Membro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const diasJornada: string[] = (cfg?.dias_trabalho as string[]) ?? ["seg","ter","qua","qui","sex"];
    const horasDiarias = Number(cfg?.horas_diarias ?? 4);
    const dowsJornada = new Set(diasJornada.map((k) => DIA_KEY_TO_DOW[k]).filter((d) => d !== undefined));

    // Janela do mês (respeita admissão se cair no mês)
    let diaInicial = 1;
    if (membro.data_admissao) {
      const adm = new Date(membro.data_admissao + "T00:00:00");
      const admMes = adm.getFullYear() * 12 + adm.getMonth();
      const refMes = ano * 12 + (mes - 1);
      if (admMes === refMes) diaInicial = adm.getDate();
      else if (admMes > refMes) diaInicial = ultimoDia + 1;
    }

    const regsPorData = new Map<string, any>();
    for (const r of (regs ?? []) as any[]) regsPorData.set(r.data, r);

    const dias: any[] = [];
    let totalHoras = 0;
    let diasComPonto = 0;
    let diasJornadaPrevistos = 0;
    let faltas = 0;
    const detalhes: string[] = [];

    for (let d = diaInicial; d <= ultimoDia; d++) {
      const dt = new Date(ano, mes - 1, d);
      const dow = dt.getDay();
      const dataStr = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const r = regsPorData.get(dataStr);
      const horas = Number(r?.horas_trabalhadas || 0);
      const previstoHoje = dowsJornada.has(dow);
      if (previstoHoje) diasJornadaPrevistos++;
      if (horas > 0) { totalHoras += horas; diasComPonto++; }
      if (previstoHoje && !r) faltas++;
      dias.push({
        data: dataStr,
        dow,
        dow_label: DOW[dow],
        entrada: r?.entrada ? String(r.entrada).slice(0, 5) : null,
        saida: r?.saida ? String(r.saida).slice(0, 5) : null,
        horas,
        previsto: previstoHoje,
        status: r?.status ?? "",
        observacao: r?.observacao ?? null,
      });
      if (previstoHoje) {
        detalhes.push(
          `${String(d).padStart(2,"0")}/${String(mes).padStart(2,"0")} (${DOW[dow]}): ` +
          (r ? `${horas.toFixed(2)}h${r.entrada ? ` ${String(r.entrada).slice(0,5)}-${String(r.saida ?? "").slice(0,5)}`:""}` : "SEM REGISTRO"),
        );
      }
    }

    const horasPrevistas = diasJornadaPrevistos * horasDiarias;
    const saldo = +(totalHoras - horasPrevistas).toFixed(2);

    const stats = {
      membro: membro.nome,
      competencia: `${MESES[mes - 1]}/${ano}`,
      data_admissao: membro.data_admissao,
      jornada_dias: diasJornada,
      horas_diarias_previstas: horasDiarias,
      dias_jornada_previstos: diasJornadaPrevistos,
      dias_com_ponto: diasComPonto,
      faltas_em_dias_de_jornada: faltas,
      horas_trabalhadas_total: +totalHoras.toFixed(2),
      horas_complementares_total: +totalComplementares.toFixed(2),
      horas_consolidadas_total: +(totalHoras + totalComplementares).toFixed(2),
      horas_previstas_mes: horasPrevistas,
      saldo_horas: saldo,
      saldo_consolidado: +((totalHoras + totalComplementares) - horasPrevistas).toFixed(2),
    };

    const promptCustom = (prompt || "").toString().trim();
    const sys = `Você é uma assistente de RH do escritório. Gere um relatório de horas de estágio em markdown, claro e profissional, em português.

Estrutura sugerida:
- **Resumo executivo** (2-3 linhas)
- **Indicadores** (lista: ponto, complementares, total consolidado, previsto, saldo, faltas)
- **Análise** (assiduidade, pontualidade, padrões observados, contribuição das horas complementares)
- **Recomendações** (se aplicável)

Tom: direto, respeitoso, baseado nos dados. Não invente informações. Valores numéricos sempre com unidade (h). Máximo 500 palavras.`;

    const complementaresTxt = complementares.length
      ? complementares.map((h: any) => `- ${h.data}: ${h.descricao} (${Number(h.horas).toFixed(2)}h)`).join("\n")
      : "(nenhuma)";

    const userMsg =
      `Estatísticas calculadas:\n${JSON.stringify(stats, null, 2)}\n\n` +
      `Horas complementares lançadas:\n${complementaresTxt}\n\n` +
      `Detalhamento dos dias previstos de jornada:\n${detalhes.join("\n")}\n\n` +
      (promptCustom
        ? `Instruções específicas do gestor para este relatório:\n"""${promptCustom}"""\n\nGere o relatório seguindo essas instruções.`
        : `Gere o relatório padrão.`);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições da IA atingido. Tente novamente em alguns instantes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos na workspace." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      return new Response(JSON.stringify({ error: `IA ${aiResp.status}: ${t.slice(0, 200)}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const conteudo = (await aiResp.json())?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ stats, dias, analise: conteudo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
