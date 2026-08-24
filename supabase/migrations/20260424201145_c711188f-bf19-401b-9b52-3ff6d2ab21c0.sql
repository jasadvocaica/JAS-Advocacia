INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, publica, editavel_por, descricao)
VALUES
  ('escritorio', 'timbrado_modo', 'cabecalho_rodape', 'texto', true, 'gestor', 'Modo de aplicação do timbrado: cabecalho_rodape (imagens separadas) ou imagem_fundo (PDF/imagem A4 inteira)'),
  ('escritorio', 'timbrado_pagina_inteira_url', '', 'arquivo', true, 'gestor', 'URL da imagem A4 (PNG) gerada a partir do PDF do timbrado, usada como fundo de toda a página'),
  ('escritorio', 'timbrado_pagina_inteira_margem_topo_mm', '40', 'numero', true, 'gestor', 'Margem superior (mm) da área útil quando o modo é imagem_fundo'),
  ('escritorio', 'timbrado_pagina_inteira_margem_base_mm', '30', 'numero', true, 'gestor', 'Margem inferior (mm) da área útil quando o modo é imagem_fundo'),
  ('escritorio', 'timbrado_pagina_inteira_margem_esq_mm', '25', 'numero', true, 'gestor', 'Margem esquerda (mm) da área útil quando o modo é imagem_fundo'),
  ('escritorio', 'timbrado_pagina_inteira_margem_dir_mm', '25', 'numero', true, 'gestor', 'Margem direita (mm) da área útil quando o modo é imagem_fundo')
ON CONFLICT (secao, chave) DO NOTHING;