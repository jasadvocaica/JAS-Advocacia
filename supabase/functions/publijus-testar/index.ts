// Edge function: testa a configuração da API do PubliJus
// Faz uma requisição de teste ao endpoint de busca por OAB usando os
// parâmetros configurados na tabela publijus_config + o secret PUBLIJUS_API_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ ok: false, error: "Sessão inválida" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ ok: false, error: "Não autenticado" }, 401);

    // Verifica se é gestor
    const { data: ehGestor } = await supabase.rpc("is_gestor", {
      _user_id: user.id,
    });
    if (!ehGestor) return json({ ok: false, error: "Apenas gestores" }, 403);

    const { oab, uf } = await req.json().catch(() => ({}));
    if (!oab || !uf) {
      return json({ ok: false, error: "Informe OAB e UF para testar" }, 400);
    }

    // Lê config
    const { data: cfg, error: cfgErr } = await supabase
      .from("publijus_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (cfgErr || !cfg) {
      return json({ ok: false, error: "Configuração não encontrada" }, 400);
    }
    if (!cfg.base_url) {
      return json({ ok: false, error: "Base URL não configurada" }, 400);
    }

    const apiKey = Deno.env.get("PUBLIJUS_API_KEY");
    if (!apiKey) {
      return json(
        { ok: false, error: "PUBLIJUS_API_KEY não está configurada" },
        500,
      );
    }

    // Monta URL
    const baseUrl = String(cfg.base_url).replace(/\/+$/, "");
    const path = String(cfg.endpoint_busca_oab || "").replace(/^\/?/, "/");
    const url = new URL(baseUrl + path);
    url.searchParams.set(cfg.param_oab || "oab", String(oab));
    url.searchParams.set(cfg.param_seccional || "uf", String(uf).toUpperCase());

    const headers: Record<string, string> = {
      "Accept": "application/json",
      [cfg.auth_header || "Authorization"]:
        `${cfg.auth_prefix || ""}${apiKey}`,
    };

    const t0 = Date.now();
    let resp: Response;
    try {
      resp = await fetch(url.toString(), { method: "GET", headers });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let amigavel = `Não foi possível conectar à Base URL. ${msg}`;
      if (/ENOTFOUND|getaddrinfo|dns/i.test(msg)) {
        amigavel = "Domínio não encontrado. Verifique se a Base URL está correta (ex.: https://api.publijus.com.br/v1).";
      } else if (/ECONNREFUSED|refused/i.test(msg)) {
        amigavel = "Conexão recusada pelo servidor. A URL existe mas não respondeu nessa porta.";
      } else if (/timeout|timed out/i.test(msg)) {
        amigavel = "Tempo esgotado aguardando resposta. O servidor demorou demais ou está fora do ar.";
      } else if (/certificate|ssl|tls/i.test(msg)) {
        amigavel = "Erro de certificado SSL/TLS. Verifique se a URL usa https:// válido.";
      }
      return json({ ok: false, error: amigavel, detalhe_tecnico: msg }, 200);
    }
    const ms = Date.now() - t0;
    const text = await resp.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* mantém como texto */ }

    let dica: string | undefined;
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        dica = "Autenticação rejeitada. Verifique o secret PUBLIJUS_API_KEY, o cabeçalho de autenticação e o prefixo (ex.: 'Bearer ').";
      } else if (resp.status === 404) {
        dica = "Endpoint não encontrado. Confira o caminho de busca por OAB (ex.: /publicacoes ou /v1/publicacoes).";
      } else if (resp.status === 400 || resp.status === 422) {
        dica = "A API recusou os parâmetros. Confira os nomes dos parâmetros de OAB e UF.";
      } else if (resp.status === 429) {
        dica = "Limite de requisições atingido. Aguarde alguns minutos e tente novamente.";
      } else if (resp.status >= 500) {
        dica = "Erro no servidor do PubliJus. Tente novamente em instantes ou contate o suporte deles.";
      }
    }

    return json({
      ok: resp.ok,
      status: resp.status,
      latencia_ms: ms,
      url: url.toString().replace(apiKey, "***"),
      preview: typeof body === "string" ? body.slice(0, 800) : body,
      dica,
    }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return json({ ok: false, error: msg }, 500);
  }
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
