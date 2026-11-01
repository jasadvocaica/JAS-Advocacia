"""Três sessões reais: dois workers e cron disputam um despacho elegível."""
import concurrent.futures, os, subprocess, threading
host=os.getenv('JAS_TEST_PGHOST')
base=['psql','-h',host,'-U','postgres'] if host else ['docker','exec','-i',os.getenv('JAS_TEST_CONTAINER','jas-config-pg'),'psql','-U','postgres']
base+=['-d',os.getenv('JAS_TEST_DB','postgres'),'-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(query): return subprocess.check_output(base+[query],text=True).strip()
user='00000000-0000-4000-8000-000000000981'
agent='00000000-0000-4000-8000-000000000982'
w1='00000000-0000-4000-8000-000000000983'
w2='00000000-0000-4000-8000-000000000984'
sql(f"insert into auth.users values('{user}');insert into profiles(id) values('{user}');insert into vault.decrypted_secrets(name,decrypted_secret) values('djen_cron_secret','placeholder-concorrencia-local');insert into agentes_ia(id,slug,nome,executor,supervisor_id,intervalo_minutos,proxima_execucao,ativo) values('{agent}','analista-worker-concorrencia','Fixture','analista_operacional','{user}',60,now()-interval '1 hour',true);insert into escritorio_privado.workers(id,supervisor_id,nome,token_hash) values('{w1}','{user}','Worker 1',repeat('c',64)),('{w2}','{user}','Worker 2',repeat('d',64));select setval('net.request_id',1000,true);")
barrier=threading.Barrier(3)
queries=[f"select escritorio_worker_pulso('{w1}',repeat('c',64),'fixture')",f"select escritorio_worker_pulso('{w2}',repeat('d',64),'fixture')","select escritorio_agendar_analistas()"]
def dispute(i):
 barrier.wait();return sql('begin;'+queries[i]+";select pg_sleep(.25);commit;")
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(dispute,range(3)))
assert sql('select last_value from net.request_id')=='1001','Mais de um pedido HTTP para a mesma oportunidade de despacho'
print('Dois workers e cron: um único despacho HTTP sob concorrência real.')
