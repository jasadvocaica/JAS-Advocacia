// Edge function: dje-analisar
// Recebe { analise_id } — busca a análise no banco, lê o PDF do storage (se houver)
// ou usa o texto_bruto, manda para o Lovable AI Gateway com tool-calling para extrair
// publicações estruturadas, e grava os itens em dje_itens_extraidos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const MODELO_PADRAO = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `Você é um assistente jurídico especializado em ler publicações do Diário da Justiça Eletrônico (DJE) brasileiro, decisões, sentenças, despachos e intimações.

Seu trabalho é IDENTIFICAR cada publicação/ato individual no texto enviado e EXTRAIR de forma estruturada:

- numero_processo: número CNJ no formato NNNNNNN-DD.AAAA.J.TR.OOOO se encontrado (mantenha como aparece no texto, sem normalizar)
- tribunal: sigla ou nome do tribunal (TJSP, TJRJ, TRF3, STJ, etc.)
- orgao_julgador: vara, câmara ou juízo responsável
- tipo_ato: classifique em uma destas categorias: "intimacao", "decisao_interlocutoria", "sentenca", "despacho", "acordao", "edital", "citacao", "audiencia_designada", "outro"
- intimados: array com objetos { nome, oab?, polo? } das pessoas/advogados intimados
- partes: array com objetos { nome, polo: "ativo"|"passivo"|"outro" } quando identificáveis
- advogados: array com objetos { nome, oab? } dos advogados mencionados
- data_publicacao: data da publicação no formato YYYY-MM-DD se identificável
- prazo_dias: número inteiro de dias do prazo aplicável (ex.: 15 para apelação, 5 para embargos de declaração, 15 para contestação). Se for prazo "em dobro" ou diferenciado, calcule o valor final em dias úteis.
- prazo_tipo: "dias_uteis" ou "dias_corridos" (regra geral CPC = dias_uteis)
- prazo_base_legal: artigo/dispositivo legal que fundamenta o prazo (ex.: "art. 1.003 CPC")
- resumo_simples: resumo em português claro (1-3 frases) explicando o que aconteceu e o que precisa ser feito, em linguagem que um cliente leigo entenderia
- trecho_original: trecho literal mais relevante do texto original (até 800 caracteres)
- confianca: número de 0.00 a 1.00 indicando o quanto você está confiante na extração

