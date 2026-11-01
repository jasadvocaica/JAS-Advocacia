// Edge Function: agentes-trabalhador (REFERÊNCIA para o Codex)
// Substitui o n8n. Chamada pelo pg_cron a cada minuto e pelo "chute" do
// agentes-disparar. Pega execuções pendentes e chama a função de cada agente.
// Secrets: AGENTES_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mesmoSegredo, umaVolta } from "../_shared/agentes-fila.ts";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const token = Deno.env.get("AGENTES_TOKEN") ?? "";
  if (req.method !== "POST" || !mesmoSegredo(req.headers.get("x-agentes-token") ?? "", token)) return json({ erro: "não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const r = await umaVolta({
    destravar: async () => { const { data, error } = await db.rpc("agentes_destravar"); if (error) throw error; return data ?? 0; },
    reservar: async (limite) => { const { data, error } = await db.rpc("agentes_reservar", { p_limite: limite }); if (error) throw error; return data ?? []; },
    chamarAgente: async (funcao, execucao_id) => {
      const resp = await fetch(`${url}/functions/v1/${funcao}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-agentes-token": token },
        body: JSON.stringify({ execucao_id }),
        signal: AbortSignal.timeout(140000),
      });
      await resp.body?.cancel();
      return { ok: resp.ok, status: resp.status };
    },
    // volta para a fila, ou vira erro depois de 3 tentativas (regra no banco)
    devolverParaFila: async (execucao_id, motivo) => { await db.rpc("agentes_devolver", { p_execucao: execucao_id, p_motivo: motivo }); },
  });
  return json(r);
});
