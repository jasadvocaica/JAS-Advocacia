import { supabase } from "@/integrations/supabase/client";

/**
 * Auditoria de eventos de autenticação.
 * Persiste em `auth_login_eventos`. Falhas são engolidas — auditoria
 * nunca pode quebrar o fluxo de login.
 */

export type EventoAuth =
  | "login_sucesso"
  | "login_falha"
  | "redirect_portal"
  | "sem_vinculo"
  | "escolha_manual"
  | "logout";

export type PortalAuditado = "interno" | "parceiro" | "cliente" | "auto";

export interface RegistroAuth {
  evento: EventoAuth;
  email?: string | null;
  userId?: string | null;
  portal?: PortalAuditado | null;
  rotaDestino?: string | null;
  motivo?: string | null;
  contexto?: Record<string, unknown>;
}

export async function registrarEventoLogin(reg: RegistroAuth): Promise<void> {
  try {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
    await (supabase.from("auth_login_eventos") as any).insert({
      user_id: reg.userId ?? null,
      email: reg.email?.toLowerCase().slice(0, 320) ?? null,
      evento: reg.evento,
      portal: reg.portal ?? null,
      rota_destino: reg.rotaDestino?.slice(0, 500) ?? null,
      motivo: reg.motivo?.slice(0, 500) ?? null,
      user_agent: userAgent,
      contexto: reg.contexto ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[auth-audit] falha ao registrar evento", e);
  }
}
