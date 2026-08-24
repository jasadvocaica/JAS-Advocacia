// Edge function: inss-importar-pdf
// Recebe { job_id, dry_run?, pular_protocolos? }
// Lê o PDF do "Portal de Atendimento INSS" do bucket "ie-arquivos",
// extrai linhas (Protocolo, Serviço, Nome, CPF, Protocolado em, Unidade,
// Situação, Última Atualização) e:
//   dry_run=true  → devolve a prévia (cliente existente / novo / duplicado)
//   dry_run=false → cria/atualiza processos administrativos vinculando por CPF
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.0/cors";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const BUCKET = "ie-arquivos";
const ORIGEM_TAG = "importacao_pdf_inss";

interface LinhaInss {
  protocolo: string;
  servico: string;
  nome: string;
  cpf: string;
  cpf_limpo: string;
  protocolado_em: string | null; // ISO
  unidade: string | null;
  situacao: string | null;
  ultima_atualizacao: string | null; // ISO datetime
}

type StatusValidacao =
  | "ok_novo_cliente"
  | "ok_cliente_existente"
  | "atualizar_existente"
  | "duplicado_pdf"
  | "campos_faltando";

interface ItemValidado extends LinhaInss {
  status_validacao: StatusValidacao;
  cliente_id: string | null;
  processo_id: string | null;
  campos_faltando: string[];
}

const PROTOCOLO_RE = /^\d{6,12}$/;
const CPF_RE = /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/;
const DATA_RE = /^(\d{2}\/\d{2}\/\d{4})$/;
const DATAHORA_RE = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})$/;

