"""Executar somente no PostgreSQL descartável criado por tests/agentes/README.md."""
import subprocess
import os

DATABASE = os.environ.get("JAS_TEST_DB", "postgres")
HOST = os.environ.get("JAS_TEST_PGHOST")
PSQL = ["psql", "-h", HOST] if HOST else ["docker", "exec", "-i", "jas-djen-test", "psql"]
PSQL += ["-U", "postgres", "-d", DATABASE, "-At", "-v", "ON_ERROR_STOP=1"]

def psql(sql):
    result = subprocess.run(
        PSQL,
        input=sql, text=True, capture_output=True, check=True,
    )
    return result.stdout

psql("""
insert into profiles(id) values ('00000000-0000-0000-0000-000000000001');
insert into processos(id,numero_cnj_limpo,responsavel_id)
values ('00000000-0000-0000-0000-000000000010','12345678901234567890','00000000-0000-0000-0000-000000000001');
insert into pje_publicacoes(id,pje_id,numero_processo_limpo) values
('00000000-0000-0000-0000-000000000100','concorrente','12345678901234567890'),
('00000000-0000-0000-0000-000000000101','concorrente','12345678901234567890');
""")
worker = subprocess.Popen(
    PSQL,
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
worker.stdin.write("""
begin;
select djen_preparar_triagem('00000000-0000-0000-0000-000000000100');
select 'reservado';
select pg_sleep(3);
commit;
""")
worker.stdin.close()
for line in worker.stdout:
    if line.strip() == "reservado":
        break
else:
    raise AssertionError("O primeiro executor não reservou o trabalho")
psql("select djen_processar_pendencias(25);")
worker.wait(timeout=15)
if worker.returncode:
    raise AssertionError(worker.stderr.read())
psql("update pje_publicacoes set triagem_proxima_tentativa=now(); select djen_processar_pendencias(25);")
assert psql("select count(*) from controladoria_itens;").strip() == "1"
assert psql("select count(*) from andamentos;").strip() == "1"
assert psql("select count(*) from pje_publicacoes where item_controladoria_id is not null;").strip() == "2"
assert psql("select sum(triagem_tentativas) from pje_publicacoes;").strip() == "0"
print("Concorrência: dois executores, uma tarefa, nenhuma tentativa perdida — OK")
