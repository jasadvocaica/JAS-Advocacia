import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEMPLATE_BASE = (conteudo: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Georgia,serif;margin:0;padding:0;background:#f4f4f4}
.container{max-width:560px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden}
.header{background:#010423;padding:24px 32px;border-bottom:3px solid #BC943F}
.header h1{color:#fff;font-size:16px;margin:0;font-weight:500}
.header p{color:#BC943F;font-size:12px;margin:4px 0 0}
.body{padding:28px 32px}
.body h2{font-size:18px;color:#010423;margin:0 0 12px;font-weight:500}
.body p{font-size:14px;color:#444;line-height:1.6;margin:0 0 16px}
.highlight{background:#FAEEDA;border-left:3px solid #BC943F;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0;font-size:13px;color:#633806}
.urgent{background:#fee;border-left:3px solid #c00;color:#600}
.footer{background:#f8f8f8;padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center}
</style></head><body><div class="container">
<div class="header"><h1>JAS Advocacia</h1><p>Dra. Juliana Araújo da Silva | OAB/MT 34.182</p></div>
<div class="body">${conteudo}</div>
<div class="footer">Email automático do LegisFlow — JAS Advocacia · Primavera do Leste — MT</div>
</div></body></html>`;

interface Item {
  id: string;
  titulo: string;
  data_vencimento: string;
  status: string;
  responsavel_id: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Verifica se o envio está ativo
    const { data: cfgRows } = await supabase
      .from("configuracoes_sistema")
      .select("chave, valor")
      .eq("secao", "email")
      .in("chave", ["ativo", "remetente_nome", "remetente_endereco"]);
    const cfg = Object.fromEntries((cfgRows ?? []).map((c: any) => [c.chave, c.valor]));
    if (cfg.ativo !== "true") {
      return new Response(JSON.stringify({ skipped: true, reason: "email desativado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remetenteNome = cfg.remetente_nome || "LegisFlow";
    const remetenteEndereco = cfg.remetente_endereco || "onboarding@resend.dev";

    // Janela: hoje 00:00 → daqui 48h (cobre "amanhã" e "atrasado de hoje")
    const now = new Date();
    const inicioHoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fim48h = new Date(inicioHoje.getTime() + 48 * 60 * 60 * 1000);

    // Itens em aberto vencendo nas próximas 48h ou já vencidos não concluídos
    const { data: itens, error } = await supabase
      .from("controladoria_itens")
      .select("id, titulo, data_vencimento, status, responsavel_id")
      .not("status", "in", "(concluido,cancelado)")
      .lte("data_vencimento", fim48h.toISOString())
      .order("data_vencimento", { ascending: true });

    if (error) throw error;

    // Buscar emails dos responsáveis e da gestora
    const respIds = Array.from(new Set((itens ?? []).map((i: any) => i.responsavel_id).filter(Boolean)));
    const { data: profilesResp } = respIds.length
      ? await supabase.from("profiles").select("id, nome, email").in("id", respIds)
      : { data: [] as any[] };
    const profById = new Map((profilesResp ?? []).map((p: any) => [p.id, p]));

    const { data: gestorRow } = await supabase
      .from("user_roles")
      .select("profiles:user_id(id, nome, email)")
      .eq("role", "gestor")
      .limit(1)
      .maybeSingle();
    const gestorProf = Array.isArray((gestorRow as any)?.profiles)
      ? (gestorRow as any).profiles[0]
      : (gestorRow as any)?.profiles;
    const gestorEmail: string | null = gestorProf?.email ?? null;

    const enviarEmail = async (para: string[], assunto: string, conteudo: string, evento: string) => {
      const html = TEMPLATE_BASE(conteudo);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${remetenteNome} <${remetenteEndereco}>`,
          to: para,
          subject: assunto,
          html,
        }),
      });
      const data = await res.json().catch(() => ({}));
      await supabase.from("email_log").insert({
        destinatario: para.join(", "),
        assunto,
        evento,
        status: res.ok ? "enviado" : "erro",
        resend_id: data?.id ?? null,
        erro: res.ok ? null : (data?.message ?? JSON.stringify(data)),
      });
      return res.ok;
    };

    let enviados = 0;
    let pulados = 0;

    for (const item of (itens ?? []) as Item[]) {
      const venc = new Date(item.data_vencimento);
      const venceuPra24h = venc.getTime() <= now.getTime() + 24 * 60 * 60 * 1000 && venc.getTime() >= now.getTime();
      const atrasado = venc.getTime() < now.getTime();

      const resp = item.responsavel_id ? profById.get(item.responsavel_id) : null;
      const respEmail = resp?.email ?? null;
      const respNome = resp?.nome ?? "Responsável";

      if (atrasado) {
        const destinatarios = Array.from(new Set([respEmail, gestorEmail].filter(Boolean) as string[]));
        if (destinatarios.length === 0) {
          pulados++;
          continue;
        }
        const dias = Math.floor((now.getTime() - venc.getTime()) / (24 * 60 * 60 * 1000));
        const ok = await enviarEmail(
          destinatarios,
          `[Atrasado ❗] ${item.titulo}`,
          `<h2>Item atrasado ❗</h2>
           <p>Responsável: <strong>${respNome}</strong></p>
           <div class="highlight urgent"><strong>${item.titulo}</strong> · vencimento ${venc.toLocaleDateString("pt-BR")} (${dias} dia${dias === 1 ? "" : "s"} de atraso)</div>
           <p>Acesse a controladoria para regularizar.</p>`,
          "prazo_atrasado",
        );
        if (ok) enviados++;
      } else if (venceuPra24h) {
        const destinatarios = Array.from(new Set([respEmail, gestorEmail].filter(Boolean) as string[]));
        if (destinatarios.length === 0) {
          pulados++;
          continue;
        }
        const ok = await enviarEmail(
          destinatarios,
          `[URGENTE] Prazo amanhã: ${item.titulo}`,
          `<h2>Prazo vence em até 24h</h2>
           <p>Responsável: <strong>${respNome}</strong></p>
           <div class="highlight urgent"><strong>${item.titulo}</strong> · vencimento ${venc.toLocaleDateString("pt-BR")} ${venc.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
           <p>Acesse a controladoria para acompanhar.</p>`,
          "prazo_24h",
        );
        if (ok) enviados++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, total_itens: (itens ?? []).length, enviados, pulados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("prazos-alertas error", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
