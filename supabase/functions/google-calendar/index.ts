import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


const GOOGLE_API_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
let tokenCache: { accessToken: string; expiresAt: number } | null = null;

function base64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGoogleAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.accessToken;

  const email = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyPem = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!email || !privateKeyPem) {
    throw new Error(
      "Google Calendar não autorizado. Configure GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no Supabase.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const pemBody = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(pemBody);
  const keyBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`Falha ao autorizar Google Calendar [${response.status}]: ${JSON.stringify(data)}`);
  }
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
  return tokenCache.accessToken;
}

const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "juridico@julianaaraujoadvocacia.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ListPayload {
  action: "list";
  timeMin?: string;
  timeMax?: string;
  q?: string;
  maxResults?: number;
}
interface CreatePayload {
  action: "create";
  event: GcalEventInput;
}
interface UpdatePayload {
  action: "update";
  eventId: string;
  event: GcalEventInput;
}
interface DeletePayload {
  action: "delete";
  eventId: string;
}
type Payload = ListPayload | CreatePayload | UpdatePayload | DeletePayload;

interface GcalEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string }[];
  colorId?: string;
}

async function callGoogle(path: string, init: RequestInit) {
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(`${GOOGLE_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Google Calendar API [${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    // Autenticação: o usuário precisa estar logado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = (await req.json()) as Payload;
    const calId = encodeURIComponent(CALENDAR_ID);

    if (payload.action === "list") {
      const params = new URLSearchParams();
      params.set("singleEvents", "true");
      params.set("orderBy", "startTime");
      params.set("maxResults", String(payload.maxResults ?? 250));
      if (payload.timeMin) params.set("timeMin", payload.timeMin);
      if (payload.timeMax) params.set("timeMax", payload.timeMax);
      if (payload.q) params.set("q", payload.q);
      const data = await callGoogle(
        `/calendars/${calId}/events?${params.toString()}`,
        { method: "GET" },
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "create") {
      const data = await callGoogle(`/calendars/${calId}/events`, {
        method: "POST",
        body: JSON.stringify(payload.event),
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "update") {
      const data = await callGoogle(
        `/calendars/${calId}/events/${encodeURIComponent(payload.eventId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload.event),
          },
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "delete") {
      await callGoogle(
        `/calendars/${calId}/events/${encodeURIComponent(payload.eventId)}`,
        { method: "DELETE", ...gatewayCommon },
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[google-calendar] erro:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
