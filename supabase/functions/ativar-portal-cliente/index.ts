// Ativa o portal de um ou vários clientes com credencial temporária forte.
// Exige sessão interna e permissão de edição no módulo Clientes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { gerarSenhaTemporaria } from "../_shared/senha-temporaria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMITE_LOTE = 100;

function responder(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function limparCpf(cpf: string): string {
  return (cpf ?? "").replace(/\D/g, "");
}

interface AtivarBody {
  cliente_ids: string[];
  mostrar_financeiro?: boolean;
  resetar_senha?: boolean;
}

type AdminClient = ReturnType<typeof createClient>;

async function localizarUsuarioPorEmail(admin: AdminClient, email: string): Promise<string | null> {
  const porPagina = 1000;
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: porPagina });
    if (error) throw error;

    const encontrado = data.users.find(
      (usuario) => usuario.email?.toLowerCase() === email.toLowerCase(),
    );
    if (encontrado) return encontrado.id;
    if (data.users.length < porPagina) return null;
  }
  throw new Error("Não foi possível concluir a busca segura do usuário");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder({ error: "Método não permitido" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) {
      return responder({ error: "Configuração interna indisponível" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return responder({ error: "Não autenticado" }, 401);
    const uid = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const [{ data: internoAtivo }, { data: temPerm }] = await Promise.all([
      admin.rpc("is_interno_ativo", { _user_id: uid }),
      admin.rpc("has_permission", {
        _user_id: uid,
        _modulo: "clientes",
        _acao: "editar",
      }),
    ]);
    if (!internoAtivo || !temPerm) return responder({ error: "Sem permissão" }, 403);

    let body: AtivarBody;
    try {
      body = (await req.json()) as AtivarBody;
    } catch {
      return responder({ error: "Corpo JSON inválido" }, 400);
    }

    if (!Array.isArray(body.cliente_ids) || body.cliente_ids.length === 0) {
      return responder({ error: "cliente_ids vazio" }, 400);
    }

    const clienteIds = [...new Set(body.cliente_ids)];
    if (clienteIds.length > LIMITE_LOTE) {
      return responder({ error: `O lote aceita no máximo ${LIMITE_LOTE} clientes` }, 400);
    }
    if (clienteIds.some((id) => typeof id !== "string" || !UUID_RE.test(id))) {
      return responder({ error: "Há identificador de cliente inválido" }, 400);
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

    for (const cliente_id of clienteIds) {
      const { data: cliente, error: cliErr } = await admin
        .from("clientes")
        .select("id, nome, cpf_cnpj")
        .eq("id", cliente_id)
        .maybeSingle();

      if (cliErr || !cliente) {
        resultados.push({ cliente_id, nome: "", cpf: "", email: "", status: "erro", mensagem: "Cliente não encontrado" });
        continue;
      }

      const cpf = limparCpf(cliente.cpf_cnpj ?? "");
      if (cpf.length !== 11) {
        resultados.push({
          cliente_id,
          nome: cliente.nome,
          cpf,
          email: "",
          status: "erro",
          mensagem: "Cliente sem CPF válido (precisa ter 11 dígitos)",
        });
        continue;
      }

      const emailDerivado = `${cpf}@cliente.local`;
      const { data: vinculo, error: vinculoErr } = await admin
        .from("cliente_usuarios")
        .select("id, user_id, email, ativo, mostrar_financeiro")
        .eq("cliente_id", cliente_id)
        .maybeSingle();

      if (vinculoErr) {
        resultados.push({ cliente_id, nome: cliente.nome, cpf, email: emailDerivado, status: "erro", mensagem: "Falha ao consultar o acesso existente" });
        continue;
      }

      let userId = vinculo?.user_id ?? null;
      let emailAcesso = vinculo?.email || emailDerivado;

      if (userId) {
        const { data: usuarioVinculado, error: usuarioVinculadoErr } =
          await admin.auth.admin.getUserById(userId);
        if (usuarioVinculadoErr || !usuarioVinculado.user) {
          userId = null;
        } else if (usuarioVinculado.user.email) {
          emailAcesso = usuarioVinculado.user.email;
        }
      }

      if (!userId) {
        try {
          userId = await localizarUsuarioPorEmail(admin, emailDerivado);
          emailAcesso = emailDerivado;
        } catch (erro) {
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email: emailDerivado,
            status: "erro",
            mensagem: erro instanceof Error ? erro.message : "Falha ao localizar usuário",
          });
          continue;
        }
      }

      const mostrarFinanceiro =
        typeof body.mostrar_financeiro === "boolean"
          ? body.mostrar_financeiro
          : (vinculo?.mostrar_financeiro ?? false);

      if (!userId) {
        const senha = gerarSenhaTemporaria();
        const { data: novo, error: criarErr } = await admin.auth.admin.createUser({
          email: emailDerivado,
          password: senha,
          email_confirm: true,
          user_metadata: { nome: cliente.nome },
          app_metadata: { cliente_id: cliente.id, tipo: "cliente_portal" },
        });

        if (criarErr || !novo.user) {
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email: emailDerivado,
            status: "erro",
            mensagem: criarErr?.message ?? "Erro ao criar usuário",
          });
          continue;
        }

        const { error: associarErr } = await admin.from("cliente_usuarios").upsert(
          {
            cliente_id,
            user_id: novo.user.id,
            email: emailDerivado,
            primeiro_acesso: true,
            ativo: true,
            mostrar_financeiro: mostrarFinanceiro,
            criado_por: uid,
          },
          { onConflict: "cliente_id" },
        );

        if (associarErr) {
          const { error: compensarErr } = await admin.auth.admin.deleteUser(novo.user.id);
          console.error("[ativar-portal-cliente] vínculo falhou; compensação auth", {
            cliente_id,
            associar: associarErr.message,
            compensar: compensarErr?.message ?? null,
          });
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email: emailDerivado,
            status: "erro",
            mensagem: compensarErr
              ? "Falha ao vincular o portal; intervenção administrativa necessária"
              : "Falha ao vincular o portal; criação desfeita",
          });
          continue;
        }

        resultados.push({ cliente_id, nome: cliente.nome, cpf, email: emailDerivado, senha, status: "ativado" });
        continue;
      }

      if (body.resetar_senha) {
        const senha = gerarSenhaTemporaria();
        const { error: atualizarSenhaErr } = await admin.auth.admin.updateUserById(userId, {
          password: senha,
        });
        if (atualizarSenhaErr) {
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email: emailAcesso,
            status: "erro",
            mensagem: atualizarSenhaErr.message,
          });
          continue;
        }

        const { error: associarErr } = await admin.from("cliente_usuarios").upsert(
          {
            cliente_id,
            user_id: userId,
            email: emailAcesso,
            primeiro_acesso: true,
            ativo: true,
            mostrar_financeiro: mostrarFinanceiro,
          },
          { onConflict: "cliente_id" },
        );
        if (associarErr) {
          resultados.push({
            cliente_id,
            nome: cliente.nome,
            cpf,
            email: emailAcesso,
            status: "erro",
            mensagem: "A senha foi alterada, mas o vínculo do portal requer conferência administrativa",
          });
          continue;
        }

        resultados.push({ cliente_id, nome: cliente.nome, cpf, email: emailAcesso, senha, status: "senha_resetada" });
        continue;
      }

      const { error: associarErr } = await admin.from("cliente_usuarios").upsert(
        {
          cliente_id,
          user_id: userId,
          email: emailAcesso,
          ativo: true,
          mostrar_financeiro: mostrarFinanceiro,
        },
        { onConflict: "cliente_id" },
      );
      if (associarErr) {
        resultados.push({
          cliente_id,
          nome: cliente.nome,
          cpf,
          email: emailAcesso,
          status: "erro",
          mensagem: "Falha ao reativar o vínculo do portal",
        });
        continue;
      }

      resultados.push({ cliente_id, nome: cliente.nome, cpf, email: emailAcesso, status: "ja_existia" });
    }

    return responder({ resultados });
  } catch (err) {
    console.error("[ativar-portal-cliente] erro não tratado", err);
    return responder({ error: "Erro interno ao ativar o portal" }, 500);
  }
});
