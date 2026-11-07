import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import {
  assinaturaValida,
  normalizarLead,
} from "../_shared/marketing-leads.ts";

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  if (Deno.env.get("MARKETING_LEADS_HABILITADO") !== "true")
    return json({ erro: "Receptor desativado; homologação necessária" }, 503);
  if (Number(req.headers.get("content-length") ?? 0) > 64000)
    return json({ erro: "Corpo excede limite" }, 413);
  const leitor = req.body?.getReader();
  if (!leitor) return json({ erro: "Corpo ausente" }, 400);
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  while (true) {
    const { value, done } = await leitor.read();
    if (done) break;
    tamanho += value.length;
    if (tamanho > 64000) {
      await leitor.cancel();
      return json({ erro: "Corpo excede limite" }, 413);
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(tamanho);
  let posicao = 0;
  for (const parte of partes) {
    bytes.set(parte, posicao);
    posicao += parte.length;
  }
  const raw = new TextDecoder().decode(bytes);
  if (
    !(await assinaturaValida(
      raw,
      req.headers.get("X-Zernio-Signature"),
      Deno.env.get("ZERNIO_WEBHOOK_SECRET") ?? "",
    ))
  )
    return json({ erro: "Assinatura inválida" }, 401);
  try {
    const corpo = JSON.parse(raw);
    if (corpo.event === "webhook.test")
      return json({ ok: true, teste_conexao: true });
    const dados = normalizarLead(
      corpo,
      req.headers.get("X-Zernio-Event-Id"),
      Deno.env.get("MARKETING_LEADS_SOMENTE_TESTE") !== "false",
    );
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const r = await db.rpc("mkt_receber_lead", { _dados: dados });
    if (r.error) {
      await db.rpc("mkt_alertas_integracao", {
        _motivo: "lead_pendente",
        _conta: dados.conta_id,
      });
      return json(
        {
          erro:
            r.error.code === "42501"
              ? "Conta/formulário não autorizado"
              : "Falha no processamento; reenvio permitido",
          codigo: r.error.code,
        },
        r.error.code === "42501" ? 403 : 503,
      );
    }
    return json({ ok: true, lead_id: r.data });
  } catch {
    return json(
      { erro: "Evento inválido; revisar mapeamento do formulário" },
      400,
    );
  }
});
