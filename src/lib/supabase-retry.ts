import { supabase } from "@/integrations/supabase/client";

function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as any)?.message?.toLowerCase?.() ?? "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("aborted")
  );
}

function isAuthError(err: unknown): boolean {
  const status = (err as any)?.status ?? (err as any)?.code;
  const msg = (err as any)?.message?.toLowerCase?.() ?? "";
  return status === 401 || msg.includes("jwt") || msg.includes("invalid token") || msg.includes("expired");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa uma operação que retorna { data, error } (padrão Supabase) com:
 *  - 1 retry em erros transitórios de rede
 *  - refresh de sessão antes do retry se o erro for 401/JWT
 *
 * Uso:
 *   const { data, error } = await comRetry(() =>
 *     supabase.from("processos").insert(payload).select().single()
 *   );
 */
export async function comRetry<T>(
  fn: () => Promise<{ data: T; error: any }>,
): Promise<{ data: T; error: any }> {
  let res = await fn().catch((e) => ({ data: null as any, error: e }));
  if (!res.error) return res;

  if (isAuthError(res.error)) {
    try {
      await supabase.auth.refreshSession();
    } catch {
      // segue para retry mesmo assim
    }
    await sleep(150);
    res = await fn().catch((e) => ({ data: null as any, error: e }));
    return res;
  }

  if (isTransientNetworkError(res.error)) {
    await sleep(400);
    res = await fn().catch((e) => ({ data: null as any, error: e }));
  }

  return res;
}

/** Versão para Promises simples (ex.: edge functions invoke). */
export async function comRetryPromise<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isAuthError(err)) {
      try { await supabase.auth.refreshSession(); } catch {}
      await sleep(150);
      return await fn();
    }
    if (isTransientNetworkError(err)) {
      await sleep(400);
      return await fn();
    }
    throw err;
  }
}
