// Edge function: pdpj-importar-pdf
// Recebe { job_id, dry_run?, pular_cnjs? } — lê o PDF do bucket "ie-arquivos",
// extrai processos (CNJ, partes, tribunal, vara, data de distribuição) e:
//  - dry_run=true → apenas retorna a pré-validação (duplicados/faltantes), sem gravar
//  - dry_run=false (padrão) → cria clientes + processos, pulando os CNJs em pular_cnjs
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";
import getDocument from "npm:pdf-parse@1.1.1";

const BUCKET = "ie-arquivos";
const ORIGEM_TAG = "importacao_pdf_pdpj";

interface ProcessoExtraido {
  cnj: string;
  cnj_limpo: string;
  data_distribuicao: string | null; // ISO
  autor: string;
  reu: string | null;
  tribunal_sigla: string | null;
  vara: string | null;
}

interface ErroLinha {
  linha: number;
  campo: string;
  erro: string;
  valor?: string;
}

type StatusValidacao = "ok" | "duplicado_pdf" | "duplicado_banco" | "campos_faltando";

interface ItemValidado extends ProcessoExtraido {
  status_validacao: StatusValidacao;
  campos_faltando: string[];
  autor_generico: boolean;
}

const CNJ_RE =
  /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/g;
const DATE_RE = /\b(\d{2}\/\d{2}\/\d{4})\b/;
const TRIBUNAL_RE =
  /^(TJ[A-Z]{2}|TJM[A-Z]{0,2}|TRF\d|TST|STJ|STF|TRT\d+)\b(.*)$/m;
const PARTE_NAO_IDENT_RE = /parte\s+n[ãa]o\s+identificada/i;

function brToIso(d: string | null): string | null {
  if (!d) return null;
  const [dd, mm, yyyy] = d.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function limparCnj(c: string): string {
  return c.replace(/\D/g, "");
}

/**
 * Extrai blocos de processo do texto puro do PDF do PDPJ.
 * O parser é tolerante: para cada CNJ encontrado, examina ~25 linhas ao redor
 * em busca de partes (formato "AUTOR X RÉU"), data e tribunal.
 */
function extrairProcessos(texto: string): ProcessoExtraido[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const resultado: ProcessoExtraido[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < linhas.length; i++) {
    const matches = [...linhas[i].matchAll(CNJ_RE)];
    if (matches.length === 0) continue;

    for (const m of matches) {
      const cnj = m[1];
      if (vistos.has(cnj)) continue;
      vistos.add(cnj);

      // Janela de contexto ao redor do CNJ
      const ini = Math.max(0, i - 5);
      const fim = Math.min(linhas.length, i + 25);
      const contexto = linhas.slice(ini, fim).join(" \n ");

      // Data de distribuição: primeira data depois do CNJ no contexto
      const idxCnj = contexto.indexOf(cnj);
      const aposCnj = idxCnj >= 0 ? contexto.slice(idxCnj) : contexto;
      const dataMatch = aposCnj.match(DATE_RE);
      const data_distribuicao = brToIso(dataMatch?.[1] ?? null);

      // Partes: linha contendo " X "
      let autor = "Parte não identificada";
      let reu: string | null = null;
      const linhaPartes = linhas
        .slice(ini, fim)
        .find((l) => / X /.test(l) && !/^\(/.test(l));
      if (linhaPartes) {
        let candidato = linhaPartes;
        // Se vier prefixado por "(1234) DIREITO ...", pega a partir do último ") "
        if (/\) /.test(candidato)) {
          const partes = candidato.split(" X ", 2);
          if (partes.length === 2 && /\) /.test(partes[0])) {
            partes[0] = partes[0].split(") ").slice(-1)[0];
            candidato = partes.join(" X ");
          }
        }
        const [a, r] = candidato.split(" X ", 2);
        if (a && r) {
          autor = a.replace(/\s+e OUTROS.*$/i, "").trim();
          reu = r.trim();
        }
      }

      // Tribunal/vara: linha que começa com sigla
      let tribunal_sigla: string | null = null;
      let vara: string | null = null;
      const linhaTrib = linhas.slice(ini, fim).find((l) => TRIBUNAL_RE.test(l));
      if (linhaTrib) {
        const partes = linhaTrib.split(" - ").map((p) => p.trim());
        tribunal_sigla = partes[0];
        vara = partes.length > 1 ? partes.slice(1).join(" - ") : null;
      }

      resultado.push({
        cnj,
        cnj_limpo: limparCnj(cnj),
        data_distribuicao,
        autor,
        reu,
        tribunal_sigla,
        vara,
      });
    }
  }
  return resultado;
}

