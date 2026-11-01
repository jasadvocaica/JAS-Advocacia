// Edge Function: agentes-agendador (REFERÊNCIA para o Codex)
// Chamada pelo pg_cron a cada 5 minutos. Cria a execução "pendente" de cada
// gatilho de agenda vencido; o agentes-trabalhador executa no minuto seguinte.
// Secrets: AGENTES_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENTES_USUARIO_TECNICO (uuid).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { agoraCuiaba, chaveDoDia, gatilhosVencidos, mesmoSegredo, type Gatilho } from "../_shared/agentes-fila.ts";

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST" || !mesmoSegredo(req.headers.get("x-agentes-token") ?? "", Deno.env.get("AGENTES_TOKEN") ?? "")) {
    return json({ erro: "não autorizado" }, 401);
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const tecnico = Deno.env.get("AGENTES_USUARIO_TECNICO") ?? null;
  const relogio = agoraCuiaba();

  const { data, error } = await db.from("agente_gatilhos")
    .select("id, agente_id, nome, tipo, dias_semana, hora, ativo, ultima_execucao, entrada, executar_como, agente:agentes_ia(ativo)")
    .eq("ativo", true).eq("tipo", "agenda");
  if (error) return json({ erro: error.message }, 500);

  const vencidos = gatilhosVencidos((data ?? []).filter((g: any) => g.agente?.ativo) as Gatilho[], relogio);
  const criadas: string[] = [];
  for (const g of vencidos) {
    const { data: nova, error: e } = await db.from("agente_execucoes").insert({
      agente_id: g.agente_id, origem: "agendado", status: "pendente",
      entrada: { ...g.entrada, gatilho: g.nome },
      executar_como: g.executar_como ?? tecnico,
      chave_idempotencia: chaveDoDia(g, relogio),
    }).select("id").maybeSingle();
    // 23505 = já existe execução com essa chave hoje: só marca o gatilho
    if (e && e.code !== "23505") continue;
    await db.from("agente_gatilhos").update({ ultima_execucao: relogio.dia }).eq("id", g.id);
    if (nova) criadas.push(nova.id);
  }
  return json({ agora: relogio, vencidos: vencidos.length, criadas });
});
