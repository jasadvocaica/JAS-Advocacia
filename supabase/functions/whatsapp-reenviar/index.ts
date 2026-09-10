import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const chavePublica = () => {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    if (keys.default) return keys.default as string;
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
};
const tipoMeta = (tipo: string) => ({
  imagem: "image",
  image: "image",
  documento: "document",
  document: "document",
  audio: "audio",
  video: "video",
}[tipo] || null);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return resposta({ error: "Método não permitido." }, 405);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return resposta({ error: "Sessão obrigatória." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = chavePublica();
  if (!supabaseUrl || !publicKey) return resposta({ error: "Servidor não configurado." }, 503);
  const db = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario, error: erroUsuario } = await db.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (erroUsuario || !usuario.user) return resposta({ error: "Sessão inválida." }, 401);

  let body: { mensagem_id?: string };
  try {
    body = await request.json();
  } catch {
    return resposta({ error: "Corpo inválido." }, 400);
  }
  const mensagemId = body.mensagem_id?.trim();
  if (!mensagemId) return resposta({ error: "Mensagem obrigatória." }, 400);

  const { data: original, error: erroOriginal } = await db
    .from("whatsapp_mensagens")
    .select("id,conversa_id,direcao,tipo,conteudo,status,provider_media_id,mime_type,nome_arquivo,whatsapp_conversas!inner(id,telefone,opt_out_em,whatsapp_conexoes!inner(phone_number_id,status,ativo))")
    .eq("id", mensagemId)
    .single();
  if (erroOriginal || !original) return resposta({ error: "Mensagem não encontrada ou sem permissão." }, 404);
  if (original.direcao !== "saida" || original.status !== "falha") {
    return resposta({ error: "Somente mensagens enviadas com falha podem ser reenviadas." }, 409);
  }
  if (original.tipo === "template") {
    return resposta({ error: "Templates devem ser reenviados pelo seletor para validar novamente os parâmetros." }, 409);
  }

  const conversa = Array.isArray(original.whatsapp_conversas)
    ? original.whatsapp_conversas[0]
    : original.whatsapp_conversas;
  if (conversa?.opt_out_em) return resposta({ error: "Este contato solicitou o descadastro. O reenvio está bloqueado." }, 409);\n\n  const conexao = Array.isArray(conversa?.whatsapp_conexoes)
    ? conversa.whatsapp_conexoes[0]
    : conversa?.whatsapp_conexoes;
  if (!conexao?.ativo || conexao.status !== "conectado" || !conexao.phone_number_id) {
    return resposta({ error: "O canal oficial não está conectado." }, 409);
  }

  const { data: ultimaEntrada, error: erroJanela } = await db
    .from("whatsapp_mensagens")
    .select("ocorrida_em")
    .eq("conversa_id", original.conversa_id)
    .eq("direcao", "entrada")
    .order("ocorrida_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroJanela) return resposta({ error: "Não foi possível validar a janela de atendimento." }, 500);
  const entradaEm = ultimaEntrada?.ocorrida_em ? new Date(ultimaEntrada.ocorrida_em).getTime() : 0;
  if (!entradaEm || Date.now() - entradaEm > 24 * 60 * 60 * 1000) {
    return resposta({ error: "A janela de 24 horas está encerrada. Retome com um template aprovado." }, 409);
  }

  const tipoMidia = tipoMeta(original.tipo);
  if (!tipoMidia && (!original.conteudo || original.tipo !== "texto")) {
    return resposta({ error: "Este tipo de mensagem não permite reenvio automático." }, 409);
  }
  if (tipoMidia && !original.provider_media_id) {
    return resposta({ error: "O anexo precisa ser selecionado novamente." }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) {
    return resposta({ error: "As credenciais oficiais ainda não foram configuradas." }, 503);
  }

  const { data: nova, error: erroInsert } = await db
    .from("whatsapp_mensagens")
    .insert({
      conversa_id: original.conversa_id,
      direcao: "saida",
      tipo: original.tipo,
      conteudo: original.conteudo,
      status: "pendente",
      enviada_por: usuario.user.id,
      ocorrida_em: new Date().toISOString(),
      provider_media_id: original.provider_media_id,
      mime_type: original.mime_type,
      nome_arquivo: original.nome_arquivo,
      reenvio_de: original.id,
    })
    .select("id")
    .single();
  if (erroInsert || !nova) {
    if (String(erroInsert?.code || "") === "23505") {
      return resposta({ error: "Esta tentativa já foi reenviada." }, 409);
    }
    return resposta({ error: "Não foi possível registrar a nova tentativa." }, 500);
  }

  try {
    const payload = tipoMidia
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: conversa.telefone.replace(/\D/g, ""),
          type: tipoMidia,
          [tipoMidia]: tipoMidia === "document"
            ? { id: original.provider_media_id, filename: original.nome_arquivo || "anexo-whatsapp" }
            : { id: original.provider_media_id },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: conversa.telefone.replace(/\D/g, ""),
          type: "text",
          text: { preview_url: false, body: original.conteudo },
        };
    const envio = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}/messages`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const resultado = await envio.json();
    if (!envio.ok) {
      await db.from("whatsapp_mensagens").update({ status: "falha" }).eq("id", nova.id);
      console.error("Falha sanitizada no reenvio WhatsApp:", envio.status);
      return resposta({ error: "A Meta recusou a nova tentativa." }, 502);
    }
    await db.from("whatsapp_mensagens").update({
      provider_message_id: resultado?.messages?.[0]?.id || null,
      status: "enviada",
    }).eq("id", nova.id);
    return resposta({ reenviada: true, mensagem_id: nova.id });
  } catch (erro) {
    await db.from("whatsapp_mensagens").update({ status: "falha" }).eq("id", nova.id);
    console.error("Falha sanitizada no reenvio:", erro instanceof Error ? erro.message : "erro");
    return resposta({ error: "Falha temporária ao reenviar a mensagem." }, 502);
  }
});
