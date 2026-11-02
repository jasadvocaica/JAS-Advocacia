import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import {
  commitLegislacao,
  importarNorma,
} from "../_shared/importacao-legislacao.ts";
import { caminhoNorma } from "../_shared/legislacao.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    const token = req.headers.get("Authorization");
    if (!token?.startsWith("Bearer "))
      return json({ error: "Entre no sistema para importar normas." }, 401);
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false },
      },
    );
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token.slice(7));
    if (error || !user) return json({ error: "Sessão expirada." }, 401);
    const gestor = await client.rpc("is_gestor", { _user_id: user.id });
    if (gestor.error || !gestor.data)
      return json({ error: "Somente a gestão pode importar normas." }, 403);
    const raw = await req.text();
    if (raw.length > 6000) return json({ error: "Pedido muito extenso." }, 413);
    const body = JSON.parse(raw);
    if (body.acao !== "importar" || typeof body.caminho !== "string")
      return json({ error: "Informe o link da norma no repositório." }, 400);
    const path = caminhoNorma(body.caminho);
    const commit = await commitLegislacao();
    const resultado = await importarNorma(client, { path }, commit);
    return json({ ok: true, resultado, commit });
  } catch (e) {
    return json(
      {
        error:
          e instanceof Error ? e.message : "Não foi possível importar a norma.",
      },
      400,
    );
  }
});
