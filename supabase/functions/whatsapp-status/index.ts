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
  if (request.method !== "GET" && request.method !== "POST") {
    return resposta({ error: "Método não permitido." }, 405);
  }

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

  const { data: conexao, error } = await db
    .from("whatsapp_conexoes")
    .select("id,phone_number_id,business_account_id,status,ativo")
    .eq("ativo", true)
    .maybeSingle();
  if (error) return resposta({ error: "Não foi possível verificar o canal." }, 500);

  const identificadores = Boolean(conexao?.phone_number_id && conexao?.business_account_id);
  const token = Boolean(Deno.env.get("META_WHATSAPP_ACCESS_TOKEN"));
  const verificacao = Boolean(Deno.env.get("META_WHATSAPP_VERIFY_TOKEN"));
  const segredoApp = Boolean(Deno.env.get("META_APP_SECRET"));
  const graphVersion = Boolean(Deno.env.get("META_WHATSAPP_GRAPH_VERSION"));
  const segredos = token && verificacao && segredoApp && graphVersion;
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

  return resposta({
    canal_cadastrado: Boolean(conexao),
    identificadores_configurados: identificadores,
    segredos_configurados: segredos,
    webhook_url: webhookUrl,
    webhook_pronto: identificadores && segredos,
    canal_conectado: conexao?.status === "conectado",
    pendencias_segredos: {
      access_token: !token,
      verify_token: !verificacao,
      app_secret: !segredoApp,
      graph_version: !graphVersion,
    },
  });
});
