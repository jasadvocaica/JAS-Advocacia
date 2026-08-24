// Edge function: extrai dados de uma solicitação de notificação extrajudicial
// usando o Lovable AI Gateway (Gemini) com tool-calling para JSON estruturado.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  prompt?: string;
  fileData?: string; // base64 puro (sem prefixo data:)
  fileMimeType?: string;
  modelosConfig?: string; // texto consolidado dos modelos do escritório
}

const SYSTEM_PROMPT = `Você é um assistente jurídico especializado em cobranças extrajudiciais do escritório JAS Advocacia.
A advogada responsável é: Juliana Araújo da Silva — OAB/MT 34.182.
Escritório: Rua São Cristóvão, 315, Poncho Verde II, Primavera do Leste/MT.
Contatos: (66) 99262-4753 | advocaciajulianaaraujo@gmail.com

Seu objetivo é extrair dados de uma solicitação de notificação extrajudicial e devolvê-los de forma estruturada.
Regras:
- Use SEMPRE a função "extrair_notificacao".
- Para datas use formato DD/MM/AAAA.
- Valores são números (sem R$, sem pontos de milhar; use ponto como separador decimal).
- Se uma informação não for fornecida, devolva string vazia ou array vazio.
- O campo "texto_notificacao" deve conter o texto formal e completo da notificação jurídica (sem tabela, sem dados bancários, sem aviso final — esses são gerados automaticamente pelo PDF).`;

const TOOL = {
  type: "function",
  function: {
    name: "extrair_notificacao",
    description: "Extrai dados estruturados de uma notificação extrajudicial.",
    parameters: {
      type: "object",
      properties: {
        notificante_nome: { type: "string" },
        notificante_cnpj: { type: "string" },
        notificante_endereco: { type: "string" },
        notificado_nome: { type: "string" },
        notificado_cpf: { type: "string" },
        notificado_rg: { type: "string" },
        notificado_endereco: { type: "string" },
        referencia: { type: "string" },
        descricao_fato: { type: "string" },
        texto_notificacao: { type: "string" },
        parcelas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              descricao: { type: "string" },
              vencimento: { type: "string" },
              valorOriginal: { type: "number" },
            },
            required: ["descricao", "vencimento", "valorOriginal"],
            additionalProperties: false,
          },
        },
        banco_nome: { type: "string" },
        banco_codigo: { type: "string" },
        banco_agencia: { type: "string" },
        banco_conta: { type: "string" },
        banco_favorecido: { type: "string" },
        banco_pix: { type: "string" },
      },
      required: [
        "notificante_nome",
        "notificado_nome",
        "referencia",
        "texto_notificacao",
        "parcelas",
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
    // Auth: garante que só usuários autenticados chamem (verify_jwt = false por padrão)
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
    const { prompt, fileData, fileMimeType, modelosConfig } = body;

    if (!prompt && !fileData) {
      return new Response(
        JSON.stringify({ error: "Informe um prompt ou anexe um arquivo." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Monta conteúdo multimodal
    const userContent: any[] = [];
    let userText = prompt?.trim() || "Extraia os dados do documento anexo.";
    if (modelosConfig && modelosConfig.trim().length > 0) {
      userText +=
        `\n\nModelos de notificação do escritório (use como referência de estilo e estrutura):\n--- MODELOS ---\n${modelosConfig}\n----------------\nAdapte a narrativa e o estilo dos modelos ao caso atual.`;
    }
    userContent.push({ type: "text", text: userText });

    if (fileData && fileMimeType?.startsWith("image/")) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${fileMimeType};base64,${fileData}` },
      });
    } else if (fileData && fileMimeType === "application/pdf") {
      // Gemini via gateway aceita PDF como image_url base64
      userContent.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${fileData}` },
      });
    }

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "extrair_notificacao" } },
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
    } else if (aiJson.choices?.[0]?.message?.content) {
      // Fallback: tenta extrair JSON do texto
      const txt = (aiJson.choices[0].message.content as string)
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      try {
        parsed = JSON.parse(txt);
      } catch {
        parsed = {};
      }
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notificacao-extrair error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
