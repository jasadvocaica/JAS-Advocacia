// Conversão determinística: nunca interpreta vigência ou completa texto ausente.
export const VERSAO_PARSER = 2;
export interface EntradaCatalogo {
  path: string;
  apelidos?: string[];
  areas?: string[];
}
export interface DispositivoImportado {
  id: string;
  sequencia: number;
  artigo: string;
  artigo_numero: string;
  texto: string;
  revogado: boolean;
}
export interface NormaImportada {
  parser_versao: number;
  id: string;
  titulo: string;
  numero: string;
  tipo: string;
  esfera: string;
  uf: string | null;
  ementa: string;
  apelidos: string[];
  areas: string[];
  fonte_oficial: string;
  fonte_repositorio: string;
  commit: string;
  sha256: string;
  versao_texto: string;
  data_norma: string | null;
  capturado_em: string | null;
  revogada: boolean;
  notas: string;
  texto_original: string;
  dispositivos: DispositivoImportado[];
}

export function caminhoNorma(valor: string): string {
  let caminho = valor.trim();
  if (caminho.startsWith("https://github.com/ctresb/leis/blob/"))
    caminho = caminho.split("/blob/")[1].split("/").slice(1).join("/");
  if (
    caminho !== "constituicao.md" &&
    !/^(federal|estaduais|municipais|reguladores|tratados)\/[a-zA-Z0-9_./-]+\.md$/.test(
      caminho,
    )
  )
    throw new Error("Escolha um arquivo de norma do repositório ctresb/leis.");
  if (
    caminho.includes("..") ||
    caminho.includes("//") ||
    /(?:^|\/)[_.](?:falhas|indice|auditoria)/i.test(caminho)
  )
    throw new Error("Caminho de norma inválido.");
  return caminho;
}

