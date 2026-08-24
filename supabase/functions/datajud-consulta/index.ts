// Edge Function: datajud-consulta
// Consulta DataJud para 1 processo (manual) OU dispara job em todos os processos ativos.
// Body: { modo: "processo_unico" | "manual" | "agendado", processo_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const BASE_URL = "https://api-publica.datajud.cnj.jus.br";

// Aliases por tribunal (replica src/lib/datajud.ts)
export const TRIBUNAL_ALIAS: Record<string, string> = {
  TST: "api_publica_tst", TSE: "api_publica_tse", STJ: "api_publica_stj", STM: "api_publica_stm",
  TRF1: "api_publica_trf1", TRF2: "api_publica_trf2", TRF3: "api_publica_trf3",
  TRF4: "api_publica_trf4", TRF5: "api_publica_trf5", TRF6: "api_publica_trf6",
  TJAC: "api_publica_tjac", TJAL: "api_publica_tjal", TJAM: "api_publica_tjam", TJAP: "api_publica_tjap",
  TJBA: "api_publica_tjba", TJCE: "api_publica_tjce", TJDFT: "api_publica_tjdft", TJES: "api_publica_tjes",
  TJGO: "api_publica_tjgo", TJMA: "api_publica_tjma", TJMG: "api_publica_tjmg", TJMS: "api_publica_tjms",
  TJMT: "api_publica_tjmt", TJPA: "api_publica_tjpa", TJPB: "api_publica_tjpb", TJPE: "api_publica_tjpe",
  TJPI: "api_publica_tjpi", TJPR: "api_publica_tjpr", TJRJ: "api_publica_tjrj", TJRN: "api_publica_tjrn",
  TJRO: "api_publica_tjro", TJRR: "api_publica_tjrr", TJRS: "api_publica_tjrs", TJSC: "api_publica_tjsc",
  TJSE: "api_publica_tjse", TJSP: "api_publica_tjsp", TJTO: "api_publica_tjto",
  TRT1: "api_publica_trt1", TRT2: "api_publica_trt2", TRT3: "api_publica_trt3", TRT4: "api_publica_trt4",
  TRT5: "api_publica_trt5", TRT6: "api_publica_trt6", TRT7: "api_publica_trt7", TRT8: "api_publica_trt8",
  TRT9: "api_publica_trt9", TRT10: "api_publica_trt10", TRT11: "api_publica_trt11", TRT12: "api_publica_trt12",
  TRT13: "api_publica_trt13", TRT14: "api_publica_trt14", TRT15: "api_publica_trt15", TRT16: "api_publica_trt16",
  TRT17: "api_publica_trt17", TRT18: "api_publica_trt18", TRT19: "api_publica_trt19", TRT20: "api_publica_trt20",
  TRT21: "api_publica_trt21", TRT22: "api_publica_trt22", TRT23: "api_publica_trt23", TRT24: "api_publica_trt24",
};

interface DataJudMovimento {
  codigo?: number;
  nome?: string;
  dataHora?: string;
  complemento?: any;
  complementosTabelados?: any[];
}

// Constrói o header Authorization no formato exigido pela API DataJud do CNJ:
// "APIKey <chave>" — exatamente um espaço, sem aspas/caracteres extras.
// Exportado para ser validado em testes automatizados.
export function buildDataJudAuthHeader(apiKey: string): string {
  return `APIKey ${apiKey}`;
}

/**
 * Formata um CNJ de 20 dígitos no padrão NNNNNNN-DD.AAAA.J.TT.OOOO.
 * O índice do DataJud armazena `numeroProcesso` com pontuação,
 * então buscas por dígitos puros podem não retornar hits em alguns
 * tribunais. Tentamos as duas formas para robustez.
 */
