-- A incorporação pública do Google Agenda é somente leitura.
-- Desabilita tentativas automáticas de escrita enquanto não houver credenciais Google.
alter table public.controladoria_itens disable trigger trg_sync_gcal_ins;
alter table public.controladoria_itens disable trigger trg_sync_gcal_upd;
alter table public.controladoria_itens disable trigger trg_sync_gcal_del;
