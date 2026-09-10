import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json; charset=utf-8" },
  });

const chavePublica = () => {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    if (keys.default) return keys.default as string;
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
};

const tipoWhatsApp = (mime: string) => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
};

const mimePermitido = (mime: string) =>
  /^(image\/(jpeg|png|webp)|audio\/(aac|amr|mpeg|mp4|ogg|opus)|video\/(mp4|3gpp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.presentationml\.presentation)|text\/plain)$/i.test(mime);

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return resposta({ error: "Envie o anexo como formulário." }, 400);
  }
  const conversaId = String(form.get("conversa_id") || "").trim();
  const arquivo = form.get("arquivo");
  if (!conversaId || !(arquivo instanceof File)) {
    return resposta({ error: "Conversa e arquivo são obrigatórios." }, 400);
  }
  if (!arquivo.size || arquivo.size > 16 * 1024 * 1024) {
    return resposta({ error: "O anexo deve ter no máximo 16 MB." }, 413);
  }
  const mime = arquivo.type.toLowerCase();
  if (!mimePermitido(mime)) return resposta({ error: "Formato de arquivo não permitido." }, 415);

  const { data: conversa, error: erroConversa } = await db
    .from("whatsapp_conversas")
    .select("id,telefone,conexao_id,opt_out_em,whatsapp_conexoes!inner(phone_number_id,status,ativo)")
    .eq("id", conversaId)
    .single();
  if (erroConversa || !conversa) return resposta({ error: "Conversa não encontrada ou sem permissão." }, 404);

  if (conversa.opt_out_em) return resposta({ error: "Este contato solicitou o descadastro. Novos envios estão bloqueados." }, 409);\n\n  const conexao = Array.isArray(conversa.whatsapp_conexoes)
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
    return resposta({ error: "A janela de 24 horas está encerrada. Retome com um template aprovado." }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) {
    return resposta({ error: "As credenciais oficiais ainda não foram configuradas." }, 503);
  }

  try {
    const uploadForm = new FormData();
    uploadForm.set("messaging_product", "whatsapp");
    uploadForm.set("type", mime);
    uploadForm.set("file", arquivo, arquivo.name);
    const upload = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}/media`,
      { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: uploadForm },
    );
    const uploadResultado = await upload.json();
    if (!upload.ok || !uploadResultado?.id) {
      console.error("Falha sanitizada no upload WhatsApp:", upload.status);
      return resposta({ error: "A Meta recusou o anexo. Verifique formato e conexão." }, 502);
    }

    const mediaId = String(uploadResultado.id);
    const tipo = tipoWhatsApp(mime);
    const nome = arquivo.name.replace(/[\\/"\r\n]/g, "_").slice(0, 240) || "anexo-whatsapp";
    const { data: mensagem, error: erroInsert } = await db
      .from("whatsapp_mensagens")
      .insert({
        conversa_id: conversa.id,
        direcao: "saida",
        tipo,
        conteudo: `[Anexo: ${nome}]`,
        status: "pendente",
        enviada_por: usuario.user.id,
        ocorrida_em: new Date().toISOString(),
        provider_media_id: mediaId,
        mime_type: mime,
        nome_arquivo: nome,
      })
      .select("id")
      .single();
    if (erroInsert || !mensagem) return resposta({ error: "Não foi possível registrar o anexo." }, 500);

    const mediaPayload = tipo === "document"
      ? { id: mediaId, filename: nome }
      : { id: mediaId };
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
          type: tipo,
          [tipo]: mediaPayload,
        }),
      },
    );
    const resultado = await envio.json();
    if (!envio.ok) {
      await db.from("whatsapp_mensagens").update({ status: "falha" }).eq("id", mensagem.id);
      console.error("Falha sanitizada no envio de mídia WhatsApp:", envio.status);
      return resposta({ error: "A Meta recusou o envio do anexo." }, 502);
    }
    const providerMessageId = resultado?.messages?.[0]?.id || null;
    await db.from("whatsapp_mensagens")
      .update({ provider_message_id: providerMessageId, status: "enviada" })
      .eq("id", mensagem.id);
    return resposta({ enviada: true, mensagem_id: mensagem.id });
  } catch (erro) {
    console.error("Falha sanitizada ao enviar mídia:", erro instanceof Error ? erro.message : "erro");
    return resposta({ error: "Falha temporária ao enviar o anexo." }, 502);
  }
});
