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

  const { data: gestor, error: erroGestor } = await db.rpc("is_gestor", { _user_id: usuario.user.id });
  if (erroGestor || !gestor) return resposta({ error: "Somente gestores podem homologar o canal." }, 403);

  const { data: conexao, error: erroConexao } = await db
    .from("whatsapp_conexoes")
    .select("id,phone_number_id,business_account_id,ativo")
    .eq("ativo", true)
    .maybeSingle();
  if (erroConexao || !conexao) return resposta({ error: "Cadastre um canal ativo antes da homologação." }, 404);
  if (!conexao.phone_number_id || !conexao.business_account_id) {
    return resposta({ error: "Informe o Phone Number ID e o Business Account ID." }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") || "";
  const appSecret = Deno.env.get("META_APP_SECRET") || "";
  if (!accessToken || !graphVersion || !verifyToken || !appSecret) {
    return resposta({ error: "Os segredos oficiais ainda não estão completos no servidor." }, 503);
  }

  try {
    const headers = { authorization: `Bearer ${accessToken}` };
    const [numeroResponse, inscricaoResponse] = await Promise.all([
      fetch(
        `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}?fields=id,display_phone_number,verified_name,quality_rating`,
        { headers },
      ),
      fetch(
        `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.business_account_id)}/subscribed_apps`,
        { headers },
      ),
    ]);

    if (!numeroResponse.ok) {
      await db.from("whatsapp_conexoes").update({
        status: "erro",
        erro_ultima_sincronizacao: "A Meta não reconheceu o número ou a credencial.",
        atualizado_em: new Date().toISOString(),
      }).eq("id", conexao.id);
      return resposta({ error: "A Meta não reconheceu o Phone Number ID ou a credencial." }, 502);
    }
    const numero = await numeroResponse.json();
    if (String(numero?.id || "") !== String(conexao.phone_number_id)) {
      return resposta({ error: "O número retornado pela Meta não corresponde ao canal cadastrado." }, 409);
    }

    if (!inscricaoResponse.ok) {
      return resposta({ error: "Não foi possível verificar a inscrição do webhook na conta empresarial." }, 502);
    }
    const inscricao = await inscricaoResponse.json();
    if (!Array.isArray(inscricao?.data) || inscricao.data.length === 0) {
      await db.from("whatsapp_conexoes").update({
        status: "configurando",
        erro_ultima_sincronizacao: "O aplicativo ainda não está inscrito nos webhooks desta conta.",
        atualizado_em: new Date().toISOString(),
      }).eq("id", conexao.id);
      return resposta({ error: "O aplicativo ainda não está inscrito nos webhooks desta conta." }, 409);
    }

    const agora = new Date().toISOString();
    const { error: erroUpdate } = await db.from("whatsapp_conexoes").update({
      status: "conectado",
      numero_exibicao: numero.display_phone_number || null,
      ultima_sincronizacao_em: agora,
      erro_ultima_sincronizacao: null,
      atualizado_em: agora,
    }).eq("id", conexao.id);
    if (erroUpdate) return resposta({ error: "A validação passou, mas o status não pôde ser atualizado." }, 500);

    return resposta({
      homologado: true,
      numero_exibicao: numero.display_phone_number || null,
      nome_verificado: numero.verified_name || null,
      qualidade: numero.quality_rating || null,
    });
  } catch (erro) {
    console.error("Falha sanitizada na homologação WhatsApp:", erro instanceof Error ? erro.message : "erro");
    return resposta({ error: "Falha temporária ao consultar a Meta." }, 502);
  }
});
