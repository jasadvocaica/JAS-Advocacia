import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type,x-jas-worker-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers });
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096)
      return json({ error: "Requisição muito grande." }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Requisição inválida." }, 400);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (body.acao === "pulso") {
      const token = req.headers.get("x-jas-worker-token") ?? "";
      if (!uuid(body.worker_id) || !/^[0-9a-f]{64}$/.test(token))
        return json({ error: "Worker não autorizado." }, 401);
      const r = await db.rpc("escritorio_worker_pulso", {
        _id: body.worker_id,
        _hash: await hash(token),
        _versao: "jas-worker-1",
      });
      if (r.error || !r.data)
        return json({ error: "Worker não autorizado ou indisponível." }, 401);
      return json(r.data);
    }
    const auth = await db.auth.getUser(
      (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, ""),
    );
    if (auth.error || !auth.data.user)
      return json({ error: "Sessão inválida." }, 401);
    const user = auth.data.user.id;
    if (!["listar", "criar", "revogar"].includes(body.acao))
      return json({ error: "Ação inválida." }, 400);
    if (body.acao === "revogar" && !uuid(body.worker_id))
      return json({ error: "Worker inválido." }, 400);
    if (
      body.acao === "criar" &&
      (typeof body.nome !== "string" ||
        body.nome.trim().length < 1 ||
        body.nome.length > 80)
    )
      return json({ error: "Nome inválido." }, 400);
    const token =
      body.acao === "criar"
        ? Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        : null;
    const r = await db.rpc("escritorio_worker_gerir", {
      _usuario: user,
      _acao: body.acao,
      _nome: body.nome?.trim() ?? null,
      _hash: token ? await hash(token) : null,
      _id: body.worker_id ?? null,
    });
    if (r.error)
      return json({ error: "Conexão restrita a gestor ativo." }, 403);
    return json({ ...r.data, ...(token ? { token } : {}) });
  } catch {
    return json({ error: "Não foi possível processar a conexão." }, 400);
  }
});
