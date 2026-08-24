import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Configuração do papel timbrado do escritório.
 * Lida da seção `escritorio` em `configuracoes_sistema`.
 *
 * Essas chaves são marcadas como `publica = true` no banco, então qualquer
 * usuário autenticado pode lê-las (necessário para gerar PDFs nos diversos
 * módulos), mas só o gestor pode editá-las.
 */
export type TimbradoModo = "cabecalho_rodape" | "imagem_fundo";

export interface TimbradoConfig {
  ativo: boolean;
  /** Modo de aplicação. `cabecalho_rodape` = imagens separadas (legado).
   * `imagem_fundo` = uma imagem A4 inteira (gerada do PDF) usada como fundo. */
  modo: TimbradoModo;
  cabecalhoUrl: string | null;
  cabecalhoAlturaMm: number;
  rodapeUrl: string | null;
  rodapeAlturaMm: number;
  /** URL da marca-d'água central. */
  marcaDaguaUrl: string | null;
  /** Largura em mm aplicada à marca-d'água (centralizada na página). */
  marcaDaguaLarguraMm: number;
  /** Opacidade da marca-d'água (0.05 – 1.0). */
  marcaDaguaOpacidade: number;
  /** Modo `imagem_fundo`: imagem A4 inteira aplicada como fundo. */
  paginaInteiraUrl: string | null;
  paginaInteiraMargemTopoMm: number;
  paginaInteiraMargemBaseMm: number;
  paginaInteiraMargemEsqMm: number;
  paginaInteiraMargemDirMm: number;
}

const DEFAULT: TimbradoConfig = {
  ativo: false,
  modo: "cabecalho_rodape",
  cabecalhoUrl: null,
  cabecalhoAlturaMm: 30,
  rodapeUrl: null,
  rodapeAlturaMm: 20,
  marcaDaguaUrl: null,
  marcaDaguaLarguraMm: 120,
  marcaDaguaOpacidade: 0.12,
  paginaInteiraUrl: null,
  paginaInteiraMargemTopoMm: 40,
  paginaInteiraMargemBaseMm: 30,
  paginaInteiraMargemEsqMm: 25,
  paginaInteiraMargemDirMm: 25,
};

let cache: { promise?: Promise<TimbradoConfig>; valor?: TimbradoConfig } = {};

/** Busca a configuração do timbrado direto, sem o hook (útil dentro de geradores PDF). */
export async function carregarTimbradoConfig(force = false): Promise<TimbradoConfig> {
  if (!force && cache.valor) return cache.valor;
  if (!force && cache.promise) return cache.promise;

  cache.promise = (async () => {
    const { data, error } = await supabase
      .from("configuracoes_sistema")
      .select("chave, valor")
      .eq("secao", "escritorio")
      .in("chave", [
        "timbrado_ativo",
        "timbrado_modo",
        "timbrado_cabecalho_url",
        "timbrado_cabecalho_altura_mm",
        "timbrado_rodape_url",
        "timbrado_rodape_altura_mm",
        "timbrado_marca_dagua_url",
        "timbrado_marca_dagua_largura_mm",
        "timbrado_marca_dagua_opacidade",
        "timbrado_pagina_inteira_url",
        "timbrado_pagina_inteira_margem_topo_mm",
        "timbrado_pagina_inteira_margem_base_mm",
        "timbrado_pagina_inteira_margem_esq_mm",
        "timbrado_pagina_inteira_margem_dir_mm",
      ]);

    if (error) {
      console.warn("[useTimbrado] erro ao carregar:", error.message);
      cache.valor = DEFAULT;
      return DEFAULT;
    }

    const map = new Map((data ?? []).map((r) => [r.chave, r.valor]));
    const opacidadeBruta = Number(map.get("timbrado_marca_dagua_opacidade") ?? 0.12);
    const opacidade = Number.isFinite(opacidadeBruta)
      ? Math.min(1, Math.max(0.05, opacidadeBruta))
      : 0.12;
    const modoRaw = String(map.get("timbrado_modo") ?? "cabecalho_rodape");
    const modo: TimbradoModo = modoRaw === "imagem_fundo" ? "imagem_fundo" : "cabecalho_rodape";
    const cfg: TimbradoConfig = {
      ativo: map.get("timbrado_ativo") === "true",
      modo,
      cabecalhoUrl: map.get("timbrado_cabecalho_url") || null,
      cabecalhoAlturaMm: Number(map.get("timbrado_cabecalho_altura_mm") ?? 30) || 30,
      rodapeUrl: map.get("timbrado_rodape_url") || null,
      rodapeAlturaMm: Number(map.get("timbrado_rodape_altura_mm") ?? 20) || 20,
      marcaDaguaUrl: map.get("timbrado_marca_dagua_url") || null,
      marcaDaguaLarguraMm: Number(map.get("timbrado_marca_dagua_largura_mm") ?? 120) || 120,
      marcaDaguaOpacidade: opacidade,
      paginaInteiraUrl: map.get("timbrado_pagina_inteira_url") || null,
      paginaInteiraMargemTopoMm: Number(map.get("timbrado_pagina_inteira_margem_topo_mm") ?? 40) || 40,
      paginaInteiraMargemBaseMm: Number(map.get("timbrado_pagina_inteira_margem_base_mm") ?? 30) || 30,
      paginaInteiraMargemEsqMm: Number(map.get("timbrado_pagina_inteira_margem_esq_mm") ?? 25) || 25,
      paginaInteiraMargemDirMm: Number(map.get("timbrado_pagina_inteira_margem_dir_mm") ?? 25) || 25,
    };
    cache.valor = cfg;
    return cfg;
  })();

  return cache.promise;
}

export function invalidarCacheTimbrado() {
  cache = {};
}

export function useTimbrado() {
  const [timbrado, setTimbrado] = useState<TimbradoConfig>(DEFAULT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    carregarTimbradoConfig().then((cfg) => {
      if (!cancel) {
        setTimbrado(cfg);
        setLoading(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  return { timbrado, loading };
}
