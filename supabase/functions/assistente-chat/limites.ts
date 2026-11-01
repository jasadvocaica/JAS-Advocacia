export const MAX_SAIDA_POR_CHAMADA = 1000;
export class LimiteTokensError extends Error {}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
interface Payload { model: string; instructions: string; input: unknown[]; tools: unknown[]; parallel_tool_calls: boolean }

export async function respostaComLimite(args: {
  key: string; payload: Payload; requestId: string; rodada: number; rpc: Rpc;
  signal?: AbortSignal; fetcher?: typeof fetch;
}) {
  const fetcher = args.fetcher ?? fetch;
  const init = { method: 'POST', redirect: 'error' as const, signal: args.signal,
    headers: { Authorization: `Bearer ${args.key}`, 'Content-Type': 'application/json' } };
  // Endpoint oficial de contagem: mede exatamente o payload que será enviado.
  const count = await fetcher('https://api.openai.com/v1/responses/input_tokens', {
    ...init, body: JSON.stringify(args.payload),
  });
  if (!count.ok) throw new Error('Não foi possível medir os tokens. A geração não foi iniciada.');
  const { input_tokens } = await count.json();
  if (!Number.isSafeInteger(input_tokens) || input_tokens < 0) throw new Error('Contagem de tokens inválida');
  const reserva = await args.rpc('assistente_reservar_tokens', {
    p_id: args.requestId, p_rodada: args.rodada, p_entrada: input_tokens, p_saida_max: MAX_SAIDA_POR_CHAMADA,
  });
  if (reserva.error || reserva.data !== true) throw new LimiteTokensError(reserva.error?.message ?? 'Chamada já reservada; não será repetida.');
  const resp = await fetcher('https://api.openai.com/v1/responses', {
    ...init, body: JSON.stringify({ ...args.payload, store: false, max_output_tokens: MAX_SAIDA_POR_CHAMADA }),
  });
  if (!resp.ok) throw new Error(resp.status === 429 ? 'Limite da API OpenAI atingido' : 'Falha da API OpenAI');
  const ai = await resp.json();
  const entrada = ai.usage?.input_tokens, saida = ai.usage?.output_tokens;
  if (![entrada, saida].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Uso de tokens não confirmado; reserva mantida.');
  const confirmado = await args.rpc('assistente_confirmar_tokens', {
    p_id: args.requestId, p_rodada: args.rodada, p_entrada: entrada, p_saida: saida,
  });
  if (confirmado.error || confirmado.data !== true) throw new Error('Consumo não confirmado ou excedente inesperado. Novas chamadas foram interrompidas.');
  return ai;
}
