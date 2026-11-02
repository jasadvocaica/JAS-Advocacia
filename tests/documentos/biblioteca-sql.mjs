import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION public.is_gestor(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1='00000000-0000-4000-8000-000000000001'::uuid$$;
 CREATE FUNCTION public.has_permission(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$SELECT $1 IS NOT NULL$$;
 GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;`);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261102151237_biblioteca_juridica.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261102151719_biblioteca_busca_sem_acento.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261102151901_biblioteca_consulta_lexemas.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261102153459_biblioteca_precisao_artigos.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const base = {
    id: "federal/teste.md",
    titulo: "Lei de teste",
    numero: "123",
    tipo: "Lei",
    esfera: "federal",
    uf: null,
    ementa: "benefício de prestação continuada",
    apelidos: ["LOAS", "BPC"],
    areas: ["previdenciario"],
    fonte_oficial: "https://www.planalto.gov.br/teste",
    fonte_repositorio:
      "https://github.com/ctresb/leis/blob/" +
      "a".repeat(40) +
      "/federal/teste.md",
    commit: "a".repeat(40),
    sha256: "b".repeat(64),
    versao_texto: "compilada",
    data_norma: null,
    capturado_em: "2026-10-13",
    revogada: false,
    notas: "Conferir vigência",
    texto_original: "Norma de teste",
    dispositivos: [
      {
        id: "c".repeat(64),
        sequencia: 1,
        artigo: "Art. 20",
        artigo_numero: "20",
        texto:
          "Art. 20. O benefício de prestação continuada assegura renda ao idoso e à pessoa com deficiência.",
        revogado: false,
      },
      {
        id: "d".repeat(64),
        sequencia: 2,
        artigo: "Art. 21",
        artigo_numero: "21",
        texto: "Art. 21. Regra revogada",
        revogado: true,
      },
    ],
  };
  const importar = (n) =>
    db.query("select public.jur_importar_norma($1::jsonb) as r", [
      JSON.stringify(n),
    ]);
  await db.exec(
    `SET ROLE authenticated;SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001'`,
  );
  await importar(base);
  let r = await db.query("select * from public.jur_pesquisar('LOAS art. 20')");
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].artigo, "Art. 20");
  assert.equal(
    (
      await db.query("select * from public.jur_pesquisar('regra revogada')")
    ).rows.some((x) => x.id === "d".repeat(64)),
    false,
  );
  assert.equal((await importar(base)).rows[0].r.status, "sem_alteracao");
  const nova = {
    ...base,
    sha256: "e".repeat(64),
    texto_original: "Norma alterada",
    dispositivos: [
      {
        ...base.dispositivos[0],
        id: "f".repeat(64),
        texto: "Art. 20. Nova redação do benefício de prestação continuada.",
      },
    ],
  };
  await importar(nova);
  assert.equal(
    (await db.query("select * from public.jur_normas_versoes")).rows.length,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.jur_pesquisar('',null,12,$1::text[])",
        [[base.dispositivos[0].id]],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('LOAS art. 20')"))
      .rows[0].versao_sha,
    nova.sha256,
  );
  await assert.rejects(() =>
    importar({
      ...base,
      sha256: "1".repeat(64),
      dispositivos: [
        { ...base.dispositivos[0], id: "2".repeat(64), texto: "" },
      ],
    }),
  );
  assert.equal(
    (await db.query("select sha256 from public.jur_normas")).rows[0].sha256,
    nova.sha256,
    "falha deve reverter versão ativa",
  );
  const versaoParser2 = {
    ...nova,
    parser_versao: 2,
    dispositivos: [{ ...nova.dispositivos[0], id: "9".repeat(64) }],
  };
  await importar(versaoParser2);
  assert.equal(
    (
      await db.query(
        "select * from public.jur_pesquisar('',null,12,$1::text[])",
        [[nova.dispositivos[0].id]],
      )
    ).rows.length,
    0,
    "fragmento de parser antigo deve ficar fora da busca ativa",
  );
  assert.equal(
    (await db.query("select * from public.jur_normas_versoes")).rows.length,
    2,
    "reindexar não deve duplicar o original da mesma versão",
  );
  await db.exec("BEGIN");
  const cpc = {
    ...base,
    id: "federal/cpc.md",
    titulo: "Código de Processo Civil",
    numero: "13105",
    apelidos: ["CPC", "Código de Processo Civil"],
    dispositivos: [
      {
        id: "3".repeat(64),
        sequencia: 1,
        artigo: "Art. 300",
        artigo_numero: "300",
        texto: "Art. 300. Tutela de urgência.",
        revogado: false,
      },
    ],
  };
  const clt = {
    ...base,
    id: "federal/clt.md",
    titulo: "CLT",
    tipo: "Decreto-Lei",
    numero: "5452",
    apelidos: ["CLT"],
    dispositivos: [
      {
        id: "4".repeat(64),
        sequencia: 1,
        artigo: "ADCT, Art. 300",
        artigo_numero: "300",
        texto: "Art. 300. Transferência do empregado.",
        revogado: false,
      },
      {
        id: "5".repeat(64),
        sequencia: 2,
        artigo: "Art. 20",
        artigo_numero: "20",
        texto: "Art. 20. *(Revogado pela Lei...)*",
        revogado: false,
      },
      {
        id: "7".repeat(64),
        sequencia: 3,
        artigo: "ADCT, Art. 818",
        artigo_numero: "818",
        texto: "Art. 818. O ônus da prova incumbe...",
        revogado: false,
      },
    ],
  };
  await importar(cpc);
  await importar(clt);
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('CPC art. 300')")).rows
      .length,
    1,
    "sigla deve limitar a norma, sem confundir artigos de igual número",
  );
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('CLT art. 20')")).rows
      .length,
    0,
    "revogação em itálico não pode ser usada como fundamento",
  );
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('CLT art. 818')"))
      .rows[0].artigo,
    "Art. 818",
    "lei ordinária não pode apresentar rótulo ADCT",
  );
  await db.exec("ROLLBACK");
  await db.exec(
    "SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002'",
  );
  await assert.rejects(() => importar(base), /gestão/);
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('BPC')")).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.jur_pesquisar('beneficio prestacao')",
      )
    ).rows.length,
    1,
    "busca sem acentos deve encontrar o texto preservado com acentos",
  );
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('Lei 1.23 art. 20')"))
      .rows.length,
    1,
    "numeração com pontos deve encontrar a lei correta",
  );
  assert.equal(
    (await db.query("select * from public.jur_pesquisar('Lei 999 art. 20')"))
      .rows.length,
    0,
    "lei diferente não deve ser substituída por outra fonte",
  );
  const estado = (await db.query("select public.jur_estado() as r")).rows[0].r;
  assert.equal(estado.normas, 1);
  assert.equal(estado.dispositivos, 1);
  await db.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(
    () => db.query("select public.jur_estado()"),
    /permission denied/,
  );
  console.log(
    "PASS: importação atômica, versões, pesquisa por artigo, exclusão de revogação/versão antiga, RLS e idempotência.",
  );
} finally {
  await db.close();
}
