import { supabase } from "@/integrations/supabase/client";

/**
 * Auditoria de ações do parceiro no portal.
 * Registra em `parceiro_acesso_log`. Falha silenciosamente — auditoria
 * nunca pode quebrar a UX do portal.
 */

export type AcaoParceiro =
  | "acessou_dashboard"
  | "acessou_processos"
  | "acessou_processo_detalhe"
  | "acessou_tarefas"
  | "acessou_prazos"
  | "acessou_financeiro"
  | "acessou_documentos"
  | "acessou_perfil"
  | "visualizou_documento"
  | "baixou_documento"
  | "enviou_mensagem"
  | "concluiu_tarefa"
  | "upload_documento";

export type RecursoTipo = "processo" | "documento" | "tarefa" | "mensagem" | "pagina";

export interface RegistroAcaoParceiro {
  parceiroId: string;
  acao: AcaoParceiro;
  recursoTipo?: RecursoTipo;
  recursoId?: string | null;
  descricao?: string;
  contexto?: Record<string, unknown>;
}

export async function registrarAcaoParceiro(reg: RegistroAcaoParceiro): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;

    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null;

    await (supabase.from("parceiro_acesso_log") as any).insert({
      parceiro_id: reg.parceiroId,
      user_id: u.user.id,
      acao: reg.acao,
      recurso_tipo: reg.recursoTipo ?? null,
      recurso_id: reg.recursoId ?? null,
      descricao: reg.descricao?.slice(0, 1000) ?? null,
      user_agent: userAgent,
      contexto: reg.contexto ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[parceiro-audit] falha ao registrar ação", e);
  }
}
