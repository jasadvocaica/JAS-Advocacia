/**
 * Utilitários de mapeamento de JSON para a integração PubliJus.
 *
 * - Detecta automaticamente o array de publicações dentro do JSON
 *   percorrendo todas as profundidades.
 * - Detecta o caminho de cada campo (CNJ, data, descrição etc.) usando
 *   regex de nomes comuns + análise do conteúdo (CNJ tem 20 dígitos).
 * - Aplica um caminho "a.b.c" sobre um objeto retornando o valor (ou
 *   undefined se não existir).
 */

const CNJ_REGEX = /\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/;

export type Mapeamento = {
  lista_path: string;
  map_cnj: string;
  map_data: string;
  map_descricao: string;
  map_id: string;
  map_orgao: string;
  map_tipo: string;
};

const VAZIO: Mapeamento = {
  lista_path: "",
  map_cnj: "",
  map_data: "",
  map_descricao: "",
  map_id: "",
  map_orgao: "",
  map_tipo: "",
};

const REGRAS: Array<{ campo: keyof Mapeamento; regex: RegExp; valida?: (v: unknown) => boolean }> = [
  { campo: "map_cnj", regex: /(numero[_-]?cnj|num[_-]?processo|cnj|numero_processo|processo|nup)/i, valida: (v) => typeof v === "string" && CNJ_REGEX.test(v) },
  { campo: "map_data", regex: /(data[_-]?(publicacao|disponibilizacao|divulgacao|movimentacao)|dt[_-]?pub|published_at|data)/i },
  { campo: "map_descricao", regex: /(texto|conteudo|descricao|description|teor|resumo|movimento|content|body)/i },
  { campo: "map_id", regex: /^(id|uuid|codigo|identificador|publicacao_id)$/i },
  { campo: "map_orgao", regex: /(orgao|tribunal|vara|comarca|fonte|caderno|diario|court)/i },
  { campo: "map_tipo", regex: /(tipo|categoria|natureza|kind)/i },
];

/**
 * Encontra o array mais provável dentro do JSON: o array que contém
 * objetos cujos itens parecem publicações (têm CNJ ou pelo menos um
 * campo com "data" e um com "texto").
 */
export function detectarListaPath(raiz: unknown): string {
  let melhor: { path: string; score: number } = { path: "", score: -1 };

  function visitar(node: unknown, path: string) {
    if (Array.isArray(node)) {
      const score = pontuarArray(node);
      if (score > melhor.score) melhor = { path, score };
      // Não desce dentro do array (queremos o array todo)
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        visitar(v, path ? `${path}.${k}` : k);
      }
    }
  }
  visitar(raiz, "");
  return melhor.score > 0 ? melhor.path : "";
}

function pontuarArray(arr: unknown[]): number {
  if (arr.length === 0) return 0;
  const amostra = arr.slice(0, 5).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (amostra.length === 0) return 0;
  let pts = amostra.length; // base: ter objetos
  for (const item of amostra) {
    const flat = aplanar(item);
    for (const v of Object.values(flat)) {
      if (typeof v === "string" && CNJ_REGEX.test(v)) { pts += 5; break; }
    }
    const chaves = Object.keys(flat).join(" ").toLowerCase();
    if (/(data|dt_)/i.test(chaves)) pts += 1;
    if (/(texto|teor|conteudo|descricao)/i.test(chaves)) pts += 1;
  }
  return pts;
}

/**
 * Achata um objeto: { a: { b: 1 } } => { "a.b": 1 }
 */
function aplanar(obj: Record<string, unknown>, prefixo = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, aplanar(v as Record<string, unknown>, path));
    } else {
      out[path] = v;
    }
  }
  return out;
}

/**
 * Detecta o mapeamento de campos olhando os primeiros itens da lista.
 */
export function detectarMapeamento(raiz: unknown): Mapeamento {
  const listaPath = detectarListaPath(raiz);
  const lista = listaPath ? (aplicarPath(raiz, listaPath) as unknown[]) : (Array.isArray(raiz) ? raiz : []);
  const out: Mapeamento = { ...VAZIO, lista_path: listaPath };
  if (!Array.isArray(lista) || lista.length === 0) return out;

  const amostra = lista.slice(0, 5).filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (amostra.length === 0) return out;

  const primeiro = aplanar(amostra[0]);
  const chaves = Object.keys(primeiro);

  for (const regra of REGRAS) {
    // Procura chave que case com regex de nome
    const candidatos = chaves.filter((c) => regra.regex.test(c.split(".").pop() ?? c));
    // Se houver validador (CNJ), aplica em todas amostras
    let escolhido: string | undefined;
    if (regra.valida) {
      escolhido = candidatos.find((c) => amostra.every((it) => {
        const v = aplicarPath(it, c);
        return v == null || regra.valida!(v);
      }));
      // Fallback: procura QUALQUER chave que contenha um CNJ válido
      if (!escolhido) {
        escolhido = chaves.find((c) => {
          const v = aplicarPath(amostra[0], c);
          return regra.valida!(v);
        });
      }
    } else {
      escolhido = candidatos[0];
    }
    if (escolhido) out[regra.campo] = escolhido;
  }
  return out;
}

/**
 * Aplica um caminho "a.b.c" sobre um objeto/array. Suporta índice
 * numérico nos arrays (ex.: "items.0.cnj").
 */
export function aplicarPath(raiz: unknown, path: string): unknown {
  if (!path) return raiz;
  const partes = path.split(".");
  let atual: unknown = raiz;
  for (const p of partes) {
    if (atual == null) return undefined;
    if (Array.isArray(atual)) {
      const idx = Number(p);
      atual = Number.isFinite(idx) ? atual[idx] : undefined;
    } else if (typeof atual === "object") {
      atual = (atual as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return atual;
}

/**
 * Lista todas as chaves "achatadas" do primeiro item de uma lista,
 * útil para popular selects de mapeamento manual.
 */
export function chavesDisponiveis(raiz: unknown, listaPath: string): string[] {
  const lista = listaPath ? aplicarPath(raiz, listaPath) : raiz;
  if (!Array.isArray(lista) || lista.length === 0) return [];
  const item = lista.find((x) => x && typeof x === "object");
  if (!item) return [];
  return Object.keys(aplanar(item as Record<string, unknown>));
}
