insert into public.configuracoes_sistema (
  secao, chave, valor, descricao, tipo, editavel_por, publica
) values (
  'comercial',
  'sla_primeira_resposta_minutos',
  null,
  'Prazo, em minutos corridos, para a primeira resposta humana no WhatsApp.',
  'numero',
  'gestor',
  false
)
on conflict (secao, chave) do nothing;

alter table public.whatsapp_conversas
  add column if not exists primeira_entrada_em timestamptz,
  add column if not exists primeira_resposta_humana_em timestamptz,
  add column if not exists sla_primeira_resposta_minutos integer,
  add column if not exists sla_primeira_resposta_limite_em timestamptz,
  add constraint whatsapp_conversas_sla_minutos_check
    check (sla_primeira_resposta_minutos is null or sla_primeira_resposta_minutos between 1 and 1440);

create index if not exists whatsapp_conversas_sla_pendente_idx
  on public.whatsapp_conversas(sla_primeira_resposta_limite_em)
  where primeira_entrada_em is not null and primeira_resposta_humana_em is null and status <> 'encerrada';

create or replace function public.whatsapp_atualizar_sla_primeira_resposta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  minutos integer;
begin
  if tg_op = 'INSERT' and new.direcao = 'entrada' then
    select case when valor ~ '^[0-9]+$' then valor::integer else null end
      into minutos
    from public.configuracoes_sistema
    where secao = 'comercial' and chave = 'sla_primeira_resposta_minutos';

    if minutos is not null and minutos not between 1 and 1440 then
      minutos := null;
    end if;

    update public.whatsapp_conversas
    set primeira_entrada_em = new.ocorrida_em,
        sla_primeira_resposta_minutos = minutos,
        sla_primeira_resposta_limite_em = case
          when minutos is null then null
          else new.ocorrida_em + make_interval(mins => minutos)
        end,
        atualizado_em = now()
    where id = new.conversa_id
      and primeira_entrada_em is null;
  end if;

  if tg_op = 'UPDATE'
    and new.direcao = 'saida'
    and new.enviada_por is not null
    and new.status in ('enviada', 'entregue', 'lida')
    and old.status is distinct from new.status
  then
    update public.whatsapp_conversas
    set primeira_resposta_humana_em = new.ocorrida_em,
        atualizado_em = now()
    where id = new.conversa_id
      and primeira_entrada_em is not null
      and primeira_resposta_humana_em is null;
  end if;

  return new;
end;
$$;

drop trigger if exists whatsapp_mensagens_sla_primeira_resposta on public.whatsapp_mensagens;
create trigger whatsapp_mensagens_sla_primeira_resposta
after insert or update of status on public.whatsapp_mensagens
for each row execute function public.whatsapp_atualizar_sla_primeira_resposta();

revoke all on function public.whatsapp_atualizar_sla_primeira_resposta() from public, anon, authenticated;

comment on column public.whatsapp_conversas.primeira_resposta_humana_em is
  'Primeira mensagem de saída confirmada pela Meta e iniciada por usuário autenticado; automações não contam.';
