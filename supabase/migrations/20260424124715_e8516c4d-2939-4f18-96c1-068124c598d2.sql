
-- =====================================================
-- TABELA CENTRAL DE CONFIGURAÇÕES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.configuracoes_sistema (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secao text NOT NULL,
  chave text NOT NULL,
  valor text,
  valor_json jsonb,
  descricao text,
  tipo text NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto','numero','booleano','json','cor','arquivo')),
  editavel_por text NOT NULL DEFAULT 'gestor' CHECK (editavel_por IN ('gestor','sistema')),
  publica boolean NOT NULL DEFAULT false,
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(secao, chave)
);

CREATE INDEX IF NOT EXISTS idx_config_secao ON public.configuracoes_sistema(secao);
CREATE INDEX IF NOT EXISTS idx_config_publica ON public.configuracoes_sistema(publica) WHERE publica = true;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_config_updated_at ON public.configuracoes_sistema;
CREATE TRIGGER trg_config_updated_at
  BEFORE UPDATE ON public.configuracoes_sistema
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.configuracoes_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores leem todas configurações"
  ON public.configuracoes_sistema FOR SELECT
  TO authenticated
  USING (public.is_gestor(auth.uid()));

CREATE POLICY "Autenticados leem configurações públicas"
  ON public.configuracoes_sistema FOR SELECT
  TO authenticated
  USING (publica = true);

CREATE POLICY "Gestores inserem configurações"
  ON public.configuracoes_sistema FOR INSERT
  TO authenticated
  WITH CHECK (public.is_gestor(auth.uid()));

CREATE POLICY "Gestores atualizam configurações"
  ON public.configuracoes_sistema FOR UPDATE
  TO authenticated
  USING (public.is_gestor(auth.uid()) AND editavel_por = 'gestor')
  WITH CHECK (public.is_gestor(auth.uid()) AND editavel_por = 'gestor');

CREATE POLICY "Gestores excluem configurações"
  ON public.configuracoes_sistema FOR DELETE
  TO authenticated
  USING (public.is_gestor(auth.uid()));

