// Edge Function: scraper-tribunais
// Consulta direta aos portais públicos do TJMT e PJe Federal (TRF1, TRF3),
// como fonte complementar ao DataJud (que tem latência de 24-72h).
//
// Modos:
//  - "agendado": invoca para todos os processos elegíveis (cron 4h)
//  - "processo_unico": dispara para 1 processo específico (botão na UI)
//
// Estratégia:
//  - TJMT: scrape HTML do PJe consulta pública
//  - TRF1/TRF3: tenta API REST PJe; fallback HTML
//  - CAPTCHA / 403 → registra status "captcha_bloqueado", segue adiante
//  - Andamento novo → grava na tabela `andamentos` com fonte 'tjmt_direto' ou 'pje_direto'
//                   → cria notificação para usuárias-chave
//                   → palavras críticas → notifica também a Dra. Juliana

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Identificação de tribunal pelo CNJ ─────────────────────────
// Formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
// segmento J pos 14, tribunal TT pos 15-16
// J=8 estadual; J=4 federal; TT=11 TJMT; TT=01..06 TRFs
function tribunalDoCNJ(cnjLimpo: string): { sigla: string; tipo: "tjmt" | "trf1" | "trf3" } | null {
  const d = cnjLimpo.replace(/\D/g, "");
  if (d.length !== 20) return null;
  const seg = d[13];
  const tt = d.slice(14, 16);
  if (seg === "8" && tt === "11") return { sigla: "TJMT", tipo: "tjmt" };
  if (seg === "4" && tt === "01") return { sigla: "TRF1", tipo: "trf1" };
  if (seg === "4" && tt === "03") return { sigla: "TRF3", tipo: "trf3" };
  return null;
}

