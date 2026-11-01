import { describe, expect, it, vi } from 'vitest';
import { respostaComLimite } from '../../../supabase/functions/assistente-chat/limites';
const payload = { model: 'modelo-teste', instructions: 'Somente teste', input: [{ role: 'user', content: 'Olá' }], tools: [], parallel_tool_calls: false };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('admissão de chamadas OpenAI', () => {
  it('não gera resposta quando falta saldo diário', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ input_tokens: 300 }));
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Limite diário atingido' } });
    await expect(respostaComLimite({ key: 'teste', payload, requestId: 'id', rodada: 0, rpc, fetcher })).rejects.toThrow('Limite diário');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('/responses/input_tokens');
  });
  it('reserva entrada e saída antes da geração e confirma consumo real', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ input_tokens: 300 }))
      .mockResolvedValueOnce(json({ usage: { input_tokens: 300, output_tokens: 50 }, output: [] }));
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await respostaComLimite({ key: 'teste', payload, requestId: 'id', rodada: 1, rpc, fetcher });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_entrada: 300, p_saida_max: 1000 });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(fetcher.mock.invocationCallOrder[1]);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_entrada: 300, p_saida: 50 });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ max_output_tokens: 1000, store: false });
  });
  it('não prossegue se o provedor não conseguir contar a entrada', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 503));
    const rpc = vi.fn();
    await expect(respostaComLimite({ key: 'teste', payload, requestId: 'id', rodada: 0, rpc, fetcher })).rejects.toThrow('não foi iniciada');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('mantém a reserva se a resposta não confirmar os tokens cobrados', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ input_tokens: 300 })).mockResolvedValueOnce(json({ output: [] }));
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(respostaComLimite({ key: 'teste', payload, requestId: 'id', rodada: 0, rpc, fetcher })).rejects.toThrow('reserva mantida');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('impede repetir uma rodada já reservada', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ input_tokens: 300 }));
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(respostaComLimite({ key: 'teste', payload, requestId: 'id', rodada: 0, rpc, fetcher })).rejects.toThrow('não será repetida');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
