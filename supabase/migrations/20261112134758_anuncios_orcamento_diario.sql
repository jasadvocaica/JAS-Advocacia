-- Novos planos usam referência diária; os planos anteriores conservam o orçamento total.
do $$declare d text;a text:='''orcamento'',''inicio''';b text:='orcamento_sugerido (somente uma estimativa numérica de teto total em reais, ou null se não houver base)';begin
 select pg_get_functiondef('public.mkt_ads(text,jsonb)'::regprocedure) into d;
 if position(a in d)=0 or position(b in d)=0 then raise exception 'Contrato de orçamento mudou';end if;
 d:=replace(d,a,'''orcamento'',''tipo_orcamento'',''justificativa_orcamento'',''excecao_orcamento_aprovada'',''inicio''');
 d:=replace(d,b,'orcamento_diario_sugerido (estimativa numérica em reais por dia, referência inicial até 20) e justificativa_orcamento (explicar a proposta; acima de 20 requer justificativa específica e aprovação posterior da gestora). Não preencher orcamento_sugerido com valor diário: esse campo legado é total do período');
 execute d;
 select pg_get_functiondef('marketing_privado.cadastrar_estrategia_ia(uuid)'::regprocedure) into d;
 a:='''publico_proposto'',publico,';
 if position(a in d)=0 then raise exception 'Contrato da estratégia mudou';end if;
 execute replace(d,a,'''orcamento_diario_sugerido'',case when (j->''anuncio''->>''orcamento_diario_sugerido'') ~ ''^[0-9]+([.][0-9]{1,2})?$'' then j->''anuncio''->>''orcamento_diario_sugerido'' else null end,''justificativa_orcamento'',left(j->''anuncio''->>''justificativa_orcamento'',1000),'||a);
end;$$;
-- A referência vale também para as rotinas automáticas do estrategista, sem mudar horários ou orçamento de IA.
update marketing_privado.ia_rotinas r set etapas=(select jsonb_agg(case when a.nome='Theo' then jsonb_set(e.value,'{instrucoes}',to_jsonb(left(e.value->>'instrucoes',3100)||E'\nORÇAMENTO DE ANÚNCIOS: referência de até R$ 20 por dia por campanha. A IA pode sugerir valor diferente com justificativa; nenhuma sugestão é autorização. No objeto anuncio, use orcamento_diario_sugerido (número ou null) e justificativa_orcamento (texto). O campo legado orcamento_sugerido é total do período, nunca diário. Não criar nem ativar anúncios.') ) else e.value end order by e.ord)
 from jsonb_array_elements(r.etapas) with ordinality e(value,ord) left join public.agentes_ia a on a.id=(e.value->>'agente_id')::uuid)
where exists(select 1 from jsonb_array_elements(r.etapas) e(value) join public.agentes_ia a on a.id=(e.value->>'agente_id')::uuid where a.nome='Theo');
