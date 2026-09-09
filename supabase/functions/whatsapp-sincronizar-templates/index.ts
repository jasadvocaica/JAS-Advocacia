import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const publicKey = () => {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    try { return JSON.parse(modern).default || ""; } catch { return ""; }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sessão obrigatória." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = publicKey();
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !adminKey) return json({ error: "Servidor não configurado." }, 503);

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: authData, error: authError } = await userDb.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

  const admin = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: role } = await admin.from("user_roles").select("role")
    .eq("user_id", authData.user.id).eq("role", "gestor").maybeSingle();
  if (!role) return json({ error: "Somente a gestão pode sincronizar templates." }, 403);

  const { data: conexao, error: erroConexao } = await admin.from("whatsapp_conexoes")
    .select("id,business_account_id,ativo").eq("ativo", true).maybeSingle();
  if (erroConexao || !conexao?.business_account_id) {
    return json({ error: "Informe a conta comercial da Meta antes de sincronizar." }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) return json({ error: "Credenciais oficiais ainda não configuradas." }, 503);

  const templates: any[] = [];
  let url: string | null =
    `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.business_account_id)}/message_templates?fields=id,name,status,category,language,components&limit=100`;

  try {
    while (url) {
      const respostaMeta = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      const payload = await respostaMeta.json();
      if (!respostaMeta.ok) {
        console.error("Falha sanitizada ao sincronizar templates:", respostaMeta.status);
        return json({ error: "A Meta recusou a sincronização. Verifique as credenciais e a conta comercial." }, 502);
      }
      templates.push(...(payload.data || []));
      const proxima = payload.paging?.next || null;
      url = typeof proxima === "string" && proxima.startsWith("https://graph.facebook.com/") ? proxima : null;
    }

    const sincronizadoEm = new Date().toISOString();
    await admin.from("whatsapp_templates").update({ presente_meta: false, sincronizado_em: sincronizadoEm })
      .eq("conexao_id", conexao.id);

    if (templates.length > 0) {
      const registros = templates.map((item) => ({
        conexao_id: conexao.id,
        provider_template_id: item.id || null,
        nome: item.name,
        idioma: item.language,
        categoria: item.category || null,
        status: item.status || "UNKNOWN",
        componentes: item.components || [],
        presente_meta: true,
        sincronizado_em: sincronizadoEm,
        atualizado_em: sincronizadoEm,
      }));
      const { error: erroUpsert } = await admin.from("whatsapp_templates")
        .upsert(registros, { onConflict: "conexao_id,nome,idioma" });
      if (erroUpsert) throw erroUpsert;
    }

    await admin.from("whatsapp_conexoes").update({
      ultima_sincronizacao_em: sincronizadoEm,
      erro_ultima_sincronizacao: null,
      atualizado_em: sincronizadoEm,
    }).eq("id", conexao.id);

    return json({
      sincronizados: templates.length,
      aprovados: templates.filter((item) => item.status === "APPROVED").length,
    });
  } catch (error) {
    console.error("Falha sanitizada na sincronização de templates:", error instanceof Error ? error.message : "erro desconhecido");
    return json({ error: "Falha temporária ao sincronizar os templates." }, 502);
  }
});
