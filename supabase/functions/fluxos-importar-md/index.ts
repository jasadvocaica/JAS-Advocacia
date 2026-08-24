// Recebe um arquivo Markdown descrevendo templates de Fluxos Automatizados,
// usa Lovable AI (Gemini) para extrair a estrutura como JSON e insere em
// fluxos_templates + fluxo_etapas_template.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATILHOS_VALIDOS = [
  "manual",
  "bpc_negado",
  "bpc_deferido",
  "auxilio_negado",
  "auxilio_deferido",
  "cliente_novo",
  "audiencia_marcada",
  "sentenca_recebida",
  "prazo_recurso_aberto",
  "peca_simples",
];

const AREAS_VALIDAS = ["previdenciario", "familia", "civil", "trabalhista", "geral"];
const TIPOS_VALIDOS = ["prazo_fatal", "prazo_processual", "tarefa", "checklist", "comunicacao", "audiencia"];
const RESPONSAVEIS_VALIDOS = ["advogado_caso", "gestor", "estagiario", "responsavel_anterior"];
const PRAZO_TIPOS = ["uteis", "corridos"];
const PRAZO_REFS = ["gatilho", "etapa_anterior", "data_audiencia", "data_intimacao"];
const PRIORIDADES = ["baixa", "media", "alta", "critica"];

