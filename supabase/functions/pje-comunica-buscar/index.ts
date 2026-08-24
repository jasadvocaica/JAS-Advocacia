// Edge Function: pje-comunica-buscar
// Busca ad-hoc na API pública do PJe Comunica (CNJ) por tipo + valor,
// SEM persistir nada no banco. Usada para preview de monitoramentos
// e para listagem rápida na UI.
//
// Body: {
//   tipo: "oab" | "nome" | "cnj",
//   valor: string,
//   uf_oab?: string,         // obrigatório quando tipo = "oab"
//   dias?: number,           // janela (default 14, máx 365) — ignorado em "cnj"
//   limite?: number,         // máximo de itens devolvidos (default 100, máx 500)
// }
//
// Resposta:
// {
//   ok: true,
//   tipo, valor, uf_oab, dias,
//   total: number,
//   items: PublicacaoNormalizada[]
// }

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const PJE_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const ITENS_POR_PAGINA = 100;
const MAX_PAGINAS = 10;

type Tipo = "oab" | "nome" | "cnj";

interface PjeAdvogado {
  nome?: string;
  numero_oab?: string;
  uf_oab?: string;
}

interface PjeDestinatario {
  nome?: string;
  polo?: string;
}

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
  destinatarios?: PjeDestinatario[];
  destinatarioadvogados?: { advogado?: PjeAdvogado }[];
  link?: string;
}

interface PjeResposta {
  status?: string;
  message?: string;
  count?: number;
  items?: PjeItem[];
}

interface PublicacaoNormalizada {
  pje_id: string | null;
  hash: string | null;
  numero_processo: string | null;
  numero_processo_limpo: string | null;
  sigla_tribunal: string | null;
  nome_orgao: string | null;
  tipo_comunicacao: string | null;
  meio: string | null;
  texto: string | null;
  data_disponibilizacao: string | null;
  destinatarios: { nome: string; polo: string | null }[];
  advogados: { nome: string; oab: string | null; uf: string | null }[];
  link: string | null;
}

function limparCnj(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

function formatarCNJ(d: string): string {
  if (d.length !== 20) return d;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

function parseDataISO(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function normalizar(item: PjeItem): PublicacaoNormalizada {
  const cnjMascara = item.numero_processo ?? item.numeroprocessocommascara ?? null;
  const destinatarios = (item.destinatarios ?? [])
    .map((d) => ({
      nome: (d.nome ?? "").trim(),
      polo: (d.polo ?? "").trim().toUpperCase() || null,
    }))
    .filter((d) => d.nome.length > 0);
  const advogados = (item.destinatarioadvogados ?? [])
    .map((da) => da.advogado)
    .filter((a): a is PjeAdvogado => !!a?.nome)
    .map((a) => ({
      nome: a.nome!.trim(),
      oab: a.numero_oab?.trim() || null,
      uf: a.uf_oab?.trim().toUpperCase() || null,
    }));

  return {
    pje_id: item.id != null ? String(item.id) : null,
    hash: item.hash ?? null,
    numero_processo: cnjMascara,
    numero_processo_limpo: limparCnj(cnjMascara) || null,
    sigla_tribunal: item.siglaTribunal ?? null,
    nome_orgao: item.nomeOrgao ?? null,
    tipo_comunicacao: item.tipoComunicacao ?? null,
    meio: item.meio ?? null,
    texto: item.texto ?? null,
    data_disponibilizacao:
      parseDataISO(item.data_disponibilizacao ?? item.datadisponibilizacao),
    destinatarios,
    advogados,
    link: item.link ?? null,
  };
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

function montarParams(
  tipo: Tipo,
  valor: string,
  uf_oab: string | null,
  dataInicio: string,
  dataFim: string,
): { params: Record<string, string>; multipagina: boolean } | { erro: string } {
  if (tipo === "oab") {
    const num = valor.replace(/\D/g, "");
    if (!num) return { erro: "Número da OAB é obrigatório" };
    if (!uf_oab || uf_oab.length !== 2) return { erro: "UF da OAB é obrigatória (2 letras)" };
    return {
      params: {
        numeroOab: num,
        ufOab: uf_oab.toUpperCase(),
        dataDisponibilizacaoInicio: dataInicio,
        dataDisponibilizacaoFim: dataFim,
      },
      multipagina: true,
    };
  }
  if (tipo === "nome") {
    const termo = valor.trim();
    if (termo.length < 4) return { erro: "Nome precisa ter ao menos 4 caracteres" };
    return {
      params: {
        nomeParte: termo,
        dataDisponibilizacaoInicio: dataInicio,
        dataDisponibilizacaoFim: dataFim,
      },
      multipagina: true,
    };
  }
  if (tipo === "cnj") {
    const cnj = limparCnj(valor);
    if (cnj.length !== 20) return { erro: "CNJ deve ter 20 dígitos" };
    return { params: { numeroProcesso: formatarCNJ(cnj) }, multipagina: false };
  }
  return { erro: `Tipo inválido: ${tipo}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Use POST" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tipoRaw = String(body?.tipo ?? "").toLowerCase();
    if (!["oab", "nome", "cnj"].includes(tipoRaw)) {
      return new Response(
        JSON.stringify({ ok: false, error: "tipo deve ser oab, nome ou cnj" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const tipo = tipoRaw as Tipo;
    const valor = String(body?.valor ?? "").trim();
    if (!valor) {
      return new Response(JSON.stringify({ ok: false, error: "valor é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const uf_oab = body?.uf_oab ? String(body.uf_oab).trim().toUpperCase() : null;
    const dias = Math.max(1, Math.min(365, Number(body?.dias) || 14));
    const limite = Math.max(1, Math.min(500, Number(body?.limite) || 100));

    const hoje = new Date();
    const dataFim = hoje.toISOString().slice(0, 10);
    const dataInicio = new Date(hoje.getTime() - dias * 86400000)
      .toISOString()
      .slice(0, 10);

    const montagem = montarParams(tipo, valor, uf_oab, dataInicio, dataFim);
    if ("erro" in montagem) {
      return new Response(JSON.stringify({ ok: false, error: montagem.erro }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items: PjeItem[] = [];
    // Para CNJ: 1ª tentativa formatada, fallback dígitos.
    if (tipo === "cnj") {
      const r1 = await consultarPagina(montagem.params, 1);
      const lista1 = r1.items ?? [];
      if (lista1.length === 0) {
        const r2 = await consultarPagina(
          { numeroProcesso: limparCnj(valor) },
          1,
        );
        items.push(...(r2.items ?? []));
      } else {
        items.push(...lista1);
      }
    } else {
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const r = await consultarPagina(montagem.params, pagina);
        const lista = r.items ?? [];
        if (lista.length === 0) break;
        items.push(...lista);
        if (items.length >= limite) break;
        if (lista.length < ITENS_POR_PAGINA) break;
      }
    }

    const normalizados = items
      .slice(0, limite)
      .map(normalizar)
      .sort((a, b) => {
        const da = a.data_disponibilizacao ?? "";
        const db = b.data_disponibilizacao ?? "";
        return db.localeCompare(da);
      });

    return new Response(
      JSON.stringify({
        ok: true,
        tipo,
        valor,
        uf_oab,
        dias: tipo === "cnj" ? null : dias,
        total: normalizados.length,
        items: normalizados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
