// Sugere o próximo parceiro a receber uma indicação, com base em:
// - Carga atual de processos ativos
// - Tempo desde a última indicação
// - Compatibilidade de área de atuação
// - Taxa de êxito histórica
// A IA recebe os dados já agregados e devolve um ranking com justificativa.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParceiroAgg {
  id: string;
  nome: string;
  tipo: string;
  cidade: string | null;
  estado: string | null;
  especialidades: string[];
  oab_completo: string | null;
  processos_ativos: number;
  processos_total: number;
  processos_encerrados_ganhos: number;
  processos_encerrados_perdidos: number;
  taxa_exito_pct: number | null;
  dias_sem_indicacao: number | null;
  ultima_indicacao_em: string | null;
  valor_total_recebido: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(url, serviceKey, {
      global: { headers: { Authorization: auth } },
    });

    let body: { area_direito?: string; uf?: string; observacao?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Sem body é OK — análise geral
    }

    const areaSolicitada = (body.area_direito ?? "").trim();
    const ufSolicitada = (body.uf ?? "").trim();

    // 1) Busca parceiros ativos
    const { data: parceiros, error: errParc } = await supabase
      .from("parceiros")
      .select("id, nome, tipo, cidade, estado, especialidades, oab_completo")
      .eq("status", "ativo")
      .eq("ativo", true);
    if (errParc) throw errParc;

    if (!parceiros || parceiros.length === 0) {
      return new Response(
        JSON.stringify({ ranking: [], resumo: "Nenhum parceiro ativo cadastrado." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ids = parceiros.map((p) => p.id);

    // 2) Vínculos em processos
    const { data: vinculos } = await supabase
      .from("processo_parceiros")
      .select("parceiro_id, processo_id, criado_em, ativo, processos:processo_id(status, area_direito)")
      .in("parceiro_id", ids);

    // 3) Repasses pagos (proxy de receita gerada)
    const { data: repasses } = await supabase
      .from("honorarios_repasses")
      .select("parceiro_id, valor_repasse, status")
      .in("parceiro_id", ids);

    const agora = new Date();
    const agg: ParceiroAgg[] = parceiros.map((p) => {
      const linkados = (vinculos ?? []).filter((v: any) => v.parceiro_id === p.id);
      const ativos = linkados.filter(
        (v: any) => v.ativo && v.processos?.status && !["encerrado", "arquivado"].includes(v.processos.status),
      ).length;
      const ganhos = linkados.filter((v: any) => v.processos?.status === "ganho").length;
      const perdidos = linkados.filter((v: any) => v.processos?.status === "perdido").length;
      const finalizados = ganhos + perdidos;
      const ultimaData = linkados
        .map((v: any) => v.criado_em)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      const diasSem = ultimaData
        ? Math.floor((agora.getTime() - new Date(ultimaData).getTime()) / 86400000)
        : null;

      const totalReceita = (repasses ?? [])
        .filter((r: any) => r.parceiro_id === p.id)
        .reduce((s: number, r: any) => s + Number(r.valor_repasse ?? 0), 0);

      return {
        id: p.id,
        nome: p.nome,
        tipo: p.tipo,
        cidade: p.cidade,
        estado: p.estado,
        especialidades: (p.especialidades as string[]) ?? [],
        oab_completo: p.oab_completo,
        processos_ativos: ativos,
        processos_total: linkados.length,
        processos_encerrados_ganhos: ganhos,
        processos_encerrados_perdidos: perdidos,
        taxa_exito_pct: finalizados > 0 ? Math.round((ganhos / finalizados) * 100) : null,
        dias_sem_indicacao: diasSem,
        ultima_indicacao_em: ultimaData ?? null,
        valor_total_recebido: totalReceita,
      };
    });

    // 4) Pré-filtra por área/UF se informados (sem excluir totalmente — só sinaliza)
    const contexto = {
      area_solicitada: areaSolicitada || null,
      uf_solicitada: ufSolicitada || null,
      observacao: body.observacao ?? null,
      total_parceiros: agg.length,
      parceiros: agg,
    };

    // 5) Chama a IA com tool calling
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente que ajuda a distribuir processos a parceiros jurídicos de forma equilibrada e estratégica.

Critérios de pontuação (combine):
1. CARGA ATUAL — quem tem MENOS processos ativos sobe (evita sobrecarga)
2. TEMPO SEM INDICAÇÃO — quem está há mais tempo sem receber sobe (mantém parceria viva)
3. ÁREA DE ATUAÇÃO — se o usuário informar área, parceiros com a especialidade ganham bônus
4. TAXA DE ÊXITO HISTÓRICA — quem tem melhor desempenho ganha bônus (mas só conta se tiver pelo menos 2 processos finalizados)

Devolva um RANKING dos top 5 parceiros mais recomendados, com justificativa curta e prática (1 frase) para cada. Inclua também alertas: parceiros há mais de 60 dias sem indicação que correm risco de "esfriar".`,
          },
          {
            role: "user",
            content: `Dados dos parceiros e contexto da nova indicação:\n\n${JSON.stringify(contexto, null, 2)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "registrar_distribuicao",
              description: "Registra o ranking sugerido e os alertas de parcerias esfriando.",
              parameters: {
                type: "object",
                properties: {
                  resumo: {
                    type: "string",
                    description: "Resumo executivo de 1-2 frases sobre o cenário geral.",
                  },
                  ranking: {
                    type: "array",
                    description: "Top 5 parceiros recomendados, em ordem.",
                    items: {
                      type: "object",
                      properties: {
                        parceiro_id: { type: "string" },
                        nome: { type: "string" },
                        score: { type: "number", description: "0-100" },
                        motivo: { type: "string", description: "Justificativa de 1 frase" },
                        sinais: {
                          type: "array",
                          items: { type: "string" },
                          description: "Etiquetas curtas: ex. 'Pouca carga', 'Há 90d sem indicação', 'Especialista na área', 'Alta taxa de êxito'",
                        },
                      },
                      required: ["parceiro_id", "nome", "score", "motivo", "sinais"],
                    },
                  },
                  alertas_esfriando: {
                    type: "array",
                    description: "Parceiros há mais de 60 dias sem nova indicação que merecem atenção.",
                    items: {
                      type: "object",
                      properties: {
                        parceiro_id: { type: "string" },
                        nome: { type: "string" },
                        dias_sem_indicacao: { type: "number" },
                        sugestao: { type: "string" },
                      },
                      required: ["parceiro_id", "nome", "dias_sem_indicacao", "sugestao"],
                    },
                  },
                },
                required: ["resumo", "ranking", "alertas_esfriando"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "registrar_distribuicao" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "rate_limit", message: "Muitas requisições. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "credits", message: "Créditos da IA esgotados. Adicione créditos em Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI gateway error ${aiRes.status}: ${txt}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("IA não devolveu resposta estruturada.");
    }
    const resultado = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({ ...resultado, dados_brutos: agg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[parceiros-distribuicao-ia] erro:", err);
    return new Response(
      JSON.stringify({ error: "internal", message: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