const SYSTEM_PROMPT = `Você é um extrator estrito de templates de fluxos jurídicos automatizados a partir de documentos Markdown.

Tarefa: ler o conteúdo Markdown fornecido pelo usuário e devolver UM ARRAY JSON de templates, cada um com suas etapas em ordem.

Regras estritas:
- Retorne APENAS JSON válido (sem markdown, sem explicações).
- Cada template tem: nome, descricao, gatilho, area, icone (1 emoji), cor (hex como "#3B82F6"), etapas[].
- Cada etapa tem: ordem (1-based), titulo, descricao (ou null), tipo, prazo_dias (inteiro, pode ser negativo se relativo a uma data futura como audiência), prazo_tipo, prazo_referencia, responsavel_padrao (ou null), prioridade, obrigatorio (boolean), gera_alerta_gestor (boolean), checklist_itens (array de strings, vazio se não aplicável), template_texto (texto completo da comunicação se for tipo comunicacao, senão null).

Valores válidos:
- gatilho: ${GATILHOS_VALIDOS.join(", ")}
- area: ${AREAS_VALIDAS.join(", ")}
- tipo: ${TIPOS_VALIDOS.join(", ")}
- responsavel_padrao: ${RESPONSAVEIS_VALIDOS.join(", ")} ou null
- prazo_tipo: ${PRAZO_TIPOS.join(", ")}
- prazo_referencia: ${PRAZO_REFS.join(", ")}
- prioridade: ${PRIORIDADES.join(", ")}

Diretrizes de inferência:
- Se o documento descreve "PRAZO FATAL", use tipo "prazo_fatal" e prioridade "critica" e gera_alerta_gestor=true.
- Se descreve coleta de documentos, use tipo "checklist".
- Se descreve mensagem ao cliente, use tipo "comunicacao" e preencha template_texto com o texto completo (mantenha variáveis como {{nome_cliente}}, {{numero_cnj}}, {{cpf}}).
- Se a etapa é relativa a uma audiência futura (ex: "5 dias antes da audiência"), use prazo_dias negativo (-5) e prazo_referencia="data_audiencia".
- Etapas obrigatórias por padrão: true. Marque false apenas se o documento disser "opcional".

Formato exato da resposta: { "templates": [ ... ] }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      return new Response(JSON.stringify({ error: "Apenas gestor pode importar templates" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { markdown, sobrescrever } = body as { markdown?: string; sobrescrever?: boolean };
    if (!markdown || typeof markdown !== "string" || markdown.length < 100) {
      return new Response(JSON.stringify({ error: "Conteúdo Markdown muito curto ou ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (markdown.length > 200_000) {
      return new Response(JSON.stringify({ error: "Markdown excede 200KB" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chamar Lovable AI — usa Flash (mais rápido) com timeout para evitar IDLE_TIMEOUT (150s) do edge.
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 120_000); // 2 min hard cap
    let aiResp: Response;
    try {
      aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: aiController.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: markdown },
          ],
        }),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return new Response(
          JSON.stringify({ error: "A IA demorou demais para responder. Divida o arquivo em partes menores e tente novamente." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    } finally {
      clearTimeout(aiTimeout);
    }

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de uso de IA atingido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Falha na IA (${aiResp.status}): ${txt.slice(0, 500)}`);
    }

    const aiData = await aiResp.json();
    const content = aiData?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Resposta da IA vazia");

    let parsed: any;
    try {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    } catch (e) {
      throw new Error("IA não retornou JSON válido");
    }

    const templates = Array.isArray(parsed) ? parsed : parsed.templates;
    if (!Array.isArray(templates) || templates.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhum template foi identificado no documento" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultados: any[] = [];
    let totalCriados = 0;
    let totalSubstituidos = 0;
    let totalIgnorados = 0;

    for (const t of templates) {
      try {
        if (!t.nome || !t.gatilho) {
          resultados.push({ nome: t.nome ?? "(sem nome)", status: "erro", erro: "nome ou gatilho ausentes" });
          continue;
        }
        const gatilho = GATILHOS_VALIDOS.includes(t.gatilho) ? t.gatilho : "manual";
        const area = AREAS_VALIDAS.includes(t.area) ? t.area : null;

        // Verifica existência por nome+gatilho
        const { data: existente } = await admin
          .from("fluxos_templates")
          .select("id")
          .eq("nome", t.nome)
          .eq("gatilho", gatilho)
          .maybeSingle();

        let templateId: string;

        if (existente) {
          if (!sobrescrever) {
            totalIgnorados++;
            resultados.push({ nome: t.nome, status: "ignorado", motivo: "Já existe (marque 'sobrescrever' para substituir)" });
            continue;
          }
          // Substitui: apaga etapas e atualiza
          await admin.from("fluxo_etapas_template").delete().eq("template_id", existente.id);
          await admin
            .from("fluxos_templates")
            .update({
              descricao: t.descricao ?? null,
              area,
              icone: t.icone ?? null,
              cor: t.cor ?? null,
              ativo: true,
            })
            .eq("id", existente.id);
          templateId = existente.id;
          totalSubstituidos++;
        } else {
          const { data: novo, error: errIns } = await admin
            .from("fluxos_templates")
            .insert({
              nome: t.nome,
              descricao: t.descricao ?? null,
              gatilho,
              area,
              icone: t.icone ?? null,
              cor: t.cor ?? null,
              ativo: true,
              criado_por: userData.user.id,
            })
            .select("id")
            .single();
          if (errIns || !novo) {
            resultados.push({ nome: t.nome, status: "erro", erro: errIns?.message ?? "falha ao criar" });
            continue;
          }
          templateId = novo.id;
          totalCriados++;
        }

        // Insere etapas
        const etapas = Array.isArray(t.etapas) ? t.etapas : [];
        const etapasParaInserir = etapas.map((e: any, idx: number) => ({
          template_id: templateId,
          ordem: typeof e.ordem === "number" ? e.ordem : idx + 1,
          titulo: e.titulo ?? `Etapa ${idx + 1}`,
          descricao: e.descricao ?? null,
          tipo: TIPOS_VALIDOS.includes(e.tipo) ? e.tipo : "tarefa",
          prazo_dias: typeof e.prazo_dias === "number" ? e.prazo_dias : 0,
          prazo_tipo: PRAZO_TIPOS.includes(e.prazo_tipo) ? e.prazo_tipo : "uteis",
          prazo_referencia: PRAZO_REFS.includes(e.prazo_referencia) ? e.prazo_referencia : "gatilho",
          responsavel_padrao: RESPONSAVEIS_VALIDOS.includes(e.responsavel_padrao) ? e.responsavel_padrao : null,
          prioridade: PRIORIDADES.includes(e.prioridade) ? e.prioridade : "media",
          obrigatorio: e.obrigatorio !== false,
          gera_alerta_gestor: e.gera_alerta_gestor === true,
          checklist_itens: Array.isArray(e.checklist_itens) ? e.checklist_itens : [],
          template_texto: e.template_texto ?? null,
        }));

        if (etapasParaInserir.length > 0) {
          const { error: errE } = await admin.from("fluxo_etapas_template").insert(etapasParaInserir);
          if (errE) {
            resultados.push({ nome: t.nome, status: "parcial", template_id: templateId, etapas: 0, erro: errE.message });
            continue;
          }
        }

        resultados.push({
          nome: t.nome,
          status: existente ? "substituido" : "criado",
          template_id: templateId,
          etapas: etapasParaInserir.length,
        });
      } catch (errTpl) {
        resultados.push({ nome: t?.nome ?? "(?)", status: "erro", erro: (errTpl as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: templates.length,
        criados: totalCriados,
        substituidos: totalSubstituidos,
        ignorados: totalIgnorados,
        resultados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[fluxos-importar-md]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
