// Assistente IA Interno — chat com contexto real do escritório.
// Recebe { conversa_id?, mensagens } e devolve stream SSE compatível com OpenAI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Mensagem {
  role: "user" | "assistant" | "system";
  content: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return String(d);
  }
}

/**
 * Monta um snapshot do escritório relevante para a pergunta do usuário.
 * Mantém payload pequeno: limites por tabela e só o essencial.
 */
async function montarContexto(
  admin: ReturnType<typeof createClient>,
  userId: string,
  pergunta: string,
  contextoRota?: { pathname?: string; modulo?: string; entityId?: string },
) {
  const ctx: Record<string, unknown> = {};
  const q = (pergunta || "").toLowerCase();

  // 1. Identidade do usuário e escritório
  const { data: profile } = await admin
    .from("profiles")
    .select("nome, email, oab")
    .eq("id", userId)
    .maybeSingle();
  ctx.usuario = profile;

  const { data: confs } = await admin
    .from("configuracoes_sistema")
    .select("chave, valor")
    .eq("secao", "escritorio");
  ctx.escritorio = Object.fromEntries((confs ?? []).map((c: any) => [c.chave, c.valor]));

  // 2. Tarefas/prazos abertos (gerais e do usuário)
  const hoje = new Date().toISOString().slice(0, 10);
  const em7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: itensMeus } = await admin
    .from("controladoria_itens")
    .select("id, titulo, tipo, prioridade, status, data_vencimento, processo_id, cliente_id")
    .in("status", ["pendente", "em_andamento", "aguardando", "atrasado"])
    .lte("data_vencimento", `${em7}T23:59:59`)
    .order("data_vencimento", { ascending: true })
    .limit(30);
  ctx.tarefas_proximas_7_dias = itensMeus;

  const { data: atrasados } = await admin
    .from("controladoria_itens")
    .select("id, titulo, tipo, prioridade, data_vencimento")
    .lt("data_vencimento", `${hoje}T00:00:00`)
    .in("status", ["pendente", "em_andamento", "aguardando", "atrasado"])
    .order("data_vencimento", { ascending: true })
    .limit(20);
  ctx.tarefas_atrasadas = atrasados;

  // 3. Resumo financeiro
  const { data: parcelasAbertas } = await admin
    .from("honorarios_parcelas")
    .select("valor, status, data_vencimento, contrato_id")
    .in("status", ["pendente", "atrasado", "negociando"])
    .order("data_vencimento", { ascending: true })
    .limit(50);
  const totalAberto = (parcelasAbertas ?? []).reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
  ctx.financeiro = {
    parcelas_em_aberto: parcelasAbertas?.length ?? 0,
    valor_em_aberto: totalAberto,
  };

  // 4. Contexto de rota — entidade aberta agora na tela
  if (contextoRota?.modulo) {
    ctx.tela_atual = {
      pathname: contextoRota.pathname,
      modulo: contextoRota.modulo,
    };

    if (contextoRota.entityId) {
      if (contextoRota.modulo === "processos") {
        const { data: proc } = await admin
          .from("processos")
          .select("id, numero_cnj, area_direito, status, valor_causa, observacoes, cliente_id, responsavel_id, criado_em")
          .eq("id", contextoRota.entityId)
          .maybeSingle();
        if (proc) {
          const { data: cli } = await admin
            .from("clientes")
            .select("id, nome, cpf_cnpj, whatsapp, email")
            .eq("id", (proc as any).cliente_id)
            .maybeSingle();
          ctx.processo_aberto = { ...proc, cliente: cli };
        }
      } else if (contextoRota.modulo === "clientes") {
        const { data: cli } = await admin
          .from("clientes")
          .select("id, nome, cpf_cnpj, whatsapp, email, status, ativo, criado_em")
          .eq("id", contextoRota.entityId)
          .maybeSingle();
        if (cli) {
          const { data: procs } = await admin
            .from("processos")
            .select("id, numero_cnj, area_direito, status")
            .eq("cliente_id", contextoRota.entityId)
            .limit(20);
          ctx.cliente_aberto = { ...cli, processos: procs };
        }
      } else if (contextoRota.modulo === "financeiro") {
        const { data: contrato } = await admin
          .from("contratos")
          .select("id, valor_total, status, cliente_id, criado_em")
          .eq("id", contextoRota.entityId)
          .maybeSingle();
        if (contrato) ctx.contrato_aberto = contrato;
      }
    }
  }

  // 5. Busca dirigida — se a pergunta cita CPF, número ou nome
  const cpfMatch = pergunta.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cnjMatch = pergunta.match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.\d{2}\.?\d{4}/);

  if (cpfMatch || cnjMatch || /cliente|processo|maria|joão|jose|ana/i.test(q)) {
    let clientesQ = admin.from("clientes").select("id, nome, cpf_cnpj, whatsapp, email, status").limit(8);
    if (cpfMatch) {
      clientesQ = clientesQ.ilike("cpf_cnpj", `%${cpfMatch[0].replace(/\D/g, "")}%`);
    } else {
      const nomes = pergunta.match(/\b[A-ZÀ-Ý][a-zà-ý]{2,}(?:\s+[A-ZÀ-Ý][a-zà-ý]{2,}){0,3}\b/g);
      if (nomes && nomes.length > 0) {
        clientesQ = clientesQ.ilike("nome", `%${nomes[0]}%`);
      }
    }
    const { data: clientes } = await clientesQ;
    ctx.clientes_relacionados = clientes;

    if (clientes && clientes.length > 0) {
      const ids = clientes.map((c: any) => c.id);
      const { data: processos } = await admin
        .from("processos")
        .select("id, numero_cnj, area_direito, status, cliente_id, responsavel_id")
        .in("cliente_id", ids)
        .limit(20);
      ctx.processos_relacionados = processos;
    }

    if (cnjMatch) {
      const { data: proc } = await admin
        .from("processos")
        .select("id, numero_cnj, area_direito, status, cliente_id")
        .eq("numero_cnj", cnjMatch[0])
        .maybeSingle();
      ctx.processo_busca = proc;
    }
  }

  // 6. Resumo geral (sempre)
  const { count: clientesAtivos } = await admin
    .from("clientes")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true);
  const { count: processosAtivos } = await admin
    .from("processos")
    .select("id", { count: "exact", head: true })
    .eq("status", "em_andamento");
  ctx.resumo_geral = {
    clientes_ativos: clientesAtivos ?? 0,
    processos_em_andamento: processosAtivos ?? 0,
    data_hoje: hoje,
  };

  return ctx;
}

