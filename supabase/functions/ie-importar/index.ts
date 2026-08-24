// Edge function: ie-importar
// Recebe { job_id, modulo, mapeamento, ignorar_erros } — lê o arquivo de "ie-arquivos"
// (já enviado pelo cliente), valida linha a linha e persiste em lotes.
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import Papa from "npm:papaparse@5.4.1";
import { z } from "npm:zod@3.23.8";

const BUCKET = "ie-arquivos";
const BATCH_SIZE = 200;

const BodySchema = z.object({
  job_id: z.string().uuid(),
  modulo: z.enum(["clientes", "processos"]),
  mapeamento: z.record(z.string()),
  ignorar_erros: z.boolean().default(false),
});

interface CampoSistema {
  chave: string;
  obrigatorio: boolean;
  validar?: (v: string) => string | null;
}

const CAMPOS_CLIENTES: CampoSistema[] = [
  { chave: "nome", obrigatorio: true },
  { chave: "cpf_cnpj", obrigatorio: true, validar: validarCpfCnpj },
  { chave: "email", obrigatorio: false, validar: validarEmail },
  { chave: "whatsapp", obrigatorio: false },
  { chave: "nascimento", obrigatorio: false, validar: validarData },
  { chave: "cidade", obrigatorio: false },
  { chave: "estado", obrigatorio: false },
  { chave: "profissao", obrigatorio: false },
];

