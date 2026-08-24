// Edge Function: parceiro-portal
// Gera convite temporário (48h) para o parceiro acessar o portal futuro
// e consulta status do convite.
// Operações: "gerar-convite" | "status"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hash));
}

function gerarToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
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

    // Apenas gestor pode operar o portal
    const { data: rolesRows } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const ehGestor = (rolesRows ?? []).some((r: any) => r.role === "gestor");
    if (!ehGestor) {
      return new Response(JSON.stringify({ error: "Apenas gestor" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action: "gerar-convite" | "status" = body.action;
    const parceiroId: string = body.parceiro_id;

    if (!parceiroId || typeof parceiroId !== "string") {
      return new Response(JSON.stringify({ error: "parceiro_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "status") {
      const { data: p, error } = await adminClient
        .from("parceiros")
        .select("portal_ativo, portal_ultimo_acesso, portal_token_convite, portal_convite_expira_em")
        .eq("id", parceiroId)
        .maybeSingle();
      if (error || !p) {
        return new Response(JSON.stringify({ error: "Parceiro não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const expirado = p.portal_convite_expira_em
        ? new Date(p.portal_convite_expira_em) < new Date()
        : true;
      return new Response(JSON.stringify({
        portal_ativo: p.portal_ativo,
        portal_ultimo_acesso: p.portal_ultimo_acesso,
        tem_convite_ativo: !!p.portal_token_convite && !expirado,
        convite_expira_em: p.portal_convite_expira_em,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "gerar-convite") {
      const token = gerarToken();
      const tokenHash = await sha256Hex(token);
      const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const { error } = await adminClient
        .from("parceiros")
        .update({
          portal_token_convite: tokenHash,
          portal_convite_expira_em: expiraEm,
        })
        .eq("id", parceiroId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Link a ser enviado manualmente pelo gestor (portal ainda não implementado)
      const link = `${SUPABASE_URL.replace("https://", "https://portal-").split(".supabase.co")[0]}/ativar?token=${token}&pid=${parceiroId}`;

      return new Response(JSON.stringify({
        token,
        link_ativacao: link,
        expira_em: expiraEm,
        mensagem: "Convite gerado com validade de 48h. Envie o link manualmente ao parceiro.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "action inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parceiro-portal error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
