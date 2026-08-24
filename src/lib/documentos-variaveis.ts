import { supabase } from "@/integrations/supabase/client";

function formatCPF(cpf: string): string {
  const n = cpf.replace(/\D/g, "");
  if (n.length !== 11) return cpf;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9, 11)}`;
}

function formatCNPJ(cnpj: string): string {
  const n = cnpj.replace(/\D/g, "");
  if (n.length !== 14) return cnpj;
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12, 14)}`;
}

export function formatCNJ(numero: string | null | undefined): string {
  if (!numero) return "";
  const limpo = numero.replace(/\D/g, "");
  if (limpo.length !== 20) return numero;
  return `${limpo.slice(0, 7)}-${limpo.slice(7, 9)}.${limpo.slice(9, 13)}.${limpo.slice(13, 14)}.${limpo.slice(14, 16)}.${limpo.slice(16, 20)}`;
}

export function formatDataBR(data: string | null | undefined): string {
  if (!data) return "";
  try {
    const d = new Date(data + (data.length === 10 ? "T00:00:00" : ""));
    return d.toLocaleDateString("pt-BR");
  } catch {
    return "";
  }
}

export function formatMoedaBR(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataExtenso(data: Date = new Date()): string {
  return data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

export function mesAno(data: Date = new Date()): string {
  return data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function montarEndereco(c: any): string {
  if (!c) return "";
  const partes = [
    c.endereco,
    c.numero,
    c.complemento,
    c.bairro,
    c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade || c.estado,
    c.cep ? `CEP ${c.cep}` : null,
  ].filter(Boolean);
  return partes.join(", ");
}

function formatCpfOuCnpj(v: string | null | undefined): string {
  if (!v) return "";
  const limpo = v.replace(/\D/g, "");
  if (limpo.length === 11) return formatCPF(limpo);
  if (limpo.length === 14) return formatCNPJ(limpo);
  return v;
}

export interface VariavelCtx {
  processo?: any;
  cliente?: any;
  advogado?: any;
}

const VARIAVEIS_PADRAO: Record<string, (ctx: VariavelCtx) => string> = {
  // Processo
  "{{numero_cnj}}": (ctx) => formatCNJ(ctx.processo?.numero_cnj_limpo || ctx.processo?.numero_cnj),
  "{{numero_cnj_limpo}}": (ctx) => ctx.processo?.numero_cnj_limpo || ctx.processo?.numero_cnj || "",
  "{{nb}}": (ctx) => ctx.processo?.nb_inss || "",
  "{{vara}}": (ctx) => ctx.processo?.vara || "",
  "{{juiz}}": (ctx) => ctx.processo?.juiz || "",
  "{{area_direito}}": (ctx) => ctx.processo?.area_direito || "",
  "{{tipo_acao}}": (ctx) => ctx.processo?.tipo_acao || "",
  "{{valor_causa}}": (ctx) => formatMoedaBR(ctx.processo?.valor_causa),
  "{{tribunal}}": (ctx) => ctx.processo?.tribunal_sigla || "",
  "{{comarca_processo}}": (ctx) => ctx.processo?.comarca || "",
  "{{data_distribuicao}}": (ctx) => formatDataBR(ctx.processo?.data_distribuicao),

  // Cliente
  "{{nome_cliente}}": (ctx) => ctx.cliente?.nome || "",
  "{{cpf}}": (ctx) => formatCpfOuCnpj(ctx.cliente?.cpf_cnpj),
  "{{rg}}": (ctx) => ctx.cliente?.rg || "",
  "{{nit}}": (ctx) => ctx.cliente?.nit_pis || "",
  "{{endereco}}": (ctx) => montarEndereco(ctx.cliente),
  "{{cidade_cliente}}": (ctx) => ctx.cliente?.cidade || "",
  "{{estado_cliente}}": (ctx) => ctx.cliente?.estado || "",
  "{{profissao}}": (ctx) => ctx.cliente?.profissao || "",
  "{{renda}}": (ctx) => formatMoedaBR(ctx.cliente?.renda_mensal),
  "{{nascimento}}": (ctx) => formatDataBR(ctx.cliente?.nascimento),
  "{{estado_civil}}": (ctx) => ctx.cliente?.estado_civil || "",

  // Advogado
  "{{nome_advogado}}": (ctx) => ctx.advogado?.nome || "",
  "{{oab}}": (ctx) => ctx.advogado?.oab || "",
  "{{email_adv}}": (ctx) => ctx.advogado?.email || "",

  // Data
  "{{data_hoje}}": () => new Date().toLocaleDateString("pt-BR"),
  "{{data_extenso}}": () => dataExtenso(),
  "{{mes_ano}}": () => mesAno(),
};

export function listarVariaveisPadrao(): string[] {
  return Object.keys(VARIAVEIS_PADRAO);
}

export function extrairVariaveis(html: string): string[] {
  if (!html) return [];
  const regex = /\{\{[^}]+\}\}/g;
  return Array.from(new Set(html.match(regex) ?? []));
}

export async function buscarContexto(processoId: string | null, clienteId: string, advogadoId: string | null): Promise<VariavelCtx> {
  const [processoRes, clienteRes, advogadoRes] = await Promise.all([
    processoId
      ? supabase.from("processos").select("*").eq("id", processoId).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle(),
    advogadoId
      ? supabase.from("profiles").select("*").eq("id", advogadoId).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);
  return {
    processo: processoRes.data,
    cliente: clienteRes.data,
    advogado: advogadoRes.data,
  };
}

export async function substituirVariaveis(
  htmlTemplate: string,
  ctx: VariavelCtx,
  opcoes: { destacarPendentes?: boolean } = { destacarPendentes: true }
): Promise<string> {
  if (!htmlTemplate) return "";

  const { data: customRows } = await supabase
    .from("doc_variaveis_customizadas")
    .select("*")
    .eq("ativo", true);

  let html = htmlTemplate;

  // Substituir variáveis padrão
  for (const [variavel, fn] of Object.entries(VARIAVEIS_PADRAO)) {
    const valor = fn(ctx) || "";
    html = html.split(variavel).join(valor);
  }

  // Substituir variáveis customizadas fixas
  for (const v of customRows ?? []) {
    if (v.fonte === "fixo" && v.valor_padrao) {
      html = html.split(`{{${v.chave}}}`).join(v.valor_padrao);
    } else if (v.fonte === "processo" && v.campo_fonte && ctx.processo?.[v.campo_fonte]) {
      html = html.split(`{{${v.chave}}}`).join(String(ctx.processo[v.campo_fonte]));
    } else if (v.fonte === "cliente" && v.campo_fonte && ctx.cliente?.[v.campo_fonte]) {
      html = html.split(`{{${v.chave}}}`).join(String(ctx.cliente[v.campo_fonte]));
    } else if (v.fonte === "advogado" && v.campo_fonte && ctx.advogado?.[v.campo_fonte]) {
      html = html.split(`{{${v.chave}}}`).join(String(ctx.advogado[v.campo_fonte]));
    }
  }

  if (opcoes.destacarPendentes) {
    html = html.replace(
      /\{\{[^}]+\}\}/g,
      (match) =>
        `<mark style="background:#FFF3CD;color:#856404;padding:0 4px;border-radius:3px" data-variavel="${match}">${match}</mark>`
    );
  }

  return html;
}
