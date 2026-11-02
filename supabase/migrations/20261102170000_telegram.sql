-- Telegram: a gestora conversa com a Gestora (Manu), cria missões e decide aprovações pelo celular.
-- O chat só obedece depois de vinculado a um usuário gestor por código de uso único (10 minutos),
-- gerado logado no JAS. O token do bot e o segredo do webhook ficam só nos segredos das funções.

create table escritorio_privado.telegram_vinculos (
  chat_id bigint primary key,
  usuario_id uuid not null,
  nome text check (char_length(nome) <= 120),
  criado_em timestamptz not null default now(),
  revogado_em timestamptz
);
create index telegram_vinculos_usuario on escritorio_privado.telegram_vinculos(usuario_id) where revogado_em is null;

create table escritorio_privado.telegram_codigos (
  codigo_hash text primary key,
  usuario_id uuid not null,
  expira_em timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Avisos já enviados (evita mandar o mesmo pedido duas vezes).
create table escritorio_privado.telegram_avisos (
  aprovacao_id uuid not null references escritorio_privado.aprovacoes(id) on delete cascade,
  chat_id bigint not null,
  mensagem_id bigint,
  enviado_em timestamptz not null default now(),
  primary key (aprovacao_id, chat_id)
);

alter table escritorio_privado.telegram_vinculos enable row level security;
alter table escritorio_privado.telegram_codigos enable row level security;
alter table escritorio_privado.telegram_avisos enable row level security;
revoke all on escritorio_privado.telegram_vinculos, escritorio_privado.telegram_codigos, escritorio_privado.telegram_avisos
  from public, anon, authenticated;
grant select, insert, update on escritorio_privado.telegram_vinculos, escritorio_privado.telegram_codigos,
  escritorio_privado.telegram_avisos to service_role;

create function escritorio_privado.telegram_hash(_codigo text) returns text language sql immutable set search_path='' as
$$ select encode(sha256(convert_to('jas-telegram:' || upper(btrim(_codigo)), 'UTF8')), 'hex') $$;

-- Gera o código (o anterior não usado deixa de valer). Retorna o código em claro uma única vez.
create function public.telegram_gerar_codigo(_usuario uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare v_codigo text;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  update escritorio_privado.telegram_codigos set usado_em = now() where usuario_id = _usuario and usado_em is null;
  v_codigo := upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10));
  insert into escritorio_privado.telegram_codigos(codigo_hash, usuario_id, expira_em)
    values (escritorio_privado.telegram_hash(v_codigo), _usuario, now() + interval '10 minutes');
  perform escritorio_privado.auditar('usuario', _usuario, 'telegram.codigo', null, '{}'::jsonb);
  return v_codigo;
end $$;

-- Vincula o chat ao dono do código (uso único, dentro do prazo). Retorna o usuário ou null.
create function public.telegram_vincular(_chat bigint, _codigo text, _nome text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c escritorio_privado.telegram_codigos;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  select * into c from escritorio_privado.telegram_codigos
    where codigo_hash = escritorio_privado.telegram_hash(coalesce(_codigo, '')) for update;
  if not found or c.usado_em is not null or c.expira_em < now() then return null; end if;
  update escritorio_privado.telegram_codigos set usado_em = now() where codigo_hash = c.codigo_hash;
  if not public.is_gestor(c.usuario_id) or not public.is_interno_ativo(c.usuario_id) then return null; end if;
  insert into escritorio_privado.telegram_vinculos(chat_id, usuario_id, nome)
    values (_chat, c.usuario_id, left(_nome, 120))
    on conflict (chat_id) do update set usuario_id = excluded.usuario_id, nome = excluded.nome,
      criado_em = now(), revogado_em = null;
  perform escritorio_privado.auditar('usuario', c.usuario_id, 'telegram.vinculado', _chat::text, '{}'::jsonb);
  return c.usuario_id;
end $$;

-- Usuário de um chat vinculado, só enquanto continuar gestor e ativo.
create function public.telegram_usuario(_chat bigint)
returns uuid language sql stable security invoker set search_path='' as $$
  select v.usuario_id from escritorio_privado.telegram_vinculos v
  where current_user = 'service_role' and v.chat_id = _chat and v.revogado_em is null
    and public.is_gestor(v.usuario_id) and public.is_interno_ativo(v.usuario_id)
$$;

create function public.telegram_estado(_usuario uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  if not public.is_gestor(_usuario) or not public.is_interno_ativo(_usuario) then
    raise exception 'Gestor ativo necessário' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('chat_id', chat_id, 'nome', nome, 'criado_em', criado_em) order by criado_em)
    from escritorio_privado.telegram_vinculos where usuario_id = _usuario and revogado_em is null), '[]'::jsonb);
