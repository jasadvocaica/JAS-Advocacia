-- Parceiros podem alterar apenas o estado operacional das tarefas que lhes foram atribuídas.
-- Demais campos permanecem sob as permissões da equipe interna.
drop policy if exists "parceiro conclui tarefa propria" on public.controladoria_itens;

drop function if exists public.controladoria_parceiro_definir_status(uuid, text);
create function public.controladoria_parceiro_definir_status(
  _item_id uuid,
  _status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'Não autenticado.';
  end if;

  if _status not in ('pendente', 'em_andamento', 'concluido') then
    raise exception 'Status não permitido no portal do parceiro.';
  end if;

  update public.controladoria_itens ci
  set
    status = _status::public.status_item,
    coluna_kanban = _status,
    concluido_em = case when _status = 'concluido' then now() else null end,
    concluido_por = case when _status = 'concluido' then _uid else null end
  where ci.id = _item_id
    and ci.visivel_parceiro = true
    and ci.processo_id is not null
    and public.parceiro_ve_processo(_uid, ci.processo_id)
    and exists (
      select 1
      from public.controladoria_responsaveis cr
      where cr.item_id = ci.id
        and cr.user_id = _uid
    );

  if not found then
    raise exception 'Tarefa indisponível ou não atribuída a este parceiro.';
  end if;
end;
$$;

revoke all on function public.controladoria_parceiro_definir_status(uuid, text)
  from public, anon;
grant execute on function public.controladoria_parceiro_definir_status(uuid, text)
  to authenticated;

drop policy if exists "editar itens controladoria" on public.controladoria_itens;
create policy "editar itens controladoria"
on public.controladoria_itens
for update
to authenticated
using (
  public.has_permission((select auth.uid()), 'controladoria'::public.modulo, 'editar'::public.acao_permissao)
)
with check (
  public.has_permission((select auth.uid()), 'controladoria'::public.modulo, 'editar'::public.acao_permissao)
);