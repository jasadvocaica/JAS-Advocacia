-- ============================================================
-- Sala de Marketing: 4 agentes baseados na skill-instagram.
-- Aplicar DEPOIS da migration de referência (ESPECIFICACAO-AGENTES-IA.md, seção 6),
-- que cria agente_acoes, agente_consumo, a fila (agentes_reservar) e a coluna funcao.
-- Sem n8n: o agentes-trabalhador chama a função "agente-marketing".
-- Só acrescenta ou atualiza os agentes de marketing; não toca em mais nada.
-- ============================================================

-- Os quatro agentes da sala de Marketing. Se algum já existir, é atualizado.
insert into public.agentes_ia
  (slug, nome, descricao, area, exige_aprovacao, ativo, ordem, modo_execucao, modulos_leitura, acoes_permitidas, funcao, config)
values
  ('conteudo-instagram', 'Camila — Estratégia de conteúdo',
   'Planeja a semana, acha o que está funcionando no nicho, audita posts, otimiza o perfil e reaproveita conteúdo.',
   'marketing', true, false, 12, 'assincrono', '{}', '{agendar_publicacao}', 'agente-marketing',
   '{"personagem":"Camila","limite_mensal_usd":5}'),
  ('video-design', 'Vinícius — Reels e Stories',
   'Roteiro de Reels com gancho testado, texto na tela, folha de batidas e sequência de Stories.',
   'marketing', true, false, 13, 'assincrono', '{}', '{agendar_publicacao}', 'agente-marketing',
   '{"personagem":"Vinicius","limite_mensal_usd":5}'),
  ('redacao-instagram', 'Lara — Legendas e carrosséis',
   'Legendas e carrosséis no tom da Dra. Juliana, dentro das regras da OAB.',
   'marketing', true, false, 14, 'assincrono', '{}', '{agendar_publicacao}', 'agente-marketing',
   '{"personagem":"Lara","limite_mensal_usd":5}'),
  ('comunidade-instagram', 'Bruna — Comentários e direct',
   'Rascunha respostas a comentários e a quem escreveu no direct. Sem parecer jurídico e sem abordar quem não pediu.',
   'marketing', true, false, 15, 'assincrono', '{}', '{}', 'agente-marketing',
   '{"personagem":"Bruna","limite_mensal_usd":3}')
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, area = excluded.area,
  exige_aprovacao = true, modo_execucao = 'assincrono',
  acoes_permitidas = excluded.acoes_permitidas, funcao = excluded.funcao,
  config = public.agentes_ia.config || excluded.config;
-- Ficam desligados (ativo = false) até o teste da Fase 1 passar. Para ligar:
-- update public.agentes_ia set ativo = true where slug in ('conteudo-instagram','video-design','redacao-instagram','comunidade-instagram');

-- Planejamento semanal automático (segunda, 08:00). Desligado até a voz estar preenchida.
insert into public.agente_gatilhos (agente_id, nome, tipo, dias_semana, hora, entrada, ativo)
select id, 'Plano da semana no Instagram', 'agenda', '{1}', '08:00',
       '{"texto": "Planeja a semana do Instagram com base nas áreas do escritório e no que aconteceu na semana passada.", "robo": "ig-plan"}'::jsonb,
       false
from public.agentes_ia where slug = 'conteudo-instagram'
and not exists (select 1 from public.agente_gatilhos g where g.agente_id = public.agentes_ia.id and g.nome = 'Plano da semana no Instagram');
