"""Duas reservas reais concorrentes disputam o mesmo teto global diário."""
import os
import subprocess

host = os.environ.get("JAS_TEST_PGHOST")
command = ["psql", "-h", host] if host else ["docker", "exec", "-i", "jas-djen-test", "psql"]
command += ["-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"]

def sql(text):
    return subprocess.run(command, input=text, text=True, capture_output=True, check=True).stdout

sql("""
update assistente_config set habilitado=true,limite_tokens_diario=10000;
insert into auth.users(id) values('00000000-0000-0000-0000-000000009099');
insert into assistente_consumo(id,user_id) values
('00000000-0000-0000-0000-000000009091','00000000-0000-0000-0000-000000009099'),
('00000000-0000-0000-0000-000000009092','00000000-0000-0000-0000-000000009099');
""")
first = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
first.stdin.write("""
begin;
set local role service_role;
select assistente_reservar_tokens('00000000-0000-0000-0000-000000009091',0,5000,1000);
select 'reservado';
select pg_sleep(3);
commit;
""")
first.stdin.close()
for line in first.stdout:
    if line.strip() == 'reservado':
        break
else:
    raise AssertionError(first.stderr.read())
try:
    sql("set role service_role; select assistente_reservar_tokens('00000000-0000-0000-0000-000000009092',0,5000,1000);")
    raise AssertionError('A segunda reserva ultrapassou o teto')
except subprocess.CalledProcessError as error:
    assert 'Limite diário de tokens' in error.stderr, error.stderr
first.wait(timeout=15)
assert first.returncode == 0, first.stderr.read()
assert sql('select sum(reservados) from assistente_reservas_tokens;').strip() == '6000'
print('Concorrência financeira: somente uma reserva de 6.000 admitida em um teto de 10.000 — OK')