Regras importantes:
- Se o texto contém VÁRIAS publicações distintas (ex.: caderno DJE inteiro), retorne UMA entrada por publicação.
- Se o texto contém UMA única publicação/decisão, retorne apenas 1 entrada.
- Use null para campos que você não conseguir identificar com segurança. Não invente.
- Para prazos: aplique conhecimento jurídico padrão brasileiro (CPC, CLT, Lei dos Juizados, etc.).
- Datas devem ser sempre YYYY-MM-DD.`;

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "registrar_publicacoes",
    description: "Registra publicações jurídicas extraídas do texto",
    parameters: {
      type: "object",
      properties: {
        publicacoes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              numero_processo: { type: ["string", "null"] },
              tribunal: { type: ["string", "null"] },
              orgao_julgador: { type: ["string", "null"] },
              tipo_ato: {
                type: ["string", "null"],
                enum: [
                  "intimacao",
                  "decisao_interlocutoria",
                  "sentenca",
                  "despacho",
                  "acordao",
                  "edital",
                  "citacao",
                  "audiencia_designada",
                  "outro",
                  null,
                ],
              },
              intimados: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    oab: { type: ["string", "null"] },
                    polo: { type: ["string", "null"] },
                  },
                  required: ["nome"],
                  additionalProperties: false,
                },
              },
              partes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    polo: {
                      type: ["string", "null"],
                      enum: ["ativo", "passivo", "outro", null],
                    },
                  },
                  required: ["nome"],
                  additionalProperties: false,
                },
              },
              advogados: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    oab: { type: ["string", "null"] },
                  },
                  required: ["nome"],
                  additionalProperties: false,
                },
              },
              data_publicacao: { type: ["string", "null"] },
              prazo_dias: { type: ["integer", "null"] },
              prazo_tipo: {
                type: ["string", "null"],
                enum: ["dias_uteis", "dias_corridos", null],
              },
              prazo_base_legal: { type: ["string", "null"] },
              resumo_simples: { type: ["string", "null"] },
              trecho_original: { type: ["string", "null"] },
              confianca: { type: ["number", "null"] },
            },
            required: [
              "intimados",
              "partes",
              "advogados",
              "resumo_simples",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["publicacoes"],
      additionalProperties: false,
    },
  },
};

function normalizarCNJ(numero: string | null): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length === 20) return digitos;
  return null;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido" }, 405);
  }

  // Validar JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Não autenticado" }, 401);
  }

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Token inválido" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: { analise_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "JSON inválido" }, 400);
  }

  const analiseId = body.analise_id;
  if (!analiseId || typeof analiseId !== "string") {
    return jsonResponse({ error: "analise_id obrigatório" }, 400);
  }

  // Buscar análise
  const { data: analise, error: analiseErr } = await supabase
    .from("dje_analises")
    .select("*")
    .eq("id", analiseId)
    .maybeSingle();

  if (analiseErr || !analise) {
    return jsonResponse({ error: "Análise não encontrada" }, 404);
  }

  // Verificar permissão: dono ou gestor
  if (analise.criado_por !== user.id) {
    const { data: ehGestor } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "gestor",
    });
    if (!ehGestor) {
      return jsonResponse({ error: "Sem permissão" }, 403);
    }
  }

  // Marcar como processando
  await supabase
    .from("dje_analises")
    .update({ status: "processando", erro: null, modelo_ia: MODELO_PADRAO })
    .eq("id", analiseId);

  try {
    // Montar payload para o Gateway
    const userContent: Array<Record<string, unknown>> = [];

    if (analise.texto_bruto && analise.texto_bruto.trim().length > 0) {
      userContent.push({
        type: "text",
        text:
          `Texto enviado para análise (origem: ${analise.origem}):\n\n${analise.texto_bruto}`,
      });
    } else if (analise.arquivo_path) {
      // Baixar PDF do storage e extrair texto com unpdf (compatível com Deno)
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from("dje-uploads")
        .download(analise.arquivo_path);

      if (downloadErr || !fileData) {
        throw new Error(
          `Falha ao baixar arquivo do storage: ${downloadErr?.message ?? "desconhecido"}`,
        );
      }

      const buffer = await fileData.arrayBuffer();
      if (buffer.byteLength > 20 * 1024 * 1024) {
        throw new Error(
          `PDF muito grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Limite: 20 MB.`,
        );
      }

      let textoPdf = "";
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const { text } = await extractText(pdf, { mergePages: true });
        textoPdf = (Array.isArray(text) ? text.join("\n") : text) ?? "";
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        throw new Error(`Falha ao extrair texto do PDF: ${m}`);
      }

      textoPdf = textoPdf.trim();
      if (textoPdf.length < 20) {
        throw new Error(
          "Não foi possível extrair texto do PDF (pode ser um PDF escaneado/imagem). Cole o texto manualmente para análise.",
        );
      }

      // Limitar para caber no contexto do modelo
      const TRECHO_MAX = 60000;
      if (textoPdf.length > TRECHO_MAX) textoPdf = textoPdf.slice(0, TRECHO_MAX);

      userContent.push({
        type: "text",
        text:
          `Texto extraído do PDF (origem: ${analise.origem}, arquivo: ${analise.arquivo_nome ?? "documento.pdf"}):\n\n${textoPdf}`,
      });
    } else {
      throw new Error("Análise sem texto nem arquivo associado");
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
          model: MODELO_PADRAO,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          tools: [TOOL_SCHEMA],
          tool_choice: {
            type: "function",
            function: { name: "registrar_publicacoes" },
          },
        }),
      },
    );

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      if (aiResp.status === 429) {
        throw new Error("Limite de requisições da IA atingido. Tente novamente em alguns minutos.");
      }
      if (aiResp.status === 402) {
        throw new Error("Créditos da IA esgotados. Adicione créditos em Configurações > Workspace > Uso.");
      }
      throw new Error(`Erro do Gateway IA (${aiResp.status}): ${txt.slice(0, 300)}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("IA não retornou dados estruturados");
    }

    let parsed: { publicacoes?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("Resposta da IA não é JSON válido");
    }

    const publicacoes = parsed.publicacoes ?? [];
    if (!Array.isArray(publicacoes) || publicacoes.length === 0) {
      // Sem itens é OK — pode ser texto sem publicações reais
      await supabase
        .from("dje_analises")
        .update({ status: "concluido", total_itens: 0 })
        .eq("id", analiseId);
      return jsonResponse({ ok: true, total: 0 });
    }

    // Inserir itens
    const linhas = publicacoes.map((p, idx) => ({
      analise_id: analiseId,
      ordem: idx + 1,
      numero_processo: (p.numero_processo as string | null) ?? null,
      numero_processo_normalizado: normalizarCNJ(
        (p.numero_processo as string | null) ?? null,
      ),
      tribunal: (p.tribunal as string | null) ?? null,
      orgao_julgador: (p.orgao_julgador as string | null) ?? null,
      tipo_ato: (p.tipo_ato as string | null) ?? null,
      intimados: p.intimados ?? [],
      partes: p.partes ?? [],
      advogados: p.advogados ?? [],
      data_publicacao: (p.data_publicacao as string | null) ?? null,
      prazo_dias: (p.prazo_dias as number | null) ?? null,
      prazo_tipo: (p.prazo_tipo as string | null) ?? null,
      prazo_base_legal: (p.prazo_base_legal as string | null) ?? null,
      resumo_simples: (p.resumo_simples as string | null) ?? null,
      trecho_original: (p.trecho_original as string | null) ?? null,
      confianca: (p.confianca as number | null) ?? null,
    }));

    const { error: insertErr } = await supabase
      .from("dje_itens_extraidos")
      .insert(linhas);

    if (insertErr) {
      throw new Error(`Falha ao salvar itens: ${insertErr.message}`);
    }

    // Tentar vincular automaticamente aos processos existentes pelo CNJ normalizado
    const cnjsNormalizados = linhas
      .map((l) => l.numero_processo_normalizado)
      .filter((c): c is string => !!c);

    if (cnjsNormalizados.length > 0) {
      const { data: procs } = await supabase
        .from("processos")
        .select("id, numero_cnj, cliente_id")
        .in("numero_cnj", cnjsNormalizados);

      if (procs && procs.length > 0) {
        const mapa = new Map(procs.map((p) => [p.numero_cnj, p]));
        for (const cnj of cnjsNormalizados) {
          const proc = mapa.get(cnj);
          if (proc) {
            await supabase
              .from("dje_itens_extraidos")
              .update({
                processo_id: proc.id,
                cliente_id: proc.cliente_id,
              })
              .eq("analise_id", analiseId)
              .eq("numero_processo_normalizado", cnj);
          }
        }
      }
    }

    await supabase
      .from("dje_analises")
      .update({ status: "concluido", total_itens: linhas.length })
      .eq("id", analiseId);

    return jsonResponse({ ok: true, total: linhas.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("dje-analisar erro:", msg);
    await supabase
      .from("dje_analises")
      .update({ status: "falha", erro: msg })
      .eq("id", analiseId);
    return jsonResponse({ error: msg }, 500);
  }
});
