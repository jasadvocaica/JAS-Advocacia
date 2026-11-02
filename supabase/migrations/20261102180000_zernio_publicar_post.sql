-- Post nas redes pelo Zernio: o agente só PROPÕE; a publicação sai após aprovação humana na Central
-- (ou no Telegram) e com "ações externas" liberadas na integração. Publicação automática segue proibida.

insert into escritorio_privado.ferramentas(slug, nome, descricao, classe, modulo) values
  ('zernio_publicar_post', 'Publicar post',
   'PROPÕE um post (agora ou agendado). Só é publicado após aprovação humana e com ações externas liberadas.',
   'sensivel', 'marketing')
on conflict (slug) do nothing;

-- Conta de destino: conectada, ativa, selecionada para a coleta e sem pedido de reconexão.
create function public.zernio_conta_para_post(_conta text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('conta_id', c.externo_id, 'plataforma', c.plataforma, 'usuario', c.usuario, 'nome', c.nome)
  from marketing_privado.zernio_contas c
  where current_user = 'service_role' and c.ativa and c.selecionada and not c.precisa_reconectar
    and (c.externo_id = _conta or lower(c.usuario) = lower(ltrim(_conta, '@')))
  order by (c.externo_id = _conta) desc
  limit 1
$$;
revoke all on function public.zernio_conta_para_post(text) from public, anon, authenticated;
grant execute on function public.zernio_conta_para_post(text) to service_role;
