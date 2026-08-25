import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
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

async function callGateway(
  path: string,
  init: RequestInit & { lovableKey: string; calKey: string },
) {
  const { lovableKey, calKey, ...rest } = init;
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": calKey,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Google Calendar API [${res.status}]: ${JSON.stringify(data)}`,
    );
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");
    if (!GOOGLE_CALENDAR_API_KEY)
      throw new Error("GOOGLE_CALENDAR_API_KEY não configurado");

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

    const gatewayCommon = {
      lovableKey: LOVABLE_API_KEY,
      calKey: GOOGLE_CALENDAR_API_KEY,
    };

    if (payload.action === "list") {
      const params = new URLSearchParams();
      params.set("singleEvents", "true");
      params.set("orderBy", "startTime");
      params.set("maxResults", String(payload.maxResults ?? 250));
      if (payload.timeMin) params.set("timeMin", payload.timeMin);
      if (payload.timeMax) params.set("timeMax", payload.timeMax);
      if (payload.q) params.set("q", payload.q);
      const data = await callGateway(
        `/calendars/${calId}/events?${params.toString()}`,
        { method: "GET", ...gatewayCommon },
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "create") {
      const data = await callGateway(`/calendars/${calId}/events`, {
        method: "POST",
        body: JSON.stringify(payload.event),
        ...gatewayCommon,
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "update") {
      const data = await callGateway(
        `/calendars/${calId}/events/${encodeURIComponent(payload.eventId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload.event),
          ...gatewayCommon,
        },
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "delete") {
      await callGateway(
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
