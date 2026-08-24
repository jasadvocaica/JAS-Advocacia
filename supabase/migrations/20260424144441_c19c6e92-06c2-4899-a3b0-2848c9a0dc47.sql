-- =========================================================
-- 1. NOTIFICAÇÕES INTERNAS — configuração de eventos
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notificacoes_config_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  modulo TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  enviar_email BOOLEAN NOT NULL DEFAULT false,
  papeis_destino TEXT[] NOT NULL DEFAULT ARRAY['gestor','advogado'],
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID
);

ALTER TABLE public.notificacoes_config_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor lê config eventos"
  ON public.notificacoes_config_eventos FOR SELECT
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "gestor edita config eventos"
  ON public.notificacoes_config_eventos FOR UPDATE
  TO authenticated
  USING (public.is_gestor(auth.uid()))
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "gestor cria config eventos"
  ON public.notificacoes_config_eventos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE TRIGGER trg_notif_config_updated_at
  BEFORE UPDATE ON public.notificacoes_config_eventos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed de eventos padrão
INSERT INTO public.notificacoes_config_eventos (chave, nome, descricao, modulo, papeis_destino) VALUES
  ('prazo_d3',           'Prazo a 3 dias do vencimento',           'Avisa quando faltam 3 dias úteis para um prazo fatal.',  'controladoria', ARRAY['gestor','advogado']),
  ('prazo_d1',           'Prazo a 1 dia do vencimento',            'Aviso final na véspera de prazos fatais.',                'controladoria', ARRAY['gestor','advogado']),
  ('prazo_perdido',      'Prazo perdido',                          'Notifica gestor quando um prazo fatal vence sem conclusão.','controladoria', ARRAY['gestor']),
  ('tarefa_atribuida',   'Tarefa atribuída',                       'Avisa o responsável quando recebe uma tarefa nova.',      'controladoria', ARRAY['advogado','estagiario']),
  ('andamento_novo',     'Novo andamento processual',              'Disparado quando o DataJud traz movimentação nova.',      'processos',     ARRAY['advogado']),
  ('contrato_vencendo',  'Contrato com mensalidade vencendo',      'Aviso 5 dias antes do vencimento de mensalidade.',        'financeiro',    ARRAY['gestor']),
  ('parcela_atrasada',   'Parcela atrasada',                       'Disparado quando uma parcela fica em atraso.',            'financeiro',    ARRAY['gestor']),
  ('pagamento_recebido', 'Pagamento recebido',                     'Confirma para o time que um pagamento foi registrado.',   'financeiro',    ARRAY['gestor','advogado']),
  ('repasse_a_pagar',    'Repasse para parceiro a pagar',          'Avisa que existe valor de êxito para repassar.',          'parceiros',     ARRAY['gestor']),
  ('cliente_novo',       'Novo cliente cadastrado',                'Notifica o time quando um cliente é criado.',             'clientes',      ARRAY['gestor']),
  ('mensagem_cliente',   'Nova mensagem no portal do cliente',     'Avisa o advogado responsável.',                           'portal',        ARRAY['advogado']),
  ('mensagem_parceiro',  'Nova mensagem do parceiro',              'Avisa o gestor sobre conversa no portal do parceiro.',    'portal',        ARRAY['gestor']),
  ('importacao_concluida','Importação em massa concluída',         'Avisa quem disparou que o job terminou.',                 'importacao_exportacao', ARRAY['gestor']),
  ('exportacao_concluida','Exportação concluída',                  'Avisa que o arquivo de exportação está pronto.',          'importacao_exportacao', ARRAY['gestor'])
ON CONFLICT (chave) DO NOTHING;

-- =========================================================
-- 2. STORAGE POLICIES — endurece buckets públicos
-- =========================================================
-- Remover políticas amplas de listagem (se existirem) e manter
-- apenas SELECT por nome de objeto. URL pública continua funcionando
-- pois usa o token assinado interno do Supabase Storage.

-- BRANDING
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_read_object"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'branding');

DROP POLICY IF EXISTS "branding_gestor_write" ON storage.objects;
CREATE POLICY "branding_gestor_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'branding' AND public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "branding_gestor_update" ON storage.objects;
CREATE POLICY "branding_gestor_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'branding' AND public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "branding_gestor_delete" ON storage.objects;
CREATE POLICY "branding_gestor_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'branding' AND public.is_gestor(auth.uid()));

-- AVATARES
DROP POLICY IF EXISTS "avatares_public_read" ON storage.objects;
CREATE POLICY "avatares_read_object"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatares');

DROP POLICY IF EXISTS "avatares_auth_write" ON storage.objects;
CREATE POLICY "avatares_auth_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatares');

DROP POLICY IF EXISTS "avatares_auth_update" ON storage.objects;
CREATE POLICY "avatares_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatares');