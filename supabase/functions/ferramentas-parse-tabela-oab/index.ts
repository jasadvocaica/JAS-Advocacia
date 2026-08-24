// Recebe um path de PDF no bucket 'ferramentas-tabelas' e retorna o JSON
// estruturado com categorias e itens da Tabela de Honorários da OAB,
// usando Lovable AI (Gemini multimodal) para extração.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair tabelas de honorários advocatícios de PDFs oficiais das seccionais da OAB.

Sua tarefa é analisar o PDF e devolver uma estrutura JSON com as categorias e itens da tabela.

Regras:
- Identifique categorias (ex: "Causas Previdenciárias", "Direito de Família", "Consultoria").
- Para cada item, extraia: descricao, tipo, valor_min, valor_max, percentual_min, percentual_max, base_calculo, unidade e observacao.
- Tipos válidos: "fixo" (valor mínimo/máximo em reais), "percentual" (% sobre uma base), "percentual_ou_fixo" (o que for maior).
- base_calculo: "valor_causa", "valor_da_indenizacao", "valor_dos_bens", "valor_do_contrato", "valor_cobrado", "valor_do_reajuste", "proveito_economico" ou null.
- Use null para campos que não se aplicam ao item.
- Valores monetários em number (ex: 2400, não "R$ 2.400,00").
- Percentuais em number sem o símbolo % (ex: 10.5).
- Não invente itens. Se a tabela mencionar apenas valor mínimo, deixe valor_max null.
- Mantenha a ordem original das categorias e itens do PDF.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Autenticação: precisa ser usuário gestor
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isGestor } = await admin.rpc("is_gestor", { _user_id: userData.user.id });
    if (!isGestor) {
      return new Response(JSON.stringify({ error: "Apenas gestor pode executar parsing" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { storage_path } = body as { storage_path?: string };
    if (!storage_path || typeof storage_path !== "string") {
      return new Response(JSON.stringify({ error: "storage_path obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Baixar o PDF do storage e converter para base64
    const { data: fileData, error: dlErr } = await admin
      .storage
      .from("ferramentas-tabelas")
      .download(storage_path);

    if (dlErr || !fileData) {
      return new Response(JSON.stringify({ error: `Não foi possível baixar PDF: ${dlErr?.message ?? "desconhecido"}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = new Uint8Array(await fileData.arrayBuffer());
    // Converter para base64 em chunks (PDFs podem ser grandes)
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const dataUrl = `data:application/pdf;base64,${base64}`;

    // Chamar Lovable AI (Gemini suporta input PDF nativo via image_url)
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia a tabela de honorários deste PDF." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "salvar_tabela_oab",
              description: "Devolve a estrutura completa da tabela de honorários extraída do PDF.",
              parameters: {
                type: "object",
                properties: {
                  categorias: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        categoria: { type: "string" },
                        itens: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              descricao: { type: "string" },
                              tipo: { type: "string", enum: ["fixo", "percentual", "percentual_ou_fixo"] },
                              valor_min: { type: ["number", "null"] },
                              valor_max: { type: ["number", "null"] },
                              percentual_min: { type: ["number", "null"] },
                              percentual_max: { type: ["number", "null"] },
                              base_calculo: { type: ["string", "null"] },
                              unidade: { type: ["string", "null"] },
                              observacao: { type: ["string", "null"] },
                            },
                            required: ["descricao", "tipo"],
                          },
                        },
                      },
                      required: ["categoria", "itens"],
                    },
                  },
                },
                required: ["categorias"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "salvar_tabela_oab" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos do Lovable AI esgotados. Adicione créditos em Settings > Workspace > Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: `IA falhou: ${aiResp.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "IA não retornou estrutura esperada" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const args = JSON.parse(toolCall.function.arguments);
    const categorias = args.categorias ?? [];

    return new Response(JSON.stringify({ tabela_json: categorias }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("parse-tabela-oab error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
