
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('gestor','advogado','controladoria','administrativo','estagiario');
CREATE TYPE public.modulo AS ENUM ('clientes','processos','controladoria','financeiro','documentos','relatorios','usuarios','parceiros');
CREATE TYPE public.acao_permissao AS ENUM ('visualizar','criar','editar','excluir','exportar');
CREATE TYPE public.tipo_processo AS ENUM ('judicial','administrativo');
CREATE TYPE public.tipo_item_controladoria AS ENUM ('prazo_fatal','prazo_processual','audiencia','reuniao','diligencia','tarefa');
CREATE TYPE public.prioridade AS ENUM ('baixa','media','alta','urgente');
CREATE TYPE public.status_item AS ENUM ('pendente','em_andamento','aguardando','concluido','cancelado');
CREATE TYPE public.tipo_honorario AS ENUM ('fixo','exito','misto','mensalidade');
CREATE TYPE public.papel_responsavel AS ENUM ('principal','apoio');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  oab TEXT,
  avatar_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  primeiro_acesso BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ PERMISSIONS ============
CREATE TABLE public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  modulo public.modulo NOT NULL,
  acao public.acao_permissao NOT NULL,
  permitido BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, modulo, acao)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_gestor(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'gestor') $$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _modulo public.modulo, _acao public.acao_permissao)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_gestor(_user_id) OR
    EXISTS (SELECT 1 FROM public.user_permissions WHERE user_id = _user_id AND modulo = _modulo AND acao = _acao AND permitido = true)
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_active()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND ativo = true) $$;

-- ============ TRIGGER: novo usuário ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
  v_is_gestor BOOLEAN;
BEGIN
  v_nome := COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_is_gestor := (NEW.email = 'ju.contatoaraujo@gmail.com');

  INSERT INTO public.profiles (id, nome, email, ativo, primeiro_acesso)
  VALUES (NEW.id, v_nome, NEW.email, v_is_gestor, NOT v_is_gestor);

  IF v_is_gestor THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'gestor');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TRIGGER: updated_em ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em = now(); RETURN NEW; END;
$$;

-- ============ POLICIES: profiles ============
CREATE POLICY "todos veem perfis ativos" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "usuario edita proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "gestor edita qualquer perfil" ON public.profiles FOR UPDATE TO authenticated USING (public.is_gestor(auth.uid()));
CREATE POLICY "gestor cria perfis" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_gestor(auth.uid()));
CREATE POLICY "gestor remove perfis" ON public.profiles FOR DELETE TO authenticated USING (public.is_gestor(auth.uid()));

CREATE TRIGGER set_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ POLICIES: user_roles ============
CREATE POLICY "usuarios veem roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestor gerencia roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ POLICIES: user_permissions ============
CREATE POLICY "usuario ve proprias permissoes" ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_gestor(auth.uid()));
CREATE POLICY "gestor gerencia permissoes" ON public.user_permissions FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf_cnpj TEXT,
  tipo_pessoa TEXT NOT NULL DEFAULT 'fisica' CHECK (tipo_pessoa IN ('fisica','juridica')),
  nascimento DATE,
  telefones TEXT[] DEFAULT '{}',
  email TEXT,
  cep TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  origem TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clientes_nome ON public.clientes(nome);
CREATE INDEX idx_clientes_cpf ON public.clientes(cpf_cnpj);
CREATE INDEX idx_clientes_ativo ON public.clientes(ativo);

CREATE POLICY "ver clientes" ON public.clientes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes', 'visualizar'));
CREATE POLICY "criar clientes" ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'clientes', 'criar'));
CREATE POLICY "editar clientes" ON public.clientes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes', 'editar'));
CREATE POLICY "excluir clientes" ON public.clientes FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes', 'excluir'));

CREATE TRIGGER set_clientes_updated BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PARCEIROS ============
CREATE TABLE public.parceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT,
  oab TEXT,
  telefone TEXT,
  percentual_padrao NUMERIC(5,2),
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver parceiros" ON public.parceiros FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'parceiros', 'visualizar'));
CREATE POLICY "gestor gerencia parceiros" ON public.parceiros FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));
CREATE TRIGGER set_parceiros_updated BEFORE UPDATE ON public.parceiros FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PROCESSOS ============
CREATE TABLE public.processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_cnj TEXT,
  nb_inss TEXT,
  tipo public.tipo_processo NOT NULL DEFAULT 'judicial',
  area_direito TEXT,
  tipo_acao TEXT,
  tribunal TEXT,
  vara TEXT,
  juiz TEXT,
  comarca TEXT,
  valor_causa NUMERIC(15,2),
  status TEXT NOT NULL DEFAULT 'em_andamento',
  fase_atual TEXT,
  data_distribuicao DATE,
  data_der DATE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  observacoes_internas TEXT,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_processos_cliente ON public.processos(cliente_id);
