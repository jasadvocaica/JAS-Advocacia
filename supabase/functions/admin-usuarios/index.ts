// Edge function para gestão administrativa de usuários
// Operações: criar usuário, redefinir senha, ativar/inativar
// Apenas usuários com role 'gestor' podem executar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppRole = "gestor" | "advogado" | "controladoria" | "administrativo" | "estagiario";
type Modulo = "clientes" | "processos" | "controladoria" | "financeiro" | "documentos" | "relatorios" | "usuarios" | "parceiros" | "equipe" | "dashboard";
type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar";

interface PermDef { v: boolean; c: boolean; e: boolean; d: boolean; x: boolean }

const PERMISSOES_PADRAO: Record<AppRole, Partial<Record<Modulo, PermDef>>> = {
  gestor: {
    clientes:      { v: true, c: true, e: true, d: true, x: true },
    processos:     { v: true, c: true, e: true, d: true, x: true },
    controladoria: { v: true, c: true, e: true, d: true, x: true },
    financeiro:    { v: true, c: true, e: true, d: true, x: true },
    documentos:    { v: true, c: true, e: true, d: true, x: true },
    parceiros:     { v: true, c: true, e: true, d: true, x: true },
    equipe:        { v: true, c: true, e: true, d: true, x: true },
    dashboard:     { v: true, c: false, e: false, d: false, x: true },
    usuarios:      { v: true, c: true, e: true, d: true, x: false },
    relatorios:    { v: true, c: true, e: true, d: true, x: true },
  },
  advogado: {
    clientes:      { v: true, c: true, e: true, d: false, x: false },
    processos:     { v: true, c: true, e: true, d: false, x: false },
    controladoria: { v: true, c: true, e: true, d: false, x: false },
    financeiro:    { v: true, c: false, e: false, d: false, x: false },
    documentos:    { v: true, c: true, e: true, d: false, x: true },
    parceiros:     { v: true, c: false, e: false, d: false, x: false },
    dashboard:     { v: true, c: false, e: false, d: false, x: false },
  },
  controladoria: {
    clientes:      { v: true, c: false, e: true, d: false, x: false },
    processos:     { v: true, c: false, e: false, d: false, x: false },
    controladoria: { v: true, c: true, e: true, d: false, x: true },
    dashboard:     { v: true, c: false, e: false, d: false, x: false },
  },
  administrativo: {
    clientes:      { v: true, c: true, e: true, d: false, x: false },
    financeiro:    { v: true, c: true, e: true, d: false, x: true },
    dashboard:     { v: true, c: false, e: false, d: false, x: false },
  },
  estagiario: {
    clientes:      { v: true, c: false, e: false, d: false, x: false },
    processos:     { v: true, c: false, e: false, d: false, x: false },
    controladoria: { v: true, c: true,  e: true, d: false, x: false },
    documentos:    { v: true, c: true,  e: true, d: false, x: false },
    dashboard:     { v: true, c: false, e: false, d: false, x: false },
  },
};

function indiceSeguro(limite: number): number {
  const maximoValido = Math.floor(256 / limite) * limite;
  const byte = new Uint8Array(1);
  do crypto.getRandomValues(byte); while (byte[0] >= maximoValido);
  return byte[0] % limite;
}

