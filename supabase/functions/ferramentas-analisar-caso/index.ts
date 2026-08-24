// Edge function: analisa documento jurídico (PDF, imagem ou texto livre) usando Lovable AI
// e devolve JSON estruturado com resumo, pontos favoráveis/desfavoráveis e estratégia.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é assistente jurídica especializada em direito previdenciário, família e consumidor, atuando no Brasil.
Sua tarefa é analisar documentos jurídicos (indeferimentos do INSS, sentenças, petições, processos administrativos, decisões) e devolver um diagnóstico estruturado em JSON.

Regras:
- Use linguagem clara e objetiva no resumo (sem juridiquês excessivo).
- Cite teses jurídicas reais (STF, STJ, súmulas). Se não houver, retorne array vazio.
- Indique urgência baseada em prazos legais identificáveis no documento.
- Se um campo não for identificável, deixe como string vazia ou array vazio. Nunca invente dados.`;

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
    const { texto_livre, storage_path, mime_type, arquivo_base64 } = body as {
      texto_livre?: string;
      storage_path?: string;
      mime_type?: string;
      arquivo_base64?: string;
    };

    if (!texto_livre && !storage_path && !arquivo_base64) {
      return new Response(
        JSON.stringify({ error: "Envie texto_livre, storage_path ou arquivo_base64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const messageContent: Array<Record<string, unknown>> = [];

    // Caminho 1: arquivo já vem em base64 (fallback quando storage upload falha)
    if (arquivo_base64) {
      const mt = mime_type || "application/pdf";
      const dataUrl = arquivo_base64.startsWith("data:")
        ? arquivo_base64
        : `data:${mt};base64,${arquivo_base64}`;
      messageContent.push({
        type: "image_url",
        image_url: { url: dataUrl },
      });
    } else if (storage_path) {
      // Caminho 2: baixa do storage
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: fileData, error: dlErr } = await admin.storage
        .from("ferramentas-analises")
        .download(storage_path);
      if (dlErr || !fileData) {
        return new Response(
          JSON.stringify({ error: `Não foi possível baixar arquivo: ${dlErr?.message ?? ""}` }),
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
      const mt = mime_type || "application/pdf";
      messageContent.push({
        type: "image_url",
        image_url: { url: `data:${mt};base64,${base64}` },
      });
    }

    if (texto_livre && texto_livre.trim().length > 0) {
      messageContent.push({ type: "text", text: texto_livre });
    }

    messageContent.push({
      type: "text",
      text: "Analise este documento jurídico e devolva o JSON estruturado conforme o schema do tool call.",
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
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: messageContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "salvar_analise_caso",
              description: "Devolve a análise estruturada do documento jurídico.",
              parameters: {
                type: "object",
                properties: {
                  tipo_documento: {
                    type: "string",
                    enum: [
                      "indeferimento_inss",
                      "carta_concessao",
                      "sentenca",
                      "peticao",
                      "processo_administrativo",
                      "documento_judicial",
                      "outro",
                    ],
                  },
                  area_direito: { type: "string" },
                  dados_identificacao: {
                    type: "object",
                    properties: {
                      nome_segurado: { type: "string" },
                      cpf: { type: "string" },
                      nb: { type: "string" },
                      der: { type: "string" },
                      dib: { type: "string" },
                      dcb: { type: "string" },
                      cid: { type: "string" },
                      tipo_beneficio: { type: "string" },
                    },
                  },
                  resumo_fatos: { type: "string" },
                  motivo_negativa_decisao: { type: "string" },
                  pontos_favoraveis: { type: "array", items: { type: "string" } },
                  pontos_desfavoraveis: { type: "array", items: { type: "string" } },
                  teses_juridicas_aplicaveis: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        tese: { type: "string" },
                        descricao: { type: "string" },
                        aplicavel: { type: "boolean" },
                        motivo: { type: "string" },
                      },
                      required: ["tese", "descricao"],
                    },
                  },
                  estrategia_sugerida: { type: "string" },
                  urgencia: { type: "string", enum: ["alta", "media", "baixa"] },
                  prazo_atencao: { type: "string" },
                  observacoes_adicionais: { type: "string" },
                },
                required: ["tipo_documento", "resumo_fatos", "urgencia"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "salvar_analise_caso" } },
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

    return new Response(JSON.stringify({ dados_extraidos: dados }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ferramentas-analisar-caso error:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return new Response(
      JSON.stringify({ error: isTimeout ? "A IA demorou demais. Tente um documento menor." : msg }),
      {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
