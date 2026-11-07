// PostgreSQL WASM isolado; não acessa o projeto ou a API externa.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const gestor = "00000000-0000-4000-8000-000000000001",
  equipe = "00000000-0000-4000-8000-000000000002",
  negado = "00000000-0000-4000-8000-000000000003";
let checks = 0;
const ok = (v, m) => {
  assert.ok(v, m);
  checks++;
};
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema marketing_privado; create schema escritorio_privado;
 grant usage on schema public,auth,marketing_privado to authenticated;
 create function public.is_interno_ativo(uuid) returns boolean language sql as $$select $1 is not null$$;
 create function public.is_gestor(uuid) returns boolean language sql as $$select $1='${gestor}'::uuid$$;
 create function marketing_privado.pode(text) returns boolean language sql as $$select auth.uid() in ('${gestor}'::uuid,'${equipe}'::uuid)$$;
 create function marketing_privado.comercial(text) returns boolean language sql as $$select auth.uid() in ('${gestor}'::uuid,'${equipe}'::uuid)$$;
 create function marketing_privado.auditar(text,uuid,text,jsonb,jsonb) returns void language sql as $$select$$;
 create table public.mkt_campanhas(id uuid primary key default gen_random_uuid(),nome text,canal text,objetivo text,status text,data_inicio date,data_fim date,orcamento_total numeric,criado_por uuid);
 create table public.mkt_leads(id uuid primary key default gen_random_uuid(),nome text,whatsapp text,email text,canal text,campanha_id uuid,status text default 'novo',criado_em timestamptz default now(),responsavel_id uuid,registrado_por uuid);
 create table public.mkt_itens(id uuid primary key,tipo text,titulo text,descricao text,status text,versao integer,versao_aprovada integer,dados jsonb);
 create table public.clientes(id uuid primary key,lead_origem_id uuid);
 create table public.comercial_contratacoes(id uuid primary key,cliente_id uuid,status text,formalizado_em timestamptz);
 create table escritorio_privado.eventos(id bigserial,tipo text,payload jsonb,chave text unique);
 create table escritorio_privado.ferramentas(slug text primary key,nome text,descricao text,classe text,modulo text);
 create table escritorio_privado.aprovacoes(id uuid primary key default gen_random_uuid(),tipo text,origem text,solicitada_por uuid,ferramenta text,modulo text,parametros jsonb,escopo_hash text,resumo text,riscos text,chave text unique,estado text default 'pendente',valida_ate timestamptz default now()+interval '7 days',decidida_por uuid,resultado jsonb);
 create function escritorio_privado.escopo_hash(text,jsonb) returns text language sql immutable as $$select encode(sha256(convert_to($1||':'||$2::text,'UTF8')),'hex')$$;
 grant usage on schema marketing_privado,escritorio_privado to service_role;
 grant usage,select on all sequences in schema escritorio_privado to service_role;
 grant all on all tables in schema public,marketing_privado,escritorio_privado to service_role;
 `);
  const original = await readFile(
    "supabase/migrations/20261102140000_integracao_zernio.sql",
    "utf8",
  );
  const tables = original.slice(
    original.indexOf("create table marketing_privado.zernio_conexoes"),
    original.indexOf(
      "-- ---------------------------------------------------------------- conexão",
    ),
  );
  await db.exec(tables);
  await db.exec(
    `create function public.zernio_conexao(boolean default false) returns jsonb language sql as $$select '{}'::jsonb$$; grant all on all tables in schema marketing_privado to service_role;`,
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261107192003_marketing_integrado.sql",
      "utf8",
    ),
  );
  await db.exec(`insert into marketing_privado.zernio_contas(externo_id,plataforma,nome,ativa) values('a1','metaads','Conta um',true),('a2','instagram','Conta dois',true);
 insert into marketing_privado.lead_formularios(conta_id,pagina_id,formulario_id,escopos_conferidos,privacidade_conferida,termos_conferidos,ativo) values('a1','p1','f1',true,true,true,true);
 update marketing_privado.zernio_conexoes set estado='conectado',ultima_sync_ok_em=now(),addon_ads=true;
 insert into marketing_privado.zernio_anuncio_metricas(nivel,referencia,data,moeda,gasto,impressoes) values('conta','a1','2026-11-03','BRL',100,20),('anuncio','ad1','2026-11-03','BRL',100,20),('conta','outra','2026-11-03','USD',40,10);
 set role service_role;`);
  const dados = {
    evento_id: "evt1",
    conta_id: "a1",
    externo_id: "lead1",
    formulario_id: "f1",
    nome: "Contato fictício",
    email: "teste@example.test",
    telefone: "",
    adquirido_em: "2026-11-03T12:00:00Z",
    teste: true,
    campanha_externa_id: "cmp1",
  };
  const receber = async (d) =>
    (
      await db.query("select public.mkt_receber_lead($1::jsonb) id", [
        JSON.stringify(d),
      ])
    ).rows[0].id;
  const lead = await receber(dados);
  ok(lead, "Lead criado");
  ok((await receber(dados)) === lead, "Retry do mesmo evento");
  ok(
    (await receber({ ...dados, evento_id: "evt2" })) === lead,
    "Novo evento do mesmo lead",
  );
  await db.exec(
    `update public.mkt_leads set status='em_atendimento' where id='${lead}';`,
  );
  await receber({ ...dados, evento_id: "evt3", nome: "Não substituir" });
  ok(
    (
      await db.query("select nome,status from public.mkt_leads where id=$1", [
        lead,
      ])
    ).rows[0].nome === "Contato fictício",
    "Nome humano preservado",
  );
  await assert.rejects(
    () => receber({ ...dados, evento_id: "evt4", conta_id: "indevida" }),
    /não homologado/,
  );
  checks++;
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${gestor}',false); set role authenticated;`,
  );
  const op = async (a, p = {}) =>
    (
      await db.query("select public.mkt_integrado($1,$2::jsonb) r", [
        a,
        JSON.stringify(p),
      ])
    ).rows[0].r;
  let pain = await op("resultados", {
    de: "2026-11-01",
    ate: "2026-11-07",
    conta: "a1",
    teste: true,
  });
  ok(
    pain.diario.length === 1 && Number(pain.diario[0].gasto) === 100,
    "Conta e nível filtrados",
  );
  ok(pain.crm.leads === 1 && pain.crm.qualificados === 1, "Coorte teste");
  ok(
    (
      await op("resultados", {
        de: "2026-11-01",
        ate: "2026-11-07",
        conta: "a1",
        teste: false,
      })
    ).crm.leads === 0,
    "Teste isolado de produção",
  );
  await assert.rejects(
    () => op("resultados", { de: "2026-11-07", ate: "2026-11-01" }),
    /Período/,
  );
  checks++;
  await assert.rejects(
    () => db.query("select * from marketing_privado.lead_origens"),
    /permission denied/,
  );
  checks++;
  const draft = {
    nome: "Campanha fictícia",
    moeda: "BRL",
    orcamento: "100",
    inicio: "2026-11-10",
    fim: "2026-11-20",
    destino: "https://example.test",
    conta_id: "a1",
    pagina_id: "p1",
    publico: "Informativo",
    texto: "Conteúdo informativo",
    midia_url: "https://example.test/imagem.png",
    revisao_etica: true,
    revisao_privacidade: true,
  };
  const r = await op("campanha_salvar", { dados: draft });
  ok(r.versao === 1, "Versão inicial");
  const a = await op("campanha_submeter", { id: r.id, versao: r.versao });
  ok(!!a.aprovacao_id, "Pedido na Central");
  ok(
    (await op("campanha_submeter", { id: r.id, versao: 1 })).aprovacao_id ===
      a.aprovacao_id,
    "Pedido idempotente",
  );
  await db.exec(
    `reset role; update escritorio_privado.aprovacoes set estado='executando',decidida_por='${gestor}' where id='${a.aprovacao_id}'; set role service_role;`,
  );
  const sim = async (id) =>
    (await db.query("select public.mkt_simular_campanha($1) r", [id])).rows[0]
      .r;
  const s = await sim(a.aprovacao_id);
  ok(
    s.status === "PAUSED" && s.chamadas_externas === 0,
    "Simulação pausada sem API",
  );
  ok(
    (await sim(a.aprovacao_id)).simulado_id === s.simulado_id,
    "Retry sem duplicação",
  );
  await db.exec("reset role;set role authenticated;");
  await op("campanha_salvar", {
    id: r.id,
    versao: 1,
    dados: { ...draft, texto: "Versão nova" },
  });
  await db.exec("reset role;set role service_role;");
  await assert.rejects(() => sim(a.aprovacao_id), /Rascunho mudou/);
  checks++;
  await db.exec(
    `reset role; insert into marketing_privado.zernio_conversas(externo_id,conta_externa_id,plataforma,participante_nome) values('direct1','a2','instagram','Contato fictício'),('direct2','a2','instagram','Contato fictício');set role authenticated;`,
  );
  const tri = await op("triagem");
  ok(tri.length === 2, "Conversas na triagem, não criam lead");
  const direct = await op("triagem_confirmar", {
    conversa: "direct1",
    nome: "Contato",
    responsavel_id: equipe,
    revisado: true,
  });
  ok(
    (
      await op("triagem_confirmar", {
        conversa: "direct1",
        nome: "Contato",
        responsavel_id: equipe,
        revisado: true,
      })
    ).lead_id === direct.lead_id,
    "Direct retry idempotente",
  );
  ok(
    (
      await op("triagem_confirmar", {
        conversa: "direct2",
        nome: "Contato",
        responsavel_id: equipe,
        revisado: true,
        lead_id: direct.lead_id,
      })
    ).lead_id === direct.lead_id,
    "Segunda conversa vinculada ao mesmo lead",
  );
  await assert.rejects(
    () =>
      op("triagem_confirmar", {
        conversa: "direct2",
        nome: "Contato",
        responsavel_id: equipe,
        revisado: false,
      }),
    /revisão/,
  );
  checks++;
  await db.exec(
    `reset role;insert into public.mkt_itens values('10000000-0000-4000-8000-000000000001','conteudo','Post fictício','Texto informativo','aprovado',2,2,'{}');set role authenticated;`,
  );
  const pub = await op("editorial_submeter", {
    id: "10000000-0000-4000-8000-000000000001",
    versao: 2,
    conta_id: "a2",
  });
  ok(!!pub.aprovacao_id, "Publicação pede autorização separada");
  await db.exec(
    `reset role;update escritorio_privado.aprovacoes set estado='executando',decidida_por='${gestor}' where id='${pub.aprovacao_id}';set role service_role;`,
  );
  const ed = (
    await db.query("select public.mkt_simular_editorial($1) r", [
      pub.aprovacao_id,
    ])
  ).rows[0].r;
  ok(
    ed.publicacao_simulada && ed.chamadas_externas === 0,
    "Publicação simulada sem API",
  );
  await db.exec(
    `reset role;update public.mkt_itens set versao=3,versao_aprovada=null;set role service_role;`,
  );
  await assert.rejects(
    () =>
      db.query("select public.mkt_simular_editorial($1)", [pub.aprovacao_id]),
    /alterada/,
  );
  checks++;
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${negado}',false);set role authenticated;`,
  );
  await assert.rejects(
    () => op("resultados", { de: "2026-11-01", ate: "2026-11-07" }),
    /Sem permissão/,
  );
  checks++;
  await assert.rejects(() => op("triagem"), /Sem permissão/);
  checks++;
  await assert.rejects(
    () =>
      db.query("select public.mkt_receber_lead($1::jsonb)", [
        JSON.stringify(dados),
      ]),
    /permission denied/,
  );
  checks++;
  await db.exec("reset role;set role service_role;");
  await assert.rejects(
    () =>
      db.query("select public.aprovacao_decidir($1,$2,true,$3,null)", [
        equipe,
        a.aprovacao_id,
        "hash-ficticio",
      ]),
    /Somente a gestora/,
  );
  checks++;
  await db.query("select public.mkt_alertas_integracao('lead_pendente','a1')");
  await db.query("select public.mkt_alertas_integracao('lead_pendente','a1')");
  ok(
    (await db.query("select count(*) n from escritorio_privado.eventos"))
      .rows[0].n === 1,
    "Alerta interno deduplicado sem contato",
  );
  await db.exec(`reset role;
    create table public.agentes_ia(id uuid primary key,nome text,slug text,descricao text,ativo boolean,executor text,sala text);
    create table escritorio_privado.agente_ferramentas(agente_id uuid,ferramenta text);
    insert into public.agentes_ia values
    ('00000000-0000-4000-8000-000000000010','Camila','camila','Conteúdo',true,'analista_operacional','marketing'),
    ('00000000-0000-4000-8000-000000000011','Vinícius','vinicius','Design',false,'analista_operacional','marketing'),
    ('00000000-0000-4000-8000-000000000012','Helena','helena','Jurídico',true,'analista_operacional','operacional');`);
  await db.exec(await readFile("supabase/migrations/20261107232918_marketing_equipe_real.sql", "utf8"));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${equipe}'`);
  const equipeReal = (await db.query("select public.mkt_equipe_disponivel() equipe")).rows[0].equipe;
  ok(equipeReal.length === 2 && equipeReal[0].nome === "Camila", "Consulta agentes reais da sala de Marketing");
  ok(equipeReal.find(a => a.nome === "Vinícius").ativo === false, "Preserva estado desativado do cadastro");
  ok(!JSON.stringify(equipeReal).includes("prompt_base"), "Não retorna configuração privada");
  await db.exec(`set request.jwt.claim.sub='${negado}'`);
  await assert.rejects(() => db.query("select public.mkt_equipe_disponivel()"), /Sem permissão/); checks++;
  await db.exec("reset role; set role anon");
  await assert.rejects(() => db.query("select public.mkt_equipe_disponivel()"), /permission denied/); checks++;
  await db.exec("reset role");
  await db.exec(await readFile("supabase/migrations/20261107234742_marketing_consulta_meta.sql", "utf8"));
  await db.exec(`update marketing_privado.zernio_conexoes set coleta_ativa=true; set role service_role;`);
  const consulta = (await db.query("select public.mkt_consulta_meta_criar($1) id", [gestor])).rows[0].id;
  ok((await db.query("select public.mkt_consulta_meta_criar($1) id", [gestor])).rows[0].id === consulta, "Consulta repetida reutiliza o único job ativo");
  const antesSync = (await db.query("select ultima_sync_ok_em::text data from marketing_privado.zernio_conexoes")).rows[0].data;
  await db.exec(`update marketing_privado.zernio_sync_jobs set estado='executando' where id='${consulta}';`);
  await db.query("select public.mkt_consulta_meta_finalizar($1,$2,null)", [consulta, JSON.stringify({contas:[{id:"a1",nome:"Conta de teste"}]})]);
  ok((await db.query("select ultima_sync_ok_em::text data from marketing_privado.zernio_conexoes")).rows[0].data === antesSync, "Consulta de metadados não simula uma sincronização completa");
  await db.exec("reset role; set role authenticated");
  await assert.rejects(() => db.query("select public.mkt_consulta_meta_criar($1)",[gestor]), /permission denied/); checks++;
  console.log(`${checks} verificações SQL passaram (PostgreSQL isolado).`);
} finally {
  await db.close();
}
