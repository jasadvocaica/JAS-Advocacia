import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
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

const hostPermitido = (host: string) =>
  ["facebook.com", "fbsbx.com", "fbcdn.net"].some(
    (dominio) => host === dominio || host.endsWith(`.${dominio}`),
  );

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sessão obrigatória." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = chavePublica();
  if (!supabaseUrl || !publicKey) return json({ error: "Servidor não configurado." }, 503);

  const db = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usuario, error: erroUsuario } = await db.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (erroUsuario || !usuario.user) return json({ error: "Sessão inválida." }, 401);

  let body: { mensagem_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corpo inválido." }, 400);
  }
  if (!body.mensagem_id) return json({ error: "Mensagem obrigatória." }, 400);

  const { data: mensagem, error } = await db
    .from("whatsapp_mensagens")
    .select("id,provider_media_id,mime_type,nome_arquivo")
    .eq("id", body.mensagem_id)
    .single();
  if (error || !mensagem?.provider_media_id) {
    return json({ error: "Mídia não encontrada ou sem permissão." }, 404);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) {
    return json({ error: "As credenciais oficiais ainda não foram configuradas." }, 503);
  }

  try {
    const metaResponse = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(mensagem.provider_media_id)}`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!metaResponse.ok) return json({ error: "A Meta não liberou esta mídia." }, 502);
    const meta = await metaResponse.json();
    if (!meta?.url) return json({ error: "A Meta não retornou a mídia." }, 502);

    const url = new URL(meta.url);
    if (url.protocol !== "https:" || !hostPermitido(url.hostname.toLowerCase())) {
      return json({ error: "Endereço de mídia recusado por segurança." }, 502);
    }
    const tamanhoInformado = Number(meta.file_size || 0);
    if (tamanhoInformado > 25 * 1024 * 1024) {
      return json({ error: "A mídia ultrapassa o limite de 25 MB." }, 413);
    }

    const arquivoResponse = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: "error",
    });
    if (!arquivoResponse.ok) return json({ error: "Não foi possível baixar a mídia." }, 502);
    const arquivo = await arquivoResponse.arrayBuffer();
    if (arquivo.byteLength > 25 * 1024 * 1024) {
      return json({ error: "A mídia ultrapassa o limite de 25 MB." }, 413);
    }

    const mimeCandidato = String(meta.mime_type || mensagem.mime_type || "");
    const mime = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeCandidato)
      ? mimeCandidato
      : "application/octet-stream";
    const nome = String(mensagem.nome_arquivo || "anexo-whatsapp")
      .replace(/[\\"\r\n]/g, "_")
      .slice(0, 240);

    return new Response(arquivo, {
      status: 200,
      headers: {
        ...cors,
        "content-type": mime,
        "content-length": String(arquivo.byteLength),
        "content-disposition": `attachment; filename="${nome}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (erro) {
    console.error("Falha sanitizada ao obter mídia:", erro instanceof Error ? erro.message : "erro");
    return json({ error: "Falha temporária ao obter a mídia." }, 502);
  }
});