CREATE INDEX idx_processos_responsavel ON public.processos(responsavel_id);
CREATE INDEX idx_processos_status ON public.processos(status);
CREATE INDEX idx_processos_cnj ON public.processos(numero_cnj);

CREATE POLICY "ver processos" ON public.processos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'processos', 'visualizar'));
CREATE POLICY "criar processos" ON public.processos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'processos', 'criar'));
CREATE POLICY "editar processos" ON public.processos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'processos', 'editar'));
CREATE POLICY "excluir processos" ON public.processos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'processos', 'excluir'));

CREATE TRIGGER set_processos_updated BEFORE UPDATE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ANDAMENTOS ============
CREATE TABLE public.andamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID NOT NULL REFERENCES public.processos(id) ON DELETE CASCADE,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'manual' CHECK (fonte IN ('manual','cnj')),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.andamentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_andamentos_processo ON public.andamentos(processo_id, data DESC);
CREATE POLICY "ver andamentos" ON public.andamentos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'processos', 'visualizar'));
CREATE POLICY "criar andamentos" ON public.andamentos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'processos', 'criar'));
CREATE POLICY "editar andamentos" ON public.andamentos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'processos', 'editar'));
CREATE POLICY "excluir andamentos" ON public.andamentos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'processos', 'excluir'));

-- ============ FERIADOS ============
CREATE TABLE public.feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nacional' CHECK (tipo IN ('nacional','estadual','municipal','escritorio')),
  uf TEXT,
  cidade TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(data, descricao)
);
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos veem feriados" ON public.feriados FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestor gerencia feriados" ON public.feriados FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- Função de cálculo de dias úteis
CREATE OR REPLACE FUNCTION public.adicionar_dias_uteis(_data_inicio DATE, _dias INTEGER)
RETURNS DATE LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_data DATE := _data_inicio;
  v_count INTEGER := 0;
BEGIN
  WHILE v_count < _dias LOOP
    v_data := v_data + 1;
    IF EXTRACT(DOW FROM v_data) NOT IN (0,6)
       AND NOT EXISTS (SELECT 1 FROM public.feriados WHERE data = v_data) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_data;
END;
$$;

-- ============ TIPOS DE PRAZO ============
CREATE TABLE public.tipos_prazo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  dias INTEGER NOT NULL,
  dias_uteis BOOLEAN NOT NULL DEFAULT true,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.tipos_prazo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos veem tipos prazo" ON public.tipos_prazo FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestor gerencia tipos prazo" ON public.tipos_prazo FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ CONTROLADORIA ITENS ============
CREATE TABLE public.controladoria_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.tipo_item_controladoria NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  processo_id UUID REFERENCES public.processos(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  data_inicio TIMESTAMPTZ,
  data_vencimento TIMESTAMPTZ NOT NULL,
  data_intimacao DATE,
  tipo_prazo_id UUID REFERENCES public.tipos_prazo(id),
  prioridade public.prioridade NOT NULL DEFAULT 'media',
  status public.status_item NOT NULL DEFAULT 'pendente',
  -- audiência
  vara TEXT,
  juiz TEXT,
  local TEXT,
  link_virtual TEXT,
  resultado TEXT,
  -- kanban
  coluna_kanban TEXT NOT NULL DEFAULT 'backlog',
  -- audit
  concluido_em TIMESTAMPTZ,
  concluido_por UUID REFERENCES auth.users(id),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.controladoria_itens ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ctr_itens_vencimento ON public.controladoria_itens(data_vencimento);
CREATE INDEX idx_ctr_itens_processo ON public.controladoria_itens(processo_id);
CREATE INDEX idx_ctr_itens_status ON public.controladoria_itens(status);

CREATE POLICY "ver itens controladoria" ON public.controladoria_itens FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "criar itens controladoria" ON public.controladoria_itens FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'criar'));
CREATE POLICY "editar itens controladoria" ON public.controladoria_itens FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'editar'));
CREATE POLICY "excluir itens controladoria" ON public.controladoria_itens FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'excluir'));

