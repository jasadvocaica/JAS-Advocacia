import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await db.auth.getUser(
      (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, ""),
    );
    if (error || !data.user) return json({ error: "Sessão inválida." }, 401);
    const usuario = data.user.id;
    const checks = await Promise.all([
      db.rpc("is_interno_ativo", { _user_id: usuario }),
      db.rpc("is_gestor", { _user_id: usuario }),
      db.rpc("has_permission", {
        _user_id: usuario,
        _modulo: "clientes",
        _acao: "criar",
      }),
    ]);
    if (checks.some((c) => c.error || c.data !== true))
      return json(
        {
          error:
            "Acompanhamento restrito a gestor interno com permissão de cadastro.",
        },
        403,
      );
    // A identidade vem exclusivamente da sessão validada, nunca do corpo da requisição.
    const snapshot = await db.rpc("clara_m1_acompanhar", { _usuario: usuario });
    if (snapshot.error)
      return json(
        { error: "Não foi possível consultar o acompanhamento da Clara." },
        503,
      );
    return json(snapshot.data);
  } catch {
    return json({ error: "Acompanhamento temporariamente indisponível." }, 503);
  }
});
