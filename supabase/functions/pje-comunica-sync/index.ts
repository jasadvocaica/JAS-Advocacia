// Edge Function: pje-comunica-sync
// Sincroniza publicações da API pública do PJe Comunica (CNJ) para os monitoramentos
// cadastrados em `pje_monitoramentos` (oab, nome, cpf_cnpj, cnj). CPF/CNPJ é tratado
// como busca por nome (do cliente vinculado), pois a API pública não aceita documento.
//
// Body: { modo?: "manual"|"agendado", monitoramento_id?: string, oab_id?: string,
//         dias?: number, dry_run?: boolean }
// - oab_id é mantido para compatibilidade (mapeia para o monitoramento espelho).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PJE_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const ITENS_POR_PAGINA = 100;
const MAX_PAGINAS = 30;

interface PjeItem {
  id?: number | string;
  hash?: string;
  numero_processo?: string;
  numeroprocessocommascara?: string;
  siglaTribunal?: string;
  nomeOrgao?: string;
  tipoComunicacao?: string;
  meio?: string;
  texto?: string;
  data_disponibilizacao?: string;
  datadisponibilizacao?: string;
  destinatarios?: unknown[];
  destinatarioadvogados?: unknown[];
  link?: string;
}

interface PjeResposta {
  status?: string;
  message?: string;
  count?: number;
  items?: PjeItem[];
}

type TipoMon = "oab" | "nome" | "cpf_cnpj" | "cnj";

interface MonitoramentoRow {
  id: string;
  tipo: TipoMon;
  valor: string;
  uf_oab: string | null;
  rotulo: string | null;
  cliente_id: string | null;
  oab_legacy_id: string | null;
}