function montarSystemPrompt(ctx: Record<string, unknown>): string {
  return `Você é a "Bia", assistente jurídica interna do escritório (LegisFlow).
Responda com base APENAS nos dados reais do escritório fornecidos abaixo.
NUNCA invente clientes, processos, valores ou datas. Se faltar dado, diga: "Não encontrei isso nos registros".

REGRAS:
1. Linguagem técnica mas clara, em português do Brasil. Sem rebuscar.
2. Use markdown — negrito para pontos críticos, listas para enumerações.
3. Datas no formato DD/MM/AAAA. Valores em R$.
4. Para cálculos previdenciários: salário mínimo R$ 1.621,00. Honorários padrão: 30% sobre retroativo bruto corrigido.
5. Prazos processuais: sempre alertar com folga de 3 dias úteis.
6. Quando citar processo, use o número CNJ.
7. Respostas curtas (≤ 3 linhas) para perguntas simples; estruturadas para análises complexas.
8. Se a tela atual tiver entidade aberta (processo_aberto, cliente_aberto, contrato_aberto), priorize-a no contexto.
9. Sempre que sugerir ação, termine com: "Quer que eu [próxima ação]?"

=== CONTEXTO DO ESCRITÓRIO (snapshot atual) ===
${JSON.stringify(ctx, null, 2)}
=== FIM DO CONTEXTO ===`;
}

const BIA_HABILITADA = Deno.env.get("BIA_ENABLED")?.toLowerCase() === "true";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!BIA_HABILITADA) {
    return new Response(
      JSON.stringify({
        error: "Bia temporariamente desativada",
        code: "BIA_DISABLED",
      }),
      {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Cliente com a sessão do usuário (valida o token via getUser)
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Cliente admin (service role) para buscar contexto sem RLS
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verifica permissão: só gestor ou advogado
    const [{ data: roles }, { data: profile }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", userId),
      admin.from("profiles").select("ativo").eq("id", userId).maybeSingle(),
    ]);
    const rolesArr = (roles ?? []).map((r: any) => r.role);
    const podeUsar =
      profile?.ativo &&
      (rolesArr.includes("gestor") || rolesArr.includes("advogado"));
    if (!podeUsar) {
      return new Response(
        JSON.stringify({ error: "Acesso restrito a gestores e advogados" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const mensagens: Mensagem[] = Array.isArray(body?.mensagens) ? body.mensagens : [];
    if (mensagens.length === 0) {
      return new Response(JSON.stringify({ error: "mensagens vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ultima = mensagens[mensagens.length - 1];
    const pergunta = ultima?.role === "user" ? ultima.content : "";

    const contextoRota = body?.contexto_rota;
    const ctx = await montarContexto(admin, userId, pergunta, contextoRota);
    const systemPrompt = montarSystemPrompt(ctx);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...mensagens],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Configurações da workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("[assistente-chat] AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Falha ao chamar a IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Devolve o stream original com header extra para o client salvar contexto
    return new Response(aiResp.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Contexto-Hash": String(JSON.stringify(ctx).length),
      },
    });
  } catch (e) {
    console.error("[assistente-chat] erro:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
