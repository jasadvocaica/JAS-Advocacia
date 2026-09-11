import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, any>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const secretKey = () => {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    if (keys.default) return keys.default as string;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");

const assinaturaValida = async (corpo: string, assinatura: string | null, segredo: string) => {
  if (!assinatura?.startsWith("sha256=") || !segredo) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(corpo)),
  );
  const esperado = `sha256=${hex(digest)}`;
  if (esperado.length !== assinatura.length) return false;

  let diferenca = 0;
  for (let indice = 0; indice < esperado.length; indice += 1) {
    diferenca |= esperado.charCodeAt(indice) ^ assinatura.charCodeAt(indice);
  }
  return diferenca === 0;
};

const textoErroSeguro = (valor: unknown, limite: number) =>
  String(valor || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(access[_ -]?token|authorization|bearer)\s*[:=]?\s*[^\s,;]+/gi, "$1 [protegido]")
    .replace(/https?:\/\/\S+/gi, "[endereço protegido]")
    .trim()
    .slice(0, limite) || null;

const normalizarNumero = (numero: string) => numero.replace(/\D/g, "");
const variantesNumero = (numero: string) => {
  const limpo = normalizarNumero(numero);
  return Array.from(new Set([limpo, limpo.startsWith("55") ? limpo.slice(2) : `55${limpo}`]));
};

const tipoMensagem = (message: Json) => {
  const permitidos = ["audio", "imagem", "documento", "video", "localizacao", "contato"];
  const mapeado: Record<string, string> = {
    image: "imagem",
    document: "documento",
    location: "localizacao",
    contacts: "contato",
  };
  const tipo = mapeado[message.type] || message.type || "texto";
  return permitidos.includes(tipo) ? tipo : "texto";
};

const metadadosMidia = (message: Json) => {
  const origem = message.image || message.document || message.audio || message.video || message.sticker;
  if (!origem?.id) return { provider_media_id: null, mime_type: null, nome_arquivo: null };
  const nomeOriginal = typeof origem.filename === "string" ? origem.filename : null;
  const nomeSeguro = nomeOriginal
    ? nomeOriginal.replace(/[\\/\0-\x1f\x7f]/g, "_").slice(0, 240)
    : null;
  return {
    provider_media_id: String(origem.id),
    mime_type: typeof origem.mime_type === "string" ? origem.mime_type.slice(0, 150) : null,
    nome_arquivo: nomeSeguro,
  };
};

const conteudoMensagem = (message: Json) => {
  if (message.type === "text") return message.text?.body || null;
  if (message.type === "button") return message.button?.text || null;
  if (message.type === "interactive") {
    return message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      "[resposta interativa]";
  }
  if (message.type === "image") return message.image?.caption || "[imagem]";
  if (message.type === "document") return message.document?.filename || "[documento]";
  if (message.type === "audio") return "[áudio]";
  if (message.type === "video") return message.video?.caption || "[vídeo]";
  if (message.type === "location") return "[localização]";
  if (message.type === "contacts") return "[contato]";
  return `[${message.type || "mensagem"}]`;
};

const termoOptOut = (conteudo: string | null) => {
  if (!conteudo) return null;
  const termo = conteudo.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z]/g, "").trim();
  return ["SAIR", "PARAR", "CANCELAR", "REMOVER", "DESCADASTRAR"].includes(termo)
    ? termo
    : null;
};

