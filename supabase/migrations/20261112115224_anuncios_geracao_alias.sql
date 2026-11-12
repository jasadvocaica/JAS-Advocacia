-- Evita colisão entre a variável da etapa e o alias SQL na validação da equipe.
do $$declare d text;a text:='jsonb_array_elements(r.etapas) e left join public.agentes_ia a on a.id=(e->>''agente_id'')';begin
 select pg_get_functiondef('public.mkt_ads(text,jsonb)'::regprocedure) into d;
 if position(a in d)=0 then raise exception 'Validação da equipe mudou';end if;
 execute replace(d,a,'jsonb_array_elements(r.etapas) etapa_config(value) left join public.agentes_ia a on a.id=(etapa_config.value->>''agente_id'')');
end;$$;
