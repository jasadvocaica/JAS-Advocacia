// Chamada entre funções do próprio backend (ex.: telegram → motor-missoes) em nome de um usuário já
// identificado pela função de origem. Só vale com a chave de serviço do projeto, que nunca sai do servidor;
// as funções de destino continuam conferindo gestor/interno ativo para esse usuário.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function iguais(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Usuário em nome de quem a chamada interna age, ou null se a chamada não for interna e válida. */
export function usuarioInterno(req: Request, body: { usuario_id?: unknown }): string | null {
  const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const enviada = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  if (req.headers.get("x-jas-interno") !== "telegram" || !iguais(enviada, chave)) return null;
  return typeof body.usuario_id === "string" && UUID.test(body.usuario_id) ? body.usuario_id : null;
}

/** Chama outra função do projeto em nome do usuário. */
export async function chamarInterno<T = Record<string, unknown>>(funcao: string, usuario: string, corpo: Record<string, unknown>) {
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${funcao}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "x-jas-interno": "telegram",
    },
    body: JSON.stringify({ ...corpo, usuario_id: usuario }),
    signal: AbortSignal.timeout(90000),
  });
  const dados = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(dados.error ?? `Falha em ${funcao} (${r.status})`);
  return dados;
}
