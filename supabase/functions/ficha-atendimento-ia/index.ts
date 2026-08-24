// Ficha de Atendimento — análise jurídica profunda por IA.
// Lê documentos (PDF, imagens, áudios) + texto bruto e devolve uma ficha
// estruturada COM EVIDÊNCIAS (trecho de origem por campo) para revisão lado a
// lado. Faz extração precisa de partes, valores, prazos, datas, NB, CPF/CNPJ,
// vara/comarca, e produz tese jurídica fundamentada (lei + súmula + jurisp.)
// com riscos, estratégia e próximos passos acionáveis.
//
// Body: { atendimento_id: string, instrucoes_extras?: string }
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

const TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "montar_ficha",
    description:
      "Monta a ficha jurídica estruturada com evidências (trechos do documento que originaram cada campo).",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título curto do atendimento (≤ 80 chars)." },
        area: {
          type: "string",
          description:
            "Área do direito: previdenciario, familia, consumidor, trabalhista, civel, tributario, criminal, outro.",
        },
        subtipo: {
          type: "string",
          description: "Subtipo (ex.: bpc_loas, aposentadoria_idade, isencao_ir, divorcio_consensual, indenizatoria_consumo).",
        },
        urgencia: { type: "string", enum: ["baixa", "media", "alta", "critica"] },
        resumo: { type: "string", description: "Resumo executivo do caso (3-5 frases) para a equipe." },
        fatos: { type: "string", description: "Narrativa cronológica dos fatos (1-2 parágrafos), só com fatos extraídos do contexto." },
        tese_juridica: {
          type: "string",
          description:
            "Tese jurídica APROFUNDADA (3-6 parágrafos). Inclua enquadramento legal, requisitos, aplicação ao caso e conclusão. Cite artigos/súmulas quando possível.",
        },
        fundamentacao_legal: {
          type: "array",
          description: "Bases legais relevantes (artigos, súmulas, leis, jurisprudência aplicável).",
          items: {
            type: "object",
            properties: {
              referencia: { type: "string", description: "Ex.: 'Art. 20, § 3º, Lei 8.742/93' ou 'Súmula 79/TNU'." },
              aplicacao: { type: "string", description: "Como esta norma se aplica ao caso concreto." },
            },
            required: ["referencia", "aplicacao"],
          },
        },
        riscos: {
          type: "array",
          description: "Riscos jurídicos / pontos fracos do caso.",
          items: {
            type: "object",
            properties: {
              risco: { type: "string" },
              mitigacao: { type: "string", description: "Como reduzir / endereçar este risco." },
              gravidade: { type: "string", enum: ["baixa", "media", "alta"] },
            },
            required: ["risco", "gravidade"],
          },
        },
        estrategia: {
          type: "string",
          description: "Estratégia de atuação sugerida (qual via, ordem das ações, prioridades).",
        },
        partes: {
          type: "object",
          description:
            "Partes envolvidas. Use apenas chaves presentes. Ex.: autor, reu, polo_cliente ('ativo'|'passivo'), advogado_contrario, vara, comarca, juizo, valor_causa, numero_processo.",
          additionalProperties: { type: ["string", "number", "boolean"] },
        },
        qualificacao: {
          type: "object",
          description:
            "Qualificação do cliente extraída do contexto (estado_civil, nacionalidade, profissao, endereco, telefone, email, rg, nome_mae, data_nascimento). Apenas chaves presentes.",
          additionalProperties: { type: ["string", "number", "boolean"] },
        },
        dados_estruturados: {
          type: "object",
          description:
            "Dados-chave do caso. Apenas chaves presentes. Ex.: NB, DER, DCB, renda_mensal, cid, valor_causa, requerido, comarca, data_indeferimento, prazo_recursal_ate.",
          additionalProperties: { type: ["string", "number", "boolean"] },
        },
        pedidos: {
          type: "array",
          description: "Pedidos sugeridos (ex.: 'Concessão de BPC/LOAS', 'Tutela de urgência', 'Honorários 20%').",
          items: { type: "string" },
        },
        documentos_faltantes: {
          type: "array",
          description: "Documentos que precisam ser coletados para instruir o caso.",
          items: { type: "string" },
        },
        proximos_passos: {
          type: "array",
          description: "Próximos passos acionáveis em ordem de prioridade.",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string" },
              detalhe: { type: "string" },
              prazo_dias: { type: "number", description: "Prazo em dias a partir de hoje." },
              tipo: {
                type: "string",
                enum: ["diligencia", "processo", "processo_administrativo", "documento", "contato", "outro"],
              },
              prioridade: { type: "string", enum: ["baixa", "media", "alta"] },
            },
            required: ["titulo", "tipo"],
          },
        },
        evidencias: {
          type: "array",
          description:
            "Para CADA campo extraído (qualificacao.*, dados_estruturados.*, partes.*, fatos), informe a fonte. Use o ID do documento OU 'texto_bruto'. Inclua o trecho EXATO copiado do documento (citacao). Isso permite revisão lado a lado.",
          items: {
            type: "object",
            properties: {
              campo: { type: "string", description: "Caminho do campo. Ex.: 'partes.autor', 'dados_estruturados.NB', 'qualificacao.cpf'." },
              valor: { type: "string", description: "Valor extraído (como string)." },
              fonte: { type: "string", description: "documento_id ou 'texto_bruto'." },
              fonte_nome: { type: "string", description: "Nome amigável do documento (opcional)." },
              citacao: { type: "string", description: "Trecho EXATO copiado do documento que justifica o valor." },
              confianca: { type: "string", enum: ["baixa", "media", "alta"] },
            },
            required: ["campo", "valor", "fonte", "citacao"],
          },
        },
        resumo_documentos: {
          type: "array",
          description: "Resumo de cada documento (1-2 frases) com pontos relevantes para o caso.",
          items: {
            type: "object",
            properties: {
              documento_id: { type: "string" },
              resumo: { type: "string" },
            },
            required: ["documento_id", "resumo"],
          },
        },
      },
      required: [
        "titulo",
        "area",
        "resumo",
        "tese_juridica",
        "fatos",
        "pedidos",
        "proximos_passos",
        "dados_estruturados",
        "evidencias",
      ],
      additionalProperties: false,
    },
  },
} as const;