export function formatarCNJ(numeroLimpo: string): string {
  const d = numeroLimpo.replace(/\D/g, "");
  if (d.length !== 20) return numeroLimpo;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

async function buscarPorNumero(
  url: string,
  apiKey: string,
  numero: string,
): Promise<any | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildDataJudAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: { match: { numeroProcesso: numero } },
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`DataJud ${response.status}: ${txt.substring(0, 200)}`);
  }

  const data = await response.json();
  const hits = data?.hits?.hits ?? [];
  return hits.length === 0 ? null : hits[0]._source;
}

export async function consultarProcesso(
  numeroCNJLimpo: string,
  tribunalSigla: string,
  apiKey: string,
): Promise<any | null> {
  const alias = TRIBUNAL_ALIAS[tribunalSigla];
  if (!alias) throw new Error(`Tribunal ${tribunalSigla} não suportado pelo DataJud`);

  const url = `${BASE_URL}/${alias}/_search`;
  const numeroLimpo = numeroCNJLimpo.replace(/\D/g, "");
  const numeroFormatado = formatarCNJ(numeroLimpo);

  // 1ª tentativa: número formatado (como o DataJud indexa em `numeroProcesso`)
  let hit = await buscarPorNumero(url, apiKey, numeroFormatado);
  if (hit) return hit;

  // 2ª tentativa: fallback com dígitos puros (alguns tribunais aceitam)
  if (numeroLimpo !== numeroFormatado) {
    hit = await buscarPorNumero(url, apiKey, numeroLimpo);
    if (hit) return hit;
  }

  return null;
}

function extrairAndamentos(dadosDataJud: any) {
  const movimentos: DataJudMovimento[] = dadosDataJud?.movimentos ?? [];
  return movimentos
    .filter((m) => m.dataHora)
    .map((mov) => ({
      datajud_id: `${mov.codigo ?? "0"}_${mov.dataHora}`,
      data: mov.dataHora!,
      descricao: mov.nome ?? mov.complemento?.descricao ?? "Movimentação registrada",
      codigo_movimento: mov.codigo ?? null,
      complemento_tpu: mov.complemento ?? mov.complementosTabelados ?? null,
      fonte: "datajud" as const,
    }));
}

async function calcularPrazo(
  supabase: any,
  dataInicio: string,
  dias: number,
  tipo: "uteis" | "corridos",
): Promise<string> {
  const fn = tipo === "uteis" ? "adicionar_dias_uteis" : "adicionar_dias_corridos";
  const { data, error } = await supabase.rpc(fn, {
    _data_inicio: dataInicio.slice(0, 10),
    _dias: dias,
  });
  if (error) throw error;
  return data as string;
}

async function processarAcaoAutomatica(
  supabase: any,
  andamento: any,
  processo: any,
  clienteNome: string | null,
): Promise<boolean> {
  if (!andamento.codigo_movimento) return false;

  const { data: regra } = await supabase
    .from("datajud_regras_acao")
    .select("*")
    .eq("codigo_movimento", andamento.codigo_movimento)
    .eq("ativo", true)
    .maybeSingle();

  if (!regra || regra.acao === "nenhuma") return false;

  const titulo = (regra.titulo_tarefa ?? "")
    .replace("{{numero_processo}}", processo.numero_cnj_limpo ?? processo.nb_inss ?? "")
    .replace("{{cliente}}", clienteNome ?? "")
    .replace("{{data}}", new Date(andamento.data).toLocaleDateString("pt-BR"));

  let acaoId: string | null = null;
  let acaoTipo: string | null = null;

  if (regra.acao === "criar_tarefa") {
    const { data } = await supabase.from("controladoria_itens").insert({
      tipo: "tarefa",
      titulo,
      processo_id: processo.id,
      cliente_id: processo.cliente_id,
      data_vencimento: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      prioridade: regra.prioridade,
      status: "pendente",
      descricao: `Gerado automaticamente pelo DataJud — movimento: ${andamento.descricao}`,
    }).select("id").single();
    acaoId = data?.id ?? null;
    acaoTipo = "tarefa";
  } else if (regra.acao === "criar_prazo" && regra.prazo_dias) {
    const dataVenc = await calcularPrazo(supabase, andamento.data, regra.prazo_dias, regra.prazo_tipo);
    const { data } = await supabase.from("controladoria_itens").insert({
      tipo: "prazo_fatal",
      titulo,
      processo_id: processo.id,
      cliente_id: processo.cliente_id,
      data_vencimento: `${dataVenc}T23:59:59Z`,
      data_intimacao: andamento.data.slice(0, 10),
      prioridade: "urgente",
      status: "pendente",
      descricao: `Prazo gerado automaticamente pelo DataJud — movimento: ${andamento.descricao}`,
    }).select("id").single();
    acaoId = data?.id ?? null;
    acaoTipo = "prazo_fatal";
  } else if (regra.acao === "disparar_fluxo" && regra.fluxo_template_id) {
    const { data } = await supabase.rpc("instanciar_fluxo", {
      _template_id: regra.fluxo_template_id,
      _processo_id: processo.id,
      _cliente_id: processo.cliente_id,
      _data_gatilho: andamento.data.slice(0, 10),
    });
    acaoId = data ?? null;
    acaoTipo = "fluxo";
  } else if (regra.acao === "notificar") {
    acaoTipo = "notificacao";
  }

  if (acaoTipo) {
    await supabase
      .from("andamentos")
      .update({ gera_acao: true, acao_gerada_tipo: acaoTipo, acao_gerada_id: acaoId })
      .eq("id", andamento.id);
  }
  return !!acaoTipo;
}

