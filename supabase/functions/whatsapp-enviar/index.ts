import { createClient } from "npm:@supabase/supabase-js@2";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const chavePublica = () => {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    if (keys.default) return keys.default as string;
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return resposta({ error: "Método não permitido." }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return resposta({ error: "Sessão obrigatória." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = chavePublica();
  if (!supabaseUrl || !publicKey) return resposta({ error: "Servidor não configurado." }, 503);

  const db = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenUsuario = authorization.slice("Bearer ".length);
  const { data: usuario, error: erroUsuario } = await db.auth.getUser(tokenUsuario);
  if (erroUsuario || !usuario.user) return resposta({ error: "Sessão inválida." }, 401);

  let body: { conversa_id?: string; texto?: string };
  try {
    body = await request.json();
  } catch {
    return resposta({ error: "Corpo inválido." }, 400);
  }

  const conversaId = body.conversa_id?.trim();
  const texto = body.texto?.trim();
  if (!conversaId || !texto) return resposta({ error: "Conversa e mensagem são obrigatórias." }, 400);
  if (texto.length > 4096) return resposta({ error: "A mensagem ultrapassa 4.096 caracteres." }, 400);

  const { data: conversa, error: erroConversa } = await db
    .from("whatsapp_conversas")
    .select("id,telefone,conexao_id,whatsapp_conexoes!inner(phone_number_id,status,ativo)")
    .eq("id", conversaId)
    .single();

  if (erroConversa || !conversa) return resposta({ error: "Conversa não encontrada ou sem permissão." }, 404);

  const conexao = Array.isArray(conversa.whatsapp_conexoes)
    ? conversa.whatsapp_conexoes[0]
    : conversa.whatsapp_conexoes;

  if (!conexao?.ativo || conexao.status !== "conectado" || !conexao.phone_number_id) {
    return resposta({ error: "O canal oficial não está conectado." }, 409);
  }

  const { data: ultimaEntrada, error: erroJanela } = await db
    .from("whatsapp_mensagens")
    .select("ocorrida_em")
    .eq("conversa_id", conversa.id)
    .eq("direcao", "entrada")
    .order("ocorrida_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroJanela) return resposta({ error: "Não foi possível validar a janela de atendimento." }, 500);
  const entradaEm = ultimaEntrada?.ocorrida_em ? new Date(ultimaEntrada.ocorrida_em).getTime() : 0;
  if (!entradaEm || Date.now() - entradaEm > 24 * 60 * 60 * 1000) {
    return resposta({
      error: "A janela de 24 horas está encerrada. Use um template aprovado pela Meta para retomar o contato.",
      codigo: "JANELA_24H_ENCERRADA",
    }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) {
    return resposta({ error: "As credenciais oficiais ainda não foram configuradas." }, 503);
  }

  const { data: mensagem, error: erroInsert } = await db
    .from("whatsapp_mensagens")
    .insert({
      conversa_id: conversa.id,
      direcao: "saida",
      tipo: "texto",
      conteudo: texto,
      status: "pendente",
      enviada_por: usuario.user.id,
      ocorrida_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert || !mensagem) {
    return resposta({ error: "Não foi possível registrar a mensagem." }, 500);
  }

  try {
    const envio = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: conversa.telefone.replace(/\D/g, ""),
          type: "text",
          text: { preview_url: false, body: texto },
        }),
      },
    );

    const resultado = await envio.json();
    if (!envio.ok) {
      await db.from("whatsapp_mensagens")
        .update({ status: "falha" })
        .eq("id", mensagem.id);
      console.error("Falha sanitizada no envio WhatsApp:", envio.status);
      return resposta({ error: "A Meta recusou o envio. Consulte a conexão do canal." }, 502);
    }

    const providerMessageId = resultado?.messages?.[0]?.id || null;
    const { error: erroUpdate } = await db
      .from("whatsapp_mensagens")
      .update({ provider_message_id: providerMessageId, status: "enviada" })
      .eq("id", mensagem.id);

    if (erroUpdate) throw erroUpdate;

    return resposta({ enviada: true, mensagem_id: mensagem.id });
  } catch (error) {
    await db.from("whatsapp_mensagens")
      .update({ status: "falha" })
      .eq("id", mensagem.id);
    console.error("Falha sanitizada no envio WhatsApp:", error instanceof Error ? error.message : "erro desconhecido");
    return resposta({ error: "Falha temporária ao enviar a mensagem." }, 502);
  }
});