Deno.serve(async (request: Request) => {
  const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") || "";
  const appSecret = Deno.env.get("META_WHATSAPP_APP_SECRET") || "";

  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (!verifyToken) return json({ error: "Webhook ainda não configurado." }, 503);
    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return json({ error: "Verificação recusada." }, 403);
  }

  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (!appSecret) return json({ error: "Webhook ainda não configurado." }, 503);

  const rawBody = await request.text();
  const valida = await assinaturaValida(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    appSecret,
  );
  if (!valida) return json({ error: "Assinatura inválida." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const adminKey = secretKey();
  if (!supabaseUrl || !adminKey) return json({ error: "Servidor não configurado." }, 503);

  const db = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: Json;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const { data: conexao } = await db
          .from("whatsapp_conexoes")
          .select("id")
          .eq("phone_number_id", phoneNumberId)
          .eq("ativo", true)
          .maybeSingle();

        // A fila inicial usa somente a responsável explicitamente configurada.
        // Não existe fallback por cargo, ordem de cadastro ou UUID no código.
        const { data: configResponsavel } = await db
          .from("configuracoes_sistema")
          .select("valor")
          .eq("secao", "comercial")
          .eq("chave", "responsavel_comunicacao_user_id")
          .maybeSingle();

        let responsavelId: string | null = null;
        if (configResponsavel?.valor) {
          const { data: perfilResponsavel } = await db
            .from("profiles")
            .select("id")
            .eq("id", configResponsavel.valor)
            .eq("ativo", true)
            .eq("tipo_portal", "interno")
            .maybeSingle();
          responsavelId = perfilResponsavel?.id || null;
        }

        for (const statusEvento of value.statuses ?? []) {
          const eventoId = `${statusEvento.id}:status:${statusEvento.status}`;
          const { data: evento } = await db
            .from("whatsapp_webhook_eventos")
            .upsert({
              provedor: "meta",
              provedor_evento_id: eventoId,
              tipo: "status_mensagem",
              conexao_id: conexao?.id || null,
              status: conexao ? "processando" : "ignorado",
            }, { onConflict: "provedor,provedor_evento_id", ignoreDuplicates: true })
            .select("id")
            .maybeSingle();

          if (!evento || !conexao) continue;

          const mapaStatus: Record<string, string> = {
            sent: "enviada",
            delivered: "entregue",
            read: "lida",
            failed: "falha",
          };
          const novoStatus = mapaStatus[statusEvento.status];
          if (novoStatus) {
            const { data: mensagemAtual } = await db
              .from("whatsapp_mensagens")
              .select("id,status")
              .eq("provider_message_id", statusEvento.id)
              .maybeSingle();
            const ordem: Record<string, number> = {
              pendente: 0,
              enviada: 1,
              entregue: 2,
              lida: 3,
              falha: 4,
            };
            if (
              mensagemAtual &&
              (novoStatus === "falha" || (ordem[novoStatus] ?? 0) >= (ordem[mensagemAtual.status] ?? 0))
            ) {
              const erroMeta = statusEvento.errors?.[0] || null;
              await db
                .from("whatsapp_mensagens")
                .update({
                  status: novoStatus,
                  erro_codigo: novoStatus === "falha" ? textoErroSeguro(erroMeta?.code, 80) : null,
                  erro_titulo: novoStatus === "falha" ? textoErroSeguro(erroMeta?.title || erroMeta?.message, 180) : null,
                  erro_detalhe: novoStatus === "falha"
                    ? textoErroSeguro(erroMeta?.error_data?.details, 500)
                    : null,
                })
                .eq("id", mensagemAtual.id);
            }
          }
          await db
            .from("whatsapp_webhook_eventos")
            .update({ status: "processado", processado_em: new Date().toISOString() })
            .eq("id", evento.id);
        }

        const nomePerfil = value.contacts?.[0]?.profile?.name || null;
        for (const message of value.messages ?? []) {
          const { data: evento } = await db
            .from("whatsapp_webhook_eventos")
            .upsert({
              provedor: "meta",
              provedor_evento_id: message.id,
              tipo: "mensagem_recebida",
              conexao_id: conexao?.id || null,
              status: conexao ? "processando" : "ignorado",
            }, { onConflict: "provedor,provedor_evento_id", ignoreDuplicates: true })
            .select("id")
            .maybeSingle();

          if (!evento || !conexao) continue;

          const telefone = normalizarNumero(message.from || "");
          if (!telefone) {
            await db.from("whatsapp_webhook_eventos")
              .update({ status: "ignorado", processado_em: new Date().toISOString() })
              .eq("id", evento.id);
            continue;
          }

          const variantes = variantesNumero(telefone);
          const { data: cliente } = await db
            .from("clientes")
            .select("id,nome")
            .in("whatsapp_normalizado", variantes)
            .limit(1)
            .maybeSingle();

          const { data: lead } = await db
            .from("mkt_leads")
            .select("id,nome")
            .in("whatsapp_normalizado", variantes)
            .limit(1)
            .maybeSingle();

          let { data: conversa } = await db
            .from("whatsapp_conversas")
            .select("id")
            .eq("conexao_id", conexao.id)
            .eq("telefone_normalizado", telefone)
            .neq("status", "encerrada")
            .maybeSingle();

          if (!conversa) {
            const criada = await db
              .from("whatsapp_conversas")
              .insert({
                conexao_id: conexao.id,
                cliente_id: cliente?.id || null,
                lead_id: cliente ? null : lead?.id,
                telefone,
                nome_contato: cliente?.nome || lead?.nome || nomePerfil || telefone,
                status: "aguardando_escritorio",
                responsavel_id: responsavelId,
              })
              .select("id")
              .single();
            if (criada.error) throw criada.error;
            conversa = criada.data;
          }

          const ocorridaEm = message.timestamp
            ? new Date(Number(message.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          const midia = metadadosMidia(message);
          const conteudo = conteudoMensagem(message);
          const inserida = await db.from("whatsapp_mensagens").upsert({
            conversa_id: conversa.id,
            provider_message_id: message.id,
            direcao: "entrada",
            tipo: tipoMensagem(message),
            conteudo,
            provider_media_id: midia.provider_media_id,
            mime_type: midia.mime_type,
            nome_arquivo: midia.nome_arquivo,
            status: "recebida",
            ocorrida_em: ocorridaEm,
          }, { onConflict: "provider_message_id", ignoreDuplicates: true })
            .select("id")
            .maybeSingle();

          if (inserida.error) throw inserida.error;

          const termoRevogacao = termoOptOut(conteudo);
          if (termoRevogacao && inserida.data?.id) {
            await db.from("whatsapp_conversas").update({
              opt_out_em: ocorridaEm,
              opt_out_termo: termoRevogacao,
              opt_out_mensagem_id: inserida.data.id,
              atualizado_em: new Date().toISOString(),
            }).eq("id", conversa.id);
            await db.from("whatsapp_contatos_bloqueados").upsert({
              telefone_normalizado: telefone,
              revogado_em: ocorridaEm,
              termo: termoRevogacao,
              conversa_origem_id: conversa.id,
              mensagem_origem_id: inserida.data.id,
              restaurado_em: null,
              restaurado_por: null,
              atualizado_em: new Date().toISOString(),
            }, { onConflict: "telefone_normalizado" });
            await db.from("whatsapp_consentimento_eventos").insert({
              conversa_id: conversa.id,
              tipo: "revogado",
              origem: "mensagem_cliente",
              termo: termoRevogacao,
              mensagem_id: inserida.data.id,
            });
          }

          await db
            .from("whatsapp_webhook_eventos")
            .update({ status: "processado", tentativas: 1, processado_em: new Date().toISOString() })
            .eq("id", evento.id);
        }

        if (conexao) {
          await db.from("whatsapp_conexoes").update({
            status: "conectado",
            ultima_sincronizacao_em: new Date().toISOString(),
            erro_ultima_sincronizacao: null,
            atualizado_em: new Date().toISOString(),
          }).eq("id", conexao.id);
        }
      }
    }

    return json({ recebido: true });
  } catch (error) {
    console.error("Falha sanitizada no webhook WhatsApp:", error instanceof Error ? error.message : "erro desconhecido");
    return json({ error: "Falha ao processar evento." }, 500);
  }
});