async function processarUmProcesso(
  supabase: any,
  apiKey: string,
  processo: any,
): Promise<{ novos: number; acoes: number }> {
  if (!processo.numero_cnj_limpo || !processo.tribunal_sigla) {
    return { novos: 0, acoes: 0 };
  }

  const dados = await consultarProcesso(processo.numero_cnj_limpo, processo.tribunal_sigla, apiKey);
  if (!dados) return { novos: 0, acoes: 0 };

  const andamentos = extrairAndamentos(dados);

  // Filtrar duplicatas
  const { data: existentes } = await supabase
    .from("andamentos")
    .select("datajud_id")
    .eq("processo_id", processo.id)
    .not("datajud_id", "is", null);

  const idsSet = new Set((existentes ?? []).map((a: any) => a.datajud_id));
  const novos = andamentos.filter((a) => !idsSet.has(a.datajud_id));

  // Buscar nome do cliente para usar nas variáveis
  const { data: cliente } = await supabase
    .from("clientes")
    .select("nome")
    .eq("id", processo.cliente_id)
    .maybeSingle();

  let acoesGeradas = 0;
  let inseridosOk = 0;
  for (const and of novos) {
    const { data: inserido, error } = await supabase
      .from("andamentos")
      .insert({
        processo_id: processo.id,
        data: and.data.slice(0, 10),
        descricao: and.descricao,
        fonte: and.fonte,
        datajud_id: and.datajud_id,
        codigo_movimento: and.codigo_movimento,
        complemento_tpu: and.complemento_tpu,
      })
      .select()
      .single();

    if (error) {
      console.error(
        `[datajud-consulta] Falha ao inserir andamento processo=${processo.id} datajud_id=${and.datajud_id}: ${error.message}`,
        error,
      );
      continue;
    }

    inseridosOk++;
    const gerou = await processarAcaoAutomatica(supabase, inserido, processo, cliente?.nome ?? null);
    if (gerou) acoesGeradas++;
  }

  // Calcula data do andamento mais recente p/ exibir "Última atualização" no card
  const ultimaData = andamentos
    .map((a) => a.data)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const updatePatch: Record<string, unknown> = {
    datajud_ultima_consulta: new Date().toISOString(),
    datajud_ultimo_erro: null,
    tribunal_nome: dados?.tribunal ?? processo.tribunal_nome,
  };
  if (ultimaData) updatePatch.ultima_atualizacao_andamento = ultimaData;

  await supabase.from("processos").update(updatePatch).eq("id", processo.id);

  // Sync log padronizado (compartilhado com scraper-tribunais)
  await supabase.from("sync_log").insert({
    processo_id: processo.id,
    tribunal: processo.tribunal_sigla ?? null,
    numero_cnj: processo.numero_cnj_limpo ?? null,
    fonte: "datajud",
    novos_andamentos: inseridosOk,
    status: inseridosOk > 0 ? "sucesso" : "sem_novidades",
  });

  return { novos: inseridosOk, acoes: acoesGeradas };
}

