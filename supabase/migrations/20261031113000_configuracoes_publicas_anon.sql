-- =====================================================
-- Permite leitura ANÔNIMA de configurações marcadas como públicas
-- -----------------------------------------------------
-- Contexto: a tela de login (antes da autenticação) chama
-- `configuracoes_sistema` para buscar `escritorio.logo_url`, para
-- exibir a logo do escritório. As policies originais cobriam apenas
-- `authenticated`, então a chamada anônima recebia:
--
--   401 - permission denied for table configuracoes_sistema (42501)
--
-- A policy abaixo libera SOMENTE leitura de linhas com `publica = true`.
-- Nenhum dado sensível é exposto: a tabela já usa esse campo como
-- marcador explícito de "pode ser exibido publicamente".
-- A policy de gestor para authenticated continua valendo para o resto.
-- =====================================================

DROP POLICY IF EXISTS "Anônimos leem configurações públicas" ON public.configuracoes_sistema;

CREATE POLICY "Anônimos leem configurações públicas"
  ON public.configuracoes_sistema FOR SELECT
  TO anon
  USING (publica = true);
