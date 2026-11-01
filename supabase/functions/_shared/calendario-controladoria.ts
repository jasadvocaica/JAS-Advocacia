interface ItemCalendario {
  id: string;
  tipo: string;
  origem?: string;
  data_vencimento: string;
  data_prazo_judicial?: string | null;
  prazo_conferido?: boolean;
}

export function idEventoControladoria(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Identificador de item inválido");
  }
  // Google aceita base32hex; prefixo e UUID hexadecimal respeitam esse alfabeto.
  return `jas${id.replace(/-/g, "").toLowerCase()}`;
}

export function horarioEvento(item: ItemCalendario) {
  const judicial = item.data_prazo_judicial;
  if (judicial && item.prazo_conferido) {
    const data = new Date(`${judicial}T00:00:00Z`);
    if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== judicial) {
      throw new Error("Data de prazo judicial inválida");
    }
    const fim = new Date(data.getTime() + 86400000).toISOString().slice(0, 10);
    return { prefixo: "[PRAZO JUDICIAL CONFERIDO] ", start: { date: judicial }, end: { date: fim } };
  }
  const inicio = new Date(item.data_vencimento);
  if (!Number.isFinite(inicio.getTime())) throw new Error("Data de vencimento inválida");
  const minutos = item.tipo === "audiencia" || item.tipo === "reuniao" ? 60 : 30;
  return {
    prefixo: judicial ? "[CONFERIR PRAZO] " : item.origem === "pje_publicacao" ? "[TRIAGEM INTERNA] " : "",
    start: { dateTime: inicio.toISOString(), timeZone: "America/Cuiaba" },
    end: { dateTime: new Date(inicio.getTime() + minutos * 60000).toISOString(), timeZone: "America/Cuiaba" },
  };
}

interface EventoGoogle { id: string }
type GoogleApi = (path: string, init: RequestInit) => Promise<EventoGoogle>;

export async function salvarEventoGoogle(
  api: GoogleApi, calendarId: string, itemId: string,
  eventBody: Record<string, unknown>, existente?: string | null,
): Promise<string> {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  if (existente) {
    try {
      return (await api(`${base}/${encodeURIComponent(existente)}`, { method: "PATCH", body: JSON.stringify(eventBody) })).id;
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  const id = idEventoControladoria(itemId);
  try {
    return (await api(base, { method: "POST", body: JSON.stringify({ ...eventBody, id }) })).id;
  } catch (e) {
    if ((e as { status?: number }).status !== 409) throw e;
    // A criação anterior pode ter funcionado antes de cair a conexão ou falhar
    // a gravação do vínculo. Repetir atualiza o mesmo evento, nunca cria outro.
    return (await api(`${base}/${id}`, { method: "PATCH", body: JSON.stringify(eventBody) })).id;
  }
}