CREATE TRIGGER set_ctr_itens_updated BEFORE UPDATE ON public.controladoria_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RESPONSÁVEIS ============
CREATE TABLE public.controladoria_responsaveis (
  item_id UUID NOT NULL REFERENCES public.controladoria_itens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel public.papel_responsavel NOT NULL DEFAULT 'apoio',
  PRIMARY KEY (item_id, user_id)
);
ALTER TABLE public.controladoria_responsaveis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver responsaveis" ON public.controladoria_responsaveis FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "gerenciar responsaveis" ON public.controladoria_responsaveis FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'editar'))
  WITH CHECK (public.has_permission(auth.uid(), 'controladoria', 'editar'));

-- ============ COMENTÁRIOS / CHAT ============
CREATE TABLE public.controladoria_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.controladoria_itens(id) ON DELETE CASCADE,
  processo_id UUID REFERENCES public.processos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  arquivos JSONB DEFAULT '[]',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (item_id IS NOT NULL OR processo_id IS NOT NULL)
);
ALTER TABLE public.controladoria_comentarios ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_ctr_com_processo ON public.controladoria_comentarios(processo_id, criado_em DESC);
CREATE INDEX idx_ctr_com_item ON public.controladoria_comentarios(item_id, criado_em DESC);

CREATE POLICY "ver comentarios" ON public.controladoria_comentarios FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'controladoria', 'visualizar'));
CREATE POLICY "criar comentarios" ON public.controladoria_comentarios FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_permission(auth.uid(), 'controladoria', 'criar'));
CREATE POLICY "editar proprio comentario" ON public.controladoria_comentarios FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "excluir proprio comentario" ON public.controladoria_comentarios FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_gestor(auth.uid()));

-- ============ FLUXOS ============
CREATE TABLE public.fluxos_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  area TEXT,
  descricao TEXT,
  etapas JSONB NOT NULL DEFAULT '[]',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fluxos_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos veem fluxos" ON public.fluxos_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestor gerencia fluxos" ON public.fluxos_templates FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ HONORÁRIOS ============
CREATE TABLE public.honorarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  tipo public.tipo_honorario NOT NULL,
  valor_fixo NUMERIC(15,2),
  percentual_exito NUMERIC(5,2),
  valor_mensalidade NUMERIC(15,2),
  parcelas INTEGER DEFAULT 1,
  parceiro_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  percentual_parceiro NUMERIC(5,2),
  percentual_indicacao NUMERIC(5,2),
  cliente_indicador_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'em_dia' CHECK (status IN ('em_dia','inadimplente','encerrado')),
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.honorarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver honorarios" ON public.honorarios FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));
CREATE POLICY "criar honorarios" ON public.honorarios FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro', 'criar'));
CREATE POLICY "editar honorarios" ON public.honorarios FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro', 'editar'));
CREATE POLICY "excluir honorarios" ON public.honorarios FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro', 'excluir'));
CREATE TRIGGER set_honorarios_updated BEFORE UPDATE ON public.honorarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PAGAMENTOS ============
CREATE TABLE public.pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  honorario_id UUID NOT NULL REFERENCES public.honorarios(id) ON DELETE CASCADE,
  data_vencimento DATE,
  data_pagamento DATE,
  valor NUMERIC(15,2) NOT NULL,
  forma_pagamento TEXT,
  comprovante_url TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','atrasado','cancelado')),
  observacoes TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pagamentos_honorario ON public.pagamentos(honorario_id);
CREATE INDEX idx_pagamentos_status ON public.pagamentos(status);
CREATE POLICY "ver pagamentos" ON public.pagamentos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));
CREATE POLICY "criar pagamentos" ON public.pagamentos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'financeiro', 'criar'));
CREATE POLICY "editar pagamentos" ON public.pagamentos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro', 'editar'));
CREATE POLICY "excluir pagamentos" ON public.pagamentos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'financeiro', 'excluir'));

-- ============ DOCUMENTOS ============
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria TEXT,
  url TEXT NOT NULL,
  tamanho_bytes BIGINT,
  mime_type TEXT,
  versao INTEGER NOT NULL DEFAULT 1,
  documento_pai_id UUID REFERENCES public.documentos(id) ON DELETE SET NULL,
  processo_id UUID REFERENCES public.processos(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  upload_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_documentos_processo ON public.documentos(processo_id);
CREATE INDEX idx_documentos_cliente ON public.documentos(cliente_id);
CREATE POLICY "ver documentos" ON public.documentos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos', 'visualizar'));
CREATE POLICY "criar documentos" ON public.documentos FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'documentos', 'criar'));
CREATE POLICY "editar documentos" ON public.documentos FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos', 'editar'));
CREATE POLICY "excluir documentos" ON public.documentos FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'documentos', 'excluir'));

