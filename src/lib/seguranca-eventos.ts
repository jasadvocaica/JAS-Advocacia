import { supabase } from "@/integrations/supabase/client";

/**
 * Registro de eventos de segurança disparados pelo cliente
 * (ações negadas por RLS, permissão negada, OTP expirado etc.).
 * Falhas de gravação são silenciadas para nunca quebrar o fluxo do usuário.
 */

export type TipoEventoSeguranca =
  | "rls_negado"
  | "permissao_negada"
  | "otp_expirado"
  | "otp_bloqueado"
  | "acesso_recurso_negado"
  | "token_invalido"
  | "funcao_negada"
  | "outro";

interface RegistroSeguranca {
  tipo: TipoEventoSeguranca;
  recurso?: string;
  rota?: string;
  detalhe?: string;
  contexto?: Record<string, unknown>;
}

export async function registrarEventoSeguranca(reg: RegistroSeguranca): Promise<void> {
  try {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const rota = reg.rota ?? (typeof window !== "undefined" ? window.location.pathname : null);
    await (supabase.rpc as any)("registrar_evento_seguranca", {
      _tipo: reg.tipo,
      _recurso: reg.recurso ?? null,
      _rota: rota ?? null,
      _detalhe: reg.detalhe ?? null,
      _contexto: reg.contexto ?? null,
      _user_agent: ua,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[seguranca-eventos] falha ao registrar", e);
  }
}

/** Detecta erros do PostgREST que correspondem a violação de RLS / permissão. */
export function ehErroRls(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; status?: number };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates row-level security")
  );
}

/** Reporta um erro como evento de RLS se aplicável. Retorna true se reportou. */
export function reportarSeRls(err: unknown, recurso?: string): boolean {
  if (!ehErroRls(err)) return false;
  const detalhe = (err as { message?: string })?.message?.slice(0, 500);
  void registrarEventoSeguranca({ tipo: "rls_negado", recurso, detalhe });
  return true;
}