-- =====================================================
-- SEED — SEÇÃO ESCRITÓRIO
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao, publica) VALUES
  ('escritorio', 'nome', 'JAS Advocacia', 'texto', 'Nome do escritório', true),
  ('escritorio', 'nome_advogado_principal', 'Juliana Araújo da Silva', 'texto', 'Nome completo do advogado principal', true),
  ('escritorio', 'cpf_cnpj', '', 'texto', 'CPF ou CNPJ do escritório', false),
  ('escritorio', 'oab', 'OAB/MT 34.182', 'texto', 'Número da OAB', true),
  ('escritorio', 'email', 'advocaciajulianaaraujo@gmail.com', 'texto', 'E-mail principal', true),
  ('escritorio', 'whatsapp_principal', '6699262-4753', 'texto', 'WhatsApp principal', true),
  ('escritorio', 'whatsapp_secundario', '6699650-9464', 'texto', 'WhatsApp secundário', true),
  ('escritorio', 'instagram', '@julianaaraujoadvogada', 'texto', 'Instagram principal', true),
  ('escritorio', 'instagram_escritorio', '@advocaciajulianaaraujo', 'texto', 'Instagram do escritório', true),
  ('escritorio', 'endereco', 'Rua São Cristóvão, 315, Poncho Verde II', 'texto', 'Logradouro e número', true),
  ('escritorio', 'cidade', 'Primavera do Leste', 'texto', 'Cidade', true),
  ('escritorio', 'estado', 'MT', 'texto', 'Estado (UF)', true),
  ('escritorio', 'cep', '', 'texto', 'CEP', true),
  ('escritorio', 'site', 'julianaaraujoadvogada.com.br', 'texto', 'Site', true),
  ('escritorio', 'logo_url', '', 'arquivo', 'URL do logotipo (PNG ou SVG)', true),
  ('escritorio', 'favicon_url', '', 'arquivo', 'Favicon do sistema', true),
  ('escritorio', 'cor_primaria', '#010423', 'cor', 'Cor primária da marca', true),
  ('escritorio', 'cor_secundaria', '#BC943F', 'cor', 'Cor secundária da marca', true),
  ('escritorio', 'assinatura_documento',
    E'{{cidade_escritorio}}, {{data_extenso}}.\n\n{{nome_advogado}}\n{{oab}}\n{{instagram}}\n{{email_escritorio}}',
    'texto', 'Texto de encerramento padrão das petições', false)
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- SEED — SEÇÃO PORTAIS
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao) VALUES
  ('portais', 'parceiro_mensagem_boas_vindas',
    'Bem-vindo ao portal da JAS Advocacia! Aqui você acompanha os processos em que atua, suas tarefas e repasses.',
    'texto', 'Mensagem exibida no primeiro acesso do parceiro'),
  ('portais', 'parceiro_mostrar_financeiro', 'true', 'booleano', 'Exibir aba financeira no portal do parceiro'),
  ('portais', 'parceiro_mostrar_chat', 'true', 'booleano', 'Habilitar chat por processo no portal do parceiro'),
  ('portais', 'cliente_mensagem_boas_vindas',
    'Olá! Aqui você acompanha seu processo de forma simples e clara. Qualquer dúvida, fale conosco!',
    'texto', 'Mensagem exibida no primeiro acesso do cliente'),
  ('portais', 'cliente_mostrar_financeiro', 'false', 'booleano', 'Exibir aba financeira por padrão'),
  ('portais', 'cliente_termos_uso', '', 'texto', 'Termos de uso exibidos no primeiro acesso')
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- SEED — SEÇÃO PROCESSOS
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor_json, tipo, descricao) VALUES
  ('processos', 'areas_direito',
    '["previdenciario","familia","civil","trabalhista","tributario","consumidor","criminal","administrativo","outro"]'::jsonb,
    'json', 'Áreas do direito ativas'),
  ('processos', 'tipos_acao',
    '{
      "previdenciario": ["BPC/LOAS","Auxílio por Incapacidade","Aposentadoria por Incapacidade","Aposentadoria por Tempo de Contribuição","Salário-Maternidade","Pensão por Morte","Revisão de Benefício","Auxílio-Acidente","Restabelecimento de Benefício"],
      "familia": ["Divórcio Consensual","Divórcio Litigioso","Guarda e Alimentos","Investigação de Paternidade","Interdição/Curatela","Inventário","União Estável"],
      "civil": ["Ação de Indenização","Cobrança","Revisão Contratual","Usucapião"],
      "trabalhista": ["Reclamação Trabalhista","Rescisão Indireta","Horas Extras"]
    }'::jsonb,
    'json', 'Tipos de ação por área do direito'),
  ('processos', 'status_customizados',
    '[
      {"id":"em_andamento","nome":"Em andamento","cor":"#3B82F6","tipo":"ambos","ativo":true,"ordem":1},
      {"id":"aguardando","nome":"Aguardando","cor":"#F59E0B","tipo":"ambos","ativo":true,"ordem":2},
      {"id":"suspenso","nome":"Suspenso","cor":"#6B7280","tipo":"ambos","ativo":true,"ordem":3},
      {"id":"arquivado","nome":"Arquivado","cor":"#1F2937","tipo":"ambos","ativo":true,"ordem":4},
      {"id":"encerrado_exito","nome":"Encerrado com êxito","cor":"#10B981","tipo":"ambos","ativo":true,"ordem":5},
      {"id":"encerrado_sem_exito","nome":"Encerrado sem êxito","cor":"#EF4444","tipo":"ambos","ativo":true,"ordem":6}
    ]'::jsonb,
    'json', 'Status customizados de processo')
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- SEED — SEÇÃO CONTROLADORIA
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor_json, tipo, descricao) VALUES
  ('controladoria', 'feriados_nacionais_fixos',
    '[
      {"mes":1,"dia":1,"nome":"Confraternização Universal"},
      {"mes":4,"dia":21,"nome":"Tiradentes"},
      {"mes":5,"dia":1,"nome":"Dia do Trabalho"},
      {"mes":9,"dia":7,"nome":"Independência do Brasil"},
      {"mes":10,"dia":12,"nome":"Nossa Senhora Aparecida"},
      {"mes":11,"dia":2,"nome":"Finados"},
      {"mes":11,"dia":15,"nome":"Proclamação da República"},
      {"mes":12,"dia":25,"nome":"Natal"}
    ]'::jsonb,
    'json', 'Feriados nacionais fixos (não editáveis)'),
  ('controladoria', 'alertas_prazo',
    '{
      "d7":{"ativo":true,"dias":7,"destinatario":"responsavel","cor":"verde"},
      "d3":{"ativo":true,"dias":3,"destinatario":"responsavel_apoio","cor":"amarelo"},
      "d1":{"ativo":true,"dias":1,"destinatario":"responsavel_gestor","cor":"vermelho"},
      "vencido":{"ativo":true,"dias":0,"destinatario":"todos","cor":"critico"}
    }'::jsonb,
    'json', 'Configuração de alertas de prazo'),
  ('controladoria', 'horario_trabalho',
    '{
      "dias_uteis":["seg","ter","qua","qui","sex"],
      "hora_inicio":"08:00",
      "hora_fim":"18:00",
      "fuso_horario":"America/Cuiaba"
    }'::jsonb,
    'json', 'Dias e horários de funcionamento')
ON CONFLICT (secao, chave) DO NOTHING;