function formatarCNJ(numeroLimpo: string): string {
  const d = numeroLimpo.replace(/\D/g, "");
  if (d.length !== 20) return numeroLimpo;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

// ── Parser HTML genérico (sem cheerio) ─────────────────────────
// Procura por linhas de tabela com data + descrição.
function parsearMovimentosHTML(html: string): { data: string; descricao: string }[] {
  const out: { data: string; descricao: string }[] = [];
  // dd/mm/aaaa [hh:mm] seguido de texto até próxima quebra ou linha similar
  const re = /(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?\s*[-–—:|]\s*([^<\n\r]{5,300})/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const [, dataBr, descRaw] = m;
    const desc = descRaw.replace(/\s+/g, " ").trim();
    const [dd, mm, yyyy] = dataBr.split("/");
    const dataIso = `${yyyy}-${mm}-${dd}`;
    const key = `${dataIso}::${desc.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ data: dataIso, descricao: desc });
  }
  return out;
}

interface ResScrape {
  movimentos: { data: string; descricao: string }[];
  status: "sucesso" | "erro" | "sem_novidades" | "captcha_bloqueado";
  erro?: string;
}

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; LegisFlow/1.0; +scraper)",
  Accept: "text/html,application/xhtml+xml",
};

const FETCH_TIMEOUT_MS = 15000;
async function fetchComTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeTJMT(cnjLimpo: string): Promise<ResScrape> {
  try {
    const url = `https://pje.tjmt.jus.br/pje/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=${formatarCNJ(cnjLimpo)}`;
    const resp = await fetchComTimeout(url, { headers: COMMON_HEADERS });
    if (resp.status === 403) {
      await resp.text().catch(() => "");
      return { movimentos: [], status: "captcha_bloqueado" };
    }
    if (!resp.ok) return { movimentos: [], status: "erro", erro: `HTTP ${resp.status}` };
    const html = await resp.text();
    if (/captcha/i.test(html)) return { movimentos: [], status: "captcha_bloqueado" };
    const movs = parsearMovimentosHTML(html);
    return { movimentos: movs, status: movs.length > 0 ? "sucesso" : "sem_novidades" };
  } catch (e) {
    return { movimentos: [], status: "erro", erro: e instanceof Error ? e.message : String(e) };
  }
}

async function scrapePJeFederal(cnjLimpo: string, tipo: "trf1" | "trf3"): Promise<ResScrape> {
  const baseUrl = tipo === "trf1"
    ? "https://pje1g.trf1.jus.br"
    : "https://pje.trf3.jus.br/pje";

  // 1) Tentar REST (TRF1)
  if (tipo === "trf1") {
    try {
      const r = await fetchComTimeout(
        `${baseUrl}/pje-rest/api/v1/processos/${cnjLimpo}/movimentos`,
        { headers: COMMON_HEADERS },
      );
      if (r.ok) {
        const json = await r.json().catch(() => null);
        const arr = Array.isArray(json) ? json : (json?.movimentos ?? json?.data ?? []);
        const movs = (arr as any[])
          .map((m) => ({
            data: String(m?.dataHora ?? m?.data ?? "").slice(0, 10),
            descricao: String(m?.descricao ?? m?.nome ?? "").trim(),
          }))
          .filter((m) => m.data && m.descricao && /^\d{4}-\d{2}-\d{2}$/.test(m.data));
        if (movs.length > 0) return { movimentos: movs, status: "sucesso" };
      } else {
        await r.text().catch(() => "");
      }
    } catch (_) { /* segue p/ HTML */ }
  }

  // 2) Fallback HTML
  try {
    const url = `${baseUrl}/ConsultaPublica/DetalheProcessoConsultaPublica/listView.seam?ca=${formatarCNJ(cnjLimpo)}`;
    const resp = await fetchComTimeout(url, { headers: COMMON_HEADERS });
    if (resp.status === 403) {
      await resp.text().catch(() => "");
      return { movimentos: [], status: "captcha_bloqueado" };
    }
    if (!resp.ok) return { movimentos: [], status: "erro", erro: `HTTP ${resp.status}` };
    const html = await resp.text();
    if (/captcha/i.test(html)) return { movimentos: [], status: "captcha_bloqueado" };
    const movs = parsearMovimentosHTML(html);
    return { movimentos: movs, status: movs.length > 0 ? "sucesso" : "sem_novidades" };
  } catch (e) {
    return { movimentos: [], status: "erro", erro: e instanceof Error ? e.message : String(e) };
  }
}

// ── Notificações ─────────────────────────────────────────────
const PALAVRAS_CRITICAS = [
  "sentença","sentenca","acórdão","acordao","decisão","decisao","despacho",
  "intimação","intimacao","citação","citacao","notificação","notificacao",
  "audiência","audiencia","perícia","pericia","avaliação","avaliacao",
  "prazo","cumprimento","execução","execucao",
  "recurso","apelação","apelacao","agravo",
];

function ehCritico(desc: string): boolean {
  const d = desc.toLowerCase();
  return PALAVRAS_CRITICAS.some((p) => d.includes(p));
}

async function notificarNovoAndamento(
  supabase: any,
  processo: { id: string; numero_cnj_limpo: string | null },
  andamento: { data: string; descricao: string; fonte: string },
) {
  // Lana (e similares operacionais) + Juliana se crítico
  const { data: lanas } = await supabase
    .from("profiles")
    .select("id, email")
    .or("email.ilike.%lana%,email.ilike.%lanapriscila%")
    .eq("ativo", true);
  const { data: julianas } = await supabase
    .from("profiles")
    .select("id, email")
    .ilike("email", "%juliana%")
    .eq("ativo", true);

  const destinatarios = new Set<string>((lanas ?? []).map((p: any) => p.id));
  const critico = ehCritico(andamento.descricao);
  if (critico) {
    for (const j of julianas ?? []) destinatarios.add(j.id);
  }
  if (destinatarios.size === 0) return;

  const titulo = critico
    ? `🚨 Andamento crítico — ${processo.numero_cnj_limpo ?? "processo"}`
    : `Novo andamento — ${processo.numero_cnj_limpo ?? "processo"}`;
  const desc = `[${andamento.fonte === "tjmt_direto" ? "TJMT direto" : "PJe direto"}] ${andamento.descricao.slice(0, 220)}`;

  const rows = Array.from(destinatarios).map((user_id) => ({
    user_id,
    tipo: critico ? "andamento_critico" : "andamento_novo",
    titulo,
    descricao: desc,
    link: `/processos/${processo.id}`,
  }));
  await supabase.from("notificacoes").insert(rows);
}

// ── Processamento ────────────────────────────────────────────
async function processarUm(
  supabase: any,
  processo: { id: string; numero_cnj_limpo: string | null; tribunal_sigla: string | null },
): Promise<{ novos: number; status: string }> {
  const cnj = processo.numero_cnj_limpo ?? "";
  const trib = tribunalDoCNJ(cnj);
  if (!trib) {
    return { novos: 0, status: "sem_novidades" };
  }

  let res: ResScrape;
  let fonte: "tjmt_direto" | "pje_direto";
  if (trib.tipo === "tjmt") {
    res = await scrapeTJMT(cnj);
    fonte = "tjmt_direto";
  } else {
    res = await scrapePJeFederal(cnj, trib.tipo);
    fonte = "pje_direto";
  }

  if (res.status === "captcha_bloqueado" || res.status === "erro") {
    // Fallback automático para DataJud quando o scraper direto falha
    let fallbackInfo: { acionado: boolean; ok?: boolean; novos?: number; erro?: string } = { acionado: false };
    try {
      const { data: fbData, error: fbErr } = await supabase.functions.invoke("datajud-consulta", {
        body: { modo: "processo_unico", processo_id: processo.id },
      });
      if (fbErr) {
        fallbackInfo = { acionado: true, ok: false, erro: fbErr.message };
      } else {
        fallbackInfo = {
          acionado: true,
          ok: fbData?.ok !== false,
          novos: Number(fbData?.novos_andamentos ?? fbData?.novos ?? 0),
          erro: fbData?.error,
        };
      }
    } catch (e) {
      fallbackInfo = { acionado: true, ok: false, erro: e instanceof Error ? e.message : String(e) };
    }

    const erroComFallback = [
      res.erro?.slice(0, 350) ?? res.status,
      `→ fallback DataJud: ${fallbackInfo.ok ? `ok (${fallbackInfo.novos ?? 0} novos)` : `falhou (${fallbackInfo.erro ?? "sem detalhe"})`}`,
    ].join(" ");

    await supabase.from("sync_log").insert({
      processo_id: processo.id,
      tribunal: trib.sigla,
      numero_cnj: cnj,
      fonte,
      novos_andamentos: fallbackInfo.novos ?? 0,
      status: fallbackInfo.ok ? "fallback_datajud" : res.status,
      erro_mensagem: erroComFallback.slice(0, 500),
    });
    return {
      novos: fallbackInfo.novos ?? 0,
      status: fallbackInfo.ok ? "fallback_datajud" : res.status,
    };
  }

  // Comparar com andamentos existentes desse processo (data+descricao primeiros 80c)
  const { data: existentes } = await supabase
    .from("andamentos")
    .select("data, descricao")
    .eq("processo_id", processo.id);
  const set = new Set<string>(
    (existentes ?? []).map((a: any) => `${a.data}::${(a.descricao ?? "").slice(0, 80)}`),
  );

  const novos = res.movimentos.filter(
    (m) => !set.has(`${m.data}::${m.descricao.slice(0, 80)}`),
  );

  let inseridos = 0;
  let ultimaData: string | null = null;
  for (const m of novos) {
    const { data: inserido, error } = await supabase
      .from("andamentos")
      .insert({
        processo_id: processo.id,
        data: m.data,
        descricao: m.descricao,
        fonte,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`[scraper] erro insert: ${error.message}`);
      continue;
    }
    inseridos++;
    if (!ultimaData || m.data > ultimaData) ultimaData = m.data;
    await notificarNovoAndamento(supabase, processo, { ...m, fonte });
    void inserido;
  }

  const updatePatch: Record<string, unknown> = {};
  if (ultimaData) updatePatch.ultima_atualizacao_andamento = ultimaData;
  if (Object.keys(updatePatch).length > 0) {
    await supabase.from("processos").update(updatePatch).eq("id", processo.id);
  }

  await supabase.from("sync_log").insert({
    processo_id: processo.id,
    tribunal: trib.sigla,
    numero_cnj: cnj,
    fonte,
    novos_andamentos: inseridos,
    status: inseridos > 0 ? "sucesso" : "sem_novidades",
  });

  return { novos: inseridos, status: inseridos > 0 ? "sucesso" : "sem_novidades" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const modo: "agendado" | "processo_unico" = body.modo ?? "agendado";

    if (modo === "processo_unico") {
      if (!body.processo_id) {
        return new Response(JSON.stringify({ error: "processo_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: proc } = await supabase
        .from("processos")
        .select("id, numero_cnj_limpo, tribunal_sigla")
        .eq("id", body.processo_id)
        .maybeSingle();
      if (!proc) {
        return new Response(JSON.stringify({ error: "Processo não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await processarUm(supabase, proc);
      return new Response(
        JSON.stringify({ ok: true, novos_andamentos: r.novos, status: r.status }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Agendado: todos elegíveis
    const { data: processos } = await supabase
      .from("processos")
      .select("id, numero_cnj_limpo, tribunal_sigla, status")
      .not("numero_cnj_limpo", "is", null)
      .not("status", "in", "(arquivado,encerrado,baixado)");

    let total = 0, novosTotal = 0, erros = 0, captchas = 0;
    for (const p of processos ?? []) {
      const trib = tribunalDoCNJ(p.numero_cnj_limpo ?? "");
      if (!trib) continue;
      total++;
      try {
        const r = await processarUm(supabase, p);
        novosTotal += r.novos;
        if (r.status === "captcha_bloqueado") captchas++;
      } catch (e) {
        erros++;
        console.error(`[scraper] processo ${p.id}: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    return new Response(
      JSON.stringify({ ok: true, processados: total, novos_andamentos: novosTotal, captchas, erros }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scraper-tribunais] erro fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
