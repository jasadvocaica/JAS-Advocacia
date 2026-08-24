import { supabase } from "@/integrations/supabase/client";

interface EnviarEmailArgs {
  para: string | string[];
  assunto: string;
  conteudo?: string;
  corpo_html?: string;
  corpo_texto?: string;
  evento?: string;
  override_api_key?: string;
}

export interface EnviarEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function enviarEmail(args: EnviarEmailArgs): Promise<EnviarEmailResult> {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", { body: args });
    if (error) return { ok: false, error: error.message ?? "Falha no envio" };
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, id: data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Erro desconhecido" };
  }
}

/** Wrapper "best-effort" — nunca lança, só loga no console em caso de falha. */
export async function enviarEmailSilencioso(args: EnviarEmailArgs) {
  const r = await enviarEmail(args);
  if (!r.ok) console.warn("[enviarEmailSilencioso]", r.error, args);
  return r;
}
