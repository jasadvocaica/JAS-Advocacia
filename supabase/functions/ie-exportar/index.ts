// Edge function: ie-exportar
// Gera exportações (XLSX, CSV, PDF) de clientes, processos e financeiro,
// salva o arquivo no bucket "ie-arquivos" e atualiza o registro em ie_jobs.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { jsPDF } from "npm:jspdf@2.5.2";
import autoTable from "npm:jspdf-autotable@3.8.4";
import { z } from "npm:zod@3.23.8";

const BUCKET = "ie-arquivos";
const EXPIRACAO_DIAS = 7;

type Modulo = "clientes" | "processos" | "financeiro";
type Formato = "xlsx" | "csv" | "pdf";
type Versao = "interno" | "parceiro" | "cliente";

const BodySchema = z.object({
  modulo: z.enum(["clientes", "processos", "financeiro"]),
  formato: z.enum(["xlsx", "csv", "pdf"]),
  versao: z.enum(["interno", "parceiro", "cliente"]).default("interno"),
  filtros: z
    .object({
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
      status: z.string().optional(),
      responsavel_id: z.string().uuid().optional(),
      area_direito: z.string().optional(),
    })
    .default({}),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return jsonResp({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonResp({ error: parsed.error.flatten().fieldErrors }, 400);
    const { modulo, formato, versao, filtros } = parsed.data;

    // Service role client para bypass de RLS na geração (já validamos quem é via JWT)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Cria job
    const { data: job, error: jobErr } = await adminClient
      .from("ie_jobs")
      .insert({
        tipo: "exportacao",
        modulo,
        subtipo: `${formato}-${versao}`,
        status: "processando",
        filtros,
        iniciado_por: userId,
        expira_em: new Date(Date.now() + EXPIRACAO_DIAS * 86400000).toISOString(),
      })
      .select()
      .single();
    if (jobErr || !job) throw jobErr ?? new Error("Falha ao criar job");

    try {
      const { rows, columns } = await coletar(adminClient, modulo, versao, filtros);

      const nomeBase = `${modulo}_${versao}_${new Date().toISOString().slice(0, 10)}`;
      const { buffer, nome, mime } = gerarArquivo(rows, columns, formato, nomeBase);

      const path = `${userId}/${job.id}/${nome}`;
      const upErr = (await adminClient.storage.from(BUCKET).upload(path, buffer, {
        upsert: true,
        contentType: mime,
      })).error;
      if (upErr) throw upErr;

      await adminClient
        .from("ie_jobs")
        .update({
          status: "concluido",
          total_registros: rows.length,
          registros_ok: rows.length,
          registros_erro: 0,
          arquivo_saida_url: path,
          arquivo_saida_nome: nome,
          arquivo_tamanho_bytes: buffer.byteLength,
          concluido_em: new Date().toISOString(),
          mensagem: `Exportação concluída — ${rows.length} registro(s)`,
        })
        .eq("id", job.id);

      return jsonResp({ job_id: job.id, total: rows.length, arquivo: nome }, 200);
    } catch (e) {
      await adminClient
        .from("ie_jobs")
        .update({
          status: "erro",
          mensagem: e instanceof Error ? e.message : "Erro desconhecido",
          concluido_em: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw e;
    }
  } catch (e) {
    console.error("ie-exportar error:", e);
    return jsonResp(
      { error: e instanceof Error ? e.message : "Falha ao exportar" },
      500,
    );
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// =================== COLETA DE DADOS ===================

interface Coluna {
  chave: string;
  rotulo: string;
}

async function coletar(
  client: ReturnType<typeof createClient>,
  modulo: Modulo,
  versao: Versao,
  filtros: Record<string, string | undefined>,
): Promise<{ rows: Record<string, unknown>[]; columns: Coluna[] }> {
  if (modulo === "clientes") return coletarClientes(client, versao, filtros);
  if (modulo === "processos") return coletarProcessos(client, versao, filtros);
  return coletarFinanceiro(client, versao, filtros);
}

async function coletarClientes(
  client: ReturnType<typeof createClient>,
  versao: Versao,
  filtros: Record<string, string | undefined>,
) {
  let q = client.from("clientes").select("*").limit(10000);
  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.responsavel_id) q = q.eq("advogado_responsavel_id", filtros.responsavel_id);
  if (filtros.data_inicio) q = q.gte("criado_em", filtros.data_inicio);
  if (filtros.data_fim) q = q.lte("criado_em", filtros.data_fim);

  const { data, error } = await q;
  if (error) throw error;

  const colunas: Coluna[] =
    versao === "cliente"
      ? [
          { chave: "nome", rotulo: "Nome" },
          { chave: "email", rotulo: "Email" },
          { chave: "whatsapp", rotulo: "WhatsApp" },
        ]
      : versao === "parceiro"
        ? [
            { chave: "nome", rotulo: "Nome" },
            { chave: "cidade", rotulo: "Cidade" },
            { chave: "estado", rotulo: "UF" },
            { chave: "status", rotulo: "Status" },
          ]
        : [
            { chave: "nome", rotulo: "Nome" },
            { chave: "cpf_cnpj", rotulo: "CPF/CNPJ" },
            { chave: "email", rotulo: "Email" },
            { chave: "whatsapp", rotulo: "WhatsApp" },
            { chave: "nascimento", rotulo: "Nascimento" },
            { chave: "cidade", rotulo: "Cidade" },
            { chave: "estado", rotulo: "UF" },
            { chave: "profissao", rotulo: "Profissão" },
            { chave: "renda_mensal", rotulo: "Renda Mensal" },
            { chave: "status", rotulo: "Status" },
            { chave: "criado_em", rotulo: "Cadastrado em" },
          ];
  return { rows: (data ?? []) as Record<string, unknown>[], columns: colunas };
}

async function coletarProcessos(
  client: ReturnType<typeof createClient>,
  versao: Versao,
  filtros: Record<string, string | undefined>,
) {
  let q = client
    .from("processos")
    .select(
      "id,numero_cnj,tipo,status,area_direito,tipo_acao,valor_causa,data_distribuicao,vara,criado_em,clientes(nome,cpf_cnpj),responsavel_id",
    )
    .limit(10000);
  if (filtros.status) q = q.eq("status", filtros.status);
  if (filtros.area_direito) q = q.eq("area_direito", filtros.area_direito);
  if (filtros.responsavel_id) q = q.eq("responsavel_id", filtros.responsavel_id);
  if (filtros.data_inicio) q = q.gte("criado_em", filtros.data_inicio);
  if (filtros.data_fim) q = q.lte("criado_em", filtros.data_fim);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).map((p: Record<string, unknown>) => {
    const cliente = p.clientes as { nome?: string; cpf_cnpj?: string } | null;
    return {
      ...p,
      cliente_nome: cliente?.nome ?? "",
      cliente_cpf: cliente?.cpf_cnpj ?? "",
    };
  });

  const colunas: Coluna[] =
    versao === "cliente"
      ? [
          { chave: "numero_cnj", rotulo: "Número do Processo" },
          { chave: "tipo_acao", rotulo: "Tipo de Ação" },
          { chave: "status", rotulo: "Situação" },
        ]
      : versao === "parceiro"
        ? [
            { chave: "numero_cnj", rotulo: "CNJ" },
            { chave: "cliente_nome", rotulo: "Cliente" },
            { chave: "area_direito", rotulo: "Área" },
            { chave: "status", rotulo: "Status" },
            { chave: "data_distribuicao", rotulo: "Distribuição" },
          ]
        : [
            { chave: "numero_cnj", rotulo: "CNJ" },
            { chave: "cliente_nome", rotulo: "Cliente" },
            { chave: "cliente_cpf", rotulo: "CPF/CNPJ" },
            { chave: "tipo", rotulo: "Tipo" },
            { chave: "area_direito", rotulo: "Área" },
            { chave: "tipo_acao", rotulo: "Ação" },
            { chave: "status", rotulo: "Status" },
            { chave: "valor_causa", rotulo: "Valor da Causa" },
            { chave: "vara", rotulo: "Vara" },
            { chave: "data_distribuicao", rotulo: "Distribuição" },
            { chave: "criado_em", rotulo: "Criado em" },
          ];
  return { rows, columns: colunas };
}

async function coletarFinanceiro(
  client: ReturnType<typeof createClient>,
  versao: Versao,
  filtros: Record<string, string | undefined>,
) {
  let q = client
    .from("honorarios_pagamentos")
    .select(
      "id,data_pagamento,valor_recebido,valor_parceiro,tipo_pagamento,forma_pagamento,observacao,clientes(nome),honorarios_contratos(numero_contrato,parceiros(nome))",
    )
    .limit(10000);
  if (filtros.data_inicio) q = q.gte("data_pagamento", filtros.data_inicio);
  if (filtros.data_fim) q = q.lte("data_pagamento", filtros.data_fim);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []).map((p: Record<string, unknown>) => {
    const cliente = p.clientes as { nome?: string } | null;
    const contrato = p.honorarios_contratos as
      | { numero_contrato?: string; parceiros?: { nome?: string } | null }
      | null;
    return {
      ...p,
      cliente_nome: cliente?.nome ?? "",
      contrato_numero: contrato?.numero_contrato ?? "",
      parceiro_nome: contrato?.parceiros?.nome ?? "",
    };
  });

  // Versão "parceiro" oculta valor recebido pelo escritório; versão "cliente" só mostra resumo
  const colunas: Coluna[] =
    versao === "cliente"
      ? [
          { chave: "data_pagamento", rotulo: "Data" },
          { chave: "tipo_pagamento", rotulo: "Tipo" },
          { chave: "valor_recebido", rotulo: "Valor (R$)" },
        ]
      : versao === "parceiro"
        ? [
            { chave: "data_pagamento", rotulo: "Data" },
            { chave: "cliente_nome", rotulo: "Cliente" },
            { chave: "tipo_pagamento", rotulo: "Tipo" },
            { chave: "valor_parceiro", rotulo: "Repasse (R$)" },
          ]
        : [
            { chave: "data_pagamento", rotulo: "Data" },
            { chave: "cliente_nome", rotulo: "Cliente" },
            { chave: "contrato_numero", rotulo: "Contrato" },
            { chave: "tipo_pagamento", rotulo: "Tipo" },
            { chave: "forma_pagamento", rotulo: "Forma" },
            { chave: "valor_recebido", rotulo: "Valor (R$)" },
            { chave: "valor_parceiro", rotulo: "Repasse (R$)" },
            { chave: "parceiro_nome", rotulo: "Parceiro" },
          ];
  return { rows, columns: colunas };
}

// =================== GERAÇÃO DE ARQUIVOS ===================

function gerarArquivo(
  rows: Record<string, unknown>[],
  columns: Coluna[],
  formato: Formato,
  nomeBase: string,
): { buffer: Uint8Array; nome: string; mime: string } {
  if (formato === "csv") return gerarCsv(rows, columns, nomeBase);
  if (formato === "xlsx") return gerarXlsx(rows, columns, nomeBase);
  return gerarPdf(rows, columns, nomeBase);
}

function gerarCsv(rows: Record<string, unknown>[], columns: Coluna[], nomeBase: string) {
  const linhas = [columns.map((c) => csvEscape(c.rotulo)).join(",")];
  for (const r of rows) {
    linhas.push(columns.map((c) => csvEscape(formatVal(r[c.chave]))).join(","));
  }
  // BOM UTF-8 para Excel
  const conteudo = "\uFEFF" + linhas.join("\r\n");
  return {
    buffer: new TextEncoder().encode(conteudo),
    nome: `${nomeBase}.csv`,
    mime: "text/csv;charset=utf-8",
  };
}

function csvEscape(v: string): string {
  if (v == null) return "";
  if (/[",\r\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function gerarXlsx(rows: Record<string, unknown>[], columns: Coluna[], nomeBase: string) {
  const aoa: unknown[][] = [columns.map((c) => c.rotulo)];
  for (const r of rows) aoa.push(columns.map((c) => formatVal(r[c.chave])));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return {
    buffer: new Uint8Array(buf),
    nome: `${nomeBase}.xlsx`,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

function gerarPdf(rows: Record<string, unknown>[], columns: Coluna[], nomeBase: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(nomeBase.replace(/_/g, " ").toUpperCase(), 40, 40);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} • ${rows.length} registro(s)`, 40, 56);

  autoTable(doc, {
    startY: 72,
    head: [columns.map((c) => c.rotulo)],
    body: rows.map((r) => columns.map((c) => formatVal(r[c.chave]))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 40, right: 40 },
  });

  const ab = doc.output("arraybuffer") as ArrayBuffer;
  return {
    buffer: new Uint8Array(ab),
    nome: `${nomeBase}.pdf`,
    mime: "application/pdf",
  };
}

function formatVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    // ISO date → dd/mm/yyyy quando aplicável
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return v;
  }
  return String(v);
}
