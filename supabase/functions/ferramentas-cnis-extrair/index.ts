// Edge function: extrai vínculos previdenciários de um CNIS (PDF) com Lovable AI.
// Usuário revisa o resultado antes de calcular.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é especialista em previdência social do Brasil. Sua tarefa é extrair com precisão os vínculos previdenciários listados em um extrato CNIS (Cadastro Nacional de Informações Sociais).

Regras:
- Categorias permitidas: empregado (CLT), domestico, ci (contribuinte individual), mei, especial (segurado especial), facultativo.
- Identifique categoria pelo código indicado no CNIS (01/02/03 = empregado, 04 = doméstico, 05 = CI, 13 = MEI, 06 = especial, 07 = facultativo) ou pelo texto descritivo.
- Datas no formato YYYY-MM-DD.
- Se o vínculo ainda está ativo (sem data de fim), use null em data_fim.
- Não invente. Campos não identificáveis ficam como string vazia, null ou array vazio.
- Ordene vínculos por data_inicio crescente.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { texto_livre, storage_path } = body as {
      texto_livre?: string;
      storage_path?: string;
    };

    if (!texto_livre && !storage_path) {
      return new Response(JSON.stringify({ error: "Envie texto_livre ou storage_path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messageContent: Array<Record<string, unknown>> = [];

    if (storage_path) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: fileData, error: dlErr } = await admin.storage
        .from("ferramentas-cnis")
        .download(storage_path);
      if (dlErr || !fileData) {
        return new Response(
          JSON.stringify({ error: `Não foi possível baixar PDF: ${dlErr?.message ?? ""}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const buf = new Uint8Array(await fileData.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode(...buf.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      messageContent.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${base64}` },
      });
    }

    if (texto_livre && texto_livre.trim().length > 0) {
      messageContent.push({ type: "text", text: texto_livre });
    }

    messageContent.push({
      type: "text",
      text: "Extraia todos os vínculos previdenciários e devolva no schema do tool call.",
    });

    const aiCtrl = new AbortController();
    const aiTimeout = setTimeout(() => aiCtrl.abort(), 120_000);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: aiCtrl.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: messageContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "salvar_vinculos_cnis",
              description: "Devolve os dados do segurado e a lista de vínculos extraídos.",
              parameters: {
                type: "object",
                properties: {
                  segurado: {
                    type: "object",
                    properties: {
                      nome: { type: "string" },
                      cpf: { type: "string" },
                      nit_pis: { type: "string" },
                      data_nascimento: { type: "string" },
                    },
                  },
                  vinculos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        empresa: { type: "string" },
                        cnpj: { type: ["string", "null"] },
                        categoria: {
                          type: "string",
                          enum: ["empregado", "domestico", "ci", "mei", "especial", "facultativo"],
                        },
                        data_inicio: { type: "string" },
                        data_fim: { type: ["string", "null"] },
                        salario_medio: { type: ["number", "null"] },
                      },
                      required: ["empresa", "categoria", "data_inicio"],
                    },
                  },
                },
                required: ["vinculos"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "salvar_vinculos_cnis" } },
      }),
    }).finally(() => clearTimeout(aiTimeout));

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos do Lovable AI esgotados. Adicione créditos em Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
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

    const dados = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(dados), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ferramentas-cnis-extrair error:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return new Response(
      JSON.stringify({ error: isTimeout ? "A IA demorou demais. Tente um PDF menor." : msg }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
