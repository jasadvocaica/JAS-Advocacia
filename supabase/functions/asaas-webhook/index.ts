import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const expected = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const received = req.headers.get("asaas-access-token");
  if (!expected || !received || received !== expected) return json({ error: "Webhook não autorizado" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json();
    const eventId = String(body?.id ?? "");
    const eventType = String(body?.event ?? "");
    const payment = body?.payment ?? {};
    const paymentId = String(payment?.id ?? "");
    if (!eventId || !eventType) return json({ error: "Evento inválido" }, 400);

    const { error: insertError } = await admin.from("asaas_webhook_eventos").insert({
      event_id: eventId, event_type: eventType, payment_id: paymentId || null, payload: body,
    });
    if (insertError?.code === "23505") return json({ ok: true, duplicate: true });
    if (insertError) throw insertError;

    const now = new Date().toISOString();
    const recebido = eventType === "PAYMENT_RECEIVED";
    const cancelado = ["PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS"].includes(eventType);
    const { data: diligencia } = await admin.from("diligencias")
      .select("id,valor_contratado").eq("asaas_payment_id", paymentId).maybeSingle();

    if (diligencia) {
      const patch: Record<string, unknown> = {
        asaas_status: payment.status ?? eventType, asaas_ultimo_sync: now, asaas_ultimo_erro: null,
      };
      if (payment.invoiceUrl) patch.asaas_invoice_url = payment.invoiceUrl;
      if (payment.bankSlipUrl) patch.asaas_bank_slip_url = payment.bankSlipUrl;
      if (recebido) {
        patch.pagamento_status = "recebido";
        patch.valor_recebido = Number(payment.value ?? diligencia.valor_contratado ?? 0);
        patch.data_recebimento = String(payment.paymentDate ?? payment.confirmedDate ?? now).slice(0, 10);
      } else if (cancelado) {
        patch.pagamento_status = "cancelado";
      }
      await admin.from("diligencias").update(patch).eq("id", diligencia.id);
    } else {
      const { data: parcela } = await admin.from("honorarios_parcelas")
        .select("id,contrato_id,valor,contrato:honorarios_contratos!inner(cliente_id)")
        .eq("asaas_payment_id", paymentId).maybeSingle();
      if (parcela) {
        const patch: Record<string, unknown> = {
          asaas_status: payment.status ?? eventType,
          asaas_ultimo_sync: now,
          asaas_ultimo_erro: null,
        };
        await admin.from("honorarios_parcelas").update(patch).eq("id", parcela.id);

        if (recebido) {
          const { data: existente } = await admin.from("honorarios_pagamentos")
            .select("id").eq("parcela_id", parcela.id).maybeSingle();
          if (!existente) {
            const contrato = Array.isArray(parcela.contrato) ? parcela.contrato[0] : parcela.contrato;
            const forma = String(payment.billingType ?? "asaas").toLowerCase();
            await admin.from("honorarios_pagamentos").insert({
              contrato_id: parcela.contrato_id,
              parcela_id: parcela.id,
              cliente_id: contrato?.cliente_id,
              data_pagamento: String(payment.paymentDate ?? payment.confirmedDate ?? now).slice(0, 10),
              valor_recebido: Number(payment.value ?? parcela.valor ?? 0),
              forma_pagamento: forma,
              tipo_pagamento: "regular",
              observacao: `Baixa automática Asaas (${paymentId})`,
            });
          }
        }
      }
    }

    await admin.from("asaas_webhook_eventos").update({ processado: true, processado_em: now }).eq("event_id", eventId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});