function brToIsoDate(d: string | null): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function brToIsoDateTime(s: string | null): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`;
}

function limparCpf(c: string): string {
  return c.replace(/\D/g, "");
}

/**
 * Mapeia o "serviço" do INSS em campos do nosso processo (área + tipo de ação).
 */
function mapearServico(servico: string): { area: string; tipo_acao: string } {
  const s = servico.toLowerCase();
  if (s.includes("salário-maternidade") || s.includes("salario-maternidade")) {
    return { area: "previdenciario", tipo_acao: "Salário-Maternidade" };
  }
  if (s.includes("aposentadoria")) {
    return { area: "previdenciario", tipo_acao: "Aposentadoria" };
  }
  if (s.includes("pensão") || s.includes("pensao")) {
    return { area: "previdenciario", tipo_acao: "Pensão por Morte" };
  }
  if (s.includes("auxílio") || s.includes("auxilio")) {
    return { area: "previdenciario", tipo_acao: "Auxílio Previdenciário" };
  }
  if (s.includes("benefício assistencial") || s.includes("beneficio assistencial") || s.includes("loas")) {
    return { area: "assistencial", tipo_acao: "BPC/LOAS" };
  }
  return { area: "previdenciario", tipo_acao: servico };
}

/**
 * Mapeia situação do INSS para o status do processo.
 */
function mapearStatus(situacao: string | null): string {
  if (!situacao) return "em_andamento";
  const s = situacao.toUpperCase();
  if (s.includes("CONCLU")) return "concluido";
  if (s.includes("EXIG")) return "exigencia";
  if (s.includes("INDEFER")) return "indeferido";
  if (s.includes("DEFER")) return "deferido";
  return "em_andamento";
}

/**
 * Parser tolerante: percorre tokens linha-a-linha. Cada registro começa quando
 * encontramos um protocolo numérico, e termina quando encontramos uma
 * data+hora (última atualização).
 */
function extrairLinhas(texto: string): LinhaInss[] {
  // Tokeniza por linha removendo cabeçalhos/rodapés
  const tokens = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      if (/^Portal de Atendimento/i.test(l)) return false;
      if (/^https?:\/\//i.test(l)) return false;
      if (/^\d+\/\d+$/.test(l)) return false; // paginação "1/8"
      if (/^\d{2}\/\d{2}\/\d{4},\s*\d{2}:\d{2}$/.test(l)) return false; // header "27/04/2026, 14:36"
      if (/^(Protocolo|Serviço|Nome|CPF|Protocolado em|Unidade|Situação|Última Atualização|Ações)$/i.test(l)) return false;
      return true;
    });

  const resultado: LinhaInss[] = [];
  let i = 0;
  while (i < tokens.length) {
    // procura próximo protocolo
    if (!PROTOCOLO_RE.test(tokens[i])) {
      i++;
      continue;
    }

    // janela: do protocolo até a próxima data+hora (última atualização)
    let j = i + 1;
    while (j < tokens.length && !DATAHORA_RE.test(tokens[j])) {
      // se topar com outro protocolo antes da data+hora, aborta esse registro
      if (PROTOCOLO_RE.test(tokens[j]) && tokens[j].length >= 6 && j > i + 3) break;
      j++;
    }
    if (j >= tokens.length || !DATAHORA_RE.test(tokens[j])) {
      i++;
      continue;
    }

    const protocolo = tokens[i];
    const ultimaAtualizacao = tokens[j];
    const meio = tokens.slice(i + 1, j);

    // Acha CPF e data de protocolo no meio
    let cpfIdx = -1;
    let dataIdx = -1;
    for (let k = 0; k < meio.length; k++) {
      if (cpfIdx < 0 && CPF_RE.test(meio[k])) cpfIdx = k;
      if (dataIdx < 0 && DATA_RE.test(meio[k])) dataIdx = k;
    }
    if (cpfIdx < 0) {
      i = j + 1;
      continue;
    }

    const cpfMatch = meio[cpfIdx].match(CPF_RE)!;
    const cpf = cpfMatch[1];
    const protocoladoEm = dataIdx >= 0 ? meio[dataIdx].match(DATA_RE)![1] : null;

    // serviço = tokens entre protocolo e nome (que vem antes do CPF)
    const servico = meio.slice(0, Math.max(0, cpfIdx - 1)).join(" ").trim();
    const nome = cpfIdx > 0 ? meio[cpfIdx - 1] : "";

    // situação = entre dataIdx e fim do meio, geralmente últimos tokens; unidade = restante
    const aposData = dataIdx >= 0 ? meio.slice(dataIdx + 1) : [];
    // O último token de aposData é a Situação (ex: "CONCLUÍDA", "Em Análise", "EXIGÊNCIA")
    const situacao = aposData.length > 0 ? aposData[aposData.length - 1] : null;
    const unidade = aposData.slice(0, Math.max(0, aposData.length - 1)).join(" ").trim() || null;

    resultado.push({
      protocolo,
      servico,
      nome,
      cpf,
      cpf_limpo: limparCpf(cpf),
      protocolado_em: brToIsoDate(protocoladoEm),
      unidade,
      situacao,
      ultima_atualizacao: brToIsoDateTime(ultimaAtualizacao),
    });

    i = j + 1;
  }
  return resultado;
}

async function validarLinhas(
  admin: ReturnType<typeof createClient>,
  linhas: LinhaInss[],
): Promise<ItemValidado[]> {
  const itens: ItemValidado[] = [];
  const vistosProtocolo = new Set<string>();

  // 1) Procura clientes existentes por CPF (em chunks)
  const cpfs = [...new Set(linhas.map((l) => l.cpf_limpo).filter(Boolean))];
  const clientePorCpf = new Map<string, string>();
  for (let i = 0; i < cpfs.length; i += 100) {
    const lote = cpfs.slice(i, i + 100);
    // Tentamos achar tanto o formatado quanto o limpo
    const formatados = lote.map((c) =>
      c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c,
    );
    const todos = [...lote, ...formatados];
    const { data } = await admin
      .from("clientes")
      .select("id, cpf_cnpj")
      .in("cpf_cnpj", todos);
    for (const r of data ?? []) {
      if (r.cpf_cnpj) clientePorCpf.set(limparCpf(r.cpf_cnpj as string), r.id as string);
    }
  }

  // 2) Procura processos administrativos existentes por nb_inss (= protocolo)
  const protocolos = [...new Set(linhas.map((l) => l.protocolo))];
  const processoPorProtocolo = new Map<string, string>();
  for (let i = 0; i < protocolos.length; i += 100) {
    const lote = protocolos.slice(i, i + 100);
    const { data } = await admin
      .from("processos")
      .select("id, nb_inss")
      .in("nb_inss", lote);
    for (const r of data ?? []) {
      if (r.nb_inss) processoPorProtocolo.set(r.nb_inss as string, r.id as string);
    }
  }

  for (const l of linhas) {
    const campos_faltando: string[] = [];
    if (!l.nome) campos_faltando.push("nome");
    if (!l.cpf_limpo || l.cpf_limpo.length !== 11) campos_faltando.push("cpf");
    if (!l.servico) campos_faltando.push("servico");

    let status: StatusValidacao;
    if (vistosProtocolo.has(l.protocolo)) {
      status = "duplicado_pdf";
    } else if (campos_faltando.length > 0) {
      status = "campos_faltando";
    } else if (processoPorProtocolo.has(l.protocolo)) {
      status = "atualizar_existente";
    } else if (clientePorCpf.has(l.cpf_limpo)) {
      status = "ok_cliente_existente";
    } else {
      status = "ok_novo_cliente";
    }
    vistosProtocolo.add(l.protocolo);

    itens.push({
      ...l,
      status_validacao: status,
      cliente_id: clientePorCpf.get(l.cpf_limpo) ?? null,
      processo_id: processoPorProtocolo.get(l.protocolo) ?? null,
      campos_faltando,
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

    const body = await req.json();
    const job_id: string | undefined = body?.job_id;
    const dry_run: boolean = !!body?.dry_run;
    const pularProtocolos: Set<string> = new Set(
      Array.isArray(body?.pular_protocolos) ? body.pular_protocolos : [],
    );
    if (!job_id) return jsonResp({ error: "job_id obrigatório" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: job, error: jobErr } = await admin
      .from("ie_jobs")
      .select("*")
      .eq("id", job_id)
      .single();
    if (jobErr || !job) return jsonResp({ error: "Job não encontrado" }, 404);
    if (job.iniciado_por !== userId) return jsonResp({ error: "Forbidden" }, 403);

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

    let textoPdf = "";
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buffer);
      const { text } = await extractText(pdf, { mergePages: true });
      textoPdf = Array.isArray(text) ? text.join("\n") : (text ?? "");
      console.log(`[inss-importar-pdf] PDF lido: ${textoPdf.length} chars`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao parsear PDF";
      console.error(`[inss-importar-pdf] Falha ao ler PDF:`, e);
      await admin.from("ie_jobs").update({
        status: "erro",
        mensagem: `Falha ao ler PDF: ${msg}`,
        concluido_em: new Date().toISOString(),
      }).eq("id", job_id);
      return jsonResp({ error: msg }, 500);
    }

    const linhas = extrairLinhas(textoPdf);
    console.log(`[inss-importar-pdf] Linhas extraídas: ${linhas.length}`);
    if (linhas.length === 0) {
      await admin.from("ie_jobs").update({
        status: "erro",
        mensagem: "Nenhum protocolo INSS encontrado no PDF.",
        total_registros: 0,
        concluido_em: new Date().toISOString(),
      }).eq("id", job_id);
      return jsonResp({ erro: "Nenhuma linha extraída" }, 200);
    }

    const itens = await validarLinhas(admin, linhas);
    const resumo = {
      total: itens.length,
      ok_cliente_existente: itens.filter((i) => i.status_validacao === "ok_cliente_existente").length,
      ok_novo_cliente: itens.filter((i) => i.status_validacao === "ok_novo_cliente").length,
      atualizar_existente: itens.filter((i) => i.status_validacao === "atualizar_existente").length,
      duplicado_pdf: itens.filter((i) => i.status_validacao === "duplicado_pdf").length,
      campos_faltando: itens.filter((i) => i.status_validacao === "campos_faltando").length,
    };

    if (dry_run) {
      await admin.from("ie_jobs").update({
        status: "aguardando",
        total_registros: itens.length,
        registros_ok: 0,
        registros_erro: 0,
        erros_json: itens.map((i) => ({
          protocolo: i.protocolo,
          status: i.status_validacao,
          nome: i.nome,
          cpf: i.cpf,
          servico: i.servico,
          situacao: i.situacao,
        })),
        mensagem: `Pré-validação: ${resumo.ok_cliente_existente + resumo.ok_novo_cliente} novos, ${resumo.atualizar_existente} para atualizar.`,
      }).eq("id", job_id);

      return jsonResp({ ok: true, modo: "dry_run", resumo, itens });
    }

    // GRAVAÇÃO
    const aProcessar = itens.filter((i) => {
      if (i.status_validacao === "duplicado_pdf") return false;
      if (i.status_validacao === "campos_faltando") return false;
      if (pularProtocolos.has(i.protocolo)) return false;
      return true;
    });

    await admin.from("ie_jobs").update({
      status: "processando",
      total_registros: aProcessar.length,
      registros_ok: 0,
      registros_erro: 0,
      erros_json: [],
      mensagem: `Iniciando processamento de ${aProcessar.length} protocolos…`,
    }).eq("id", job_id);

    const detalhes: { protocolo: string; status: string; mensagem?: string }[] = [];
    let ok = 0;
    let err = 0;

    for (let idx = 0; idx < aProcessar.length; idx++) {
      const it = aProcessar[idx];
      try {
        // 1) Garante cliente
        let clienteId = it.cliente_id;
        if (!clienteId) {
          const cpfFmt = `${it.cpf_limpo.slice(0, 3)}.${it.cpf_limpo.slice(3, 6)}.${it.cpf_limpo.slice(6, 9)}-${it.cpf_limpo.slice(9)}`;
          const { data: novoCli, error: cErr } = await admin
            .from("clientes")
            .insert({
              nome: it.nome,
              cpf_cnpj: cpfFmt,
              tipo_pessoa: "fisica",
              status: "ativo",
              ativo: true,
              origem: ORIGEM_TAG,
              criado_por: userId,
            })
            .select("id")
            .single();
          if (cErr || !novoCli) throw new Error(`Cliente: ${cErr?.message ?? "erro"}`);
          clienteId = novoCli.id as string;
        }

        const mapa = mapearServico(it.servico);
        const statusProc = mapearStatus(it.situacao);
        const obs = [
          `Importado do Portal de Atendimento INSS.`,
          `Serviço: ${it.servico}`,
          it.unidade ? `Unidade: ${it.unidade}` : null,
          it.situacao ? `Situação: ${it.situacao}` : null,
          it.ultima_atualizacao ? `Última atualização: ${it.ultima_atualizacao}` : null,
        ].filter(Boolean).join("\n");

        // 2) Cria ou atualiza processo
        let processoId = it.processo_id;
        if (processoId) {
          const { error: uErr } = await admin
            .from("processos")
            .update({
              status: statusProc,
              fase_administrativa: it.situacao,
              observacoes_internas: obs,
            })
            .eq("id", processoId);
          if (uErr) throw new Error(`Processo: ${uErr.message}`);
          detalhes.push({ protocolo: it.protocolo, status: "atualizado" });
        } else {
          const { data: novoP, error: pErr } = await admin
            .from("processos")
            .insert({
              nb_inss: it.protocolo,
              tipo: "administrativo",
              area_direito: mapa.area,
              tipo_acao: mapa.tipo_acao,
              status: statusProc,
              fase_administrativa: it.situacao,
              data_distribuicao: it.protocolado_em,
              cliente_id: clienteId,
              observacoes_internas: obs,
              datajud_ativo: false,
              criado_por: userId,
            })
            .select("id")
            .single();
          if (pErr || !novoP) throw new Error(`Processo: ${pErr?.message ?? "erro"}`);
          processoId = novoP.id as string;
          detalhes.push({ protocolo: it.protocolo, status: "criado" });
        }

        // 3) Andamento de sincronização
        const dataAnd = it.ultima_atualizacao
          ? it.ultima_atualizacao.slice(0, 10)
          : (it.protocolado_em ?? new Date().toISOString().slice(0, 10));
        const desc = `Protocolo ${it.protocolo} — ${it.servico}. Situação: ${it.situacao ?? "—"}.${it.unidade ? ` Unidade: ${it.unidade}.` : ""}`;
        await admin.from("andamentos").insert({
          processo_id: processoId,
          data: dataAnd,
          descricao: desc,
          fonte: "inss_portal",
          gera_acao: false,
          criado_por: userId,
        });

        ok++;
      } catch (e) {
        err++;
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        detalhes.push({ protocolo: it.protocolo, status: "erro", mensagem: msg });
      }

      await admin.from("ie_jobs").update({
        registros_ok: ok,
        registros_erro: err,
        erros_json: detalhes,
        mensagem: `Processado ${idx + 1}/${aProcessar.length}`,
      }).eq("id", job_id);
    }

    const statusFinal = err === 0 ? "concluido" : ok === 0 ? "erro" : "concluido_parcial";
    await admin.from("ie_jobs").update({
      status: statusFinal,
      registros_ok: ok,
      registros_erro: err,
      erros_json: detalhes,
      concluido_em: new Date().toISOString(),
      mensagem: `Importação INSS concluída: ${ok} ok, ${err} erro(s).`,
    }).eq("id", job_id);

    return jsonResp({ ok: true, ok_count: ok, err_count: err, resumo });
  } catch (e) {
    console.error(`[inss-importar-pdf] Erro não tratado:`, e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return jsonResp({ error: msg }, 500);
  }
});
