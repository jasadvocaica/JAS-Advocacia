
-- Tabela de modelos de email editáveis pela interface
CREATE TABLE public.email_templates (
  chave TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  assunto TEXT NOT NULL,
  html TEXT NOT NULL,
  variaveis JSONB NOT NULL DEFAULT '[]'::jsonb,
  ativo BOOLEAN NOT NULL DEFAULT true,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_por UUID
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Apenas gestores podem ler e gerenciar
CREATE POLICY "gestores_select_email_templates"
  ON public.email_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "gestores_insert_email_templates"
  ON public.email_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "gestores_update_email_templates"
  ON public.email_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "gestores_delete_email_templates"
  ON public.email_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION public.tg_email_templates_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_email_templates_touch
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_templates_touch();

-- Seed dos templates atuais (HTML extraído das edge functions)
INSERT INTO public.email_templates (chave, nome, descricao, assunto, html, variaveis) VALUES
('tarefa_atribuida',
 'Nova tarefa atribuída',
 'Disparado quando uma tarefa é criada ou transferida para um responsável.',
 '[LegisFlow] Nova tarefa: {{titulo}}{{vinculo_sufixo}}',
 '<h2>{{titulo_email}}</h2>
<p>Olá{{saudacao_nome}}! Você {{verbo_atribuicao}} esta tarefa no LegisFlow:</p>
<div class="highlight">
  <strong>{{titulo}}</strong><br>
  {{linha_vinculo}}
  Prazo: {{prazo}}<br>
  Prioridade: {{prioridade}}
</div>
{{bloco_descricao}}
<a href="{{link}}" class="btn">Ver tarefa no LegisFlow</a>',
 '["titulo","titulo_email","saudacao_nome","verbo_atribuicao","vinculo_sufixo","linha_vinculo","prazo","prioridade","bloco_descricao","link"]'::jsonb),

('revisao_solicitada',
 'Peça enviada para revisão',
 'Avisa a Dra. Juliana quando uma peça é enviada para revisão.',
 '[Revisão] {{nome_remetente}} enviou: {{titulo}}',
 '<h2>Peça enviada para revisão</h2>
<p><strong>{{nome_remetente}}</strong> enviou uma peça para sua revisão:</p>
<div class="highlight">
  <strong>{{titulo}}</strong><br>
  {{bloco_anotacoes}}
</div>
<a href="{{link}}" class="btn">Revisar agora</a>',
 '["nome_remetente","titulo","bloco_anotacoes","link"]'::jsonb),

('revisao_aprovada',
 'Peça aprovada para protocolo',
 'Avisa o responsável quando a peça é aprovada na revisão.',
 '[Aprovado] {{titulo}}',
 '<h2>Peça aprovada — pode protocolar</h2>
<p>Sua peça foi aprovada pela Dra. Juliana:</p>
<div class="highlight"><strong>{{titulo}}</strong></div>
{{bloco_comentario}}
<a href="{{link}}" class="btn">Ver no LegisFlow</a>',
 '["titulo","bloco_comentario","link"]'::jsonb),

('revisao_reprovada',
 'Peça devolvida para correção',
 'Avisa o responsável quando a peça é devolvida com comentários.',
 '[Correção] {{titulo}}',
 '<h2>Peça devolvida para correção</h2>
<p>A Dra. Juliana devolveu sua peça para correção:</p>
<div class="highlight">
  <strong>{{titulo}}</strong><br><br>
  <strong>O que corrigir:</strong><br>
  {{comentario}}
</div>
<a href="{{link}}" class="btn">Corrigir agora</a>',
 '["titulo","comentario","link"]'::jsonb),

('aviso_urgente',
 'Aviso urgente do mural',
 'Disparado para destinatárias quando um aviso urgente é publicado no mural.',
 '[URGENTE] {{titulo}}',
 '<h2>Aviso urgente: {{titulo}}</h2>
<p>A Dra. Juliana publicou um aviso urgente:</p>
<div class="highlight">
  <strong>{{titulo}}</strong><br><br>
  {{conteudo}}
</div>
<a href="{{link}}" class="btn">Ver no LegisFlow</a>',
 '["titulo","conteudo","link"]'::jsonb),

('prazo_24h',
 'Prazo vence em 24h',
 'Alerta diário para itens que vencem no dia seguinte.',
 '[URGENTE] Prazo amanhã: {{titulo}}{{vinculo_sufixo}}',
 '<h2>Prazo vence amanhã</h2>
<p>O seguinte item vence <strong>amanhã</strong>:</p>
<div class="highlight">
  <strong>{{titulo}}</strong><br>
  {{linha_vinculo}}
  Prazo: {{prazo}}
</div>
<a href="{{link}}" class="btn">Ver no LegisFlow</a>',
 '["titulo","vinculo_sufixo","linha_vinculo","prazo","link"]'::jsonb),

('prazo_atrasado',
 'Item atrasado',
 'Alerta diário para itens em atraso.',
 '[Atrasado] {{titulo}}{{vinculo_sufixo}} — {{dias_atraso}} dias',
 '<h2>Item atrasado</h2>
<p>O seguinte item está <strong>{{dias_atraso}} dia(s) atrasado</strong>:</p>
<div class="highlight" style="border-color:#F09595;background:#FCEBEB;color:#7a1f1f;">
  <strong>{{titulo}}</strong><br>
  {{linha_vinculo}}
  Venceu em: {{prazo}}
</div>
<a href="{{link}}" class="btn">Resolver agora</a>',
 '["titulo","vinculo_sufixo","linha_vinculo","prazo","dias_atraso","link"]'::jsonb),

('ponto_incompleto',
 'Registro de ponto incompleto',
 'Alerta diário para membros sem entrada/saída registradas no dia anterior.',
 '[Ponto] Registro incompleto — {{data_curta}}',
 '<h2>Registro de ponto incompleto</h2>
<p>Olá! Seu registro de ponto de <strong>{{data_extensa}}</strong> está incompleto.</p>
<div class="highlight">
  {{detalhe_ponto}}
</div>
<p>Acesse o sistema para corrigir ou fale com a Dra. Juliana.</p>
<a href="{{link}}" class="btn">Ver meu ponto</a>',
 '["data_curta","data_extensa","detalhe_ponto","link"]'::jsonb);
