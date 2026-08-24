INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, publica, editavel_por, descricao)
VALUES
  ('escritorio', 'timbrado_marca_dagua_url', '', 'arquivo', true, 'gestor', 'URL da marca-d''água central aplicada como fundo da página A4'),
  ('escritorio', 'timbrado_marca_dagua_largura_mm', '120', 'numero', true, 'gestor', 'Largura da marca-d''água em milímetros (centralizada)'),
  ('escritorio', 'timbrado_marca_dagua_opacidade', '0.12', 'numero', true, 'gestor', 'Opacidade da marca-d''água (0.05 a 1.0)')
ON CONFLICT (secao, chave) DO NOTHING;