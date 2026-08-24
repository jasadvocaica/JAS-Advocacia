-- Adiciona chaves do papel timbrado em configuracoes_sistema (seção escritorio)
INSERT INTO public.configuracoes_sistema (secao, chave, tipo, valor, editavel_por, publica, descricao)
VALUES
  ('escritorio', 'timbrado_ativo', 'booleano', 'false', 'gestor', false,
    'Se ativado, aplica cabeçalho/rodapé do papel timbrado nos PDFs gerados pela plataforma.'),
  ('escritorio', 'timbrado_cabecalho_url', 'arquivo', NULL, 'gestor', false,
    'Imagem do cabeçalho do papel timbrado (PNG/JPG, ocupa toda a largura da página).'),
  ('escritorio', 'timbrado_cabecalho_altura_mm', 'numero', '30', 'gestor', false,
    'Altura em milímetros que o cabeçalho ocupa no topo de cada página A4.'),
  ('escritorio', 'timbrado_rodape_url', 'arquivo', NULL, 'gestor', false,
    'Imagem do rodapé do papel timbrado (PNG/JPG, ocupa toda a largura da página).'),
  ('escritorio', 'timbrado_rodape_altura_mm', 'numero', '20', 'gestor', false,
    'Altura em milímetros que o rodapé ocupa na base de cada página A4.')
ON CONFLICT (secao, chave) DO NOTHING;