function gerarSenhaTemporaria(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const numeros = "23456789";
  const simbolos = "!@#$%&*";
  const todos = letras + numeros + simbolos;
  const caracteres = [
    letras[indiceSeguro(letras.length)],
    numeros[indiceSeguro(numeros.length)],
    simbolos[indiceSeguro(simbolos.length)],
  ];
  for (let i = 0; i < 9; i++) caracteres.push(todos[indiceSeguro(todos.length)]);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = indiceSeguro(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = claims.claims.sub;

    // Exige gestor interno e ativo. O service role é usado somente depois desta verificação.
    const [{ data: rolesData, error: rolesErr }, { data: callerProfile, error: profileErr }] = await Promise.all([
      adminClient.from("user_roles").select("role").eq("user_id", callerId),
      adminClient.from("profiles").select("ativo, tipo_portal").eq("id", callerId).maybeSingle(),
    ]);
    const isGestor = (rolesData ?? []).some((r: { role: string }) => r.role === "gestor");
    const isInternoAtivo = callerProfile?.ativo === true && callerProfile?.tipo_portal === "interno";
    if (rolesErr || profileErr || !isGestor || !isInternoAtivo) {
      return new Response(JSON.stringify({ error: "Apenas gestores internos ativos podem executar esta ação" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

    // ============================================================
    // CRIAR USUÁRIO
    // ============================================================
    if (action === "criar") {
      const { nome, email, perfil, senha: senhaProvided, forcarTroca = true } = body;
      const nomeNormalizado = typeof nome === "string" ? nome.trim().replace(/\s+/g, " ") : "";
      const emailNormalizado = typeof email === "string" ? email.trim().toLowerCase() : "";

      if (!nomeNormalizado || !emailNormalizado || !perfil) {
        return new Response(JSON.stringify({ error: "nome, email e perfil são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (nomeNormalizado.length < 3 || nomeNormalizado.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
        return new Response(JSON.stringify({ error: "Nome ou e-mail inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const perfisValidos: AppRole[] = ["gestor", "advogado", "controladoria", "administrativo", "estagiario"];
      if (!perfisValidos.includes(perfil)) {
        return new Response(JSON.stringify({ error: "Perfil inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const senha = senhaProvided || gerarSenhaTemporaria();

      // Cria usuário no auth (auto-confirmado)
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: emailNormalizado,
        password: senha,
        email_confirm: true,
        user_metadata: { nome: nomeNormalizado },
      });
      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const newUserId = created.user!.id;

      // O trigger handle_new_user já cria o profile. Atualizamos primeiro_acesso conforme escolha
      await adminClient.from("profiles").update({
        nome: nomeNormalizado,
        primeiro_acesso: !!forcarTroca,
      }).eq("id", newUserId);

      // Adiciona role (se não for gestor — gestor é exclusivo do dono criado em handle_new_user)
      // mas permitimos múltiplos gestores aqui.
      await adminClient.from("user_roles").upsert({ user_id: newUserId, role: perfil }, { onConflict: "user_id,role" });

      // Aplica permissões padrão do perfil
      const padrao = PERMISSOES_PADRAO[perfil as AppRole] || {};
      const rows: any[] = [];
      for (const [modulo, def] of Object.entries(padrao)) {
        const acoes: [Acao, boolean][] = [
          ["visualizar", def!.v],
          ["criar", def!.c],
          ["editar", def!.e],
          ["excluir", def!.d],
          ["exportar", def!.x],
        ];
        for (const [acao, permitido] of acoes) {
          rows.push({ user_id: newUserId, modulo, acao, permitido });
        }
      }
      if (rows.length > 0) {
        await adminClient.from("user_permissions").upsert(rows, { onConflict: "user_id,modulo,acao" });
      }

      return new Response(JSON.stringify({
        ok: true,
        user_id: newUserId,
        senha_temporaria: senhaProvided ? null : senha,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============================================================
    // REDEFINIR SENHA
    // ============================================================
    if (action === "redefinir_senha") {
      const { user_id, senha: senhaProvided, forcarTroca = true } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const senha = senhaProvided || gerarSenhaTemporaria();
      const { error: upErr } = await adminClient.auth.admin.updateUserById(user_id, { password: senha });
      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await adminClient.from("profiles").update({ primeiro_acesso: !!forcarTroca }).eq("id", user_id);
      return new Response(JSON.stringify({
        ok: true,
        senha_temporaria: senhaProvided ? null : senha,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============================================================
    // RESETAR PERMISSÕES PARA PADRÃO DO PERFIL
    // ============================================================
    if (action === "resetar_permissoes") {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: targetRoles, error: targetRoleErr } = await adminClient
        .from("user_roles").select("role").eq("user_id", user_id);
      const perfil = targetRoles?.[0]?.role as AppRole | undefined;
      if (targetRoleErr || !perfil || !PERMISSOES_PADRAO[perfil]) {
        return new Response(JSON.stringify({ error: "Perfil atual do usuário não encontrado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await adminClient.from("user_permissions").delete().eq("user_id", user_id);
      const padrao = PERMISSOES_PADRAO[perfil];
      const rows: any[] = [];
      for (const [modulo, def] of Object.entries(padrao)) {
        const acoes: [Acao, boolean][] = [
          ["visualizar", def!.v],
          ["criar", def!.c],
          ["editar", def!.e],
          ["excluir", def!.d],
          ["exportar", def!.x],
        ];
        for (const [acao, permitido] of acoes) {
          rows.push({ user_id, modulo, acao, permitido });
        }
      }
      if (rows.length > 0) {
        await adminClient.from("user_permissions").upsert(rows, { onConflict: "user_id,modulo,acao" });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "action desconhecida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Erro inesperado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
