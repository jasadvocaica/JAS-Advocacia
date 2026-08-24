// Gera checklist inteligente de diligências para um processo usando Lovable AI.
// Body: { processo_id: string, instrucoes_extra?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "montar_checklist",
    description:
      "Monta uma lista priorizada de diligências/pendências para o advogado executar neste processo.",
    parameters: {
      type: "object",
      properties: {
        diagnostico: {
          type: "string",
          description: "Resumo objetivo (≤3 linhas) da fase atual do processo e do que está pendente.",
        },
        itens: {
          type: "array",
          minItems: 3,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Ação curta no infinitivo. Ex: 'Protocolar contestação'." },
              descricao: { type: "string", description: "Como executar a diligência (1-3 frases)." },
              categoria: {
                type: "string",
                enum: ["diligencia", "documento", "peticao", "prazo", "audiencia", "contato", "administrativo", "outro"],
              },
              prazo_dias: { type: "number", description: "Dias úteis para concluir. 0 se não houver prazo claro." },
              prioridade: { type: "string", enum: ["urgente", "alta", "media", "baixa"] },
              base_legal: { type: "string", description: "Artigo/lei quando aplicável. Vazio se não houver." },
            },
            required: ["titulo", "descricao", "categoria", "prazo_dias", "prioridade"],
            additionalProperties: false,
          },
        },
      },
      required: ["diagnostico", "itens"],
      additionalProperties: false,
    },
  },
};

function addBusinessDays(base: Date, days: number): Date {
  const d = new Date(base);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { processo_id, instrucoes_extra } = await req.json();
    if (!processo_id) {
      return new Response(JSON.stringify({ error: "processo_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id ?? null;

    // Coleta contexto
    const { data: proc, error: procErr } = await admin
      .from("processos")
      .select("id, numero_cnj, tipo, area_direito, tipo_acao, status, fase_atual, fase_administrativa, valor_causa, data_distribuicao, data_der, dib, vara, observacoes, cliente_id, clientes(nome, tipo_pessoa)")
      .eq("id", processo_id)
      .maybeSingle();

    if (procErr || !proc) {
      return new Response(JSON.stringify({ error: "Processo não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: andamentos } = await admin
      .from("andamentos")
      .select("data, descricao, tipo")
      .eq("processo_id", processo_id)
      .order("data", { ascending: false })
      .limit(20);

    const { data: itensCtrl } = await admin
      .from("controladoria_itens")
      .select("titulo, tipo, status, data_vencimento")
      .eq("processo_id", processo_id)
      .neq("status", "concluido")
      .limit(20);

    const cliente = (proc as any).clientes;

    const contexto = {
      processo: {
        numero_cnj: proc.numero_cnj,
        tipo: proc.tipo,
        area: proc.area_direito,
        tipo_acao: proc.tipo_acao,
        status: proc.status,
        fase: proc.fase_atual ?? proc.fase_administrativa,
        valor_causa: proc.valor_causa,
        distribuicao: proc.data_distribuicao,
        der: proc.data_der,
        dib: proc.dib,
        vara: proc.vara,
        observacoes: proc.observacoes,
      },
      cliente: cliente ? { nome: cliente.nome, tipo: cliente.tipo_pessoa } : null,
      andamentos_recentes: (andamentos ?? []).map((a) => ({
        data: a.data,
        tipo: a.tipo,
        descricao: (a.descricao ?? "").slice(0, 400),
      })),
      pendencias_existentes: itensCtrl ?? [],
    };

    const systemPrompt = `Você é Bia, advogada sênior brasileira especialista em controladoria jurídica.
Sua missão é montar um checklist EXECUTÁVEL de diligências para o advogado adiantar este processo.
Regras:
- Olhe a fase atual, andamentos recentes e pendências já abertas — NÃO duplique o que já existe em pendencias_existentes.
- Foque em ações concretas (peticionar, juntar documento, intimar parte, ligar para cliente, agendar perícia, etc).
- Se for processo previdenciário/INSS, considere CNIS, perícia médica, recurso administrativo, judicialização, exigência.
- Sempre explique brevemente COMO executar.
- Prazos em dias úteis, conservadores.
- Priorize: urgente (perde direito em <7d), alta (<15d), media (<30d), baixa (rotina).
${instrucoes_extra ? `\nInstruções extras do usuário: ${instrucoes_extra}` : ""}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Contexto do processo:\n```json\n" + JSON.stringify(contexto, null, 2) + "\n```\n\nMonte o checklist." },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "montar_checklist" } },
      }),
    });

    if (!aiResp.ok) {
      const status = aiResp.status;
      const txt = await aiResp.text();
      console.error("AI error", status, txt);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições da IA. Tente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione em Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Falha na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "IA não retornou checklist" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(toolCall.function.arguments);
    const itens = (parsed.itens ?? []) as Array<any>;

    // Insere itens
    const hoje = new Date();
    const { data: existentes } = await admin
      .from("checklist_diligencias")
      .select("id")
      .eq("processo_id", processo_id);
    const baseOrdem = (existentes?.length ?? 0);

    const rows = itens.map((it, i) => ({
      processo_id,
      ordem: baseOrdem + i,
      titulo: String(it.titulo).slice(0, 240),
      descricao: it.descricao ?? null,
      categoria: it.categoria ?? "diligencia",
      prazo_dias: it.prazo_dias ?? null,
      prazo_tipo: "dias_uteis",
      data_sugerida: it.prazo_dias && it.prazo_dias > 0
        ? addBusinessDays(hoje, it.prazo_dias).toISOString().slice(0, 10)
        : null,
      base_legal: it.base_legal || null,
      prioridade: it.prioridade ?? "media",
      status: "pendente",
      origem: "ia",
      criado_por: userId,
    }));

    const { data: inseridos, error: insErr } = await admin
      .from("checklist_diligencias")
      .insert(rows)
      .select();

    if (insErr) {
      console.error("insert err", insErr);
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, diagnostico: parsed.diagnostico, itens: inseridos }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
