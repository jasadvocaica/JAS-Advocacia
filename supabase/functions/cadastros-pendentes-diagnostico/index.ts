// Faz o levantamento de clientes com cadastro incompleto.
// Campos obrigatórios: nome, CPF, telefone, nascimento, endereço.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data, error } = await supa
      .from("clientes")
      .select("id, nome, cpf_cnpj, telefones, whatsapp, nascimento, endereco, numero, cidade, estado, ativo")
      .eq("ativo", true)
      .limit(2000);
    if (error) throw error;

    const incompletos: { id: string; nome: string; faltando: string[] }[] = [];
    let cpf = 0, tel = 0, nasc = 0, end = 0;

    for (const c of data ?? []) {
      const faltando: string[] = [];
      if (!c.cpf_cnpj || c.cpf_cnpj.replace(/\D/g, "").length < 11) { faltando.push("CPF"); cpf++; }
      const temTel = (c.telefones && c.telefones.length > 0) || !!c.whatsapp;
      if (!temTel) { faltando.push("Telefone"); tel++; }
      if (!c.nascimento) { faltando.push("Nascimento"); nasc++; }
      const temEnd = !!(c.endereco && (c.cidade || c.estado));
      if (!temEnd) { faltando.push("Endereço"); end++; }
      if (faltando.length) incompletos.push({ id: c.id, nome: c.nome, faltando });
    }

    return new Response(JSON.stringify({
      total: data?.length ?? 0,
      incompletos_total: incompletos.length,
      por_campo: { cpf, telefone: tel, nascimento: nasc, endereco: end },
      incompletos: incompletos.slice(0, 200),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
