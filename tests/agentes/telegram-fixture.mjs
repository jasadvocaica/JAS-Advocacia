import {readFile} from 'node:fs/promises';
import {bootstrapOperacao} from './operacao24h-fixture.mjs';
export async function prepararTelegram(db,dono){
 await db.exec(bootstrapOperacao(dono));
 await db.exec(`alter table escritorio_privado.missao_tarefas add column depende_de uuid[] default '{}',add column profundidade smallint default 0,add column pai_id uuid;
 create table escritorio_privado.ia_precos(modelo text primary key,entrada_por_milhao numeric,saida_por_milhao numeric,conferido_em date);
 create table escritorio_privado.agente_configuracoes(agente_id uuid primary key,dados jsonb);
 alter table escritorio_privado.ferramentas add column ativa boolean default true;
 alter table escritorio_privado.missao_tarefas add column chave text unique;
 alter table escritorio_privado.missoes add column encerrada_em timestamptz;
 create table marketing_privado.ia_entregas(tarefa_id uuid primary key,pauta_id uuid,conteudo_id uuid,material_id uuid,erro text);
 grant all on escritorio_privado.agente_configuracoes to service_role;
 create function public.telegram_usuario(_chat bigint) returns uuid language sql stable as $$select usuario_id from escritorio_privado.telegram_vinculos where chat_id=_chat and revogado_em is null and public.is_gestor(usuario_id)$$;`);
 await db.exec(await readFile('supabase/migrations/20261108153837_operacao_24h_resumos_telegram.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261108190537_telegram_conversa_missoes.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261108192849_telegram_ordem_por_chat.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261108193224_telegram_materializar_pautas.sql','utf8'));
}
