// Roda bootstrap + migrations do motor e do Zernio + fluxos num Postgres em memória (PGlite), sem Docker.
//   npm i --no-save @electric-sql/pglite@0.2.17 && node tests/zernio/rodar-pglite.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(join(process.argv[2] ?? process.cwd(), "x.js"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const raiz = new URL("../../", import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), "utf8");
const avisos = [];
const arquivos = [
  "tests/motor/bootstrap.sql",
  "supabase/migrations/20261102120000_motor_missoes_fase2.sql",
  "supabase/migrations/20261102140000_integracao_zernio.sql",
  "tests/zernio/fluxo.sql",
];
for (const arquivo of arquivos) {
  try {
    await db.exec(ler(arquivo), { onNotice: (n) => avisos.push(n.message) });
  } catch (e) {
    console.error(`Falhou em ${arquivo}: ${e.message}${e.where ? `\n${e.where}` : ""}`);
    process.exit(1);
  }
}
console.log(avisos.filter((a) => a.endsWith(": OK")).join("\n"));