const CAMPOS_PROCESSOS: CampoSistema[] = [
  { chave: "numero_cnj", obrigatorio: true, validar: validarCnj },
  { chave: "cliente_nome", obrigatorio: true },
  { chave: "cliente_cpf", obrigatorio: false, validar: validarCpfCnpj },
  { chave: "tipo", obrigatorio: false },
  { chave: "area_direito", obrigatorio: false },
  { chave: "tipo_acao", obrigatorio: false },
  { chave: "status", obrigatorio: false },
  { chave: "valor_causa", obrigatorio: false },
  { chave: "data_distribuicao", obrigatorio: false, validar: validarData },
  { chave: "vara", obrigatorio: false },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResp({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return jsonResp({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonResp({ error: parsed.error.flatten().fieldErrors }, 400);
    const { job_id, modulo, mapeamento, ignorar_erros } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) busca o job e valida ownership
    const { data: job, error: jobErr } = await admin
      .from("ie_jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return jsonResp({ error: "Job não encontrado" }, 404);
    if (job.iniciado_por !== userId) return jsonResp({ error: "Forbidden" }, 403);
    if (!job.arquivo_entrada_url) return jsonResp({ error: "Arquivo não enviado" }, 400);

    await admin.from("ie_jobs").update({ status: "processando" }).eq("id", job_id);

    try {
      // 2) baixa o arquivo do storage
      const { data: blob, error: dlErr } = await admin.storage
        .from(BUCKET)
        .download(job.arquivo_entrada_url);
      if (dlErr || !blob) throw dlErr ?? new Error("Falha ao baixar arquivo");

      const ext = (job.arquivo_entrada_nome ?? "").split(".").pop()?.toLowerCase();
      const rows = ext === "csv" ? await parseCsv(blob) : await parseXlsx(blob);

      // 3) valida
      const campos = modulo === "clientes" ? CAMPOS_CLIENTES : CAMPOS_PROCESSOS;
      const validadas = rows.map((row, idx) => validarLinha(row, campos, mapeamento, idx + 2));
      const erros = validadas.filter((l) => l.status === "erro");
      const validas = validadas.filter((l) => l.status !== "erro");

      if (erros.length > 0 && !ignorar_erros) {
        await admin
          .from("ie_jobs")
          .update({
            status: "erro",
            total_registros: rows.length,
            registros_ok: 0,
            registros_erro: erros.length,
            erros_json: erros.slice(0, 500).map((e) => ({
              linha: e.linha,
              campo: e.problemas[0]?.campo ?? "",
              erro: e.problemas.map((p) => p.mensagem).join("; "),
            })),
            mensagem: `${erros.length} linha(s) com erro — corrija ou ative "ignorar erros"`,
            concluido_em: new Date().toISOString(),
          })
          .eq("id", job_id);
        return jsonResp(
          { job_id, status: "erro", total: rows.length, erros: erros.length },
          200,
        );
      }

      // 4) persiste em lotes
      let okCount = 0;
      const errosPersist: { linha: number; erro: string }[] = [];
      for (let i = 0; i < validas.length; i += BATCH_SIZE) {
        const lote = validas.slice(i, i + BATCH_SIZE);
        try {
          const inseridos = await persistirLote(admin, modulo, lote, userId);
          okCount += inseridos;
        } catch (e) {
          errosPersist.push({
            linha: lote[0]?.linha ?? 0,
            erro: e instanceof Error ? e.message : "erro lote",
          });
        }
      }

      const falhas = rows.length - okCount;
      const status =
        falhas === 0 ? "concluido" : okCount === 0 ? "erro" : "concluido_parcial";

      await admin
        .from("ie_jobs")
        .update({
          status,
          total_registros: rows.length,
          registros_ok: okCount,
          registros_erro: falhas,
          erros_json: [
            ...erros.slice(0, 500).map((e) => ({
              linha: e.linha,
              campo: e.problemas[0]?.campo ?? "",
              erro: e.problemas.map((p) => p.mensagem).join("; "),
            })),
            ...errosPersist,
          ],
          mensagem: `Importação ${status} — ${okCount} ok, ${falhas} falha(s)`,
          concluido_em: new Date().toISOString(),
        })
        .eq("id", job_id);

      return jsonResp({ job_id, status, importados: okCount, falhas }, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      await admin
        .from("ie_jobs")
        .update({ status: "erro", mensagem: msg, concluido_em: new Date().toISOString() })
        .eq("id", job_id);
      throw e;
    }
  } catch (e) {
    console.error("ie-importar error:", e);
    return jsonResp({ error: e instanceof Error ? e.message : "Falha" }, 500);
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// =================== PARSERS ===================

async function parseCsv(blob: Blob): Promise<Record<string, string>[]> {
  const texto = await blob.text();
  const result = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => h.trim(),
  });
  return result.data;
}

async function parseXlsx(blob: Blob): Promise<Record<string, string>[]> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" });
  // detecta linha de header (mesma lógica do parser do frontend)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(matriz.length, 5); i++) {
    const linha = matriz[i] ?? [];
    const nonEmpty = linha.filter((c) => String(c).trim()).length;
    const primeiro = String(linha[0] ?? "").toLowerCase();
    if (nonEmpty >= 3 && !primeiro.startsWith("modelo") && !primeiro.startsWith("preencha")) {
      headerIdx = i;
      break;
    }
  }
  const headers = (matriz[headerIdx] ?? []).map((c) => String(c).trim()).filter(Boolean);
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < matriz.length; i++) {
    const linha = matriz[i] ?? [];
    if (linha.every((c) => !String(c).trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => (obj[h] = String(linha[idx] ?? "").trim()));
    out.push(obj);
  }
  return out;
}

// =================== VALIDAÇÃO ===================

interface LinhaValidada {
  linha: number;
  status: "ok" | "erro";
  valores: Record<string, string>;
  problemas: { campo: string; mensagem: string }[];
}

function validarLinha(
  row: Record<string, string>,
  campos: CampoSistema[],
  mapeamento: Record<string, string>,
  numLinha: number,
): LinhaValidada {
  const valores: Record<string, string> = {};
  const problemas: { campo: string; mensagem: string }[] = [];
  for (const campo of campos) {
    const colunaOrigem = mapeamento[campo.chave];
    const valor = colunaOrigem ? (row[colunaOrigem] ?? "").toString().trim() : "";
    valores[campo.chave] = valor;
    if (campo.obrigatorio && !valor) {
      problemas.push({ campo: campo.chave, mensagem: `${campo.chave} é obrigatório` });
      continue;
    }
    if (valor && campo.validar) {
      const erro = campo.validar(valor);
      if (erro) problemas.push({ campo: campo.chave, mensagem: erro });
    }
  }
  return {
    linha: numLinha,
    status: problemas.length > 0 ? "erro" : "ok",
    valores,
    problemas,
  };
}

// =================== PERSISTÊNCIA ===================

async function persistirLote(
  admin: ReturnType<typeof createClient>,
  modulo: "clientes" | "processos",
  lote: LinhaValidada[],
  userId: string,
): Promise<number> {
  if (modulo === "clientes") {
    const payload = lote.map((l) => ({
      nome: l.valores.nome,
      cpf_cnpj: l.valores.cpf_cnpj?.replace(/\D/g, "") || null,
      email: l.valores.email || null,
      whatsapp: l.valores.whatsapp || null,
      nascimento: normalizarData(l.valores.nascimento),
      cidade: l.valores.cidade || null,
      estado: l.valores.estado || null,
      profissao: l.valores.profissao || null,
      criado_por: userId,
    }));
    const { data, error } = await admin.from("clientes").insert(payload).select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }

  // processos
  const payload: Record<string, unknown>[] = [];
  for (const l of lote) {
    const cliente_id = await acharOuCriarCliente(
      admin,
      l.valores.cliente_nome,
      l.valores.cliente_cpf,
      userId,
    );
    payload.push({
      numero_cnj: l.valores.numero_cnj,
      cliente_id,
      tipo: l.valores.tipo || "judicial",
      area_direito: l.valores.area_direito || null,
      tipo_acao: l.valores.tipo_acao || null,
      status: l.valores.status || "em_andamento",
      valor_causa: l.valores.valor_causa
        ? Number(l.valores.valor_causa.replace(",", "."))
        : null,
      data_distribuicao: normalizarData(l.valores.data_distribuicao),
      vara: l.valores.vara || null,
      criado_por: userId,
    });
  }
  const { data, error } = await admin.from("processos").insert(payload).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function acharOuCriarCliente(
  admin: ReturnType<typeof createClient>,
  nome: string,
  cpf: string | undefined,
  userId: string,
): Promise<string> {
  const cpfLimpo = cpf?.replace(/\D/g, "") || null;
  if (cpfLimpo) {
    const { data } = await admin
      .from("clientes")
      .select("id")
      .eq("cpf_cnpj", cpfLimpo)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  const { data, error } = await admin
    .from("clientes")
    .insert({ nome, cpf_cnpj: cpfLimpo, criado_por: userId })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("falha ao criar cliente");
  return (data as { id: string }).id;
}

function normalizarData(v: string | undefined): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// =================== VALIDADORES ===================

function validarCpfCnpj(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return validarCpf(d) ? null : "CPF inválido";
  if (d.length === 14) return validarCnpj(d) ? null : "CNPJ inválido";
  return "CPF/CNPJ deve ter 11 ou 14 dígitos";
}

function validarCpf(cpf: string): boolean {
  if (/^(\d)\1+$/.test(cpf)) return false;
  const calc = (slice: number) => {
    let s = 0;
    for (let i = 0; i < slice; i++) s += parseInt(cpf[i]) * (slice + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
}

function validarCnpj(cnpj: string): boolean {
  if (/^(\d)\1+$/.test(cnpj)) return false;
  const calc = (digits: string, weights: number[]) => {
    const sum = digits.split("").reduce((acc, n, i) => acc + parseInt(n) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + d1, w2);
  return d1 === parseInt(cnpj[12]) && d2 === parseInt(cnpj[13]);
}

function validarCnj(v: string): string | null {
  const d = v.replace(/\D/g, "");
  return d.length === 20 ? null : "CNJ deve ter 20 dígitos";
}

function validarEmail(v: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Email inválido";
}

function validarData(v: string): string | null {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)
    ? null
    : "Data deve estar em dd/mm/aaaa ou aaaa-mm-dd";
}