export function fonteOficial(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /\.(gov|leg|jus)\.br$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function sha256(texto: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

function cabecalho(md: string): {
  meta: Record<string, string>;
  corpo: string;
} {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  const meta: Record<string, string> = {};
  if (!m) return { meta, corpo: md };
  let chave = "";
  for (const linha of m[1].split(/\r?\n/)) {
    const p = linha.match(/^([a-z_]+):\s*(.*)$/i);
    if (!p) {
      if (chave && /^\s+/.test(linha)) meta[chave] += " " + linha.trim();
      continue;
    }
    chave = p[1];
    let valor = p[2].trim();
    if (valor.startsWith('"')) {
      try {
        valor = JSON.parse(valor);
      } catch {
        throw new Error(`Cabeçalho inválido: ${chave}`);
      }
    } else if (valor.startsWith("'") && valor.endsWith("'"))
      valor = valor.slice(1, -1).replace(/''/g, "'");
    else if ([">", "|", ">-", "|-"].includes(valor)) valor = "";
    meta[chave] = valor;
  }
  return { meta, corpo: md.slice(m[0].length) };
}

export function textoSemRedacoesTachadas(corpo: string): string {
  const semTachado = corpo
    .replace(/~~[\s\S]*?~~/g, "")
    .replace(/<(?:del|s|strike)\b[^>]*>[\s\S]*?<\/(?:del|s|strike)>/gi, "");
  if (semTachado.includes("~~") || /<(?:del|s|strike)\b/i.test(semTachado))
    throw new Error(
      "Redação tachada incompleta: documento exige conferência antes da indexação.",
    );
  return semTachado
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(?:p|div|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/\r/g, "");
}

function fragmentar(texto: string, max = 6500): string[] {
  const partes: string[] = [];
  let atual = "";
  for (const paragrafo of texto.split(/\n\s*\n/)) {
    if (atual && atual.length + paragrafo.length > max) {
      partes.push(atual.trim());
      atual = "";
    }
    if (paragrafo.length > max) {
      let restante = paragrafo;
      while (restante.length > max) {
        const quebra = Math.max(
          restante.lastIndexOf("\n", max),
          restante.lastIndexOf("; ", max),
          restante.lastIndexOf(". ", max),
        );
        const ponto = quebra > max / 2 ? quebra + 1 : max;
        partes.push(restante.slice(0, ponto).trim());
        restante = restante.slice(ponto).trim();
      }
      atual = restante;
    } else atual += (atual ? "\n\n" : "") + paragrafo;
  }
  if (atual.trim()) partes.push(atual.trim());
  return partes;
}

export async function converterNorma(
  md: string,
  entrada: EntradaCatalogo,
  commit: string,
): Promise<NormaImportada> {
  const path = caminhoNorma(entrada.path);
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("Versão do repositório inválida.");
  if (new TextEncoder().encode(md).length > 4_000_000)
    throw new Error("Norma excede o limite de importação individual.");
  const { meta, corpo } = cabecalho(md);
  const constituicao = path === "constituicao.md";
  const origem = constituicao
    ? (corpo.match(/\]\((https:\/\/www\.planalto\.gov\.br\/[^)]+)\)/)?.[1] ??
      "")
    : (meta.fonte ?? "");
  if (!fonteOficial(origem))
    throw new Error(
      "Fonte oficial brasileira não identificada; norma não será usada pela IA.",
    );
  const texto = textoSemRedacoesTachadas(corpo);
  const artigos = [
    ...texto.matchAll(
      /^\s*Art(?:igo)?\.?\s*(\d+[º°o]?(?:\s*[-–]\s*[A-Z])?|[Úú]nico)(?:[.\s]|$)/gm,
    ),
  ];
  if (!artigos.length)
    throw new Error(
      "Nenhum artigo identificável. A importação requer revisão do formato.",
    );
  const hash = await sha256(md);
  const dispositivos: DispositivoImportado[] = [];
  const adct =
    constituicao || /constitui|lei[ _-]*org/i.test(meta.tipo ?? "")
      ? texto.search(
          /^#{1,6}\s*(?:ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS|ADCT)\b/im,
        )
      : -1;
  for (let i = 0; i < artigos.length; i++) {
    const inicio = artigos[i].index!;
    const fim = artigos[i + 1]?.index ?? texto.length;
    const numero = artigos[i][1]
      .replace(/[º°]/g, "")
      .replace(/^(\d+)o/, "$1")
      .replace(/\s/g, "")
      .replace("–", "-");
    const rotulo = `${adct >= 0 && inicio > adct ? "ADCT, " : ""}Art. ${numero}`;
    let trecho = texto.slice(inicio, fim).trim();
    // Não leva títulos do artigo seguinte ou assinaturas para o dispositivo anterior.
    trecho = trecho.replace(/\n#+\s[^]*$/, "").trim();
    const revogado =
      /^Art(?:igo)?\.?\s*\d+[º°o]?(?:\s*[-–]\s*[A-Z])?\s*[.]?\s*\(?\s*(?:revogad[oa]|vetad[oa])/i.test(
        trecho.split("\n")[0].replace(/[*_]/g, ""),
      );
    const partes = fragmentar(trecho);
    for (let j = 0; j < partes.length; j++) {
      const sequencia = dispositivos.length + 1;
      dispositivos.push({
        id: await sha256(`${path}@${hash}:parser${VERSAO_PARSER}:${sequencia}`),
        sequencia,
        artigo:
          partes.length > 1
            ? `${rotulo} — parte ${j + 1}/${partes.length}`
            : rotulo,
        artigo_numero: numero,
        texto: partes[j],
        revogado,
      });
    }
  }
  const notas = corpo
    .slice(0, corpo.search(/(?:\*\*)?Art\.?\s*1/))
    .split("\n")
    .filter((l) => l.startsWith(">"))
    .join("\n")
    .slice(0, 3500);
  return {
    parser_versao: VERSAO_PARSER,
    id: path,
    titulo:
      meta.titulo || "Constituição da República Federativa do Brasil de 1988",
    numero: meta.numero || "1988",
    tipo: meta.tipo || "Constituição",
    esfera: path.startsWith("estaduais/")
      ? "estadual"
      : path.startsWith("municipais/")
        ? "municipal"
        : "federal",
    uf: meta.uf || null,
    ementa: meta.ementa || "Constituição Federal",
    apelidos: entrada.apelidos ?? [],
    areas: entrada.areas ?? ["geral"],
    fonte_oficial: origem,
    fonte_repositorio: `https://github.com/ctresb/leis/blob/${commit}/${path}`,
    commit,
    sha256: hash,
    versao_texto:
      meta.versao_texto ||
      (constituicao
        ? "Compilação do Planalto; observar regras de transição"
        : "Versão não informada"),
    data_norma: /^\d{4}-\d{2}-\d{2}$/.test(meta.data ?? "") ? meta.data : null,
    capturado_em: /^\d{4}-\d{2}-\d{2}$/.test(meta.baixado_em ?? "")
      ? meta.baixado_em
      : constituicao
        ? (corpo.match(/obtido em (\d{4}-\d{2}-\d{2})/)?.[1] ?? null)
        : null,
    revogada: meta.revogada === "true" || /^revogad/i.test(meta.situacao ?? ""),
    notas,
    texto_original: md,
    dispositivos,
  };
}
