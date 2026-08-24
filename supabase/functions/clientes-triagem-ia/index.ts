// Edge function: triagem inicial de clientes via Lovable AI Gateway
// Recebe a descrição livre do caso e devolve área do direito, tipo de ação,
// documentos necessários e observações estratégicas.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  descricao?: string;
  contexto?: {
    nome?: string;
    profissao?: string;
    idade?: number | null;
  };
}

const SYSTEM_PROMPT = `Você é um(a) advogado(a) brasileiro(a) sênior fazendo triagem inicial de um novo caso.
A pessoa atendente descreveu o caso do cliente em linguagem comum.

Seu trabalho:
1. Identificar a ÁREA DO DIREITO predominante (ex.: Previdenciário, Trabalhista, Cível, Família, Consumidor, Tributário, Penal, Empresarial, Administrativo, Imobiliário, etc.).
2. Sugerir o TIPO DE AÇÃO ou procedimento mais provável (ex.: "Aposentadoria por Invalidez", "Reclamatória Trabalhista — verbas rescisórias", "Ação revisional de contrato", "Divórcio consensual", "Notificação extrajudicial").
3. Listar os DOCUMENTOS NECESSÁRIOS para iniciar o caso (objetivos, em itens curtos).
4. Apontar pontos de atenção, prazos prescricionais ou riscos relevantes em "observações".
5. Estimar a URGÊNCIA: "baixa", "media" ou "alta".

Regras:
- Use SEMPRE a função "registrar_triagem".
- Seja objetivo(a) e use português do Brasil.
- Se a descrição for vaga demais, ainda assim faça a melhor inferência possível e marque isso em "observacoes".`;

const TOOL = {
  type: "function",
  function: {
    name: "registrar_triagem",
    description: "Registra a triagem inicial estruturada do caso jurídico.",
    parameters: {
      type: "object",
      properties: {
        area_direito: {
          type: "string",
          description: "Área do direito predominante.",
        },
        tipo_acao: {
          type: "string",
          description: "Tipo de ação / procedimento sugerido.",
        },
        documentos_necessarios: {
          type: "array",
          items: { type: "string" },
          description: "Lista objetiva de documentos necessários.",
        },
        observacoes: {
          type: "string",
          description: "Pontos de atenção, prazos, riscos.",
        },
        urgencia: {
          type: "string",
          enum: ["baixa", "media", "alta"],
        },
      },
      required: [
        "area_direito",
        "tipo_acao",
        "documentos_necessarios",
        "observacoes",
        "urgencia",
      ],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    const descricao = (body.descricao ?? "").trim();
    if (descricao.length < 10) {
      return new Response(
        JSON.stringify({ error: "Descreva o caso com pelo menos 10 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (descricao.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Descrição muito longa (máx. 5000 caracteres)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ctx = body.contexto ?? {};
    const ctxLinhas: string[] = [];
    if (ctx.nome) ctxLinhas.push(`Cliente: ${ctx.nome}`);
    if (ctx.profissao) ctxLinhas.push(`Profissão: ${ctx.profissao}`);
    if (ctx.idade != null) ctxLinhas.push(`Idade: ${ctx.idade} anos`);

    const userText = [
      ctxLinhas.length ? `Contexto:\n${ctxLinhas.join("\n")}` : null,
      `Descrição do caso (em linguagem comum):\n${descricao}`,
    ].filter(Boolean).join("\n\n");

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userText },
          ],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "registrar_triagem" } },
        }),
      },
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos da IA esgotados. Adicione saldo em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Falha na IA: " + errText.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    let parsed: any = {};
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Falha ao parsear arguments", e);
      }
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("clientes-triagem-ia error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
