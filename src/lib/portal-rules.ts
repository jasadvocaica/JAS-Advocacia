export type PortalDisponivel = "interno" | "parceiro" | "cliente";

export interface PortalInfo {
  tipo: PortalDisponivel;
  nome: string;
  descricao: string;
  rota: string;
}

/**
 * REGRAS DE IDENTIFICAÇÃO DE PORTAL
 * =================================
 * Decide para onde redirecionar o usuário após o login.
 *
 * Ordem de prioridade (1 → 4):
 *  1. ROLE INTERNA: profile.ativo + pelo menos 1 role → portal interno
 *     (gestores e equipe sempre vão para o sistema, mesmo se também
 *     forem cadastrados como parceiro/cliente)
 *  2. DOMÍNIO CORPORATIVO: e-mail no domínio do escritório → portal interno
 *     (ex.: alguém da equipe ainda sem profile criado é tratado como interno)
 *  3. VÍNCULO DE PARCEIRO: existe em `parceiros` (email match) com
 *     portal_ativo=true e ativo=true
 *  4. VÍNCULO DE CLIENTE: existe em `cliente_usuarios` (email match)
 *     com ativo=true
 *
 * Quando o usuário tem MÚLTIPLOS vínculos (ex.: equipe + cliente do
 * próprio escritório), todos são listados e ele escolhe na tela
 * `/selecionar-portal`. A prioridade acima decide apenas a ORDEM de
 * exibição e qual é o "preferido" para redirect automático quando
 * existir só um.
 */

/**
 * Domínios de e-mail tratados como equipe interna do escritório.
 * Adicione aqui domínios próprios para que e-mails @dominio.com sejam
 * automaticamente reconhecidos como acesso interno em potencial.
 */
export const DOMINIOS_INTERNOS: readonly string[] = [
  "julianaaraujoadvocacia.com",
  "julianaaraujoadvocacia.com.br",
];

export function extrairDominio(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

export function isEmailDominioInterno(email: string | null | undefined): boolean {
  const dom = extrairDominio(email);
  return !!dom && DOMINIOS_INTERNOS.includes(dom);
}

export interface ContextoIdentificacao {
  email: string | null | undefined;
  /** profile.ativo === true */
  profileAtivo: boolean;
  /** roles do usuário no sistema interno */
  rolesCount: number;
  /** linha em `parceiros` ativa, se houver */
  parceiroNome: string | null;
  /** linha em `cliente_usuarios` ativa, se houver — nome do cliente associado */
  clienteNome: string | null;
}

/**
 * Aplica as regras e devolve a lista ordenada de portais disponíveis
 * para o usuário, com o "preferido" (primeiro da lista) já no topo.
 */
export function resolverPortaisDisponiveis(ctx: ContextoIdentificacao): PortalInfo[] {
  const found: PortalInfo[] = [];

  // 1. Role interna explícita
  const temAcessoInternoExplicito = ctx.profileAtivo && ctx.rolesCount > 0;

  // 2. Domínio corporativo (sinal complementar)
  const dominioInterno = isEmailDominioInterno(ctx.email);

  if (temAcessoInternoExplicito || dominioInterno) {
    found.push({
      tipo: "interno",
      nome: "Sistema interno",
      descricao: temAcessoInternoExplicito
        ? "Equipe do escritório"
        : "Acesso por domínio corporativo",
      rota: "/",
    });
  }

  // 3. Parceiro
  if (ctx.parceiroNome) {
    found.push({
      tipo: "parceiro",
      nome: "Portal do Parceiro",
      descricao: ctx.parceiroNome,
      rota: "/portal-parceiro",
    });
  }

  // 4. Cliente
  if (ctx.clienteNome) {
    found.push({
      tipo: "cliente",
      nome: "Portal do Cliente",
      descricao: ctx.clienteNome,
      rota: "/portal-cliente",
    });
  }

  return found;
}

/**
 * Motivo legível da decisão (para auditoria/log).
 */
export function descreverMotivoIdentificacao(
  ctx: ContextoIdentificacao,
  portais: PortalInfo[],
): string {
  if (portais.length === 0) return "nenhum vínculo identificado";
  const tipos = portais.map((p) => p.tipo).join("+");
  const sinais: string[] = [];
  if (ctx.profileAtivo && ctx.rolesCount > 0) sinais.push("profile_ativo+roles");
  if (isEmailDominioInterno(ctx.email)) sinais.push("dominio_corporativo");
  if (ctx.parceiroNome) sinais.push("vinculo_parceiro");
  if (ctx.clienteNome) sinais.push("vinculo_cliente");
  return `${tipos} via ${sinais.join(",") || "—"}`;
}