/**
 * Pré-valida a lista extraída:
 *  1) Detecta CNJs duplicados dentro do próprio PDF (mantém o primeiro)
 *  2) Detecta CNJs já cadastrados no banco
 *  3) Detecta campos obrigatórios faltando (autor, tribunal, vara, data)
 */
async function validarProcessos(
  admin: ReturnType<typeof createClient>,
  processos: ProcessoExtraido[],
): Promise<ItemValidado[]> {
  const itens: ItemValidado[] = [];
  const vistosLimpo = new Set<string>();

  // Consulta em lote o que já existe no banco (por cnj_limpo)
  const cnjsLimpo = [...new Set(processos.map((p) => p.cnj_limpo))];
  const existentesBanco = new Set<string>();
  // chunked para evitar URL grande
  for (let i = 0; i < cnjsLimpo.length; i += 100) {
    const lote = cnjsLimpo.slice(i, i + 100);
    const { data } = await admin
      .from("processos")
      .select("numero_cnj_limpo")
      .in("numero_cnj_limpo", lote);
    for (const r of data ?? []) {
      if (r.numero_cnj_limpo) existentesBanco.add(r.numero_cnj_limpo);
    }
  }

  for (const p of processos) {
    const campos_faltando: string[] = [];
    const autor_generico = PARTE_NAO_IDENT_RE.test(p.autor);
    if (autor_generico) campos_faltando.push("autor");
    if (!p.tribunal_sigla) campos_faltando.push("tribunal");
    if (!p.vara) campos_faltando.push("vara");
    if (!p.data_distribuicao) campos_faltando.push("data_distribuicao");
    if (!p.reu) campos_faltando.push("reu");

    let status_validacao: StatusValidacao = "ok";
    if (vistosLimpo.has(p.cnj_limpo)) {
      status_validacao = "duplicado_pdf";
    } else if (existentesBanco.has(p.cnj_limpo)) {
      status_validacao = "duplicado_banco";
    } else if (campos_faltando.length > 0) {
      status_validacao = "campos_faltando";
    }
    vistosLimpo.add(p.cnj_limpo);

    itens.push({
      ...p,
      status_validacao,
      campos_faltando,
      autor_generico,
    });
  }

  return itens;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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
    const { data: claims } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) return jsonResp({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const job_id: string | undefined = body?.job_id;
    const dry_run: boolean = !!body?.dry_run;
    const pularCnjs: Set<string> = new Set(
      Array.isArray(body?.pular_cnjs) ? body.pular_cnjs.map(limparCnj) : [],
    );
    if (!job_id) return jsonResp({ error: "job_id obrigatório" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Carrega job e valida ownership
    const { data: job, error: jobErr } = await admin
      .from("ie_jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return jsonResp({ error: "Job não encontrado" }, 404);
    if (job.iniciado_por !== userId) {
      return jsonResp({ error: "Forbidden" }, 403);
    }

    // 2) Baixa PDF do storage
    if (!job.arquivo_entrada_url) {
      await admin.from("ie_jobs").update({
        status: "erro",
        mensagem: "Arquivo do job não encontrado.",
        concluido_em: new Date().toISOString(),
      }).eq("id", job_id);
      return jsonResp({ error: "Arquivo não encontrado" }, 400);
    }

    const { data: file, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(job.arquivo_entrada_url);
    if (dlErr || !file) {
      await admin.from("ie_jobs").update({
        status: "erro",
        mensagem: `Falha ao baixar PDF: ${dlErr?.message ?? "desconhecido"}`,
        concluido_em: new Date().toISOString(),
      }).eq("id", job_id);
      return jsonResp({ error: "Falha ao baixar PDF" }, 500);
    }

    // 3) Extrai texto do PDF
    let textoPdf = "";
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const result = await getDocument(buffer);
      textoPdf = result?.text ?? "";
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao parsear PDF";
      await admin.from("ie_jobs").update({
        status: "erro",
        mensagem: `Falha ao ler PDF: ${msg}`,
        concluido_em: new Date().toISOString(),
      }).eq("id", job_id);
      return jsonResp({ error: msg }, 500);
    }

    const processosBrutos = extrairProcessos(textoPdf);

    if (processosBrutos.length === 0) {
      await admin.from("ie_jobs").update({
        status: "erro",
        mensagem: "Nenhum processo encontrado no PDF (verifique se é o relatório do PDPJ).",
        total_registros: 0,
        concluido_em: new Date().toISOString(),
      }).eq("id", job_id);
      return jsonResp({ erro: "Nenhum processo extraído" }, 200);
    }

    // 4) PRÉ-VALIDAÇÃO (sempre roda)
    const itens = await validarProcessos(admin, processosBrutos);
    const resumo = {
      total: itens.length,
      ok: itens.filter((i) => i.status_validacao === "ok").length,
      duplicado_pdf: itens.filter((i) => i.status_validacao === "duplicado_pdf").length,
      duplicado_banco: itens.filter((i) => i.status_validacao === "duplicado_banco").length,
      campos_faltando: itens.filter((i) => i.status_validacao === "campos_faltando").length,
    };

    if (dry_run) {
      // Apenas guarda a prévia no job e retorna
      await admin.from("ie_jobs").update({
        status: "aguardando",
        total_registros: itens.length,
        registros_ok: 0,
        registros_erro: 0,
        erros_json: itens.map((i) => ({
          cnj: i.cnj,
          status: i.status_validacao,
          autor: i.autor,
          reu: i.reu,
          tribunal: i.tribunal_sigla,
          vara: i.vara,
          data_distribuicao: i.data_distribuicao,
          campos_faltando: i.campos_faltando,
        })),
        mensagem: `Pré-validação: ${resumo.ok} ok, ${resumo.duplicado_pdf + resumo.duplicado_banco} duplicado(s), ${resumo.campos_faltando} com campos faltando.`,
      }).eq("id", job_id);

      return jsonResp({ ok: true, modo: "dry_run", resumo, itens });
    }

    // 5) GRAVAÇÃO — pula duplicatas (PDF e banco) e itens explicitamente pulados
    // Por padrão, itens com `campos_faltando` ainda são gravados (autor genérico
    // vira "Parte não identificada"); o usuário pode optar por excluí-los via
    // `pular_cnjs`.
    const aGravar = itens.filter((i) => {
      if (i.status_validacao === "duplicado_pdf") return false;
      if (i.status_validacao === "duplicado_banco") return false;
      if (pularCnjs.has(i.cnj_limpo)) return false;
      return true;
    });

    await admin.from("ie_jobs").update({
      status: "processando",
      total_registros: aGravar.length,
      registros_ok: 0,
      registros_erro: 0,
      erros_json: [],
      mensagem: `Iniciando inserção de ${aGravar.length} processos…`,
    }).eq("id", job_id);

    const erros: ErroLinha[] = [];
    const detalhes: { cnj: string; status: "ok" | "erro" | "duplicado"; mensagem?: string }[] = [];
    let ok = 0;
    let err = 0;

    // Cache de cliente_id por nome para deduplicar
    const cacheClientes = new Map<string, string>();

    for (let idx = 0; idx < aGravar.length; idx++) {
      const p = aGravar[idx];

      try {
        // Re-checa duplicidade no momento da gravação (race condition safety)
        const { data: existentes } = await admin
          .from("processos")
          .select("id")
          .or(`numero_cnj.eq.${p.cnj},numero_cnj_limpo.eq.${p.cnj_limpo}`)
          .limit(1);
        const existente = existentes?.[0];

        if (existente) {
          detalhes.push({
            cnj: p.cnj,
            status: "duplicado",
            mensagem: "Processo já cadastrado",
          });
          ok++;
        } else {
          // Garante cliente
          let cliente_id = cacheClientes.get(p.autor);
          if (!cliente_id) {
            const { data: existenteC } = await admin
              .from("clientes")
              .select("id")
              .eq("nome", p.autor)
              .maybeSingle();
            if (existenteC) {
              cliente_id = existenteC.id as string;
            } else {
              const { data: novoC, error: cErr } = await admin
                .from("clientes")
                .insert({
                  nome: p.autor,
                  tipo_pessoa: "fisica",
                  status: "ativo",
                  ativo: true,
                  origem: ORIGEM_TAG,
                  criado_por: userId,
                })
                .select("id")
                .single();
              if (cErr || !novoC) {
                throw new Error(`Cliente: ${cErr?.message ?? "erro ao inserir"}`);
              }
              cliente_id = novoC.id as string;
            }
            cacheClientes.set(p.autor, cliente_id);
          }

          // Insere processo
          const obs = p.reu
            ? `Importado do Portal PDPJ. Réu: ${p.reu}`
            : "Importado do Portal PDPJ";

          const { data: novoP, error: pErr } = await admin
            .from("processos")
            .insert({
              numero_cnj: p.cnj,
              numero_cnj_limpo: p.cnj_limpo,
              tipo: "judicial",
              tribunal: p.tribunal_sigla,
              tribunal_sigla: p.tribunal_sigla,
              vara: p.vara,
              data_distribuicao: p.data_distribuicao,
              status: "em_andamento",
              cliente_id,
              observacoes_internas: obs,
              datajud_ativo: true,
              criado_por: userId,
            })
            .select("id")
            .single();
          if (pErr) throw new Error(pErr.message);

          // Andamento inicial: distribuição (órgão julgador + partes)
          // Vinculação defensiva: confirma o processo_id consultando pelo CNJ
          // limpo, garantindo que o andamento NUNCA seja gravado em outro processo.
          if (novoP?.id) {
            const { data: confirmacao, error: confErr } = await admin
              .from("processos")
              .select("id, numero_cnj_limpo")
              .eq("id", novoP.id)
              .eq("numero_cnj_limpo", p.cnj_limpo)
              .maybeSingle();

            if (confErr || !confirmacao) {
              throw new Error(
                `Falha ao confirmar vínculo do andamento ao CNJ ${p.cnj}`,
              );
            }

            const orgao =
              [p.vara, p.tribunal_sigla].filter(Boolean).join(" — ") ||
              "Órgão não informado";
            const partes = p.reu
              ? `${p.autor} × ${p.reu}`
              : p.autor;
            const dataAnd =
              p.data_distribuicao ?? new Date().toISOString().slice(0, 10);

            const { error: andErr } = await admin.from("andamentos").insert({
              processo_id: confirmacao.id,
              data: dataAnd,
              descricao: `Distribuição [CNJ ${p.cnj}] — ${orgao}. Partes: ${partes}.`,
              fonte: "pdpj_pdf",
              gera_acao: false,
              criado_por: userId,
            });
            if (andErr) {
              throw new Error(`Andamento: ${andErr.message}`);
            }
          }

          ok++;
          detalhes.push({ cnj: p.cnj, status: "ok" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        err++;
        erros.push({
          linha: idx + 1,
          campo: "processo",
          erro: msg,
          valor: p.cnj,
        });
        detalhes.push({ cnj: p.cnj, status: "erro", mensagem: msg });
      }

      await admin.from("ie_jobs").update({
        registros_ok: ok,
        registros_erro: err,
        erros_json: detalhes,
        mensagem: `Processado ${idx + 1}/${aGravar.length}`,
      }).eq("id", job_id);
    }

    const statusFinal =
      err === 0 ? "concluido" : ok === 0 ? "erro" : "concluido_parcial";

    await admin.from("ie_jobs").update({
      status: statusFinal,
      registros_ok: ok,
      registros_erro: err,
      erros_json: detalhes,
      concluido_em: new Date().toISOString(),
      mensagem: `${ok} processos cadastrados, ${err} com erro.`,
    }).eq("id", job_id);

    return jsonResp({
      ok: true,
      total: aGravar.length,
      sucesso: ok,
      erros: err,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return jsonResp({ error: msg }, 500);
  }
});
