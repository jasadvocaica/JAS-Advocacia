// Edge Function: datajud-lote
// Consulta DataJud para uma lista de processos (em série, com rate-limit) e
// reporta o progresso em ie_jobs (subtipo "datajud_lote") para que a UI mostre
// uma barra com status item-a-item — exatamente como a importação do PDF PDPJ.
//
// Body: { job_id: string, processo_ids: string[] }
//
// Reaproveita a mesma lógica de extração e dedup da função `datajud-consulta`
// (TRIBUNAL_ALIAS, consultarProcesso, extrairAndamentos, processarAcaoAutomatica)
// — copiamos aqui porque edge functions não compartilham módulos entre si.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://api-publica.datajud.cnj.jus.br";

// Chave pública vigente publicada pelo CNJ. O secret tem prioridade para rotação.
const DATAJUD_PUBLIC_API_KEY =
  "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

const TRIBUNAL_ALIAS: Record<string, string> = {
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

async function consultarProcesso(numeroCNJLimpo: string, tribunalSigla: string, apiKey: string) {
  const alias = TRIBUNAL_ALIAS[tribunalSigla];
  if (!alias) throw new Error(`Tribunal ${tribunalSigla} não suportado`);
  const url = `${BASE_URL}/${alias}/_search`;
  const consultar = async (numero: string) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `APIKey ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { match: { numeroProcesso: numero } } }),
    });
    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`DataJud ${response.status}: ${txt.substring(0, 200)}`);
    }
    const data = await response.json();
    return data?.hits?.hits?.[0]?._source ?? null;
  };

  const limpo = numeroCNJLimpo.replace(/\D/g, "");
  const formatado = limpo.length === 20
    ? `${limpo.slice(0, 7)}-${limpo.slice(7, 9)}.${limpo.slice(9, 13)}.${limpo.slice(13, 14)}.${limpo.slice(14, 16)}.${limpo.slice(16, 20)}`
    : numeroCNJLimpo;
  return (await consultar(formatado)) ?? (formatado !== limpo ? await consultar(limpo) : null);
}

function extrairAndamentos(dadosDataJud: any) {
  const movimentos: DataJudMovimento[] = dadosDataJud?.movimentos ?? [];
  return movimentos.filter((m) => m.dataHora).map((mov) => ({
    datajud_id: `${mov.codigo ?? "0"}_${mov.dataHora}`,
    data: mov.dataHora!,
    descricao: mov.nome ?? mov.complemento?.descricao ?? "Movimentação registrada",
    codigo_movimento: mov.codigo ?? null,
    complemento_tpu: mov.complemento ?? mov.complementosTabelados ?? null,
  }));
}

async function processarUm(
  supabase: any,
  apiKey: string,
  processo: any,
): Promise<{ novos: number; total_movimentos: number }> {
  if (!processo.numero_cnj_limpo || !processo.tribunal_sigla) {
    throw new Error("Processo sem CNJ ou tribunal");
  }
  const dados = await consultarProcesso(processo.numero_cnj_limpo, processo.tribunal_sigla, apiKey);
  if (!dados) return { novos: 0, total_movimentos: 0 };

  const andamentos = extrairAndamentos(dados);

  // Dedup por datajud_id
  const { data: existentes } = await supabase
    .from("andamentos")
    .select("datajud_id")
    .eq("processo_id", processo.id)
    .not("datajud_id", "is", null);
  const idsSet = new Set((existentes ?? []).map((a: any) => a.datajud_id));
  const novos = andamentos.filter((a) => !idsSet.has(a.datajud_id));

  for (const a of novos) {
    await supabase.from("andamentos").insert({
      processo_id: processo.id,
      data: a.data.slice(0, 10),
      descricao: a.descricao,
      fonte: "datajud",
      datajud_id: a.datajud_id,
      codigo_movimento: a.codigo_movimento,
      complemento_tpu: a.complemento_tpu,
    });
  }

  await supabase
    .from("processos")
    .update({
      datajud_ultima_consulta: new Date().toISOString(),
      datajud_ultimo_erro: null,
      tribunal_nome: dados?.tribunal ?? processo.tribunal_nome,
    })
    .eq("id", processo.id);

  return { novos: novos.length, total_movimentos: andamentos.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("DATAJUD_API_KEY") ?? DATAJUD_PUBLIC_API_KEY;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: isGestor } = await admin
      .from("user_roles").select("role")
      .eq("user_id", userId).eq("role", "gestor").maybeSingle();
    if (!isGestor) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const job_id: string = body.job_id;
    const processo_ids: string[] = Array.isArray(body.processo_ids) ? body.processo_ids : [];
    if (!job_id || processo_ids.length === 0) {
      return new Response(JSON.stringify({ error: "job_id e processo_ids são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Marca job como processando
    await admin.from("ie_jobs").update({
      status: "processando",
      total_registros: processo_ids.length,
      mensagem: `Iniciando consulta de ${processo_ids.length} processos no DataJud…`,
    }).eq("id", job_id);

    // Busca todos os processos de uma vez
    const { data: processos } = await admin
      .from("processos")
      .select("id, numero_cnj, numero_cnj_limpo, tribunal_sigla, tribunal_nome, cliente_id")
      .in("id", processo_ids);

    // Processamento em background — evita IDLE_TIMEOUT (150s) em lotes grandes.
    const processar = async () => {
      let ok = 0;
      let err = 0;
      let novosTotal = 0;
      const detalhes: Array<{ processo_id: string; cnj: string; status: "ok" | "erro"; novos: number; mensagem?: string }> = [];

      for (let idx = 0; idx < (processos ?? []).length; idx++) {
        const p = processos![idx];
        try {
          const r = await processarUm(admin, apiKey, p);
          novosTotal += r.novos;
          ok++;
          detalhes.push({
            processo_id: p.id, cnj: p.numero_cnj, status: "ok", novos: r.novos,
            mensagem: r.novos > 0
              ? `${r.novos} novos andamentos (de ${r.total_movimentos} totais)`
              : `Sem novos andamentos (${r.total_movimentos} já estavam atualizados)`,
          });
        } catch (e) {
          err++;
          const msg = e instanceof Error ? e.message : String(e);
          detalhes.push({ processo_id: p.id, cnj: p.numero_cnj, status: "erro", novos: 0, mensagem: msg });
          await admin.from("processos")
            .update({ datajud_ultimo_erro: msg, datajud_ultima_consulta: new Date().toISOString() })
            .eq("id", p.id);
        }

        await admin.from("ie_jobs").update({
          registros_ok: ok,
          registros_erro: err,
          erros_json: detalhes,
          mensagem: `Processando ${idx + 1}/${processos!.length} · ${novosTotal} novos andamentos`,
        }).eq("id", job_id);

        await new Promise((r) => setTimeout(r, 500));
      }

      const statusFinal = err === 0 ? "concluido" : (ok === 0 ? "erro" : "concluido_parcial");
      await admin.from("ie_jobs").update({
        status: statusFinal,
        concluido_em: new Date().toISOString(),
        mensagem: `Concluído: ${ok} ok, ${err} erros, ${novosTotal} novos andamentos.`,
      }).eq("id", job_id);
    };

    // @ts-ignore — EdgeRuntime existe em runtime do Supabase
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processar());
    } else {
      // Fallback (dev local): não bloqueia o response
      processar().catch((e) => console.error("[datajud-lote] background:", e));
    }

    return new Response(
      JSON.stringify({ ok: true, status: "iniciado", total: processo_ids.length, job_id }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[datajud-lote] erro fatal:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
