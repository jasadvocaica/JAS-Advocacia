// Edge Function: pje-comunica-consulta
// Consulta a API pública do PJe Comunica (CNJ) por número de processo,
// agrega as publicações encontradas e devolve um preview no MESMO formato
// usado pelo Datajud (campo `dados`), para servir como fallback no
// formulário assistido de cadastro de processos.
//
// Body: { numero_cnj: string }
// Resposta: { encontrado: boolean, fonte: "pje_comunica", dados?: DataJudPreviewLike, error?: string }

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PJE_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

interface PjeItem {
  id?: number | string;
  numero_processo?: string;
  numeroprocessocommascara?: string;
  siglaTribunal?: string;
  nomeOrgao?: string;
  tipoComunicacao?: string;
  meio?: string;
  texto?: string;
  data_disponibilizacao?: string;
  datadisponibilizacao?: string;
  destinatarios?: Array<{ nome?: string; polo?: string; comunicacao_id?: number }>;
  destinatarioadvogados?: Array<{
    advogado?: { nome?: string; numero_oab?: string; uf_oab?: string };
  }>;
  link?: string;
}

interface PjeResposta {
  status?: string;
  message?: string;
  count?: number;
  items?: PjeItem[];
}

function limparCnj(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function formatarCNJ(d: string): string {
  if (d.length !== 20) return d;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

async function consultarPorNumero(numero: string): Promise<PjeItem[]> {
  const url = new URL(PJE_BASE);
  url.searchParams.set("numeroProcesso", numero);
  url.searchParams.set("itensPorPagina", "50");
  url.searchParams.set("pagina", "1");

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`PJe Comunica ${resp.status}: ${txt.slice(0, 250)}`);
  }
  const json = (await resp.json()) as PjeResposta;
  return json.items ?? [];
}

function parseDataISO(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

interface ParteAgg {
  nome: string;
  polo: string | null;
}

function agregar(items: PjeItem[]) {
  // Ordena por data de disponibilização desc para usar a mais recente como referência
  const ordenados = [...items].sort((a, b) => {
    const da = parseDataISO(a.data_disponibilizacao ?? a.datadisponibilizacao) ?? "";
    const db = parseDataISO(b.data_disponibilizacao ?? b.datadisponibilizacao) ?? "";
    return db.localeCompare(da);
  });
  const ultima = ordenados[0];

  // Partes (deduplicadas por nome)
  const mapaPartes = new Map<string, ParteAgg>();
  for (const it of items) {
    for (const dest of it.destinatarios ?? []) {
      const nome = (dest.nome ?? "").trim();
      if (!nome) continue;
      const polo = (dest.polo ?? "").trim().toUpperCase() || null;
      const chave = nome.toLowerCase();
      if (!mapaPartes.has(chave)) mapaPartes.set(chave, { nome, polo });
    }
  }

  // Heurística: polo "ATIVO"/"AUTOR" → ativo; "PASSIVO"/"REU"/"RÉU" → passivo; demais → ativo
  const ativo: { nome: string; cpf_cnpj: null }[] = [];
  const passivo: { nome: string; cpf_cnpj: null }[] = [];
  for (const p of mapaPartes.values()) {
    const polo = p.polo ?? "";
    if (/PASSIV|R[ÉE]U|EXECUTAD|REQUERID/i.test(polo)) {
      passivo.push({ nome: p.nome, cpf_cnpj: null });
    } else {
      ativo.push({ nome: p.nome, cpf_cnpj: null });
    }
  }

  // Advogados (deduplicados por OAB+UF)
  const mapaAdv = new Map<string, { nome: string; oab: string }>();
  for (const it of items) {
    for (const da of it.destinatarioadvogados ?? []) {
      const adv = da.advogado;
      if (!adv?.nome) continue;
      const oab = `${adv.numero_oab ?? ""}/${adv.uf_oab ?? ""}`.trim();
      const chave = (oab || adv.nome).toLowerCase();
      if (!mapaAdv.has(chave)) mapaAdv.set(chave, { nome: adv.nome, oab });
    }
  }

  // Anexa primeiro advogado encontrado a cada parte ativa quando não houver
  // outra associação (apenas para exibição — o usuário pode editar depois).
  const advogados = Array.from(mapaAdv.values());

  return {
    numero_cnj: ultima?.numero_processo ?? ultima?.numeroprocessocommascara ?? "",
    tribunal_sigla: ultima?.siglaTribunal ?? "",
    tribunal_nome: null,
    orgao_julgador: ultima?.nomeOrgao ?? null,
    classe: null,
    assuntos: [] as { codigo: number; nome: string }[],
    grau: null,
    data_ajuizamento: null,
    valor_causa: null,
    sistema: ultima?.meio ?? null,
    partes: { ativo, passivo },
    total_movimentos: items.length,
    ultimo_movimento: ultima
      ? {
          data: parseDataISO(ultima.data_disponibilizacao ?? ultima.datadisponibilizacao),
          descricao:
            (ultima.tipoComunicacao ? `[${ultima.tipoComunicacao}] ` : "") +
            (ultima.texto ?? "").slice(0, 500),
        }
      : null,
    advogados, // extensão específica desta fonte
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const numeroLimpo = limparCnj(body?.numero_cnj);
    if (numeroLimpo.length !== 20) {
      return new Response(
        JSON.stringify({ encontrado: false, fonte: "pje_comunica", error: "CNJ inválido (20 dígitos)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1ª tentativa: número formatado (formato indexado pela maioria dos tribunais)
    let items = await consultarPorNumero(formatarCNJ(numeroLimpo));
    // 2ª tentativa: dígitos puros (fallback)
    if (items.length === 0) {
      items = await consultarPorNumero(numeroLimpo);
    }

    if (items.length === 0) {
      return new Response(
        JSON.stringify({ encontrado: false, fonte: "pje_comunica" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dados = agregar(items);
    return new Response(
      JSON.stringify({ encontrado: true, fonte: "pje_comunica", dados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ encontrado: false, fonte: "pje_comunica", error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