async function fileToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function montarPromptTexto(ctx: any, instr?: string): string {
  return `Você é a "Bia", assistente jurídica sênior do escritório.
Sua missão: ler com PROFUNDIDADE o texto bruto e os documentos anexados e
montar uma FICHA DE ATENDIMENTO juridicamente robusta para o sistema.

## DIRETRIZES OBRIGATÓRIAS

1. **EXTRAIA TUDO** que constar nos documentos com precisão jurídica:
   - CPF/CNPJ (mantenha pontuação), RG, NB (Número do Benefício), datas (DER,
     DIB, DCB, indeferimento, citação), valores em R$, endereços completos,
     CID, número de processo (formato CNJ), vara, comarca, juízo, partes
     (autor, réu, polo do cliente), advogado contrário, valor da causa.
   - Reconheça abreviações jurídicas (BPC/LOAS, INSS, DER, CNIS, CTPS, CID).
   - NUNCA invente. Se não encontrar, omita a chave.

2. **EVIDÊNCIAS — passo crítico**: Para cada dado relevante extraído (cada
   chave de \`partes\`, \`qualificacao\`, \`dados_estruturados\`, e cada
   afirmação importante de \`fatos\`), adicione UMA entrada em \`evidencias\`:
   - \`campo\`: caminho do campo (ex.: "partes.autor", "dados_estruturados.NB").
   - \`valor\`: o valor extraído como string.
   - \`fonte\`: o ID do documento (use exatamente o id mostrado abaixo) ou
     "texto_bruto" se veio das anotações da advogada.
   - \`citacao\`: TRECHO LITERAL copiado do documento (até 240 chars), sem
     parafrasear. Isso permite à advogada revisar lado a lado.
   - \`confianca\`: alta (texto explícito), media (inferência razoável), baixa
     (dedução fraca — sinalize na tese se relevante).

3. **TESE JURÍDICA APROFUNDADA**: 3-6 parágrafos com:
   (a) enquadramento legal — qual instituto se aplica;
   (b) requisitos legais — listados;
   (c) subsunção — aplicação dos requisitos aos fatos do caso;
   (d) precedentes/súmulas relevantes (se conhecer);
   (e) conclusão — tese central.
   Cite artigos com formato "Art. X, Lei Y/ZZ" e súmulas (ex.: "Súmula 79/TNU").

4. **FUNDAMENTAÇÃO LEGAL**: liste itens-chave (lei/súmula/precedente) com
   uma frase de aplicação ao caso.

5. **RISCOS**: identifique fragilidades (ex.: ausência de prova, decadência
   próxima, jurisprudência desfavorável) com gravidade e mitigação.

6. **ESTRATÉGIA**: proponha caminho concreto (ex.: "1) requerimento
   administrativo no INSS; 2) se indeferido, ação judicial com tutela...").

7. **PRÓXIMOS PASSOS**: tarefas concretas com prazo em dias e tipo correto
   para conversão automática (diligencia, processo, processo_administrativo,
   documento, contato).

8. **DOCUMENTOS FALTANTES**: o que ainda é necessário coletar.

## CONTEXTO

- Cliente vinculado: ${ctx.cliente?.nome ?? "—"} (CPF/CNPJ: ${ctx.cliente?.cpf_cnpj ?? "—"}).
- Profissão informada no cadastro: ${ctx.cliente?.profissao ?? "—"}.
- Renda mensal cadastrada: ${ctx.cliente?.renda_mensal ?? "—"}.
- Data de hoje: ${new Date().toLocaleDateString("pt-BR")}.

## TEXTO BRUTO INFORMADO PELA ADVOGADA

${ctx.atendimento.informacoes_brutas?.trim() || "(nenhum)"}

## DOCUMENTOS ANEXADOS (use EXATAMENTE estes IDs em fonte/documento_id)

${ctx.documentos.map((d: any) => `- id=${d.id} | nome="${d.nome}" | tipo=${d.tipo ?? "?"} | mime=${d.mime_type ?? "?"}`).join("\n") || "(nenhum)"}

${instr ? `\n## INSTRUÇÕES EXTRAS DA ADVOGADA\n${instr}\n` : ""}

Chame a função \`montar_ficha\` com o resultado completo. Não responda em texto.`;
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
    const atendimentoId = String(body?.atendimento_id ?? "");
    const instrucoes: string | undefined = body?.instrucoes_extras;
    if (!atendimentoId) {
      return new Response(JSON.stringify({ error: "atendimento_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: atendimento, error: aerr } = await admin
      .from("cliente_atendimentos")
      .select("id, cliente_id, titulo, informacoes_brutas, area, subtipo")
      .eq("id", atendimentoId)
      .maybeSingle();
    if (aerr || !atendimento) {
      return new Response(JSON.stringify({ error: "Atendimento não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cliente } = await admin
      .from("clientes")
      .select("id, nome, cpf_cnpj, profissao, renda_mensal, observacoes")
      .eq("id", (atendimento as any).cliente_id)
      .maybeSingle();

    const { data: docs } = await admin
      .from("cliente_ficha_documentos")
      .select("id, nome, tipo, storage_path, mime_type, tamanho_bytes")
      .eq("atendimento_id", atendimentoId)
      .order("criado_em", { ascending: true });

    const documentos = docs ?? [];

    const parts: any[] = [
      {
        text: montarPromptTexto({ atendimento, cliente, documentos }, instrucoes),
      },
    ];

    let totalBytes = 0;
    const MAX_TOTAL = 18 * 1024 * 1024; // 18 MB total
    for (const d of documentos) {
      if (totalBytes >= MAX_TOTAL) break;
      try {
        const { data: blob, error: derr } = await admin.storage
          .from("fichas-atendimento")
          .download((d as any).storage_path);
        if (derr || !blob) continue;
        if (blob.size + totalBytes > MAX_TOTAL) continue;
        totalBytes += blob.size;
        const b64 = await fileToBase64(blob);
        parts.push({
          text: `\n[Documento id=${(d as any).id} | ${(d as any).nome}]`,
        });
        parts.push({
          inline_data: {
            mime_type: (d as any).mime_type ?? "application/octet-stream",
            data: b64,
          },
        });
      } catch (e) {
        console.warn("[ficha-ia] falha ao baixar doc", (d as any).id, e);
      }
    }

    // Modelo Pro para extração jurídica precisa + multimodal robusto.
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: parts }],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "montar_ficha" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("[ficha-ia] AI error", aiResp.status, t);
      const status = aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500;
      const msg =
        aiResp.status === 429
          ? "Limite de requisições da IA atingido. Tente em alguns instantes."
          : aiResp.status === 402
            ? "Créditos da IA esgotados. Adicione créditos em Settings → Workspace → Usage."
            : "Falha ao processar com IA.";
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
    const ficha = JSON.parse(call.function.arguments);

    const update: any = {
      titulo: ficha.titulo ?? atendimento.titulo ?? "Ficha de atendimento",
      area: ficha.area ?? null,
      subtipo: ficha.subtipo ?? null,
      resumo: ficha.resumo ?? "",
      resumo_ia: ficha.resumo ?? "",
      tese_juridica: ficha.tese_juridica ?? null,
      fatos: ficha.fatos ?? null,
      urgencia: ficha.urgencia ?? null,
      qualificacao: ficha.qualificacao ?? {},
      pedidos: Array.isArray(ficha.pedidos) ? ficha.pedidos : [],
      documentos_faltantes: Array.isArray(ficha.documentos_faltantes)
        ? ficha.documentos_faltantes
        : [],
      proximos_passos: Array.isArray(ficha.proximos_passos) ? ficha.proximos_passos : [],
      dados_estruturados: ficha.dados_estruturados ?? {},
      partes: ficha.partes ?? {},
      fundamentacao_legal: Array.isArray(ficha.fundamentacao_legal)
        ? ficha.fundamentacao_legal
        : [],
      riscos: Array.isArray(ficha.riscos) ? ficha.riscos : [],
      estrategia: ficha.estrategia ?? null,
      evidencias: Array.isArray(ficha.evidencias) ? ficha.evidencias : [],
      analisado_em: new Date().toISOString(),
      status: "ativo",
    };
    await admin.from("cliente_atendimentos").update(update).eq("id", atendimentoId);

    if (Array.isArray(ficha.resumo_documentos)) {
      for (const r of ficha.resumo_documentos) {
        if (!r?.documento_id || !r?.resumo) continue;
        await admin
          .from("cliente_ficha_documentos")
          .update({ resumo_ia: r.resumo })
          .eq("id", r.documento_id)
          .eq("atendimento_id", atendimentoId);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ficha,
        documentos_processados: documentos.length,
        bytes_processados: totalBytes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[ficha-ia] erro:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
