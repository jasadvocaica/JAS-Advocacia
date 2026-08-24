import * as XLSX from "xlsx";
import Papa from "papaparse";
import { isValidCpfCnpj } from "@/lib/cpf";

export interface ParsedFile {
  /** Cabeçalhos detectados (linha de header) */
  headers: string[];
  /** Linhas de dados — cada linha já como objeto {coluna: valor} */
  rows: Record<string, string>[];
  /** Nome do arquivo original */
  nomeArquivo: string;
}

/**
 * Lê um arquivo .csv ou .xlsx e devolve headers + linhas como objetos.
 * Para xlsx do nosso modelo (3 linhas de cabeçalho), descarta as duas primeiras.
 */
export async function lerArquivoTabular(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return lerCsv(file);
  if (ext === "xlsx" || ext === "xls") return lerXlsx(file);
  throw new Error("Formato não suportado. Use .csv ou .xlsx.");
}

async function lerCsv(file: File): Promise<ParsedFile> {
  const texto = await file.text();
  const result = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data, nomeArquivo: file.name };
}

async function lerXlsx(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
  // Detecta a linha de header: primeira linha com mais de 2 colunas que pareça nome de campo
  let headerIdx = 0;
  for (let i = 0; i < Math.min(matriz.length, 5); i++) {
    const linha = matriz[i] ?? [];
    const nonEmpty = linha.filter((c) => String(c).trim()).length;
    if (nonEmpty >= 3 && !String(linha[0] ?? "").toUpperCase().startsWith("MODELO") &&
        !String(linha[0] ?? "").toLowerCase().startsWith("preencha")) {
      headerIdx = i;
      break;
    }
  }
  const headers = (matriz[headerIdx] ?? []).map((c) => String(c).trim()).filter(Boolean);
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < matriz.length; i++) {
    const linha = matriz[i] ?? [];
    if (linha.every((c) => !String(c).trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = String(linha[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows, nomeArquivo: file.name };
}

// ===================== CAMPOS DO SISTEMA =====================

export interface CampoSistema {
  /** chave técnica (ex.: "cpf_cnpj") */
  chave: string;
  /** label exibido ao usuário */
  rotulo: string;
  /** texto de exemplo */
  exemplo: string;
  obrigatorio: boolean;
  /** validador opcional. Retorna mensagem de erro se inválido. */
  validar?: (valor: string) => string | null;
  /** sinônimos comuns no header do arquivo (case-insensitive) */
  sinonimos?: string[];
}

const validarCpfCnpj = (v: string) =>
  v && !isValidCpfCnpj(v) ? "CPF/CNPJ com dígito inválido" : null;

const validarCnj = (v: string) => {
  if (!v) return null;
  const limpo = v.replace(/\D/g, "");
  return limpo.length === 20 ? null : "CNJ deve ter 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO)";
};

const validarEmail = (v: string) =>
  v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "Email em formato inválido" : null;

const validarData = (v: string) => {
  if (!v) return null;
  // aceita dd/mm/aaaa ou aaaa-mm-dd
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return "Data deve estar em dd/mm/aaaa ou aaaa-mm-dd";
};

export const CAMPOS_CLIENTES: CampoSistema[] = [
  { chave: "nome", rotulo: "Nome do Cliente", exemplo: "João da Silva Santos", obrigatorio: true,
    sinonimos: ["nome", "nome_cliente", "cliente", "razao_social"] },
  { chave: "cpf_cnpj", rotulo: "CPF / CNPJ", exemplo: "123.456.789-00", obrigatorio: true,
    validar: validarCpfCnpj, sinonimos: ["cpf", "cnpj", "documento", "doc_federal"] },
  { chave: "email", rotulo: "Email", exemplo: "joao@email.com", obrigatorio: false,
    validar: validarEmail, sinonimos: ["email", "e-mail"] },
  { chave: "whatsapp", rotulo: "WhatsApp", exemplo: "(11) 98765-4321", obrigatorio: false,
    sinonimos: ["whatsapp", "telefone", "celular", "contato"] },
  { chave: "nascimento", rotulo: "Data de Nascimento", exemplo: "15/03/1975", obrigatorio: false,
    validar: validarData, sinonimos: ["data_nascimento", "nascimento", "dt_nasc"] },
  { chave: "cidade", rotulo: "Cidade", exemplo: "Belém", obrigatorio: false,
    sinonimos: ["cidade", "municipio"] },
  { chave: "estado", rotulo: "Estado (UF)", exemplo: "PA", obrigatorio: false,
    sinonimos: ["estado", "uf"] },
  { chave: "profissao", rotulo: "Profissão", exemplo: "Auxiliar administrativo", obrigatorio: false,
    sinonimos: ["profissao", "ocupacao"] },
];

export const CAMPOS_PROCESSOS: CampoSistema[] = [
  { chave: "numero_cnj", rotulo: "Número do Processo (CNJ)", exemplo: "0801234-56.2023.8.19.0001",
    obrigatorio: true, validar: validarCnj,
    sinonimos: ["numero_cnj", "cnj", "numero_processo", "n_processo", "processo"] },
  { chave: "cliente_nome", rotulo: "Nome do Cliente", exemplo: "Maria Oliveira", obrigatorio: true,
    sinonimos: ["cliente_nome", "nome_cliente", "cliente"] },
  { chave: "cliente_cpf", rotulo: "CPF do Cliente", exemplo: "987.654.321-11", obrigatorio: false,
    validar: validarCpfCnpj, sinonimos: ["cliente_cpf", "cpf", "documento"] },
  { chave: "tipo", rotulo: "Tipo (judicial/admin)", exemplo: "judicial", obrigatorio: false,
    sinonimos: ["tipo"] },
  { chave: "area_direito", rotulo: "Área do Direito", exemplo: "previdenciario", obrigatorio: false,
    sinonimos: ["area_direito", "area"] },
  { chave: "tipo_acao", rotulo: "Tipo de Ação", exemplo: "BPC/LOAS", obrigatorio: false,
    sinonimos: ["tipo_acao", "acao"] },
  { chave: "status", rotulo: "Status", exemplo: "em_andamento", obrigatorio: false,
    sinonimos: ["status", "situacao"] },
  { chave: "valor_causa", rotulo: "Valor da Causa (R$)", exemplo: "22252.39", obrigatorio: false,
    sinonimos: ["valor_causa", "valor"] },
  { chave: "data_distribuicao", rotulo: "Data de Distribuição", exemplo: "15/04/2026",
    obrigatorio: false, validar: validarData,
    sinonimos: ["data_distribuicao", "distribuicao", "data"] },
  { chave: "vara", rotulo: "Vara", exemplo: "1ª Vara Federal", obrigatorio: false,
    sinonimos: ["vara"] },
];

/**
 * Sugere mapeamento automático {campoSistema → colunaArquivo} baseado em sinônimos.
 * Retorna `""` quando não encontrou correspondência.
 */
export function sugerirMapeamento(
  headers: string[],
  campos: CampoSistema[],
): Record<string, string> {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_");
  const mapa: Record<string, string> = {};
  campos.forEach((campo) => {
    const candidatos = [campo.chave, ...(campo.sinonimos ?? [])].map(norm);
    const match = headers.find((h) => candidatos.includes(norm(h)));
    mapa[campo.chave] = match ?? "";
  });
  return mapa;
}

// ===================== VALIDAÇÃO =====================

export interface LinhaValidada {
  /** índice 1-based original no arquivo (linha 2 = primeiro registro) */
  linha: number;
  status: "ok" | "aviso" | "erro";
  /** valores já normalizados, indexados pela chave do campo */
  valores: Record<string, string>;
  /** mensagens de erro/aviso por campo */
  problemas: { campo: string; mensagem: string; tipo: "erro" | "aviso" }[];
}

export function validarLinhas(
  rows: Record<string, string>[],
  campos: CampoSistema[],
  mapeamento: Record<string, string>,
): LinhaValidada[] {
  return rows.map((row, idx) => {
    const valores: Record<string, string> = {};
    const problemas: LinhaValidada["problemas"] = [];

    campos.forEach((campo) => {
      const colunaOrigem = mapeamento[campo.chave];
      const valor = colunaOrigem ? (row[colunaOrigem] ?? "").toString().trim() : "";
      valores[campo.chave] = valor;

      if (campo.obrigatorio && !valor) {
        problemas.push({ campo: campo.chave, mensagem: `${campo.rotulo} é obrigatório`, tipo: "erro" });
        return;
      }
      if (valor && campo.validar) {
        const erro = campo.validar(valor);
        if (erro) problemas.push({ campo: campo.chave, mensagem: erro, tipo: "erro" });
      }
    });

    const temErro = problemas.some((p) => p.tipo === "erro");
    const temAviso = problemas.some((p) => p.tipo === "aviso");
    return {
      linha: idx + 2, // +2 = +1 (1-based) +1 (header)
      status: temErro ? "erro" : temAviso ? "aviso" : "ok",
      valores,
      problemas,
    };
  });
}
