# Testes dos agentes DJEN

Somente em banco descartável. Nunca executar o bootstrap em produção.

```bash
docker run -d --name jas-djen-test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine
docker cp tests/. jas-djen-test:/tests/
docker cp supabase/. jas-djen-test:/supabase/
docker exec -w / jas-djen-test psql -U postgres -v ON_ERROR_STOP=1 -f tests/agentes/bootstrap.sql -f tests/agentes/fluxo.sql
python3 tests/agentes/concorrencia.py
docker rm -f jas-djen-test
```

Com PostgreSQL já disponível e banco vazio, executar `psql -v ON_ERROR_STOP=1 -f tests/agentes/bootstrap.sql -f tests/agentes/fluxo.sql`; depois, `JAS_TEST_PGHOST=localhost python3 tests/agentes/concorrencia.py`. A variável opcional `JAS_TEST_DB` seleciona outro banco descartável.

O bootstrap simula apenas os contratos necessários de cron, Vault e HTTP; nenhum teste dispara chamadas externas. A concorrência usa duas conexões reais. O teste transacional usa rollback; o teste de concorrência deixa fixtures no banco descartável.

Para checar os servidores sem depender da transformação do CDN:

```bash
deno check --no-config --import-map=tests/agentes/deno-imports.json supabase/functions/agentes-disparar/index.ts supabase/functions/pje-comunica-sync/index.ts supabase/functions/controladoria-sync-calendar/index.ts
```
