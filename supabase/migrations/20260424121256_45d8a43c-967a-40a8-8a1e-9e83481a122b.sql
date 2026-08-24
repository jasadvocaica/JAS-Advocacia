-- =========================================================
-- RLS do Portal do Parceiro
-- Permite ao parceiro autenticado ver apenas os dados dos
-- processos/clientes/documentos/repasses/mensagens nos quais
-- ele está vinculado (parceiros.id = parceiro_id_do_usuario).
-- =========================================================

-- ---------- processos ----------
DROP POLICY IF EXISTS "parceiro ve seus processos" ON public.processos;
CREATE POLICY "parceiro ve seus processos"
ON public.processos
FOR SELECT
TO authenticated
USING (parceiro_id IS NOT NULL AND parceiro_id = public.parceiro_id_do_usuario(auth.uid()));

-- ---------- controladoria_itens (tarefas/prazos) ----------
DROP POLICY IF EXISTS "parceiro ve itens de seus processos" ON public.controladoria_itens;
CREATE POLICY "parceiro ve itens de seus processos"
ON public.controladoria_itens
FOR SELECT
TO authenticated
USING (
  processo_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = controladoria_itens.processo_id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);

-- ---------- documentos ----------
DROP POLICY IF EXISTS "parceiro ve docs de seus processos" ON public.documentos;
CREATE POLICY "parceiro ve docs de seus processos"
ON public.documentos
FOR SELECT
TO authenticated
USING (
  processo_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = documentos.processo_id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);

-- ---------- honorarios_repasses ----------
DROP POLICY IF EXISTS "parceiro ve seus repasses" ON public.honorarios_repasses;
CREATE POLICY "parceiro ve seus repasses"
ON public.honorarios_repasses
FOR SELECT
TO authenticated
USING (parceiro_id IS NOT NULL AND parceiro_id = public.parceiro_id_do_usuario(auth.uid()));

-- ---------- honorarios_contratos (necessário para o join do financeiro) ----------
DROP POLICY IF EXISTS "parceiro ve seus contratos" ON public.honorarios_contratos;
CREATE POLICY "parceiro ve seus contratos"
ON public.honorarios_contratos
FOR SELECT
TO authenticated
USING (parceiro_id IS NOT NULL AND parceiro_id = public.parceiro_id_do_usuario(auth.uid()));

-- ---------- clientes (parceiro vê clientes vinculados aos seus processos) ----------
DROP POLICY IF EXISTS "parceiro ve clientes de seus processos" ON public.clientes;
CREATE POLICY "parceiro ve clientes de seus processos"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.cliente_id = clientes.id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);

-- ---------- andamentos (timeline da página de processo) ----------
DROP POLICY IF EXISTS "parceiro ve andamentos de seus processos" ON public.andamentos;
CREATE POLICY "parceiro ve andamentos de seus processos"
ON public.andamentos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = andamentos.processo_id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);

-- ---------- cliente_portal_mensagens (chat parceiro<->escritorio) ----------
-- Parceiro só vê/envia mensagens marcadas como remetente_tipo='parceiro' ou 'escritorio'
-- vinculadas a um processo onde ele é o parceiro responsável.
DROP POLICY IF EXISTS "parceiro ve mensagens de seus processos" ON public.cliente_portal_mensagens;
CREATE POLICY "parceiro ve mensagens de seus processos"
ON public.cliente_portal_mensagens
FOR SELECT
TO authenticated
USING (
  remetente_tipo IN ('parceiro','escritorio')
  AND processo_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = cliente_portal_mensagens.processo_id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);

DROP POLICY IF EXISTS "parceiro envia mensagem propria" ON public.cliente_portal_mensagens;
CREATE POLICY "parceiro envia mensagem propria"
ON public.cliente_portal_mensagens
FOR INSERT
TO authenticated
WITH CHECK (
  remetente_tipo = 'parceiro'
  AND remetente_id = auth.uid()
  AND processo_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.processos p
    WHERE p.id = cliente_portal_mensagens.processo_id
      AND p.parceiro_id = public.parceiro_id_do_usuario(auth.uid())
  )
);
