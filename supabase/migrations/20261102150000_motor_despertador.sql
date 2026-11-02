-- Despertador do motor de missões: a cada 5 minutos, se o motor estiver ligado e houver tarefa
-- pronta, acorda a Edge Function motor-missoes. Endereço e segredo vêm do Vault (nada fixo aqui).
create function escritorio_privado.motor_cron()
returns void language plpgsql security definer set search_path='' as $$
declare v_url text; v_segredo text;
begin
  if not coalesce((select ligado from escritorio_privado.motor_config), false) then return; end if;
  if not exists(select 1 from escritorio_privado.missao_tarefas
                where estado = 'pendente' or (estado = 'executando' and reservada_ate < now())) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'djen_cron_secret';
  if v_url is null or v_segredo is null then return; end if;
  perform net.http_post(url := v_url || '/functions/v1/motor-missoes',
    headers := jsonb_build_object('Content-Type','application/json','x-djen-cron-secret', v_segredo),
    body := '{"acao":"pulso"}'::jsonb, timeout_milliseconds := 5000);
end $$;
revoke all on function escritorio_privado.motor_cron() from public, anon, authenticated;

do $$ begin
  if exists(select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('motor-missoes-pulso', '*/5 * * * *', 'select escritorio_privado.motor_cron()');
  end if;
end $$;
