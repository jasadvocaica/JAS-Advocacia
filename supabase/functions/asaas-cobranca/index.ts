import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    const environment = Deno.env.get("ASAAS_ENVIRONMENT") ?? "sandbox";
    if (!apiKey) return json({ error: "Integração Asaas ainda não configurada" }, 503);
    if (environment !== "sandbox") return json({ error: "Produção bloqueada até homologação completa" }, 503);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Não autenticado" }, 401);

    const admin = createClient(url, service);
    const { data: role } = await admin.from("user_roles").select("user_id").eq("user_id", user.id).eq("role", "gestor").maybeSingle();
    if (!role) return json({ error: "Apenas gestores podem gerar cobranças" }, 403);

    const { action, diligencia_id, billing_type = "UNDEFINED", due_date } = await req.json();
    if (action !== "criar_cobranca_diligencia" || !diligencia_id) return json({ error: "Ação inválida" }, 400);
    if (!["UNDEFINED", "PIX", "BOLETO"].includes(billing_type)) return json({ error: "Forma de cobrança inválida" }, 400);

    const { data: d, error: de } = await admin
      .from("diligencias")
      .select("*, cliente:clientes(id,nome,cpf_cnpj,email,whatsapp,telefones,asaas_customer_id)")
      .eq("id", diligencia_id).maybeSingle();
    if (de || !d) return json({ error: "Diligência não encontrada" }, 404);
    if (d.asaas_payment_id) return json({ ok: true, ja_existente: true, payment_id: d.asaas_payment_id, invoice_url: d.asaas_invoice_url });
    if (!d.cliente) return json({ error: "Vincule a diligência a um cliente antes de gerar a cobrança" }, 422);

    const cpfCnpj = String(d.cliente.cpf_cnpj ?? "").replace(/\D/g, "");
    if (![11, 14].includes(cpfCnpj.length)) return json({ error: "O cliente precisa ter CPF ou CNPJ válido" }, 422);
    const value = Number(d.valor_contratado ?? 0) - Number(d.valor_recebido ?? 0);
    if (!(value > 0)) return json({ error: "Não existe saldo positivo para cobrar" }, 422);

    const base = "https://api-sandbox.asaas.com/v3";
    const headers = { "Content-Type": "application/json", "User-Agent": "JAS-Advocacia/1.0 (Supabase; sandbox)", "access_token": apiKey };
    async function asaas(path: string, init: RequestInit = {}) {
      const res = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.errors?.[0]?.description ?? `Asaas HTTP ${res.status}`);
      return payload;
    }

    let customerId = d.cliente.asaas_customer_id;
    if (!customerId) {
      const found = await asaas(`/customers?cpfCnpj=${cpfCnpj}&limit=1`);
      customerId = found?.data?.[0]?.id;
      if (!customerId) {
        const phone = String(d.cliente.whatsapp ?? d.cliente.telefones?.[0] ?? "").replace(/\D/g, "");
        const created = await asaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: d.cliente.nome, cpfCnpj,
            email: d.cliente.email || undefined,
            mobilePhone: phone || undefined,
            externalReference: d.cliente.id,
            notificationDisabled: true,
          }),
        });
        customerId = created.id;
      }
      await admin.from("clientes").update({ asaas_customer_id: customerId }).eq("id", d.cliente.id);
    }

    const dueDate = due_date ?? d.data_vencimento_cobranca ?? String(d.data_hora).slice(0, 10);
    const payment = await asaas("/payments", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId, billingType: billing_type, value, dueDate,
        description: `Diligência: ${d.descricao}`.slice(0, 500),
        externalReference: `diligencia:${d.id}`,
      }),
    });

    await admin.from("diligencias").update({
      data_vencimento_cobranca: dueDate, asaas_payment_id: payment.id,
      asaas_status: payment.status, asaas_billing_type: payment.billingType,
      asaas_invoice_url: payment.invoiceUrl ?? null,
      asaas_bank_slip_url: payment.bankSlipUrl ?? null,
      asaas_ultimo_sync: new Date().toISOString(), asaas_ultimo_erro: null,
    }).eq("id", d.id);
    await admin.from("asaas_integracao_log").insert({
      acao: "criar_cobranca", entidade_tipo: "diligencia", entidade_id: d.id,
      asaas_id: payment.id, sucesso: true, criado_por: user.id,
    });
    return json({ ok: true, payment_id: payment.id, status: payment.status, invoice_url: payment.invoiceUrl, bank_slip_url: payment.bankSlipUrl });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});