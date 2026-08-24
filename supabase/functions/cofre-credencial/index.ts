// Edge Function: cofre-credencial
// Criptografa/descriptografa senhas do cofre usando AES-256-GCM
// Operações: "encrypt" | "decrypt"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RAW_KEY = Deno.env.get("COFRE_ENCRYPTION_KEY")!;

// Deriva uma chave AES-256 a partir da string do secret (SHA-256)
async function getAesKey(): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(RAW_KEY);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return await crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (const v of b) s += String.fromCharCode(v);
  return btoa(s);
}
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptText(plain: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return bytesToB64(combined);
}

async function decryptText(b64: string): Promise<string> {
  const key = await getAesKey();
  const data = b64ToBytes(b64);
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action: "encrypt" | "decrypt" = body.action;

    if (action === "encrypt") {
      const plain: string = body.plain;
      if (typeof plain !== "string" || plain.length === 0) {
        return new Response(JSON.stringify({ error: "plain inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cipher = await encryptText(plain);
      return new Response(JSON.stringify({ cipher }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decrypt") {
      const credencialId: string = body.credencial_id;
      if (!credencialId) {
        return new Response(JSON.stringify({ error: "credencial_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Carrega a credencial respeitando RLS do usuário
      const { data: row, error: rowErr } = await userClient
        .from("cliente_credenciais")
        .select("id, senha_cifrada")
        .eq("id", credencialId)
        .maybeSingle();
      if (rowErr || !row) {
        return new Response(JSON.stringify({ error: "Credencial não encontrada ou sem acesso" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const plain = await decryptText(row.senha_cifrada);

      // Auditoria: log de acesso (com service-role para não falhar)
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);
      await adminClient.from("cliente_credenciais_acesso_log").insert({
        credencial_id: credencialId,
        user_id: user.id,
        acao: "visualizar",
      });

      return new Response(JSON.stringify({ plain }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cofre-credencial error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
