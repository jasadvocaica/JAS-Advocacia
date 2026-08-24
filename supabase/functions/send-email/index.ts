import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  para: string | string[];
  assunto: string;
  corpo_html?: string;
  corpo_texto?: string;
  conteudo?: string; // shortcut: HTML do bloco interno (será embrulhado no template base)
  evento?: string;
  override_api_key?: string; // apenas para o botão "Testar configuração"
}

const TEMPLATE_BASE = (conteudo: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
body{font-family:Georgia,'Times New Roman',serif;margin:0;padding:0;background:#f1ece4;color:#1c1c1c}
.container{max-width:580px;margin:40px auto;background:#fff;border:1px solid #e6dfd2}
.header{padding:36px 40px 24px;border-bottom:1px solid #ece5d6;text-align:center}
.brand{font-size:11px;letter-spacing:3px;color:#BC943F;text-transform:uppercase;margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600}
.header h1{color:#010423;font-size:22px;margin:0;font-weight:400;letter-spacing:0.5px}
.header .sub{color:#7a7062;font-size:12px;margin:6px 0 0;font-style:italic}
.rule{width:36px;height:2px;background:#BC943F;margin:18px auto 0}
.body{padding:32px 40px}
.body h2{font-size:18px;color:#010423;margin:0 0 16px;font-weight:500;letter-spacing:0.2px}
.body p{font-size:14.5px;color:#3a3a3a;line-height:1.7;margin:0 0 14px}
.highlight{background:#faf5ec;border-left:2px solid #BC943F;padding:14px 18px;margin:18px 0;font-size:13.5px;color:#5a4a2a;line-height:1.6}
.btn{display:inline-block;background:#010423;color:#fff !important;padding:11px 22px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;margin-top:10px}
.footer{padding:20px 40px 28px;font-size:11px;color:#9a9388;text-align:center;border-top:1px solid #ece5d6;background:#fbf8f3;line-height:1.6}
.footer strong{color:#7a7062;font-weight:500}
</style></head>
<body><div class="container">
<div class="header">
  <p class="brand">Juliana Araújo · Advocacia</p>
  <h1>Dra. Juliana Araújo da Silva</h1>
  <p class="sub">OAB/MT 34.182</p>
  <div class="rule"></div>
</div>
<div class="body">${conteudo}</div>
<div class="footer"><strong>Juliana Araújo Advocacia</strong><br>Primavera do Leste · Mato Grosso<br>Mensagem automática — não responda este endereço.</div>
</div></body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Autenticação obrigatória
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const payload = (await req.json()) as Payload;
    const { para, assunto, evento } = payload;

    if (!para || !assunto || (!payload.corpo_html && !payload.corpo_texto && !payload.conteudo)) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: para, assunto, corpo_html|corpo_texto|conteudo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // override_api_key restrito a gestores (evita abuso de relay)
    if (payload.override_api_key) {
      const { data: ehGestor } = await supabase.rpc("is_gestor", { _user_id: user.id });
      if (!ehGestor) {
        return new Response(JSON.stringify({ error: "Apenas gestores podem usar override_api_key" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: cfgRows } = await supabase
      .from("configuracoes_sistema")
      .select("chave, valor")
      .eq("secao", "email")
      .in("chave", ["remetente_nome", "remetente_endereco", "ativo"]);

    const cfg = Object.fromEntries((cfgRows ?? []).map((c: any) => [c.chave, c.valor]));
    const remetenteNome = cfg.remetente_nome || "LegisFlow";
    const remetenteEndereco = cfg.remetente_endereco || "onboarding@resend.dev";
    const ativo = cfg.ativo === "true";

    if (!ativo && !payload.override_api_key) {
      return new Response(JSON.stringify({ error: "Envio de email desativado. Configure em /configuracoes/email." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = payload.override_api_key || Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada nos secrets do projeto." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = payload.corpo_html ?? (payload.conteudo ? TEMPLATE_BASE(payload.conteudo) : undefined);
    const destinatarios = Array.isArray(para) ? para : [para];

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${remetenteNome} <${remetenteEndereco}>`,
        to: destinatarios,
        subject: assunto,
        html,
        text: payload.corpo_texto,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      await supabase.from("email_log").insert({
        destinatario: destinatarios.join(", "),
        assunto,
        evento,
        status: "erro",
        erro: typeof data?.message === "string" ? data.message : JSON.stringify(data),
      });
      return new Response(JSON.stringify({ error: data?.message ?? "Falha ao enviar via Resend", detalhes: data }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("email_log").insert({
      destinatario: destinatarios.join(", "),
      assunto,
      evento,
      status: "enviado",
      resend_id: data?.id ?? null,
    });

    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-email error", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
