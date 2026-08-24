REVOKE EXECUTE ON FUNCTION public.trg_confirmar_comissao_fechamento_pagamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_criar_comissao_fechamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.usuario_ve_contrato_financeiro(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usuario_ve_contrato_financeiro(uuid, uuid) TO authenticated;