end $$;

create function public.telegram_desvincular(_usuario uuid, _chat bigint default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  update escritorio_privado.telegram_vinculos set revogado_em = now()
    where usuario_id = _usuario and revogado_em is null and (_chat is null or chat_id = _chat);
  get diagnostics n = row_count;
  perform escritorio_privado.auditar('usuario', _usuario, 'telegram.desvinculado', _chat::text, '{}'::jsonb);
  return n;
end $$;

-- Chats que devem receber um pedido de aprovação: vinculados a quem pode decidi-lo e ainda não avisados.
create function public.telegram_destinos_aprovacao(_aprovacao uuid)
returns table(chat_id bigint, usuario_id uuid) language sql stable security invoker set search_path='' as $$
  select v.chat_id, v.usuario_id
  from escritorio_privado.aprovacoes a, escritorio_privado.telegram_vinculos v
  where current_user = 'service_role' and a.id = _aprovacao and a.estado = 'pendente' and v.revogado_em is null
    and public.is_interno_ativo(v.usuario_id)
    and case when a.tipo = 'orcamento' then public.is_gestor(v.usuario_id)
             else public.has_permission(v.usuario_id, a.modulo, 'editar') end
    and not exists(select 1 from escritorio_privado.telegram_avisos t where t.aprovacao_id = a.id and t.chat_id = v.chat_id)
$$;

create function public.telegram_registrar_aviso(_aprovacao uuid, _chat bigint, _mensagem bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'service_role' then raise exception 'Somente backend' using errcode='42501'; end if;
  insert into escritorio_privado.telegram_avisos(aprovacao_id, chat_id, mensagem_id) values (_aprovacao, _chat, _mensagem)
    on conflict do nothing;
end $$;

-- Pedido novo → avisa a função telegram (se houver algum chat vinculado). Endereço e segredo vêm do Vault.
create function escritorio_privado.telegram_avisar_aprovacao() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_url text; v_segredo text;
begin
  if new.estado <> 'pendente' or not exists(select 1 from escritorio_privado.telegram_vinculos where revogado_em is null) then
    return new;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'djen_cron_secret';
  if v_url is null or v_segredo is null then return new; end if;
  perform net.http_post(url := v_url || '/functions/v1/telegram',
    headers := jsonb_build_object('Content-Type','application/json','x-djen-cron-secret', v_segredo),
    body := jsonb_build_object('acao', 'avisar_aprovacao', 'aprovacao_id', new.id), timeout_milliseconds := 5000);
  return new;
exception when others then
  return new; -- aviso nunca bloqueia o pedido de aprovação
end $$;
revoke all on function escritorio_privado.telegram_avisar_aprovacao() from public, anon, authenticated;
create trigger telegram_aviso_aprovacao after insert on escritorio_privado.aprovacoes
  for each row execute function escritorio_privado.telegram_avisar_aprovacao();

do $$ declare f text; begin
  foreach f in array array['telegram_gerar_codigo(uuid)', 'telegram_vincular(bigint,text,text)', 'telegram_usuario(bigint)',
    'telegram_estado(uuid)', 'telegram_desvincular(uuid,bigint)', 'telegram_destinos_aprovacao(uuid)',
    'telegram_registrar_aviso(uuid,bigint,bigint)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
grant execute on function escritorio_privado.telegram_hash(text) to service_role;