function limparCnj(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function parseDataISO(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function hashItem(item: PjeItem): string {
  const partes = [
    String(item.id ?? ""),
    item.hash ?? "",
    limparCnj(item.numero_processo ?? item.numeroprocessocommascara),
    parseDataISO(item.data_disponibilizacao ?? item.datadisponibilizacao) ?? "",
    (item.texto ?? "").slice(0, 80),
  ];
  return partes.join("|");
}

async function consultarPagina(
  params: Record<string, string>,
  pagina: number,
): Promise<PjeResposta> {
  const url = new URL(PJE_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("itensPorPagina", String(ITENS_POR_PAGINA));

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`PJe ${resp.status}: ${txt.slice(0, 250)}`);
  }
  return (await resp.json()) as PjeResposta;
}

function paramsParaMonitoramento(
  m: MonitoramentoRow,
  termoEfetivo: string,
  dataInicio: string,
  dataFim: string,
): Record<string, string> | null {
  const base: Record<string, string> = {
    dataDisponibilizacaoInicio: dataInicio,
    dataDisponibilizacaoFim: dataFim,
  };
  if (m.tipo === "oab") {
    if (!m.uf_oab) return null;
    return {
      ...base,
      numeroOab: m.valor.replace(/\D/g, ""),
      ufOab: m.uf_oab.toUpperCase(),
    };
  }
  if (m.tipo === "cnj") {
    const cnj = m.valor.replace(/\D/g, "");
    if (cnj.length < 15) return null;
    // CNJ: faz consulta histórica (sem janela), API aceita numeroProcesso isolado
    return { numeroProcesso: cnj };
  }
  if (m.tipo === "nome" || m.tipo === "cpf_cnpj") {
    const termo = termoEfetivo.trim();
    if (termo.length < 4) return null;
    return { ...base, nomeParte: termo };
  }
  return null;
}

interface ResultadoSync {
  monitoramento_id: string;
  oab_id: string | null;
  identificador: string;
  tipo: TipoMon;
  consultadas: number;
  novas: number;
  duplicadas: number;
  vinculadas: number;
  erros: number;
  mensagem?: string;
}

async function sincronizarMonitoramento(
  supabase: ReturnType<typeof createClient>,
  m: MonitoramentoRow,
  dataInicio: string,
  dataFim: string,
  dryRun: boolean,
): Promise<ResultadoSync> {
  const r: ResultadoSync = {
    monitoramento_id: m.id,
    oab_id: m.oab_legacy_id,
    identificador: m.rotulo ?? m.valor,
    tipo: m.tipo,
    consultadas: 0,
    novas: 0,
    duplicadas: 0,
    vinculadas: 0,
    erros: 0,
  };

  // CPF/CNPJ → resolve nome do cliente
  let termoEfetivo = m.valor;
  if (m.tipo === "cpf_cnpj") {
    if (!m.cliente_id) {
      r.mensagem = "Monitoramento por CPF/CNPJ requer cliente vinculado";
      return r;
    }
    const { data: cli } = await supabase
      .from("clientes")
      .select("nome")
      .eq("id", m.cliente_id)
      .maybeSingle();
    if (!cli?.nome) {
      r.mensagem = "Cliente vinculado não encontrado";
      return r;
    }
    termoEfetivo = cli.nome as string;
  }

  const paramsBusca = paramsParaMonitoramento(m, termoEfetivo, dataInicio, dataFim);
  if (!paramsBusca) {
    r.mensagem = "Parâmetros de busca inválidos";
    return r;
  }

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const resp = await consultarPagina(paramsBusca, pagina);
    const items = resp.items ?? [];
    if (items.length === 0) break;
    r.consultadas += items.length;

    for (const item of items) {
      try {
        const hash_dedup = hashItem(item);
        const cnjMascara = item.numero_processo ?? item.numeroprocessocommascara ?? null;
        const cnjLimpo = limparCnj(cnjMascara);
        const dataDisp = parseDataISO(item.data_disponibilizacao ?? item.datadisponibilizacao);

        // Tenta achar processo existente
        let processoId: string | null = null;
        let processoResponsavelId: string | null = null;
        let processoClienteId: string | null = null;
        if (cnjLimpo) {
          const { data: proc } = await supabase
            .from("processos")
            .select("id, responsavel_id, cliente_id")
            .eq("numero_cnj_limpo", cnjLimpo)
            .maybeSingle();
          processoId = (proc?.id as string) ?? null;
          processoResponsavelId = (proc?.responsavel_id as string) ?? null;
          processoClienteId = (proc?.cliente_id as string) ?? null;
        }

        if (dryRun) continue;

        const { data: inserted, error: insErr } = await supabase
          .from("pje_publicacoes")
          .insert({
            pje_id: item.id != null ? String(item.id) : null,
            hash_dedup,
            monitoramento_id: m.id,
            // mantém oab_monitorada_id para histórico/legado, quando aplicável
            oab_monitorada_id: m.oab_legacy_id,
            numero_processo: cnjMascara,
            numero_processo_limpo: cnjLimpo || null,
            sigla_tribunal: item.siglaTribunal ?? null,
            nome_orgao: item.nomeOrgao ?? null,
            tipo_comunicacao: item.tipoComunicacao ?? null,
            meio: item.meio ?? null,
            texto_publicacao: item.texto ?? null,
            data_disponibilizacao: dataDisp,
            destinatarios: item.destinatarios ?? [],
            destinatario_advogados: item.destinatarioadvogados ?? [],
            link_certidao: item.link ?? null,
            hash_pje: item.hash ?? null,
            payload_bruto: item as unknown as Record<string, unknown>,
          })
          .select("id")
          .single();

        if (insErr) {
          if ((insErr as { code?: string }).code === "23505") {
            r.duplicadas += 1;
            continue;
          }
          throw insErr;
        }

        r.novas += 1;

        // Publicação reconhecida: vincula ao processo, registra o andamento e cria
        // uma TRIAGEM na Controladoria. O prazo jurídico definitivo permanece humano.
        if (processoId && inserted?.id) {
          let andamentoId: string | null = null;
          let itemControladoriaId: string | null = null;

          const { data: andamento, error: andamentoErr } = await supabase
            .from("andamentos")
            .insert({
              processo_id: processoId,
              data: dataDisp ?? new Date().toISOString().slice(0, 10),
              descricao: `DJEN — ${item.tipoComunicacao ?? "Publicação"}: ${(item.texto ?? "").slice(0, 1000)}`,
              fonte: "djen",
              datajud_id: `djen_${inserted.id}`,
            })
            .select("id")
            .single();
          if (!andamentoErr) andamentoId = andamento?.id ?? null;

          let vencimento = new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString().slice(0, 10);
          const { data: proximoDiaUtil } = await supabase.rpc("adicionar_dias_uteis", {
            _data_inicio: dataDisp ?? new Date().toISOString().slice(0, 10),
            _dias: 1,
          });
          if (proximoDiaUtil) vencimento = String(proximoDiaUtil);

          const numeroExibicao = cnjMascara || cnjLimpo;
          const { data: itemCtrl, error: ctrlErr } = await supabase
            .from("controladoria_itens")
            .insert({
              tipo: "intimacao",
              titulo: `Triar publicação DJEN — ${numeroExibicao}`,
              descricao: [
                `Tipo: ${item.tipoComunicacao ?? "Publicação"}`,
                `Órgão: ${item.nomeOrgao ?? item.siglaTribunal ?? "Não informado"}`,
                "",
                (item.texto ?? "").slice(0, 3000),
                item.link ? `\\nCertidão: ${item.link}` : "",
                "",
                "ATENÇÃO: vencimento de triagem. O prazo jurídico deve ser conferido e cadastrado pela responsável.",
              ].filter(Boolean).join("\\n"),
              processo_id: processoId,
              cliente_id: processoClienteId,
              responsavel_id: processoResponsavelId,
              data_vencimento: `${vencimento}T18:00:00-04:00`,
              data_intimacao: dataDisp,
              prioridade: "alta",
              status: "pendente",
              origem: "djen",
            })
            .select("id")
            .single();
          if (!ctrlErr) itemControladoriaId = itemCtrl?.id ?? null;

          const { error: updErr } = await supabase
            .from("pje_publicacoes")
            .update({
              processo_id: processoId,
              andamento_id: andamentoId,
              item_controladoria_id: itemControladoriaId,
            })
            .eq("id", inserted.id);
          if (!updErr) r.vinculadas += 1;
          if (andamentoErr) console.error("Falha ao criar andamento DJEN:", andamentoErr);
          if (ctrlErr) console.error("Falha ao criar triagem DJEN:", ctrlErr);
        }

        if (inserted?.id) {
          const { data: gestores } = await supabase
            .from("user_roles")
            .select("user_id, profiles!inner(ativo)")
            .eq("role", "gestor")
            .eq("profiles.ativo", true);
          const destinatarios = new Set<string>();
          if (processoResponsavelId) destinatarios.add(processoResponsavelId);
          for (const gestor of gestores ?? []) {
            if (gestor.user_id) destinatarios.add(gestor.user_id);
          }
          if (destinatarios.size > 0) {
            await supabase.from("notificacoes").insert(
              Array.from(destinatarios).map((user_id) => ({
                user_id,
                tipo: "djen_nova_publicacao",
                titulo: item.tipoComunicacao ?? "Nova publicação no DJEN",
                descricao: cnjMascara
                  ? `${cnjMascara} · ${item.nomeOrgao ?? item.siglaTribunal ?? "DJEN"}`
                  : item.nomeOrgao ?? item.siglaTribunal ?? "DJEN",
                link: processoId
                  ? `/processos/${processoId}`
                  : "/ferramentas/publicacoes-pje",
              })),
            );
          }
        }
      } catch (e) {
        console.error("Erro ao processar item PJe:", e);
        r.erros += 1;
      }
    }

    if (items.length < ITENS_POR_PAGINA) break;
    // CNJ: API geralmente retorna tudo numa página só
    if (m.tipo === "cnj") break;
  }

  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  let logId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    const modo: "manual" | "agendado" = body.modo === "agendado" ? "agendado" : "manual";
    const monIdParam: string | null = body.monitoramento_id ?? null;
    const oabIdParam: string | null = body.oab_id ?? null; // legado
    const dias: number = Math.max(1, Math.min(365, Number(body.dias) || 7));
    const dryRun: boolean = body.dry_run === true;

    let disparadoPor: string | null = null;
    if (modo === "agendado") {
      const cronSecret = req.headers.get("x-djen-cron-secret") ?? "";
      const { data: cronValido, error: cronError } = await supabase.rpc(
        "validar_djen_cron_secret",
        { _secret: cronSecret },
      );
      if (cronError || cronValido !== true) {
        return new Response(JSON.stringify({ error: "Unauthorized scheduler" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supaUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const token = authHeader.replace("Bearer ", "");
      const { data, error } = await supaUser.auth.getClaims(token);
      if (error || !data?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      disparadoPor = data.claims.sub as string;

      const { data: gestor } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", disparadoPor)
        .eq("role", "gestor")
        .maybeSingle();
      if (!gestor) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const hoje = new Date();
    const dataFim = hoje.toISOString().slice(0, 10);
    const ini = new Date(hoje.getTime() - dias * 86400000);
    const dataInicio = ini.toISOString().slice(0, 10);

    // Resolve monitoramentos alvo
    let queryMon = supabase
      .from("pje_monitoramentos")
      .select("id,tipo,valor,uf_oab,rotulo,cliente_id,oab_legacy_id")
      .eq("ativo", true);
    if (monIdParam) queryMon = queryMon.eq("id", monIdParam);
    else if (oabIdParam) queryMon = queryMon.eq("oab_legacy_id", oabIdParam);

    const { data: monitoramentos, error: monErr } = await queryMon;
    if (monErr) throw monErr;

    if (!monitoramentos || monitoramentos.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "Nenhum monitoramento ativo", resultados: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: log } = await supabase
      .from("pje_sync_log")
      .insert({
        modo,
        oab_id: oabIdParam,
        data_inicio: dataInicio,
        data_fim: dataFim,
        disparado_por: disparadoPor,
      })
      .select("id")
      .single();
    logId = (log?.id as string) ?? null;

    const resultados: ResultadoSync[] = [];
    let consultadasTot = 0,
      novasTot = 0,
      dupTot = 0,
      vincTot = 0,
      errosTot = 0;

    for (const m of monitoramentos as MonitoramentoRow[]) {
      try {
        const r = await sincronizarMonitoramento(supabase, m, dataInicio, dataFim, dryRun);
        resultados.push(r);
        consultadasTot += r.consultadas;
        novasTot += r.novas;
        dupTot += r.duplicadas;
        vincTot += r.vinculadas;
        errosTot += r.erros;

        if (!dryRun) {
          await supabase
            .from("pje_monitoramentos")
            .update({ ultima_sync_em: new Date().toISOString(), ultima_sync_qtd: r.novas })
            .eq("id", m.id);

          // Mantém o legado sincronizado (apenas para tipo OAB com vínculo)
          if (m.oab_legacy_id) {
            await supabase
              .from("pje_oabs_monitoradas")
              .update({ ultima_sync_em: new Date().toISOString(), ultima_sync_qtd: r.novas })
              .eq("id", m.oab_legacy_id);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        resultados.push({
          monitoramento_id: m.id,
          oab_id: m.oab_legacy_id,
          identificador: m.rotulo ?? m.valor,
          tipo: m.tipo,
          consultadas: 0,
          novas: 0,
          duplicadas: 0,
          vinculadas: 0,
          erros: 1,
          mensagem: msg,
        });
        errosTot += 1;
      }
    }

    const dur = Date.now() - t0;
    if (logId) {
      await supabase
        .from("pje_sync_log")
        .update({
          status: errosTot > 0 && novasTot === 0 ? "erro" : "concluido",
          finalizado_em: new Date().toISOString(),
          duracao_ms: dur,
          total_consultadas: consultadasTot,
          total_novas: novasTot,
          total_duplicadas: dupTot,
          total_vinculadas: vincTot,
          total_erros: errosTot,
          detalhes: resultados as unknown as Record<string, unknown>,
        })
        .eq("id", logId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        log_id: logId,
        duracao_ms: dur,
        totais: {
          consultadas: consultadasTot,
          novas: novasTot,
          duplicadas: dupTot,
          vinculadas: vincTot,
          erros: errosTot,
        },
        resultados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (logId) {
      await supabase
        .from("pje_sync_log")
        .update({
          status: "erro",
          finalizado_em: new Date().toISOString(),
          duracao_ms: Date.now() - t0,
          mensagem: msg,
        })
        .eq("id", logId);
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
