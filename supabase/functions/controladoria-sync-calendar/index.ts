// Edge Function: sync automático Controladoria -> Google Calendar
// Disparada pelos triggers AFTER INSERT/UPDATE/DELETE em controladoria_itens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "juridico@julianaaraujoadvocacia.com";
const TZ = "America/Cuiaba";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  action: "upsert" | "delete";
  item_id: string;
  event_id?: string | null;
  calendar_id?: string | null;
}

// Visual mapping por tipo
const TIPO_CONFIG: Record<string, { emoji: string; colorId: string; reminderMin: number[] }> = {
  prazo_fatal:      { emoji: "🔴", colorId: "11", reminderMin: [1440, 120] }, // tomato
  prazo_processual: { emoji: "🗓",  colorId: "9",  reminderMin: [1440, 60] },  // blueberry
  audiencia:        { emoji: "⚖️", colorId: "5",  reminderMin: [1440, 60] },  // banana
  reuniao:          { emoji: "👥", colorId: "7",  reminderMin: [60, 15] },    // peacock
  diligencia:       { emoji: "📋", colorId: "10", reminderMin: [1440] },      // basil
  tarefa:           { emoji: "✅", colorId: "8",  reminderMin: [60] },        // graphite
};

const PRIORIDADE_PREFIX: Record<string, string> = {
  urgente: "🚨 URGENTE — ",
  alta:    "⚠️ ",
  media:   "",
  baixa:   "",
};

function buildSummary(item: any) {
  const cfg = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG.tarefa;
  const pri = PRIORIDADE_PREFIX[item.prioridade] ?? "";
  const tipoLabel = item.tipo.replace(/_/g, " ");
  return `${pri}${cfg.emoji} ${tipoLabel.charAt(0).toUpperCase() + tipoLabel.slice(1)}: ${item.titulo}`;
}

function buildDescription(item: any, clienteNome?: string, processoCnj?: string) {
  const lines: string[] = [];
  if (item.descricao) lines.push(item.descricao, "");
  if (clienteNome) lines.push(`👤 Cliente: ${clienteNome}`);
  if (processoCnj) lines.push(`📄 Processo: ${processoCnj}`);
  if (item.vara) lines.push(`🏛 Vara: ${item.vara}`);
  if (item.juiz) lines.push(`⚖️ Juiz(a): ${item.juiz}`);
  if (item.link_virtual) lines.push(`🔗 Link: ${item.link_virtual}`);
  if (item.data_intimacao) lines.push(`📬 Intimação: ${item.data_intimacao}`);
  lines.push("", `— Sincronizado da Controladoria (#${item.id.slice(0, 8)})`);
  return lines.join("\n");
}

function buildEvent(item: any, clienteNome?: string, processoCnj?: string) {
  const cfg = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG.tarefa;
  const start = new Date(item.data_vencimento);
  // duração padrão: audiência/reunião = 1h; demais = evento de 30 min
  const durationMin = item.tipo === "audiencia" || item.tipo === "reuniao" ? 60 : 30;
  const end = new Date(start.getTime() + durationMin * 60_000);

  return {
    summary: buildSummary(item),
    description: buildDescription(item, clienteNome, processoCnj),
    location: item.local || item.link_virtual || undefined,
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    colorId: cfg.colorId,
    reminders: {
      useDefault: false,
      overrides: cfg.reminderMin.map((m) => ({ method: "popup", minutes: m })),
    },
    extendedProperties: {
      private: {
        controladoria_item_id: item.id,
        controladoria_tipo: item.tipo,
        controladoria_status: item.status,
      },
    },
  };
}

async function gateway(path: string, init: RequestInit & { lovableKey: string; calKey: string }) {
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
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`GCal[${res.status}]: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_CALENDAR_API_KEY = Deno.env.get("GOOGLE_CALENDAR_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado");
    if (!GOOGLE_CALENDAR_API_KEY) throw new Error("GOOGLE_CALENDAR_API_KEY não configurado");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const payload = (await req.json()) as Payload;
    const calId = encodeURIComponent(CALENDAR_ID);
    const common = { lovableKey: LOVABLE_API_KEY, calKey: GOOGLE_CALENDAR_API_KEY };

    // Buscar mapping existente
    const { data: mapping } = await admin
      .from("controladoria_google_eventos")
      .select("google_event_id, google_calendar_id")
      .eq("item_id", payload.item_id)
      .maybeSingle();

    if (payload.action === "delete") {
      const eventIdDelete = payload.event_id ?? mapping?.google_event_id;
      const calendarIdDelete = payload.calendar_id ?? mapping?.google_calendar_id ?? CALENDAR_ID;
      if (eventIdDelete) {
        try {
          await gateway(
            `/calendars/${encodeURIComponent(calendarIdDelete)}/events/${encodeURIComponent(eventIdDelete)}`,
            { method: "DELETE", ...common },
          );
        } catch (e) {
          console.warn("[sync] delete falhou:", (e as Error).message);
        }
        // mapping é removido em cascade pelo FK
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // upsert: buscar item completo + cliente/processo
    const { data: item, error } = await admin
      .from("controladoria_itens")
      .select("*, cliente:clientes(nome), processo:processos(numero_cnj)")
      .eq("id", payload.item_id)
      .maybeSingle();

    if (error || !item) {
      return new Response(JSON.stringify({ error: "Item não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Itens cancelados: remover do calendário
    if (item.status === "cancelado") {
      if (mapping?.google_event_id) {
        try {
          await gateway(
            `/calendars/${encodeURIComponent(mapping.google_calendar_id)}/events/${encodeURIComponent(mapping.google_event_id)}`,
            { method: "DELETE", ...common },
          );
          await admin.from("controladoria_google_eventos").delete().eq("item_id", item.id);
        } catch (e) {
          console.warn("[sync] cancel delete falhou:", (e as Error).message);
        }
      }
      return new Response(JSON.stringify({ ok: true, skipped: "cancelado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventBody = buildEvent(item, item.cliente?.nome, item.processo?.numero_cnj);
    // Concluído: prefixar título
    if (item.status === "concluido") {
      eventBody.summary = `✔️ [CONCLUÍDO] ${eventBody.summary}`;
      eventBody.colorId = "8"; // graphite
    }

    let eventId: string;
    try {
      if (mapping?.google_event_id) {
        const updated = await gateway(
          `/calendars/${encodeURIComponent(mapping.google_calendar_id)}/events/${encodeURIComponent(mapping.google_event_id)}`,
          { method: "PATCH", body: JSON.stringify(eventBody), ...common },
        );
        eventId = updated.id;
      } else {
        const created = await gateway(
          `/calendars/${calId}/events`,
          { method: "POST", body: JSON.stringify(eventBody), ...common },
        );
        eventId = created.id;
      }

      await admin.from("controladoria_google_eventos").upsert({
        item_id: item.id,
        google_event_id: eventId,
        google_calendar_id: CALENDAR_ID,
        ultimo_sync: new Date().toISOString(),
        ultimo_erro: null,
      });

      return new Response(JSON.stringify({ ok: true, event_id: eventId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[sync] erro upsert:", msg);
      // grava erro pro mapping (se existir) p/ debug
      if (mapping) {
        await admin.from("controladoria_google_eventos").update({
          ultimo_erro: msg, ultimo_sync: new Date().toISOString(),
        }).eq("item_id", item.id);
      }
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[controladoria-sync-calendar] erro:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