async function logSyncErro(
  supabase: any,
  processo: { id: string; numero_cnj_limpo?: string | null; tribunal_sigla?: string | null },
  msg: string,
) {
  try {
    await supabase.from("sync_log").insert({
      processo_id: processo.id,
      tribunal: processo.tribunal_sigla ?? null,
      numero_cnj: processo.numero_cnj_limpo ?? null,
      fonte: "datajud",
      novos_andamentos: 0,
      status: "erro",
      erro_mensagem: msg.slice(0, 500),
    });
  } catch (_) { /* ignore */ }
}

/**
 * Cria notificações para todos os gestores ativos quando o job
 * de consulta DataJud termina com erros. Usado tanto no modo
 * "processo_unico" quanto no job em massa.
 */
async function notificarGestoresErroDatajud(
  supabase: any,
  ctx: {
    modo: string;
    consultados: number;
    erros: number;
    primeiroErro: string | null;
    processoId?: string | null;
  },
) {
  try {
    const { data: gestores } = await supabase
      .from("user_roles")
      .select("user_id, profiles!inner(ativo)")
      .eq("role", "gestor")
      .eq("profiles.ativo", true);

    const ids = (gestores ?? [])
      .map((g: any) => g.user_id)
      .filter((v: string | null): v is string => !!v);
    if (ids.length === 0) return;

    const titulo =
      ctx.modo === "processo_unico"
        ? "Consulta DataJud falhou"
        : `Job DataJud terminou com ${ctx.erros} erro(s)`;
    const descricao =
      ctx.modo === "processo_unico"
        ? `Erro: ${ctx.primeiroErro?.slice(0, 200) ?? "—"}`
        : `${ctx.consultados} consultados · ${ctx.erros} erros · primeiro erro: ${ctx.primeiroErro?.slice(0, 160) ?? "—"}`;
    const link = ctx.processoId
      ? `/processos/${ctx.processoId}`
      : "/configuracoes/datajud";

    const rows = ids.map((user_id: string) => ({
      user_id,
      tipo: "datajud_erro",
      titulo,
      descricao,
      link,
    }));
    await supabase.from("notificacoes").insert(rows);
  } catch (e) {
    console.error("[datajud-consulta] falha ao notificar gestores:", e);
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("DATAJUD_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "DATAJUD_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- AUTHENTICATION ----
    // Reject unauthenticated requests. Only active gestores may trigger DataJud
    // queries (which use the service-role key and write to multiple tables).
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Service-role client for the actual work (RLS-bypass needed for cross-tenant ops)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Body precisa ser lido antes para sabermos se é preview (autenticado basta)
    // ou modo de escrita (gestor obrigatório).
    const body = await req.json().catch(() => ({}));
    const modo: "processo_unico" | "manual" | "agendado" | "preview" = body.modo ?? "manual";

    // Restrict write modes:
    // - "manual" / "agendado" (job em massa): apenas gestor
    // - "processo_unico": gestor OU advogado responsável pelo processo alvo
    if (modo !== "preview") {
      const { data: isGestorRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "gestor")
        .maybeSingle();

      let autorizado = !!isGestorRow;

      if (!autorizado && modo === "processo_unico" && body.processo_id) {
        const { data: procResp } = await supabase
          .from("processos")
          .select("responsavel_id")
          .eq("id", body.processo_id)
          .maybeSingle();
        if (procResp?.responsavel_id === userId) autorizado = true;
      }

      if (!autorizado) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const inicio = Date.now();
    const logInicio = new Date().toISOString();

    // PREVIEW: consulta DataJud por CNJ sem persistir nada (cadastro assistido).
    // Aceita qualquer usuário autenticado — não escreve no banco.
    if (modo === "preview") {
      const numeroCnjLimpo = String(body.numero_cnj ?? "").replace(/\D/g, "");
      if (numeroCnjLimpo.length !== 20) {
        return new Response(JSON.stringify({ error: "Número CNJ deve ter 20 dígitos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tribunalSigla: string | undefined = body.tribunal_sigla;
      if (tribunalSigla && !TRIBUNAL_ALIAS[tribunalSigla]) {
        return new Response(JSON.stringify({ error: `Tribunal ${tribunalSigla} não suportado` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Se não veio o tribunal, não temos como saber qual alias chamar — exigir do cliente.
      if (!tribunalSigla) {
        return new Response(JSON.stringify({ error: "tribunal_sigla é obrigatório no modo preview" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const dados = await consultarProcesso(numeroCnjLimpo, tribunalSigla, apiKey);
        if (!dados) {
          return new Response(
            JSON.stringify({ ok: true, encontrado: false }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        // Extrair partes (autor, réu) quando disponíveis
        const partes = Array.isArray(dados?.poloAtivo) || Array.isArray(dados?.poloPassivo)
          ? {
              ativo: (dados.poloAtivo ?? []).map((p: any) => ({
                nome: p?.nome ?? p?.parte?.nome ?? null,
                cpf_cnpj: p?.documento ?? p?.parte?.documento ?? null,
                advogado_nome: p?.advogados?.[0]?.nome ?? null,
                advogado_oab: p?.advogados?.[0]?.numeroOAB ?? null,
              })).filter((x: any) => x.nome),
              passivo: (dados.poloPassivo ?? []).map((p: any) => ({
                nome: p?.nome ?? p?.parte?.nome ?? null,
                cpf_cnpj: p?.documento ?? p?.parte?.documento ?? null,
              })).filter((x: any) => x.nome),
            }
          : null;
        // Última movimentação (resumo)
        const movimentos = Array.isArray(dados?.movimentos) ? dados.movimentos : [];
        const ultimoMovimento = movimentos.length > 0
          ? movimentos.slice().sort((a: any, b: any) => String(b?.dataHora ?? "").localeCompare(String(a?.dataHora ?? "")))[0]
          : null;
        const resumo = {
          numero_cnj: numeroCnjLimpo,
          tribunal_sigla: tribunalSigla,
          tribunal_nome: dados?.tribunal ?? null,
          orgao_julgador: dados?.orgaoJulgador?.nome ?? null,
          codigo_orgao_julgador: dados?.orgaoJulgador?.codigo ?? null,
          classe: dados?.classe?.nome ?? null,
          codigo_classe: dados?.classe?.codigo ?? null,
          assuntos: Array.isArray(dados?.assuntos)
            ? dados.assuntos.map((a: any) => ({ codigo: a?.codigo, nome: a?.nome })).filter((a: any) => a.nome)
            : [],
          grau: dados?.grau ?? null,
          nivel_sigilo: dados?.nivelSigilo ?? null,
          data_ajuizamento: dados?.dataAjuizamento ?? null,
          valor_causa: typeof dados?.valorCausa === "number" ? dados.valorCausa : null,
          sistema: dados?.sistema?.nome ?? null,
          formato: dados?.formato?.nome ?? null,
          partes,
          total_movimentos: movimentos.length,
          ultimo_movimento: ultimoMovimento
            ? {
                data: ultimoMovimento?.dataHora ?? null,
                descricao: ultimoMovimento?.nome ?? null,
                codigo: ultimoMovimento?.codigo ?? null,
              }
            : null,
        };
        return new Response(
          JSON.stringify({ ok: true, encontrado: true, dados: resumo }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[datajud-consulta] preview erro:", msg);
        return new Response(JSON.stringify({ error: msg }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1 processo único
    if (modo === "processo_unico") {
      if (!body.processo_id) {
        return new Response(JSON.stringify({ error: "processo_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: processo, error } = await supabase
        .from("processos")
        .select("id, numero_cnj_limpo, tribunal_sigla, tribunal_nome, cliente_id, nb_inss")
        .eq("id", body.processo_id)
        .maybeSingle();

      if (error || !processo) {
        return new Response(JSON.stringify({ error: "Processo não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const r = await processarUmProcesso(supabase, apiKey, processo);
        await supabase.from("datajud_log_execucoes").insert({
          iniciado_em: logInicio,
          finalizado_em: new Date().toISOString(),
          modo: "processo_unico",
          total_consultados: 1,
          total_andamentos_novos: r.novos,
          total_acoes_geradas: r.acoes,
          total_erros: 0,
          duracao_ms: Date.now() - inicio,
          detalhes: { processo_id: processo.id },
        });
        return new Response(
          JSON.stringify({ ok: true, novos_andamentos: r.novos, acoes_geradas: r.acoes }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase
          .from("processos")
          .update({ datajud_ultimo_erro: msg, datajud_ultima_consulta: new Date().toISOString() })
          .eq("id", processo.id);
        await logSyncErro(supabase, processo, msg);
        await supabase.from("datajud_log_execucoes").insert({
          iniciado_em: logInicio,
          finalizado_em: new Date().toISOString(),
          modo: "processo_unico",
          total_consultados: 1,
          total_erros: 1,
          duracao_ms: Date.now() - inicio,
          detalhes: { erro: msg, processo_id: processo.id },
        });
        await notificarGestoresErroDatajud(supabase, {
          modo: "processo_unico",
          consultados: 1,
          erros: 1,
          primeiroErro: msg,
          processoId: processo.id,
        });
        return new Response(JSON.stringify({ error: msg }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Job em massa
    const { data: processos } = await supabase
      .from("processos")
      .select("id, numero_cnj_limpo, tribunal_sigla, tribunal_nome, cliente_id, nb_inss")
      .eq("tipo", "judicial")
      .eq("datajud_ativo", true)
      .not("numero_cnj_limpo", "is", null)
      .not("tribunal_sigla", "is", null);

    let consultados = 0;
    let novosTotal = 0;
    let acoesTotal = 0;
    let erros = 0;
    const detalhesErros: any[] = [];

    for (const p of processos ?? []) {
      try {
        const r = await processarUmProcesso(supabase, apiKey, p);
        novosTotal += r.novos;
        acoesTotal += r.acoes;
        consultados++;
      } catch (err) {
        erros++;
        const msg = err instanceof Error ? err.message : String(err);
        detalhesErros.push({ processo_id: p.id, cnj: p.numero_cnj_limpo, erro: msg });
        await supabase
          .from("processos")
          .update({ datajud_ultimo_erro: msg, datajud_ultima_consulta: new Date().toISOString() })
          .eq("id", p.id);
        await logSyncErro(supabase, p, msg);
      }
      // Rate limiting: 500ms entre requisições
      await new Promise((r) => setTimeout(r, 500));
    }

    await supabase.from("datajud_log_execucoes").insert({
      iniciado_em: logInicio,
      finalizado_em: new Date().toISOString(),
      modo,
      total_consultados: consultados,
      total_andamentos_novos: novosTotal,
      total_acoes_geradas: acoesTotal,
      total_erros: erros,
      duracao_ms: Date.now() - inicio,
      detalhes: { erros: detalhesErros.slice(0, 50) },
    });

    if (erros > 0) {
      await notificarGestoresErroDatajud(supabase, {
        modo,
        consultados,
        erros,
        primeiroErro: detalhesErros[0]?.erro ?? null,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        consultados,
        novos_andamentos: novosTotal,
        acoes_geradas: acoesTotal,
        erros,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[datajud-consulta] erro fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
