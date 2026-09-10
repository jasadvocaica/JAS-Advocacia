revoke execute on function public.whatsapp_atualizar_conversa_por_mensagem() from public, anon, authenticated;
revoke execute on function public.registrar_whatsapp_conversa_historico() from public, anon, authenticated;

drop policy if exists whatsapp_conexoes_manage on public.whatsapp_conexoes;
create policy whatsapp_conexoes_insert_gestor
  on public.whatsapp_conexoes for insert to authenticated
  with check (public.has_role((select auth.uid()), 'gestor'::app_role));
create policy whatsapp_conexoes_update_gestor
  on public.whatsapp_conexoes for update to authenticated
  using (public.has_role((select auth.uid()), 'gestor'::app_role))
  with check (public.has_role((select auth.uid()), 'gestor'::app_role));
create policy whatsapp_conexoes_delete_gestor
  on public.whatsapp_conexoes for delete to authenticated
  using (public.has_role((select auth.uid()), 'gestor'::app_role));

drop policy if exists whatsapp_templates_manage on public.whatsapp_templates;
create policy whatsapp_templates_insert_gestor
  on public.whatsapp_templates for insert to authenticated
  with check (public.has_role((select auth.uid()), 'gestor'::app_role));
create policy whatsapp_templates_update_gestor
  on public.whatsapp_templates for update to authenticated
  using (public.has_role((select auth.uid()), 'gestor'::app_role))
  with check (public.has_role((select auth.uid()), 'gestor'::app_role));
create policy whatsapp_templates_delete_gestor
  on public.whatsapp_templates for delete to authenticated
  using (public.has_role((select auth.uid()), 'gestor'::app_role));

drop index if exists public.whatsapp_mensagens_provider_message_uidx;

create index if not exists whatsapp_conexoes_criado_por_idx
  on public.whatsapp_conexoes(criado_por) where criado_por is not null;
create index if not exists whatsapp_conversa_historico_alterado_por_idx
  on public.whatsapp_conversa_historico(alterado_por) where alterado_por is not null;
create index if not exists whatsapp_conversa_historico_responsavel_anterior_idx
  on public.whatsapp_conversa_historico(responsavel_anterior_id) where responsavel_anterior_id is not null;
create index if not exists whatsapp_conversa_historico_responsavel_novo_idx
  on public.whatsapp_conversa_historico(responsavel_novo_id) where responsavel_novo_id is not null;
create index if not exists whatsapp_conversa_notas_criado_por_idx
  on public.whatsapp_conversa_notas(criado_por);
create index if not exists whatsapp_mensagens_enviada_por_idx
  on public.whatsapp_mensagens(enviada_por) where enviada_por is not null;