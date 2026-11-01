-- Contrato mínimo da tabela nativa, somente no PostgreSQL descartável.
alter table public.clientes alter column id set default gen_random_uuid();
alter table public.clientes add column nome text not null default 'Fixture', add column cpf_cnpj text,
 add column tipo_pessoa text not null default 'fisica', add column whatsapp text, add column telefones text[] default '{}',
 add column email text,add column endereco text,add column nascimento date,add column status text default 'ativo',
 add column ativo boolean default true,add column criado_por uuid,add column origem text;
create or replace function public.is_gestor(_user_id uuid) returns boolean language sql as $$select public.is_interno_ativo(_user_id);$$;
\i supabase/migrations/20261101180430_clara_m1_homologacao.sql
