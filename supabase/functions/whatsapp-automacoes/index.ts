import { createClient } from "npm:@supabase/supabase-js@2";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return resposta({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const adminKey = serviceKey();
  const authorization = request.headers.get("authorization") || "";
  if (!supabaseUrl || !adminKey) return resposta({ error: "Servidor não configurado." }, 503);
  if (authorization !== `Bearer ${adminKey}`) return resposta({ error: "Não autorizado." }, 401);

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) return resposta({ error: "Credenciais oficiais não configuradas." }, 503);

  const db = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: fila, error: erroFila } = await db
    .from("mkt_automacao_execucoes")
    .select("id,automacao_id,lead_id,conversa_id,mkt_automacoes!inner(status,mensagem_template)")
    .eq("status", "pendente")
    .lte("agendada_para", new Date().toISOString())
    .order("agendada_para")
    .limit(20);

  if (erroFila) return resposta({ error: "Não foi possível consultar a fila." }, 500);

  const resultados: Array<{ id: string; status: string }> = [];
  for (const item of fila ?? []) {
    const automacao = Array.isArray(item.mkt_automacoes) ? item.mkt_automacoes[0] : item.mkt_automacoes;
    if (automacao?.status !== "ativa") {
      await db.from("mkt_automacao_execucoes").update({ status: "cancelada", erro_resumo: "Automação não está ativa." }).eq("id", item.id).eq("status", "pendente");
      resultados.push({ id: item.id, status: "cancelada" });
      continue;
    }

    const { data: reivindicada } = await db.from("mkt_automacao_execucoes")
      .update({ status: "processando" }).eq("id", item.id).eq("status", "pendente").select("id").maybeSingle();
    if (!reivindicada) continue;

    let conversaId = item.conversa_id as string | null;
    if (!conversaId && item.lead_id) {
      const { data: conversaLead } = await db.from("whatsapp_conversas")
        .select("id").eq("lead_id", item.lead_id).neq("status", "encerrada")
        .order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
      conversaId = conversaLead?.id || null;
    }

    if (!conversaId) {
      await db.from("mkt_automacao_execucoes").update({
        status: "falha", executada_em: new Date().toISOString(),
        erro_resumo: "Contato sem conversa oficial vinculada.",
      }).eq("id", item.id);
      resultados.push({ id: item.id, status: "falha" });
      continue;
    }

    const { data: conversa } = await db.from("whatsapp_conversas")
      .select("id,telefone,ultima_mensagem_em,conexao_id,whatsapp_conexoes!inner(phone_number_id,status,ativo)")
      .eq("id", conversaId).single();
    const conexao = Array.isArray(conversa?.whatsapp_conexoes) ? conversa.whatsapp_conexoes[0] : conversa?.whatsapp_conexoes;
    const ultima = conversa?.ultima_mensagem_em ? new Date(conversa.ultima_mensagem_em).getTime() : 0;
    const dentroDaJanela = ultima > 0 && Date.now() - ultima <= 24 * 60 * 60 * 1000;

    if (!conversa || !conexao?.ativo || conexao.status !== "conectado" || !conexao.phone_number_id || !dentroDaJanela) {
      await db.from("mkt_automacao_execucoes").update({
        status: "falha", executada_em: new Date().toISOString(),
        erro_resumo: dentroDaJanela ? "Canal oficial indisponível." : "Janela de 24 horas encerrada; exige template aprovado pela Meta.",
      }).eq("id", item.id);
      resultados.push({ id: item.id, status: "falha" });
      continue;
    }

    const texto = String(automacao.mensagem_template || "").trim();
    const { data: mensagem, error: erroMensagem } = await db.from("whatsapp_mensagens").insert({
      conversa_id: conversa.id, direcao: "saida", tipo: "texto", conteudo: texto,
      status: "pendente", ocorrida_em: new Date().toISOString(),
    }).select("id").single();

    if (erroMensagem || !mensagem) {
      await db.from("mkt_automacao_execucoes").update({
        status: "falha", executada_em: new Date().toISOString(), erro_resumo: "Falha ao registrar mensagem.",
      }).eq("id", item.id);
      resultados.push({ id: item.id, status: "falha" });
      continue;
    }

    try {
      const envio = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", recipient_type: "individual",
          to: conversa.telefone.replace(/\D/g, ""), type: "text",
          text: { preview_url: false, body: texto },
        }),
      });
      const resultado = await envio.json();
      if (!envio.ok) throw new Error(`Meta HTTP ${envio.status}`);
      const providerId = resultado?.messages?.[0]?.id || null;
      await db.from("whatsapp_mensagens").update({ status: "enviada", provider_message_id: providerId }).eq("id", mensagem.id);
      await db.from("mkt_automacao_execucoes").update({
        status: "sucesso", executada_em: new Date().toISOString(), provider_message_id: providerId, erro_resumo: null,
      }).eq("id", item.id);
      resultados.push({ id: item.id, status: "sucesso" });
    } catch (error) {
      await db.from("whatsapp_mensagens").update({ status: "falha" }).eq("id", mensagem.id);
      await db.from("mkt_automacao_execucoes").update({
        status: "falha", executada_em: new Date().toISOString(), erro_resumo: "A Meta recusou ou não concluiu o envio.",
      }).eq("id", item.id);
      console.error("Falha sanitizada na automação:", error instanceof Error ? error.message : "erro desconhecido");
      resultados.push({ id: item.id, status: "falha" });
    }
  }

  return resposta({ processadas: resultados.length, resultados });
});
