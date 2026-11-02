// Executado no GitHub Actions; credencial OIDC efêmera nunca é registrada nos logs.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const catalogo = JSON.parse(
  await readFile(new URL("./catalogo.json", import.meta.url), "utf8"),
);
const endpoint =
  "https://mzwnljgujheumdslkloc.supabase.co/functions/v1/biblioteca-juridica-sync";
async function credencial() {
  const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience", "jas-legislacao-sync");
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`,
    },
  });
  if (!r.ok) throw new Error("Falha ao obter a identidade do workflow.");
  return (await r.json()).value;
}
async function chamar(body) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await credencial()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(145_000),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || `Sincronização recusada: HTTP ${r.status}`);
  return data;
}
const commit = execFileSync(
  "git",
  ["ls-remote", "https://github.com/ctresb/leis.git", "HEAD"],
  { encoding: "utf8" },
).split(/\s/)[0];
if (!/^[a-f0-9]{40}$/.test(commit))
  throw new Error("Versão de origem inválida.");
const cadastradas = await chamar({ acao: "catalogo" });
const normas = [
  ...new Map(
    [...cadastradas.normas, ...catalogo.normas].map((n) => [n.path, n]),
  ).values(),
];
console.log(`Sincronizando ${normas.length} normas no commit ${commit}.`);
let falhas = 0;
for (let i = 0; i < normas.length; i += 2) {
  let data;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      data = await chamar({
        commit,
        parser_versao: catalogo.parser_versao,
        normas: normas.slice(i, i + 2),
      });
      break;
    } catch (e) {
      if (tentativa === 2) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  for (const item of data.resultados) {
    console.log(JSON.stringify(item));
    if (!item.ok) falhas++;
  }
}
if (falhas)
  throw new Error(
    `${falhas} normas exigem conferência. As demais importações foram preservadas.`,
  );
console.log("Sincronização concluída.");
