-- A agenda está integrada por incorporação (iframe), sem OAuth.
-- Remove estados pendentes enganosos, preservando eventos já vinculados.
update public.diligencias
set sincronizar_google = false,
    google_ultimo_erro = null,
    atualizado_em = now()
where sincronizar_google is true
  and google_event_id is null;
