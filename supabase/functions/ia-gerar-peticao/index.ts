// Geração automática de rascunho de petição via IA, salvando em doc_pecas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPTS: Record<string, string> = {
  cumprimento_sentenca: "Redija um cumprimento de sentença para execução de valores previdenciários. Inclua qualificação das partes, valor atualizado pelo SELIC, planilha referenciada, pedidos (RPV ou precatório), astreintes se aplicável.",
  bpc_loas: "Redija petição inicial de BPC/LOAS. Inclua qualificação, fatos, fundamentos (Lei 8.742/93, STF Tema 312, STJ Tema 640), pedidos (concessão + retroativo) e valor da causa.",
  recurso_inss: "Redija recurso administrativo ao INSS com identificação do benefício indeferido, fundamentos e pedido de reforma.",
  habilitacao: "Redija petição de habilitação de crédito previdenciário (Art. 788 CPC).",
  acordo: "Redija minuta de acordo judicial: partes, objeto, valor, forma de pagamento, renúncia ao remanescente, homologação.",
  generica: "Redija a peça processual cabível conforme os dados do processo.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const processo_id = body?.processo_id;
    const tipo_peticao = body?.tipo_peticao || "generica";
    if (!processo_id) {
      return new Response(JSON.stringify({ error: "processo_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: processo } = await admin
      .from("processos")
      .select(`
        id, numero_cnj, area_direito, tipo_acao, vara, comarca, valor_causa, observacoes_internas, responsavel_id,
        cliente:clientes(id, nome, cpf_cnpj, nascimento, profissao, endereco, cidade, estado, cep, rg)
      `)
      .eq("id", processo_id)
      .maybeSingle();
    if (!processo) {
      return new Response(JSON.stringify({ error: "processo não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promptEspecifico = PROMPTS[tipo_peticao] || PROMPTS.generica;
    const sys = `Você é redatora jurídica especializada (assistente "Bia").
REGRAS DE FORMATAÇÃO:
- Sem "Excelentíssimo" no cabeçalho
- Seções "I — TÍTULO" maiúsculo
- Subseções "a) Título"
- Artigos em negrito; transcrição literal recuada
- Fechar com nome completo do(a) advogado(a) responsável e OAB

REGRAS DE CONTEÚDO:
- Use APENAS os dados fornecidos; nunca invente valores ou datas
- Salário mínimo: R$ 1.621,00. Honorários: 30% sobre retroativo bruto corrigido
- Se faltar dado essencial, marque [INSERIR: descrição]
- Markdown limpo. Máx 4000 caracteres.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro", max_tokens: 4000,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `${promptEspecifico}\n\nDados do processo:\n${JSON.stringify(processo, null, 2)}\n\nRedija a peça completa.` },
        ],
      }),
    });
    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}: ${(await aiResp.text()).slice(0, 200)}`);
    const conteudoMd = (await aiResp.json())?.choices?.[0]?.message?.content ?? "";

    // Cria peça de processo (doc_pecas) como rascunho
    const titulo = `Rascunho IA — ${tipo_peticao} — ${(processo as any).cliente?.nome ?? ""}`.trim();
    const { data: peca, error: pecaErr } = await admin
      .from("doc_pecas")
      .insert({
        processo_id,
        titulo,
        conteudo_html: `<pre style="white-space:pre-wrap;font-family:Bookman Old Style,serif">${escapeHtml(conteudoMd)}</pre>`,
        conteudo_texto: conteudoMd,
        status: "rascunho",
        criado_por: (processo as any).responsavel_id ?? null,
      } as any)
      .select("id")
      .maybeSingle();
    // doc_pecas pode ter colunas diferentes — falha não bloqueia
    let pecaId: string | null = peca?.id ?? null;
    if (pecaErr) {
      console.warn("doc_pecas insert falhou, salvando como relatório", pecaErr.message);
      const { data: rel } = await admin.from("ia_relatorios").insert({
        tipo: "rascunho_peticao",
        titulo,
        conteudo: conteudoMd,
        dados: { processo_id, tipo_peticao },
      }).select("id").maybeSingle();
      pecaId = rel?.id ?? null;
    }

    // Limpa flag pendente no processo
    await admin.from("processos").update({ ia_peticao_pendente: null }).eq("id", processo_id);

    // Notifica responsável (ou gestores)
    const destino = (processo as any).responsavel_id;
    if (destino) {
      await admin.from("notificacoes").insert({
        user_id: destino,
        tipo: "peticao_gerada",
        titulo: `📝 Rascunho IA pronto: ${tipo_peticao}`,
        descricao: titulo,
        link: `/processos/${processo_id}`,
      });
    } else {
      const { data: gestores } = await admin.from("user_roles").select("user_id").eq("role", "gestor");
      if (gestores?.length) {
        await admin.from("notificacoes").insert(gestores.map((g: any) => ({
          user_id: g.user_id, tipo: "peticao_gerada",
          titulo: `📝 Rascunho IA pronto: ${tipo_peticao}`,
          descricao: titulo, link: `/processos/${processo_id}`,
        })));
      }
    }

    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-gerar-peticao", status: "sucesso",
      detalhes: { processo_id, tipo_peticao, peca_id: pecaId },
    });
    return new Response(JSON.stringify({ ok: true, peca_id: pecaId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ia-gerar-peticao]", msg);
    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-gerar-peticao", status: "erro", erro: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
