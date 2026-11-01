"""Duas sessões reais: deduplicação de intake e de aprovação por CPF."""
import concurrent.futures, json, os, subprocess, threading
host = os.getenv('JAS_TEST_PGHOST')
base = ['psql','-h',host,'-U','postgres'] if host else ['docker','exec','-i',os.getenv('JAS_TEST_CONTAINER','jas-clara-m1'),'psql','-U','postgres']
base += ['-d',os.getenv('JAS_TEST_DB','m1_final'),'-qAt','-v','ON_ERROR_STOP=1','-c']
def sql(s):
 return subprocess.check_output(base+[s],text=True).strip()
user='00000000-0000-0000-0000-000000000961'
sql(f"insert into auth.users(id) values('{user}');insert into profiles(id) values('{user}');update homologacao.clara_config set habilitado=true where id;")
barrier=threading.Barrier(2)
def receber(_):
 barrier.wait()
 return sql(f"select public.clara_m1_receber('{user}',repeat('a',64),'Cadastrar','teste.txt','Teste de concorrência');")
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 ids=list(pool.map(receber,range(2)))
assert ids[0]==ids[1], 'Recebimento concorrente criou duas tarefas'
id2=sql(f"select public.clara_m1_receber('{user}',repeat('b',64),'Cadastrar','teste2.txt','Mesmo CPF em outro documento');")
for task in (ids[0],id2):
 run=json.loads(sql(f"select public.clara_m1_reservar('{user}','{task}');"))
 sql(f"select public.clara_m1_previa('{user}','{task}','{run['consumo_id']}', '{{\"nome\":\"Cliente Ficticia Concorrencia\",\"cpf_cnpj\":\"00000000272\",\"email\":\"concorrencia@example.invalid\"}}','{{}}','[]',null,1,1,0);")
barrier=threading.Barrier(2)
def aprovar(task):
 barrier.wait()
 return json.loads(sql(f"begin;select public.clara_m1_aprovar('{user}','{task}');select pg_sleep(.15);commit;").splitlines()[0])['cliente_id']
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 clientes=list(pool.map(aprovar,(ids[0],id2)))
assert clientes[0]==clientes[1], 'Aprovação concorrente duplicou CPF'
assert sql("select count(*) from homologacao.clientes where cpf_cnpj='00000000272';")=='1'
print(json.dumps({'intake_concorrente':'id único','aprovacoes_concorrentes':'cliente único','cliente_homologacao_id':clientes[0]}))
