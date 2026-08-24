-- Permite o retorno imediato de uma atividade recém-criada sem abrir leitura indevida.
-- A chamada can_view_controladoria_item continua protegendo as demais consultas.
drop policy if exists "ver itens controladoria" on public.controladoria_itens;

create policy "ver itens controladoria"
on public.controladoria_itens
for select
to authenticated
using (
  public.has_permission(
    (select auth.uid()),
    'controladoria'::public.modulo,
    'visualizar'::public.acao_permissao
  )
  and (
    public.is_gestor((select auth.uid()))
    or criado_por = (select auth.uid())
    or public.can_view_controladoria_item((select auth.uid()), id)
  )
);
