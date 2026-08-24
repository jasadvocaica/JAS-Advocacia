// Análise inicial de cliente recém-cadastrado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { cliente_id } = await req.json().catch(() => ({}));
    if (!cliente_id) {
      return new Response(JSON.stringify({ error: "cliente_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cliente } = await admin
      .from("clientes")
      .select("id, nome, cpf_cnpj, nascimento, profissao, renda_mensal, escolaridade, observacoes, advogado_responsavel_id, nit_pis, ultimo_vinculo_emprego")
      .eq("id", cliente_id)
      .maybeSingle();
    if (!cliente) {
      return new Response(JSON.stringify({ error: "cliente não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: beneficios }, { data: docs }] = await Promise.all([
      admin.from("cliente_beneficios_inss").select("*").eq("cliente_id", cliente_id),
      admin.from("documentos").select("titulo, tipo, criado_em").eq("cliente_id", cliente_id).limit(20),
    ]);

    const sys = `Você é a "Bia", especialista em análise previdenciária.
Analise os dados do cliente e estruture em markdown:
1. **BENEFÍCIOS CABÍVEIS** — lista
2. **PONTOS DE ATENÇÃO** — dados faltantes, riscos
3. **ESTRATÉGIA RECOMENDADA** — qual benefício priorizar
4. **DOCUMENTOS NECESSÁRIOS** — checklist
5. **ESTIMATIVA DE HONORÁRIOS** — com base nos dados (30% sobre retroativo)
Salário mínimo R$ 1.621,00. Use APENAS dados fornecidos. Máx 800 palavras.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview", max_tokens: 2500,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Cliente:\n${JSON.stringify(cliente, null, 2)}\n\nBenefícios INSS:\n${JSON.stringify(beneficios, null, 2)}\n\nDocumentos:\n${JSON.stringify(docs, null, 2)}\n\nGere a análise.` },
        ],
      }),
    });
    if (!aiResp.ok) throw new Error(`AI ${aiResp.status}: ${(await aiResp.text()).slice(0, 200)}`);
    const conteudo = (await aiResp.json())?.choices?.[0]?.message?.content ?? "";

    await admin.from("ia_analises_cliente").insert({
      cliente_id, tipo: "analise_inicial", conteudo, modelo: "google/gemini-3-flash-preview",
    });

    const destino = (cliente as any).advogado_responsavel_id;
    if (destino) {
      await admin.from("notificacoes").insert({
        user_id: destino,
        tipo: "analise_cliente",
        titulo: `🔍 Análise IA: ${cliente.nome}`,
        descricao: "Benefícios cabíveis e documentos necessários identificados.",
        link: `/clientes/${cliente_id}`,
      });
    } else {
      const { data: gestores } = await admin.from("user_roles").select("user_id").eq("role", "gestor");
      if (gestores?.length) {
        await admin.from("notificacoes").insert(gestores.map((g: any) => ({
          user_id: g.user_id, tipo: "analise_cliente",
          titulo: `🔍 Análise IA: ${cliente.nome}`,
          descricao: "Análise inicial gerada.", link: `/clientes/${cliente_id}`,
        })));
      }
    }

    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-analise-novo-cliente", status: "sucesso", detalhes: { cliente_id },
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ia-analise-novo-cliente]", msg);
    await admin.from("ia_execucoes_log").insert({
      funcao: "ia-analise-novo-cliente", status: "erro", erro: msg,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
