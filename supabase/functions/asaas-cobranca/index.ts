import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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
    const { data: role } = await admin.from("user_roles")
      .select("user_id").eq("user_id", user.id).eq("role", "gestor").maybeSingle();
    if (!role) return json({ error: "Apenas gestores podem gerar cobranças" }, 403);

    const input = await req.json();
    const billingType = input.billing_type ?? "UNDEFINED";
    if (!["UNDEFINED", "PIX", "BOLETO"].includes(billingType)) {
      return json({ error: "Forma de cobrança inválida" }, 400);
    }

    const base = "https://api-sandbox.asaas.com/v3";
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": "JAS-Advocacia/1.0 (Supabase; sandbox)",
      "access_token": apiKey,
    };
    async function asaas(path: string, init: RequestInit = {}) {
      const res = await fetch(base + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.errors?.[0]?.description ?? `Asaas HTTP ${res.status}`);
      return payload;
    }
    async function ensureCustomer(cliente: any) {
      if (!cliente) throw new Error("Cliente não encontrado");
      if (cliente.asaas_customer_id) return cliente.asaas_customer_id;
      const cpfCnpj = String(cliente.cpf_cnpj ?? "").replace(/\D/g, "");
      if (![11, 14].includes(cpfCnpj.length)) throw new Error("O cliente precisa ter CPF ou CNPJ válido");
      const found = await asaas(`/customers?cpfCnpj=${cpfCnpj}&limit=1`);
      let customerId = found?.data?.[0]?.id;
      if (!customerId) {
        const phone = String(cliente.whatsapp ?? cliente.telefones?.[0] ?? "").replace(/\D/g, "");
        const created = await asaas("/customers", {
          method: "POST",
          body: JSON.stringify({
            name: cliente.nome,
            cpfCnpj,
            email: cliente.email || undefined,
            mobilePhone: phone || undefined,
            externalReference: cliente.id,
            notificationDisabled: true,
          }),
        });
        customerId = created.id;
      }
      await admin.from("clientes").update({ asaas_customer_id: customerId }).eq("id", cliente.id);
      return customerId;
    }

    if (input.action === "criar_cobranca_diligencia" && input.diligencia_id) {
      const { data: d, error } = await admin.from("diligencias")
        .select("*, cliente:clientes(id,nome,cpf_cnpj,email,whatsapp,telefones,asaas_customer_id)")
        .eq("id", input.diligencia_id).maybeSingle();
      if (error || !d) return json({ error: "Diligência não encontrada" }, 404);
      if (d.asaas_payment_id) {
        return json({ ok: true, ja_existente: true, payment_id: d.asaas_payment_id, invoice_url: d.asaas_invoice_url });
      }
      if (!d.cliente) return json({ error: "Vincule a diligência a um cliente antes de gerar a cobrança" }, 422);
      const value = Number(d.valor_contratado ?? 0) - Number(d.valor_recebido ?? 0);
      if (!(value > 0)) return json({ error: "Não existe saldo positivo para cobrar" }, 422);
      const customerId = await ensureCustomer(d.cliente);
      const dueDate = input.due_date ?? d.data_vencimento_cobranca ?? String(d.data_hora).slice(0, 10);
      const payment = await asaas("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId, billingType, value, dueDate,
          description: `Diligência: ${d.descricao}`.slice(0, 500),
          externalReference: `diligencia:${d.id}`,
        }),
      });
      await admin.from("diligencias").update({
        data_vencimento_cobranca: dueDate,
        asaas_payment_id: payment.id,
        asaas_status: payment.status,
        asaas_billing_type: payment.billingType,
        asaas_invoice_url: payment.invoiceUrl ?? null,
        asaas_bank_slip_url: payment.bankSlipUrl ?? null,
        asaas_ultimo_sync: new Date().toISOString(),
        asaas_ultimo_erro: null,
      }).eq("id", d.id);
      await admin.from("asaas_integracao_log").insert({
        acao: "criar_cobranca", entidade_tipo: "diligencia", entidade_id: d.id,
        asaas_id: payment.id, sucesso: true, criado_por: user.id,
      });
      return json({ ok: true, payment_id: payment.id, status: payment.status, invoice_url: payment.invoiceUrl, bank_slip_url: payment.bankSlipUrl });
    }

    if (input.action === "criar_cobranca_parcela" && input.parcela_id) {
      const { data: p, error } = await admin.from("honorarios_parcelas")
        .select("id,contrato_id,numero_parcela,valor,data_vencimento,status,asaas_payment_id,asaas_invoice_url,contrato:honorarios_contratos!inner(cliente_id,cliente:clientes!inner(id,nome,cpf_cnpj,email,whatsapp,telefones,asaas_customer_id))")
        .eq("id", input.parcela_id).maybeSingle();
      if (error || !p) return json({ error: "Parcela não encontrada" }, 404);
      if (p.status === "pago") return json({ error: "A parcela já está paga" }, 422);
      if (p.asaas_payment_id) {
        return json({ ok: true, ja_existente: true, payment_id: p.asaas_payment_id, invoice_url: p.asaas_invoice_url });
      }
      const contrato = Array.isArray(p.contrato) ? p.contrato[0] : p.contrato;
      const cliente = Array.isArray(contrato?.cliente) ? contrato.cliente[0] : contrato?.cliente;
      const value = Number(p.valor ?? 0);
      if (!(value > 0)) return json({ error: "A parcela precisa ter valor positivo" }, 422);
      const customerId = await ensureCustomer(cliente);
      const payment = await asaas("/payments", {
        method: "POST",
        body: JSON.stringify({
          customer: customerId,
          billingType,
          value,
          dueDate: input.due_date ?? p.data_vencimento,
          description: `Honorários jurídicos - parcela ${p.numero_parcela}`.slice(0, 500),
          externalReference: `honorario_parcela:${p.id}`,
        }),
      });
      await admin.from("honorarios_parcelas").update({
        asaas_payment_id: payment.id,
        asaas_status: payment.status,
        asaas_billing_type: payment.billingType,
        asaas_invoice_url: payment.invoiceUrl ?? null,
        asaas_bank_slip_url: payment.bankSlipUrl ?? null,
        asaas_ultimo_sync: new Date().toISOString(),
        asaas_ultimo_erro: null,
      }).eq("id", p.id);
      await admin.from("asaas_integracao_log").insert({
        acao: "criar_cobranca", entidade_tipo: "honorario_parcela", entidade_id: p.id,
        asaas_id: payment.id, sucesso: true, criado_por: user.id,
      });
      return json({ ok: true, payment_id: payment.id, status: payment.status, invoice_url: payment.invoiceUrl, bank_slip_url: payment.bankSlipUrl });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});