-- Trava feriados nacionais como não-editável pela interface
UPDATE public.configuracoes_sistema
SET editavel_por = 'sistema'
WHERE secao = 'controladoria' AND chave = 'feriados_nacionais_fixos';

-- =====================================================
-- SEED — SEÇÃO FINANCEIRO
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao) VALUES
  ('financeiro', 'salario_minimo', '1518.00', 'numero', 'Salário mínimo vigente'),
  ('financeiro', 'teto_inss', '7786.02', 'numero', 'Teto do INSS vigente'),
  ('financeiro', 'ufmt', '1412.63', 'numero', 'UFMT — Unidade Fiscal de Mato Grosso'),
  ('financeiro', 'data_ultima_atualizacao_indices', '2025-01-01', 'texto', 'Data da última atualização dos índices'),
  ('financeiro', 'indice_correcao_padrao', 'IPCA-E', 'texto', 'Índice padrão para correção monetária'),
  ('financeiro', 'forma_pagamento_padrao', 'pix', 'texto', 'Forma de pagamento pré-selecionada'),
  ('financeiro', 'incluir_exito_na_projecao', 'false', 'booleano', 'Incluir êxito na projeção financeira'),
  ('financeiro', 'horizonte_projecao_meses', '3', 'numero', 'Período padrão da projeção em meses'),
  ('financeiro', 'dia_geracao_mensalidades', '1', 'numero', 'Dia do mês para gerar parcelas'),
  ('financeiro', 'prazo_validade_proposta_honorarios', '15', 'numero', 'Validade em dias das propostas'),
  ('financeiro', 'banco_nome', '', 'texto', 'Nome do banco do escritório'),
  ('financeiro', 'banco_agencia', '', 'texto', 'Agência'),
  ('financeiro', 'banco_conta', '', 'texto', 'Conta'),
  ('financeiro', 'banco_tipo_conta', 'corrente', 'texto', 'Tipo de conta (corrente/poupança)'),
  ('financeiro', 'pix_chave', '', 'texto', 'Chave PIX'),
  ('financeiro', 'pix_tipo', 'email', 'texto', 'Tipo da chave PIX')
ON CONFLICT (secao, chave) DO NOTHING;

INSERT INTO public.configuracoes_sistema (secao, chave, valor_json, tipo, descricao) VALUES
  ('financeiro', 'alertas_inadimplencia',
    '{
      "d1":{"ativo":true,"dias":1,"acao":"notificacao_interna"},
      "d5":{"ativo":true,"dias":5,"acao":"notificacao_gestor"},
      "d15":{"ativo":true,"dias":15,"acao":"badge_cliente"},
      "d30":{"ativo":true,"dias":30,"acao":"criar_tarefa_cobranca"}
    }'::jsonb,
    'json', 'Configuração de alertas de inadimplência')
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- SEED — SEÇÃO DOCUMENTOS
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao, publica) VALUES
  ('documentos', 'fonte_padrao', 'Bookman Old Style', 'texto', 'Fonte padrão dos documentos', true),
  ('documentos', 'tamanho_fonte', '12', 'numero', 'Tamanho em pt', true),
  ('documentos', 'margem_superior', '1440', 'numero', 'Margem superior em twips', true),
  ('documentos', 'margem_inferior', '1440', 'numero', 'Margem inferior em twips', true),
  ('documentos', 'margem_esquerda', '1800', 'numero', 'Margem esquerda em twips', true),
  ('documentos', 'margem_direita', '1080', 'numero', 'Margem direita em twips', true),
  ('documentos', 'espacamento_linhas', '1.5', 'numero', 'Espaçamento entre linhas', true),
  ('documentos', 'recuo_paragrafo', '720', 'numero', 'Recuo de parágrafo em twips', true)
ON CONFLICT (secao, chave) DO NOTHING;

