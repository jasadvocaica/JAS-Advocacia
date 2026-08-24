-- Conceder permissão de excluir itens da controladoria para todos os estagiários existentes
INSERT INTO public.user_permissions (user_id, modulo, acao, permitido)
SELECT user_id, 'controladoria', 'excluir', true
FROM public.user_roles
WHERE role = 'estagiario'
ON CONFLICT (user_id, modulo, acao) DO UPDATE SET permitido = true;
