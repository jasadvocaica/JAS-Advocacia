-- Reutiliza as conversas existentes; não migra dados jurídicos ou financeiros.
CREATE SCHEMA IF NOT EXISTS assistente_privado;
REVOKE ALL ON SCHEMA assistente_privado FROM PUBLIC,anon;
GRANT USAGE ON SCHEMA assistente_privado TO authenticated,service_role;
CREATE FUNCTION assistente_privado.escopo() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT md5(coalesce((SELECT string_agg(role::text,',' ORDER BY role::text) FROM public.user_roles WHERE user_id=auth.uid()),'')||'|'||coalesce((SELECT string_agg(modulo::text||':'||acao::text||':'||permitido::text,',' ORDER BY modulo,acao) FROM public.user_permissions WHERE user_id=auth.uid()),'')||'|'||coalesce((SELECT string_agg(id::text,',' ORDER BY id) FROM public.processos WHERE public.usuario_ve_processo(auth.uid(),id)),'')||'|'||coalesce((SELECT string_agg(id::text,',' ORDER BY id) FROM public.clientes WHERE public.usuario_ve_cliente(auth.uid(),id)),'')||'|'||coalesce((SELECT string_agg(id::text,',' ORDER BY id) FROM public.controladoria_itens WHERE responsavel_id=auth.uid() OR executor_id=auth.uid() OR revisor_id=auth.uid()),'')||'|'||coalesce((SELECT ativo::text||':'||tipo_portal FROM public.profiles WHERE id=auth.uid()),'')) WHERE auth.uid() IS NOT NULL AND public.is_interno_ativo(auth.uid())
$$;
CREATE FUNCTION public.assistente_escopo() RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT assistente_privado.escopo() $$;
REVOKE ALL ON FUNCTION assistente_privado.escopo(),public.assistente_escopo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION assistente_privado.escopo(),public.assistente_escopo() TO authenticated;
ALTER TABLE public.assistente_conversas ADD COLUMN escopo_hash text;
ALTER TABLE public.assistente_conversas ADD COLUMN expira_em timestamptz;
-- Histórico anterior permanece preservado, mas exige revisão antes de reutilização como contexto.
DROP POLICY "Usuário vê suas conversas (ou gestor vê tudo)" ON public.assistente_conversas;
CREATE POLICY assistente_historico_privado ON public.assistente_conversas FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) AND escopo_hash=(SELECT public.assistente_escopo()) AND expira_em>now());
REVOKE INSERT,UPDATE ON public.assistente_conversas FROM authenticated;
CREATE TABLE public.assistente_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), habilitado boolean NOT NULL DEFAULT false,
 modelo text NOT NULL DEFAULT 'gpt-4.1-mini-2025-04-14' CHECK(modelo IN ('gpt-4.1-mini-2025-04-14')),
 retencao_dias integer NOT NULL DEFAULT 30 CHECK(retencao_dias BETWEEN 1 AND 365),
 limite_usuario_usd numeric NOT NULL DEFAULT 10 CHECK(limite_usuario_usd BETWEEN 0 AND 1000),
 limite_global_usd numeric NOT NULL DEFAULT 100 CHECK(limite_global_usd BETWEEN 0 AND 10000),
 limite_diario integer NOT NULL DEFAULT 30 CHECK(limite_diario BETWEEN 1 AND 200)
);
INSERT INTO public.assistente_config(id) VALUES(true);
ALTER TABLE public.assistente_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistente_config_ler ON public.assistente_config FOR SELECT TO authenticated USING(public.is_interno_ativo(auth.uid()));
CREATE POLICY assistente_config_gestor ON public.assistente_config FOR UPDATE TO authenticated USING(public.is_interno_ativo(auth.uid()) AND public.is_gestor(auth.uid())) WITH CHECK(public.is_interno_ativo(auth.uid()) AND public.is_gestor(auth.uid()));
GRANT SELECT,UPDATE ON public.assistente_config TO authenticated;
CREATE TABLE public.assistente_consumo (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 conversa_id uuid REFERENCES public.assistente_conversas(id) ON DELETE SET NULL,
 criado_em timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'reservado' CHECK(status IN ('reservado','concluido','falha','cancelado')),
 modelo text NOT NULL, tokens_entrada bigint NOT NULL DEFAULT 0, tokens_saida bigint NOT NULL DEFAULT 0,
 custo_estimado_usd numeric NOT NULL DEFAULT 0, reserva_usd numeric NOT NULL DEFAULT 0.20,
 ferramentas jsonb NOT NULL DEFAULT '[]', erro_codigo text
);
CREATE INDEX assistente_consumo_user_data ON public.assistente_consumo(user_id,criado_em DESC);
CREATE INDEX assistente_consumo_data ON public.assistente_consumo(criado_em);
ALTER TABLE public.assistente_consumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY assistente_consumo_ler ON public.assistente_consumo FOR SELECT TO authenticated USING(public.is_interno_ativo(auth.uid()) AND (user_id=auth.uid() OR public.is_gestor(auth.uid())));
GRANT SELECT ON public.assistente_consumo TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.assistente_consumo FROM authenticated,anon;
CREATE FUNCTION public.assistente_reservar(p_id uuid,p_user uuid,p_modelo text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cfg public.assistente_config; total numeric; individual numeric;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Somente backend'; END IF;
 PERFORM pg_advisory_xact_lock(79415621);
 SELECT * INTO cfg FROM public.assistente_config WHERE id=true;
 IF NOT cfg.habilitado OR NOT public.is_interno_ativo(p_user) OR p_modelo<>cfg.modelo THEN RAISE EXCEPTION 'Assistente indisponível'; END IF;
 IF EXISTS(SELECT 1 FROM public.assistente_consumo WHERE id=p_id) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.assistente_consumo WHERE user_id=p_user AND criado_em>now()-interval '15 seconds') OR EXISTS(SELECT 1 FROM public.assistente_consumo WHERE user_id=p_user AND status='reservado' AND criado_em>now()-interval '5 minutes') THEN RAISE EXCEPTION 'Aguarde a solicitação anterior'; END IF;
 IF (SELECT count(*) FROM public.assistente_consumo WHERE user_id=p_user AND criado_em>=date_trunc('day',now()))>=cfg.limite_diario THEN RAISE EXCEPTION 'Limite diário atingido'; END IF;
 SELECT coalesce(sum(greatest(custo_estimado_usd,reserva_usd)),0),coalesce(sum(greatest(custo_estimado_usd,reserva_usd)) FILTER(WHERE user_id=p_user),0) INTO total,individual FROM public.assistente_consumo WHERE criado_em>=date_trunc('month',now());
 IF total+0.20>cfg.limite_global_usd OR individual+0.20>cfg.limite_usuario_usd THEN RAISE EXCEPTION 'Limite mensal de consumo atingido'; END IF;
 INSERT INTO public.assistente_consumo(id,user_id,modelo) VALUES(p_id,p_user,p_modelo);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.assistente_reservar(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistente_reservar(uuid,uuid,text) TO service_role;
GRANT ALL ON public.assistente_config,public.assistente_consumo TO service_role;
CREATE INDEX assistente_conversas_expira ON public.assistente_conversas(expira_em) WHERE expira_em IS NOT NULL;
-- Somente conversas criadas pela nova integração têm expiração automática.
SELECT cron.schedule('assistente-retencao','25 10 * * *', $$DELETE FROM public.assistente_conversas WHERE expira_em<=now(); DELETE FROM public.assistente_consumo WHERE criado_em<now()-interval '13 months';$$);