INSERT INTO public.configuracoes_sistema (secao, chave, valor_json, tipo, descricao) VALUES
  ('documentos', 'categorias',
    '[
      {"id":"peticao_inicial","nome":"Petição Inicial","ordem":1,"ativo":true},
      {"id":"contestacao","nome":"Contestação","ordem":2,"ativo":true},
      {"id":"recurso","nome":"Recurso","ordem":3,"ativo":true},
      {"id":"manifestacao","nome":"Manifestação","ordem":4,"ativo":true},
      {"id":"procuracao","nome":"Procuração","ordem":5,"ativo":true},
      {"id":"contrato","nome":"Contrato","ordem":6,"ativo":true},
      {"id":"parecer","nome":"Parecer","ordem":7,"ativo":true},
      {"id":"outros","nome":"Outros","ordem":99,"ativo":true}
    ]'::jsonb,
    'json', 'Categorias de documentos')
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- SEED — SEÇÃO INTEGRAÇÕES
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao) VALUES
  ('integracoes', 'backup_automatico_ativo', 'true', 'booleano', 'Realizar backup automático'),
  ('integracoes', 'backup_frequencia', 'semanal', 'texto', 'diario | semanal | mensal'),
  ('integracoes', 'backup_dia_semana', 'domingo', 'texto', 'Para frequência semanal'),
  ('integracoes', 'backup_horario', '03:00', 'texto', 'Horário do backup'),
  ('integracoes', 'backup_retencao_dias', '30', 'numero', 'Dias de retenção dos backups'),
  ('integracoes', 'smtp_host', '', 'texto', 'Servidor SMTP'),
  ('integracoes', 'smtp_porta', '587', 'numero', 'Porta SMTP'),
  ('integracoes', 'smtp_usuario', '', 'texto', 'Usuário/e-mail SMTP'),
  ('integracoes', 'smtp_senha', '', 'texto', 'Senha SMTP (sensível)'),
  ('integracoes', 'smtp_nome_remetente', 'JAS Advocacia', 'texto', 'Nome exibido no remetente'),
  ('integracoes', 'smtp_email_remetente', 'advocaciajulianaaraujo@gmail.com', 'texto', 'E-mail remetente'),
  ('integracoes', 'datajud_horario_job', '06:00', 'texto', 'Horário do job DataJud'),
  ('integracoes', 'datajud_delay_ms', '500', 'numero', 'Delay entre requisições DataJud'),
  ('integracoes', 'gcal_horizonte_dias', '90', 'numero', 'Horizonte de sincronização Google Calendar')
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- SEED — SEÇÃO SISTEMA
-- =====================================================
INSERT INTO public.configuracoes_sistema (secao, chave, valor, tipo, descricao, publica) VALUES
  ('sistema', 'fuso_horario', 'America/Cuiaba', 'texto', 'Fuso horário padrão', true),
  ('sistema', 'idioma', 'pt-BR', 'texto', 'Idioma do sistema', true),
  ('sistema', 'formato_data', 'DD/MM/YYYY', 'texto', 'Formato de data', true),
  ('sistema', 'formato_moeda', 'BRL', 'texto', 'Moeda', true),
  ('sistema', 'separador_decimal', ',', 'texto', 'Separador decimal', true),
  ('sistema', 'separador_milhar', '.', 'texto', 'Separador de milhar', true),
  ('sistema', 'versao', '1.0.0', 'texto', 'Versão do sistema', true)
ON CONFLICT (secao, chave) DO NOTHING;

UPDATE public.configuracoes_sistema
SET editavel_por = 'sistema'
WHERE secao = 'sistema' AND chave = 'versao';

INSERT INTO public.configuracoes_sistema (secao, chave, valor_json, tipo, descricao) VALUES
  ('sistema', 'notificacoes_internas',
    '{
      "prazo_vencido":{"ativo":true,"destinatario":"responsavel_gestor"},
      "prazo_fatal_amanha":{"ativo":true,"destinatario":"responsavel_gestor"},
      "novo_andamento_datajud":{"ativo":true,"destinatario":"responsavel"},
      "pagamento_recebido":{"ativo":true,"destinatario":"gestor"},
      "inadimplencia_d5":{"ativo":true,"destinatario":"gestor"},
      "novo_cliente_portal":{"ativo":true,"destinatario":"gestor"},
      "sessao_visualizar_como":{"ativo":true,"destinatario":"gestor_log"},
      "backup_concluido":{"ativo":true,"destinatario":"gestor"},
      "backup_com_erro":{"ativo":true,"destinatario":"gestor"}
    }'::jsonb,
    'json', 'Eventos que disparam notificações internas')
ON CONFLICT (secao, chave) DO NOTHING;

-- =====================================================
-- LOG DE ALTERAÇÕES (auditoria já é coberta por user_log_atividade,
-- mas adicionamos trigger específico aqui para garantir registro)
-- =====================================================
CREATE OR REPLACE FUNCTION public.trg_log_configuracao_alteracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.valor_json IS DISTINCT FROM NEW.valor_json) THEN
    INSERT INTO public.user_log_atividade (
      user_id, acao, modulo, registro_id, registro_titulo, dados_antes, dados_depois
    ) VALUES (
      COALESCE(NEW.atualizado_por, auth.uid()),
      'editou_configuracao',
      'configuracoes',
      NEW.id,
      NEW.secao || '.' || NEW.chave,
      jsonb_build_object('valor', OLD.valor, 'valor_json', OLD.valor_json),
      jsonb_build_object('valor', NEW.valor, 'valor_json', NEW.valor_json)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_config_log_alteracao ON public.configuracoes_sistema;
CREATE TRIGGER trg_config_log_alteracao
  AFTER UPDATE ON public.configuracoes_sistema
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_configuracao_alteracao();