-- ============ LOGS ============
CREATE TABLE public.logs_atividade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  tabela TEXT,
  registro_id UUID,
  detalhes JSONB,
  ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.logs_atividade ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_logs_user ON public.logs_atividade(user_id, criado_em DESC);
CREATE POLICY "gestor ve logs" ON public.logs_atividade FOR SELECT TO authenticated
  USING (public.is_gestor(auth.uid()));
CREATE POLICY "qualquer um insere log" ON public.logs_atividade FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============ HISTÓRICO DE RELACIONAMENTO ============
CREATE TABLE public.cliente_interacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('atendimento','ligacao','email','reuniao','outro')),
  descricao TEXT NOT NULL,
  data TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cliente_interacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver interacoes" ON public.cliente_interacoes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes', 'visualizar'));
CREATE POLICY "criar interacoes" ON public.cliente_interacoes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'clientes', 'criar'));
CREATE POLICY "excluir interacoes" ON public.cliente_interacoes FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'clientes', 'excluir'));

-- ============ STATUS PROCESSO CUSTOMIZÁVEIS ============
CREATE TABLE public.status_processo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT '#BC943F',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.status_processo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos veem status" ON public.status_processo FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestor gerencia status" ON public.status_processo FOR ALL TO authenticated
  USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

-- ============ SEED: Feriados nacionais 2025-2026 ============
INSERT INTO public.feriados (data, descricao, tipo) VALUES
('2025-01-01','Confraternização Universal','nacional'),
('2025-03-03','Carnaval','nacional'),
('2025-03-04','Carnaval','nacional'),
('2025-04-18','Sexta-feira Santa','nacional'),
('2025-04-21','Tiradentes','nacional'),
('2025-05-01','Dia do Trabalho','nacional'),
('2025-06-19','Corpus Christi','nacional'),
('2025-09-07','Independência','nacional'),
('2025-10-12','Nossa Senhora Aparecida','nacional'),
('2025-11-02','Finados','nacional'),
('2025-11-15','Proclamação da República','nacional'),
('2025-11-20','Dia da Consciência Negra','nacional'),
('2025-12-25','Natal','nacional'),
('2026-01-01','Confraternização Universal','nacional'),
('2026-02-16','Carnaval','nacional'),
('2026-02-17','Carnaval','nacional'),
('2026-04-03','Sexta-feira Santa','nacional'),
('2026-04-21','Tiradentes','nacional'),
('2026-05-01','Dia do Trabalho','nacional'),
('2026-06-04','Corpus Christi','nacional'),
('2026-09-07','Independência','nacional'),
('2026-10-12','Nossa Senhora Aparecida','nacional'),
('2026-11-02','Finados','nacional'),
('2026-11-15','Proclamação da República','nacional'),
('2026-11-20','Dia da Consciência Negra','nacional'),
('2026-12-25','Natal','nacional');

-- ============ SEED: Tipos de prazo padrão ============
INSERT INTO public.tipos_prazo (nome, dias, dias_uteis, descricao) VALUES
('Contestação', 15, true, 'Prazo para apresentar contestação'),
('Recurso de Apelação', 15, true, 'Prazo para apelar de sentença'),
('Embargos de Declaração', 5, true, 'Embargos de declaração'),
('Recurso Especial', 15, true, 'Recurso ao STJ'),
('Recurso Extraordinário', 15, true, 'Recurso ao STF'),
('Agravo de Instrumento', 15, true, 'Agravo contra decisão interlocutória'),
('Réplica', 15, true, 'Réplica à contestação'),
('Razões Finais', 15, true, 'Memoriais / razões finais'),
('Manifestação sobre laudo', 15, true, 'Manifestação sobre laudo pericial'),
('Recurso JEF', 10, true, 'Recurso em Juizado Especial Federal');

-- ============ SEED: Status de processo ============
INSERT INTO public.status_processo (nome, cor, ordem) VALUES
('Em andamento', '#3B82F6', 1),
('Aguardando perícia', '#F59E0B', 2),
('Em fase recursal', '#8B5CF6', 3),
('Aguardando sentença', '#06B6D4', 4),
('Sentenciado', '#10B981', 5),
('Transitado em julgado', '#22C55E', 6),
('Suspenso', '#6B7280', 7),
('Arquivado', '#374151', 8),
('Concedido (INSS)', '#10B981', 9),
('Indeferido (INSS)', '#EF4444', 10);
