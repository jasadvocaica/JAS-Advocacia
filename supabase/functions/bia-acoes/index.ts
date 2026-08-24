// Bia — Análise + sugestões de ações para publicações e itens da controladoria.
// Recebe { alvo: "publicacao" | "item_controladoria", id } e devolve JSON estruturado
// com classificação, urgência, ações sugeridas. O cliente aplica cada ação após confirmação.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const TIPOS_CONTROLADORIA = [
  "prazo_fatal",
  "prazo_processual",
  "audiencia",
  "reuniao",
  "diligencia",
  "tarefa",
] as const;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "sugerir_acoes",
    description:
      "Analisa a publicação/item e retorna classificação + ações sugeridas para o usuário aprovar.",
    parameters: {
      type: "object",
      properties: {
        classificacao: {
          type: "string",
          description:
            "Tipo da comunicação em uma palavra: intimacao, despacho, decisao, sentenca, audiencia, citacao, outro",
        },
        urgencia: { type: "string", enum: ["urgente", "alta", "media", "baixa"] },
        prazo_dias: {
          type: "number",
          description:
            "Quantos dias úteis há para cumprir. Use 0 se não houver prazo legal claro.",
        },
        resumo: {
          type: "string",
          description: "Resumo em 1-2 frases do que está sendo comunicado.",
        },
        proximos_passos: {
          type: "string",
          description: "O que precisa ser feito a seguir, em texto corrido (≤ 3 linhas).",
        },
        acoes_sugeridas: {
          type: "array",
          description: "Lista de ações concretas que o usuário pode aplicar com 1 clique.",
          items: {
            type: "object",
            properties: {
              tipo: {
                type: "string",
                enum: [
                  "criar_item_controladoria",
                  "marcar_publicacao_vista",
                  "arquivar_publicacao",
                  "vincular_processo",
                ],
                description: "Ação a executar.",
              },
              label: { type: "string", description: "Texto curto do botão." },
              payload: {
                type: "object",
                description:
                  "Dados para a ação. Para criar_item_controladoria: { tipo (um de prazo_fatal|prazo_processual|audiencia|reuniao|diligencia|tarefa), titulo, descricao, prioridade (urgente|alta|media|baixa), data_vencimento_iso }.",
                properties: {
                  tipo: { type: "string" },
                  titulo: { type: "string" },
                  descricao: { type: "string" },
                  prioridade: { type: "string" },
                  data_vencimento_iso: { type: "string" },
                },
              },
            },
            required: ["tipo", "label"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "classificacao",
        "urgencia",
        "prazo_dias",
        "resumo",
        "proximos_passos",
        "acoes_sugeridas",
      ],
      additionalProperties: false,
    },
  },
} as const;

function diaUtilFuturo(dias: number): string {
  const d = new Date();
  let restante = Math.max(0, Math.floor(dias));
  while (restante > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) restante--;
  }
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

async function carregarAlvo(
  admin: ReturnType<typeof createClient>,
  alvo: string,
  id: string,
) {
  if (alvo === "publicacao") {
    const { data: pub } = await admin
      .from("pje_publicacoes")
      .select(
        "id, numero_processo, sigla_tribunal, nome_orgao, tipo_comunicacao, texto_publicacao, data_disponibilizacao, data_publicacao, status_leitura, processo_id, item_controladoria_id, destinatarios",
      )
      .eq("id", id)
      .maybeSingle();
    if (!pub) return null;

    let processo: any = null;
    if ((pub as any).processo_id) {
      const { data } = await admin
        .from("processos")
        .select("id, numero_cnj, area_direito, status, cliente_id, responsavel_id")
        .eq("id", (pub as any).processo_id)
        .maybeSingle();
      processo = data;
    } else if ((pub as any).numero_processo) {
      const limpo = String((pub as any).numero_processo).replace(/\D/g, "");
      const { data } = await admin
        .from("processos")
        .select("id, numero_cnj, area_direito, status, cliente_id, responsavel_id")
        .eq("numero_cnj", (pub as any).numero_processo)
        .maybeSingle();
      processo = data ??
        (limpo
          ? (
              await admin
                .from("processos")
                .select("id, numero_cnj, cliente_id, responsavel_id")
                .ilike("numero_cnj", `%${limpo.slice(-7)}%`)
                .limit(1)
                .maybeSingle()
            ).data
          : null);
    }

    return { tipo: "publicacao", publicacao: pub, processo };
  }

  if (alvo === "item_controladoria") {
    const { data: item } = await admin
      .from("controladoria_itens")
      .select(
        "id, tipo, titulo, descricao, status, prioridade, data_vencimento, data_intimacao, processo_id, cliente_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (!item) return null;
    let processo: any = null;
    if ((item as any).processo_id) {
      const { data } = await admin
        .from("processos")
        .select("id, numero_cnj, area_direito, status")
        .eq("id", (item as any).processo_id)
        .maybeSingle();
      processo = data;
    }
    return { tipo: "item_controladoria", item, processo };
  }

  return null;
}

function montarPrompt(ctx: any, prefs: any): string {
  const hoje = new Date().toLocaleDateString("pt-BR");
  const blocoPrefs = prefs
    ? `
PREFERÊNCIAS DO USUÁRIO (sempre respeite):
- Nível de autonomia: ${prefs.nivel_autonomia}
- Estilo de recomendação: ${prefs.estilo}
- Tom: ${prefs.tom}
- Prioridade padrão: ${prefs.prioridade_padrao ?? "automática"}
- Prazo padrão (dias úteis): ${prefs.prazo_padrao_dias ?? "automático"}
- Instruções extras: ${prefs.instrucoes_extras ?? "(nenhuma)"}
`
    : "";

  return `Você é a "Bia", assistente jurídica do escritório. Hoje é ${hoje}.
Analise o item abaixo e devolva sugestões CONCRETAS e SEGURAS para o advogado aprovar.

REGRAS:
- Nunca invente dados. Use só o que está no contexto.
- Para PUBLICAÇÃO: identifique se é intimação/despacho/decisão e o PRAZO LEGAL típico.
  Exemplos: contestação=15 dias úteis, embargos de declaração=5 dias, recurso ordinário=8 dias, manifestar sobre laudo=15 dias.
  Se não houver prazo claro, use prazo_dias=0 e ainda assim crie um item de "diligencia" para análise.
- Sempre sugira AO MENOS 1 ação. Para publicação não-arquivada, sugira "criar_item_controladoria" + "marcar_publicacao_vista".
- Os tipos válidos para criar_item_controladoria são: ${TIPOS_CONTROLADORIA.join(", ")}.
- Use prioridade=urgente quando prazo_dias <= 3, alta quando <= 7, media até 15, baixa acima.
- Título do item deve começar com a classificação (ex.: "Despacho - manifestar sobre cálculo").
${blocoPrefs}
CONTEXTO:
${JSON.stringify(ctx, null, 2)}

Chame a função sugerir_acoes com a análise.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: ud, error: uerr } = await userClient.auth.getUser();
    if (uerr || !ud?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const alvo = String(body?.alvo ?? "");
    const id = String(body?.id ?? "");
    if (!alvo || !id) {
      return new Response(JSON.stringify({ error: "alvo e id obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = await carregarAlvo(admin, alvo, id);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "Item não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Carregar preferências da Bia (específica do tipo, fallback geral)
    const tipoPref =
      alvo === "publicacao"
        ? "publicacao"
        : alvo === "item_controladoria"
          ? "item_controladoria"
          : "geral";
    const { data: prefRows } = await admin
      .from("bia_preferencias")
      .select("*")
      .eq("user_id", ud.user.id)
      .in("tipo_item", [tipoPref, "geral"]);
    const prefs =
      (prefRows ?? []).find((r: any) => r.tipo_item === tipoPref) ??
      (prefRows ?? []).find((r: any) => r.tipo_item === "geral") ??
      null;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: montarPrompt(ctx, prefs) }],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "sugerir_acoes" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("[bia-acoes] AI error", aiResp.status, t);
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const msg =
        aiResp.status === 429
          ? "Limite de requisições excedido."
          : aiResp.status === 402
            ? "Créditos da IA esgotados."
            : "Falha ao analisar com IA.";
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Sem retorno estruturado da IA" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sugestoes = JSON.parse(call.function.arguments);

    // Pós-processamento: garante data_vencimento_iso para acoes de criar_item
    const prazoOverride = prefs?.prazo_padrao_dias ?? null;
    const prioridadeOverride = prefs?.prioridade_padrao ?? null;
    const acoes = (sugestoes.acoes_sugeridas ?? []).map((a: any) => {
      if (a.tipo === "criar_item_controladoria") {
        const p = a.payload ?? {};
        const dias =
          prazoOverride !== null && prazoOverride !== undefined
            ? prazoOverride
            : Math.max(1, sugestoes.prazo_dias ?? 1);
        if (!p.data_vencimento_iso || prazoOverride !== null) {
          p.data_vencimento_iso = diaUtilFuturo(dias);
        }
        if (!TIPOS_CONTROLADORIA.includes(p.tipo)) p.tipo = "diligencia";
        if (prioridadeOverride) {
          p.prioridade = prioridadeOverride;
        } else if (!["urgente", "alta", "media", "baixa"].includes(p.prioridade)) {
          p.prioridade = sugestoes.urgencia ?? "media";
        }
        a.payload = p;
      }
      return a;
    });

    return new Response(
      JSON.stringify({
        ...sugestoes,
        acoes_sugeridas: acoes,
        preferencias: prefs
          ? {
              nivel_autonomia: prefs.nivel_autonomia,
              estilo: prefs.estilo,
              tom: prefs.tom,
            }
          : null,
        contexto: {
          processo_id: (ctx as any).processo?.id ?? null,
          processo_cnj: (ctx as any).processo?.numero_cnj ?? null,
          cliente_id:
            (ctx as any).processo?.cliente_id ?? (ctx as any).item?.cliente_id ?? null,
          responsavel_sugerido_id: (ctx as any).processo?.responsavel_id ?? null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[bia-acoes] erro:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
