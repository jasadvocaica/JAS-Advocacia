// Edge function: ativa o portal de um (ou vários) clientes.
// - Exige usuário autenticado da equipe com permissão em "clientes".
// - Para cada cliente_id recebido:
//   * gera email fictício "<cpf>@cliente.local"
//   * gera senha "<primeironome>123#"
//   * cria/atualiza usuário no auth (admin)
//   * upsert em cliente_usuarios
// - Retorna lista com {cliente_id, cpf, senha, status}.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function limparCpf(cpf: string): string {
  return (cpf ?? "").replace(/\D/g, "");
}

function senhaPadrao(nome: string): string {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  const semAcento = primeiro
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
  return `${semAcento || "cliente"}123#`;
}

interface AtivarBody {
  cliente_ids: string[];
  mostrar_financeiro?: boolean;
  resetar_senha?: boolean; // se true, força reset para senha padrão mesmo se já existir
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. valida sessão da equipe
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uid = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: temPerm } = await admin.rpc("has_permission", {
      _user_id: uid,
      _modulo: "clientes",
      _acao: "editar",
    });
    if (!temPerm) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. valida payload
    const body = (await req.json()) as AtivarBody;
    if (!Array.isArray(body.cliente_ids) || body.cliente_ids.length === 0) {
      return new Response(JSON.stringify({ error: "cliente_ids vazio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resultados: Array<{
      cliente_id: string;
      nome: string;
      cpf: string;
      email: string;
      senha?: string;
      status: "ativado" | "ja_existia" | "senha_resetada" | "erro";
      mensagem?: string;
    }> = [];

    for (const cliente_id of body.cliente_ids) {
      // busca dados do cliente
      const { data: cliente, error: cliErr } = await admin
        .from("clientes")
        .select("id, nome, cpf_cnpj, email")
        .eq("id", cliente_id)
        .maybeSingle();

      if (cliErr || !cliente) {
        resultados.push({
          cliente_id,
          nome: "",
          cpf: "",
          email: "",
          status: "erro",
          mensagem: "Cliente não encontrado",
        });
        continue;
      }

      const cpf = limparCpf(cliente.cpf_cnpj ?? "");
      if (!cpf || cpf.length < 11) {
        resultados.push({
          cliente_id,
          nome: cliente.nome,
          cpf: cpf,
          email: "",
          status: "erro",
          mensagem: "Cliente sem CPF válido (precisa ter 11 dígitos)",
        });
        continue;
      }

      const email = `${cpf}@cliente.local`;
      const senha = senhaPadrao(cliente.nome);

      // verifica se já existe vínculo
      const { data: vinculo } = await admin
        .from("cliente_usuarios")
        .select("id, user_id, ativo")
        .eq("cliente_id", cliente_id)
        .maybeSingle();

      let userId = vinculo?.user_id ?? null;

      // procura usuário existente pelo email (caso o vínculo tenha sido removido)
      if (!userId) {
        const { data: existing } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const found = existing?.users.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase(),
        );
        if (found) userId = found.id;
      }

      if (!userId) {
        // cria novo usuário no auth
        const { data: novo, error: criarErr } = await admin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
          user_metadata: {
            nome: cliente.nome,
            cliente_id: cliente.id,
            tipo: "cliente_portal",
          },
        });
        if (criarErr || !novo.user) {
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email,
            status: "erro",
            mensagem: criarErr?.message ?? "Erro ao criar usuário",
          });
          continue;
        }
        userId = novo.user.id;

        await admin.from("cliente_usuarios").upsert(
          {
            cliente_id,
            user_id: userId,
            email,
            primeiro_acesso: true,
            ativo: true,
            mostrar_financeiro: !!body.mostrar_financeiro,
            criado_por: uid,
          },
          { onConflict: "cliente_id" },
        );

        resultados.push({
          cliente_id,
          nome: cliente.nome,
          cpf,
          email,
          senha,
          status: "ativado",
        });
      } else if (body.resetar_senha) {
        // reseta para senha padrão
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
          password: senha,
        });
        if (updErr) {
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email,
            status: "erro",
            mensagem: updErr.message,
          });
          continue;
        }
        await admin.from("cliente_usuarios").upsert(
          {
            cliente_id,
            user_id: userId,
            email,
            primeiro_acesso: true,
            ativo: true,
            mostrar_financeiro: !!body.mostrar_financeiro,
          },
          { onConflict: "cliente_id" },
        );
        resultados.push({
          cliente_id,
          nome: cliente.nome,
          cpf,
          email,
          senha,
          status: "senha_resetada",
        });
      } else {
        // já existe, garante vínculo ativo
        await admin.from("cliente_usuarios").upsert(
          {
            cliente_id,
            user_id: userId,
            email,
            ativo: true,
            mostrar_financeiro: !!body.mostrar_financeiro,
          },
          { onConflict: "cliente_id" },
        );
        resultados.push({
          cliente_id,
          nome: cliente.nome,
          cpf,
          email,
          status: "ja_existia",
        });
      }
    }

    return new Response(JSON.stringify({ resultados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
