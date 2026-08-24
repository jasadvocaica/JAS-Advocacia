UPDATE public.configuracoes_sistema
SET publica = true
WHERE secao = 'escritorio'
  AND chave IN (
    'timbrado_ativo',
    'timbrado_cabecalho_url',
    'timbrado_cabecalho_altura_mm',
    'timbrado_rodape_url',
    'timbrado_rodape_altura_mm',
    'logo_url',
    'nome',
    'nome_advogado_principal',
    'oab',
    'cidade',
    'estado'
  );