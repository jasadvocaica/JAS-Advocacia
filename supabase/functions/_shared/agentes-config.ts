export interface FonteAgente {
  id: string;
  titulo: string;
  texto: string;
}
export interface ConfigAgente {
  nome: string;
  missao: string;
  cargo: string;
  sala: string;
  prompt_base: string;
  tom: "objetivo" | "formal" | "acolhedor";
  ferramentas: string[];
  documentos: FonteAgente[];
  intervalo_minutos: number | null;
  ativo: boolean;
}
export const FERRAMENTAS_AGENTE = [
  "indicadores_operacionais",
  "base_conhecimento",
] as const;
export const SALAS_AGENTE = [
  "diretoria",
  "operacional",
  "comercial",
  "reuniao",
  "diligencias",
  "marketing",
] as const;
export function validarConfigAgente(raw: unknown): ConfigAgente {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Configuração inválida.");
  const v = raw as Record<string, unknown>;
  const fields = [
    "nome",
    "missao",
    "cargo",
    "sala",
    "prompt_base",
    "tom",
    "ferramentas",
    "documentos",
    "intervalo_minutos",
    "ativo",
  ];
  if (Object.keys(v).some((k) => !fields.includes(k)))
    throw new Error("Campo de configuração não reconhecido.");
  const str = (key: string, min: number, max: number) => {
    const s = typeof v[key] === "string" ? (v[key] as string).trim() : "";
    if (s.length < min || s.length > max)
      throw new Error(`Confira ${key}: limite de ${max} caracteres.`);
    return s;
  };
  const nome = str("nome", 3, 80),
    missao = str("missao", 0, 1000),
    cargo = str("cargo", 1, 120),
    prompt_base = str("prompt_base", 10, 6000);
  if (
    !SALAS_AGENTE.includes(v.sala as never) ||
    !["objetivo", "formal", "acolhedor"].includes(v.tom as string) ||
    typeof v.ativo !== "boolean" ||
    ![null, 60, 240, 1440].includes(v.intervalo_minutos as never)
  )
    throw new Error("Sala, tom, ativação ou rotina inválidos.");
  if (
    !Array.isArray(v.ferramentas) ||
    !v.ferramentas.length ||
    v.ferramentas.length > 2 ||
    v.ferramentas.some((t) => !FERRAMENTAS_AGENTE.includes(t as never)) ||
    new Set(v.ferramentas).size !== v.ferramentas.length
  )
    throw new Error("Selecione apenas as ferramentas disponíveis.");
  if (!Array.isArray(v.documentos) || v.documentos.length > 10)
    throw new Error("Use até dez fontes na base.");
  const docs = v.documentos.map((d: unknown) => {
    if (!d || typeof d !== "object" || Array.isArray(d))
      throw new Error("Fonte inválida.");
    const f = d as Record<string, unknown>;
    if (
      Object.keys(f).some((k) => !["id", "titulo", "texto"].includes(k)) ||
      typeof f.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(f.id) ||
      typeof f.titulo !== "string" ||
      f.titulo.trim().length < 1 ||
      f.titulo.length > 120 ||
      typeof f.texto !== "string" ||
      !f.texto.trim() ||
      f.texto.length > 20000
    )
      throw new Error(
        "Cada fonte precisa de título e texto de até 20 mil caracteres.",
      );
    return { id: f.id, titulo: f.titulo.trim(), texto: f.texto };
  });
  if (
    new Set(docs.map((d) => d.id)).size !== docs.length ||
    docs.reduce((n, d) => n + d.texto.length, 0) > 60000
  )
    throw new Error(
      "Use fontes distintas, com até 60 mil caracteres no total.",
    );
  return {
    nome,
    missao,
    cargo,
    prompt_base,
    sala: v.sala as string,
    tom: v.tom as ConfigAgente["tom"],
    ativo: v.ativo,
    ferramentas: v.ferramentas as string[],
    documentos: docs,
    intervalo_minutos: v.intervalo_minutos as number | null,
  };
}
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function buscarConhecimento(
  documentos: FonteAgente[],
  consulta: string,
) {
  const termos = [...new Set(normal(consulta).match(/[a-z0-9]{3,}/g) ?? [])];
  return documentos
    .flatMap((doc) => {
      const chunks = [];
      for (let i = 0; i < doc.texto.length; i += 1200) {
        const texto = doc.texto.slice(i, i + 1200);
        const n = normal(doc.titulo + " " + texto);
        chunks.push({
          fonte_id: doc.id,
          titulo: doc.titulo,
          trecho: texto,
          posicao: i,
          pontos: termos.reduce((s, t) => s + (n.includes(t) ? 1 : 0), 0),
        });
      }
      return chunks;
    })
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, 6)
    .map(({ pontos, ...fonte }) => fonte);
}
