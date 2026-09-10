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

  let body: { conversa_id?: string };
  try {
    body = await request.json();
  } catch {
    return resposta({ error: "Corpo inválido." }, 400);
  }
  const conversaId = body.conversa_id?.trim();
  if (!conversaId) return resposta({ error: "Conversa obrigatória." }, 400);

  const { data: conversa, error: erroConversa } = await db
    .from("whatsapp_conversas")
    .select("id,nao_lidas,whatsapp_conexoes!inner(phone_number_id,status,ativo)")
    .eq("id", conversaId)
    .single();
  if (erroConversa || !conversa) return resposta({ error: "Conversa não encontrada ou sem permissão." }, 404);
  if (!conversa.nao_lidas) return resposta({ marcada: false, motivo: "sem_mensagens_novas" });

  const conexao = Array.isArray(conversa.whatsapp_conexoes)
    ? conversa.whatsapp_conexoes[0]
    : conversa.whatsapp_conexoes;
  if (!conexao?.ativo || conexao.status !== "conectado" || !conexao.phone_number_id) {
    return resposta({ error: "O canal oficial não está conectado." }, 409);
  }

  const { data: ultimaEntrada, error: erroMensagem } = await db
    .from("whatsapp_mensagens")
    .select("id,provider_message_id")
    .eq("conversa_id", conversa.id)
    .eq("direcao", "entrada")
    .not("provider_message_id", "is", null)
    .order("ocorrida_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroMensagem || !ultimaEntrada?.provider_message_id) {
    return resposta({ error: "A mensagem recebida ainda não possui identificador oficial." }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) {
    return resposta({ error: "As credenciais oficiais ainda não foram configuradas." }, 503);
  }

  try {
    const meta = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: ultimaEntrada.provider_message_id,
        }),
      },
    );
    if (!meta.ok) {
      console.error("Falha sanitizada ao marcar leitura WhatsApp:", meta.status);
      return resposta({ error: "A Meta não confirmou a leitura." }, 502);
    }

    const { error: erroUpdate } = await db
      .from("whatsapp_conversas")
      .update({ nao_lidas: 0, atualizado_em: new Date().toISOString() })
      .eq("id", conversa.id);
    if (erroUpdate) return resposta({ error: "A leitura foi confirmada, mas o contador não foi atualizado." }, 500);

    await db.from("whatsapp_mensagens")
      .update({ status: "lida" })
      .eq("conversa_id", conversa.id)
      .eq("direcao", "entrada")
      .neq("status", "lida");

    return resposta({ marcada: true });
  } catch (erro) {
    console.error("Falha sanitizada na confirmação de leitura:", erro instanceof Error ? erro.message : "erro");
    return resposta({ error: "Falha temporária ao confirmar a leitura." }, 502);
  }
});
