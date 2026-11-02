import {
  converterNorma,
  caminhoNorma,
  type EntradaCatalogo,
} from "./legislacao.ts";

export async function commitLegislacao(): Promise<string> {
  const res = await fetch(
    "https://api.github.com/repos/ctresb/leis/git/ref/heads/main",
    {
      headers: { "User-Agent": "JAS-Legislacao" },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok)
    throw new Error(
      "Não foi possível consultar a versão atual do repositório. Tente novamente mais tarde.",
    );
  const sha = (await res.json())?.object?.sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha))
    throw new Error("Versão inválida na origem.");
  return sha;
}

export async function importarNorma(
  banco: {
    rpc: (
      nome: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  },
  entrada: EntradaCatalogo,
  commit: string,
) {
  const path = caminhoNorma(entrada.path);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Commit inválido.");
  const res = await fetch(
    `https://raw.githubusercontent.com/ctresb/leis/${commit}/${path}`,
    { redirect: "error", signal: AbortSignal.timeout(25_000) },
  );
  if (!res.ok)
    throw new Error(
      `A origem não disponibilizou a norma (HTTP ${res.status}).`,
    );
  const leitor = res.body?.getReader();
  if (!leitor) throw new Error("Arquivo sem conteúdo.");
  const decoder = new TextDecoder();
  let md = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4_000_000) {
        await leitor.cancel();
        throw new Error("Arquivo excede o limite de importação individual.");
      }
      md += decoder.decode(value, { stream: true });
    }
    md += decoder.decode();
  } finally {
    leitor.releaseLock();
  }
  const norma = await converterNorma(
    md,
    {
      path,
      apelidos: entrada.apelidos?.slice(0, 30),
      areas: entrada.areas?.slice(0, 10),
    },
    commit,
  );
  const { data, error } = await banco.rpc("jur_importar_norma", {
    p_norma: norma,
  });
  if (error)
    throw new Error(`Não foi possível salvar a norma: ${error.message}`);
  return data;
}
