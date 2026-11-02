// Banco PostgreSQL WASM isolado: não acessa nem altera o projeto conectado.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PGlite();
const student = "00000000-0000-4000-8000-000000000001";
const lawyer = "00000000-0000-4000-8000-000000000002";
const client = "10000000-0000-4000-8000-000000000001";
const otherClient = "10000000-0000-4000-8000-000000000002";
const process = "20000000-0000-4000-8000-000000000001";
const task = "30000000-0000-4000-8000-000000000001";

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    CREATE TYPE public.modulo AS ENUM ('documentos');
    CREATE TYPE public.acao_permissao AS ENUM ('visualizar','criar','editar');
    CREATE TYPE public.doc_categoria AS ENUM ('manifestacao');
    CREATE TYPE public.doc_peca_status AS ENUM ('rascunho','em_revisao','revisado','finalizado','protocolado');
    CREATE TABLE public.user_roles(user_id uuid, role text);
    INSERT INTO public.user_roles VALUES ('${student}', 'estagiario'), ('${lawyer}', 'advogado');
    CREATE FUNCTION public.is_gestor(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.has_permission(uuid,public.modulo,public.acao_permissao) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('${student}'::uuid,'${lawyer}'::uuid) $$;
    CREATE TABLE public.clientes(id uuid PRIMARY KEY);
    INSERT INTO public.clientes VALUES ('${client}'), ('${otherClient}');
    ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY visible_client ON public.clientes FOR SELECT TO authenticated USING (id = '${client}');
    CREATE TABLE public.processos(id uuid PRIMARY KEY, cliente_id uuid REFERENCES public.clientes(id));
    INSERT INTO public.processos VALUES ('${process}','${client}');
    CREATE TABLE public.controladoria_itens(id uuid PRIMARY KEY, cliente_id uuid, processo_id uuid);
    INSERT INTO public.controladoria_itens VALUES ('${task}','${client}','${process}');
    CREATE TABLE public.doc_pecas(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), titulo text NOT NULL, categoria public.doc_categoria NOT NULL,
      cliente_id uuid NOT NULL REFERENCES public.clientes(id), processo_id uuid REFERENCES public.processos(id),
      conteudo_html text NOT NULL DEFAULT '', fonte text, tamanho_fonte integer, espacamento_entre_linhas numeric,
      status public.doc_peca_status NOT NULL DEFAULT 'rascunho', versao_atual integer NOT NULL DEFAULT 1,
      elaborado_por uuid, revisado_por uuid, finalizado_por uuid, finalizado_em timestamptz, protocolado_em date,
      atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE FUNCTION public.timestamp_documento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.atualizado_em := clock_timestamp(); RETURN NEW; END $$;
    CREATE TRIGGER timestamp_documento BEFORE UPDATE ON public.doc_pecas FOR EACH ROW EXECUTE FUNCTION public.timestamp_documento();
    ALTER TABLE public.doc_pecas ENABLE ROW LEVEL SECURITY;
    CREATE POLICY doc_select ON public.doc_pecas FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'documentos','visualizar'));
    CREATE POLICY doc_insert ON public.doc_pecas FOR INSERT TO authenticated WITH CHECK(public.has_permission(auth.uid(),'documentos','criar'));
    CREATE POLICY doc_update ON public.doc_pecas FOR UPDATE TO authenticated USING(public.has_permission(auth.uid(),'documentos','editar')) WITH CHECK(public.has_permission(auth.uid(),'documentos','editar'));
    CREATE TABLE public.doc_pecas_versoes(id uuid DEFAULT gen_random_uuid(), peca_id uuid REFERENCES public.doc_pecas(id), numero_versao integer, nome_versao text, conteudo_html text, salvo_por uuid, UNIQUE(peca_id,numero_versao));
    ALTER TABLE public.doc_pecas_versoes ENABLE ROW LEVEL SECURITY;
    CREATE POLICY ver_select ON public.doc_pecas_versoes FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'documentos','visualizar'));
    CREATE POLICY ver_insert ON public.doc_pecas_versoes FOR INSERT TO authenticated WITH CHECK(public.has_permission(auth.uid(),'documentos','editar'));
    CREATE TABLE public.doc_comentarios(peca_id uuid, resolvido boolean);
    GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261102141741_documentos_workspace.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `SET ROLE authenticated; SET request.jwt.claim.sub = '${student}';`,
  );
  const base = {
    titulo: "Manifestação",
    categoria: "manifestacao",
    cliente_id: client,
    processo_id: process,
    conteudo_html: "<p>Versão inicial.</p>",
    fonte: "Arial",
    tamanho_fonte: 12,
    espacamento_entre_linhas: 1.5,
    contexto_producao: { tarefa_id: task, checklist: [] },
    status: "rascunho",
  };
  async function save(peca, dados = base, snapshot = false) {
    const r = await db.query(
      "SELECT * FROM public.salvar_documento_workspace($1,$2::jsonb,$3::timestamptz,$4,$5)",
      [
        peca?.id ?? null,
        JSON.stringify(dados),
        peca?.atualizado_em ?? null,
        snapshot,
        "Teste",
      ],
    );
    return r.rows[0];
  }
  let p = await save(null);
  assert.equal(p.status, "rascunho");
  assert.equal(
    (await db.query("SELECT * FROM doc_pecas_versoes")).rows.length,
    1,
  );
  const stale = p;
  p = await save(p, {
    ...base,
    conteudo_html: "<p>Alteração humana preservada.</p>",
  });
  await assert.rejects(() => save(stale), /outra sessão/);
  p = await save(
    p,
    { ...base, conteudo_html: "<p>Sugestão aplicada.</p>" },
    true,
  );
  assert.ok(
    (await db.query("SELECT * FROM doc_pecas_versoes")).rows.some((v) =>
      v.conteudo_html.includes("Alteração humana"),
    ),
  );
  const count = (await db.query("SELECT * FROM doc_pecas_versoes")).rows.length;
  await assert.rejects(
    () => save(p, { ...base, cliente_id: otherClient }, true),
    /Cliente indisponível/,
  );
  assert.equal(
    (await db.query("SELECT * FROM doc_pecas_versoes")).rows.length,
    count,
    "erro deve reverter os snapshots da transação",
  );
  await assert.rejects(
    () => save(p, { ...base, processo_id: null }, true),
    /Tarefa não encontrada/,
  );
  await assert.rejects(
    () =>
      save(p, {
        ...base,
        conteudo_html: "<p>{{nome}}</p>",
        status: "em_revisao",
      }),
    /campos pendentes/,
  );
  p = await save(p, { ...base, status: "em_revisao" });
  const conferido = {
    ...base,
    contexto_producao: {
      tarefa_id: task,
      checklist: ["fatos", "pedido", "fontes", "anexos", "formatacao"],
      intimacao: "Manifeste-se",
      prazo_conferido: true,
    },
  };
  await assert.rejects(
    () => save(p, { ...conferido, status: "revisado" }),
    /advogado ou gestão/,
  );
  await db.exec(`SET request.jwt.claim.sub = '${lawyer}';`);
  await assert.rejects(
    () => save(p, { ...base, status: "revisado" }),
    /conferência/,
  );
  await db.exec(`INSERT INTO doc_comentarios VALUES ('${p.id}', false);`);
  await assert.rejects(
    () => save(p, { ...conferido, status: "revisado" }),
    /comentários/,
  );
  await db.exec("UPDATE doc_comentarios SET resolvido = true");
  await assert.rejects(
    () =>
      save(p, {
        ...conferido,
        contexto_producao: {
          ...conferido.contexto_producao,
          prazo_conferido: false,
        },
        status: "revisado",
      }),
    /prazo/,
  );
  p = await save(p, { ...conferido, status: "revisado" }, true);
  assert.equal(p.revisado_por, lawyer);
  p = await save(p, { ...conferido, status: "finalizado" }, true);
  await assert.rejects(
    () =>
      save(p, {
        ...conferido,
        status: "finalizado",
        conteudo_html: "<p>Tentativa de edição</p>",
      }),
    /reabra/,
  );
  p = await save(p, { ...base, status: "rascunho" }, true);
  assert.equal(p.revisado_por, null);
  p = await save(p, { ...conferido, status: "em_revisao" });
  p = await save(p, { ...conferido, status: "revisado" });
  p = await save(p, { ...conferido, status: "finalizado" });
  await assert.rejects(
    () => save(p, { ...conferido, status: "protocolado" }),
    /data efetiva/,
  );
  p = await save(
    p,
    { ...conferido, status: "protocolado", protocolado_em: "2026-11-02" },
    true,
  );
  assert.equal(p.status, "protocolado");
  await assert.rejects(
    () => save(p, { ...conferido, status: "rascunho" }),
    /Transição/,
  );
  await db.exec(
    "SET request.jwt.claim.sub = '00000000-0000-4000-8000-000000000099';",
  );
  await assert.rejects(() => save(p), /indisponível/);
  console.log(
    "PASS: criação, contexto, snapshots, concorrência, rollback, vínculo, RLS, aprovação, reabertura e protocolo.",
  );
} finally {
  await db.close();
}
