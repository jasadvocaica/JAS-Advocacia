export type Fonte = { titulo: string; rota: string; ferramenta: string; consultado_em: string };
export type Acesso = { uid: string; gestor: boolean; modulos: Set<string>; escopo: string };
const grupos: Record<string,string[]> = {
 clientes: ['buscar_clientes','consultar_cliente'],
 processos: ['listar_processos_cliente','buscar_processos','consultar_processo','listar_processos_por_status','listar_processos_por_responsavel'],
 controladoria: ['listar_prazos','listar_prazos_proximos','listar_prazos_atrasados','consultar_pendencias_controladoria','consultar_agenda','listar_compromissos_por_responsavel','listar_atividades','consultar_atividades_por_responsavel','resumo_produtividade','listar_atividades_atrasadas'],
 diligencias: ['listar_diligencias','consultar_diligencia'],
 financeiro: ['resumo_financeiro','consultar_receitas','consultar_despesas','listar_recebimentos_pendentes','comparar_periodos_financeiros'],
};
const props = { termo:{type:['string','null']},id:{type:['string','null']},cliente_id:{type:['string','null']},responsavel_id:{type:['string','null']},status:{type:['string','null']},inicio:{type:['string','null']},fim:{type:['string','null']},inicio_anterior:{type:['string','null']},fim_anterior:{type:['string','null']} };
export function ferramentas(a:Acesso) { return Object.entries(grupos).flatMap(([modulo,nomes]) => a.modulos.has(modulo) ? nomes.map(name=>({type:'function',name,description:`Consulta somente de leitura: ${name}. Dados do módulo ${modulo}, sujeitos a autorização. Datas YYYY-MM-DD; parâmetros não utilizados devem ser null. Máximo 25 registros, resumos até 500 registros por fonte e período.`,strict:true,parameters:{type:'object',properties:props,required:Object.keys(props),additionalProperties:false}})) : []); }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validar(raw:unknown):Record<string,string|null> {
 if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('Parâmetros inválidos');
 const a=raw as Record<string,unknown>; const out:Record<string,string|null>={};
 for(const [k,v] of Object.entries(a)) { if(!(k in props)|| (v!==null && typeof v!=='string')) throw new Error('Parâmetros inválidos'); if(typeof v==='string' && v.length>120) throw new Error('Parâmetro muito longo');out[k]=v as string|null; }
 for(const k of ['id','cliente_id','responsavel_id']) if(out[k]&&!uuid.test(out[k]!))throw new Error('Identificador inválido');
 for(const k of ['inicio','fim','inicio_anterior','fim_anterior'])if(out[k]&&(!/^\d{4}-\d{2}-\d{2}$/.test(out[k]!)||new Date(out[k]!).toISOString().slice(0,10)!==out[k]))throw new Error('Data inválida');
 for(const [a,b] of [['inicio','fim'],['inicio_anterior','fim_anterior']]) if(out[a]&&out[b]&&(out[a]!>out[b]!||(Date.parse(out[b]!)-Date.parse(out[a]!))/86400000>93))throw new Error('Período máximo de 93 dias');
 return out;
}
async function resultado(q:any) { const {data,error}=await q; if(error)throw new Error('Consulta indisponível'); return data??[]; }
export async function consultar(db:any,a:Acesso,nome:string,raw:unknown) {
 const modulo=Object.entries(grupos).find(([,n])=>n.includes(nome))?.[0];
 if(!modulo||!a.modulos.has(modulo))throw new Error('Ferramenta não autorizada');
 const p=validar(raw); const fontes:Fonte[]=[];const now=new Date().toISOString();
 const ref=(rows:any[],base:string,campo='id')=> rows.forEach(r=>fontes.push({titulo:r.nome||r.titulo||r.numero_cnj||`${nome}: ${r[campo]}`,rota:base==='controladoria'?`/controladoria?item=${r[campo]}`:`/${base}/${r[campo]}`,ferramenta:nome,consultado_em:now}));
 const filtrar=(q:any,date?:string)=>{if(p.id)q=q.eq('id',p.id);if(p.cliente_id)q=q.eq('cliente_id',p.cliente_id);if(p.status)q=q.eq('status',p.status);if(p.responsavel_id)q=q.eq('responsavel_id',p.responsavel_id);if(date&&p.inicio)q=q.gte(date,p.inicio);if(date&&p.fim)q=q.lte(date,p.fim.length===10&&date!=='data_vencimento'?p.fim+'T23:59:59-04:00':p.fim);return q;};
 let rows:any[]=[]; let resumo:any;
 if(modulo==='clientes') {
  if(nome==='consultar_cliente'&&!p.id)throw new Error('Informe o cliente');
  let q=db.from('clientes').select('id,nome,status,ativo').order('nome').limit(25);if(p.id)q=q.eq('id',p.id);if(p.termo)q=q.ilike('nome',`%${p.termo.replace(/[%_]/g,'')}%`);rows=await resultado(q);ref(rows,'clientes');
 }else if(modulo==='processos') {
  if(nome==='consultar_processo'&&!p.id)throw new Error('Informe o processo');if(nome==='listar_processos_cliente'&&!p.cliente_id)throw new Error('Informe o cliente');
  let q=filtrar(db.from('processos').select('id,numero_cnj,tipo_acao,status,fase_atual,area_direito,cliente_id,responsavel_id,ultima_atualizacao_andamento').order('atualizado_em',{ascending:false}).limit(25));if(p.termo)q=q.ilike('numero_cnj',`%${p.termo.replace(/[%_]/g,'')}%`);rows=await resultado(q);ref(rows,'processos');
 }else if(modulo==='diligencias') {
  if(nome==='consultar_diligencia'&&!p.id)throw new Error('Informe a diligência');
  let q=filtrar(db.from('diligencias').select('id,tipo,status,data_hora,local,processo_id,cliente_id,criado_por').order('data_hora').limit(25),'data_hora');if(!a.gestor)q=q.eq('criado_por',a.uid);rows=await resultado(q);
  for(const r of rows) {if(r.processo_id){const {data,error}=await db.rpc('usuario_ve_processo',{_user_id:a.uid,_processo_id:r.processo_id});if(error||!data)throw new Error('Diligência fora do escopo');}}
  fontes.push({titulo:'Diligências autorizadas',rota:'/diligencias',ferramenta:nome,consultado_em:now});
 }else if(modulo==='controladoria') {
  if(!a.gestor&&p.responsavel_id&&p.responsavel_id!==a.uid)throw new Error('Consulta de equipe restrita à gestão');
  let q=filtrar(db.from('controladoria_itens').select('id,titulo,tipo,status,prioridade,data_inicio,data_vencimento,data_prazo_judicial,data_prazo_interno,prazo_conferido,processo_id,responsavel_id,executor_id,revisor_id,concluido_em').order('data_vencimento').limit(nome==='resumo_produtividade'?500:25),'data_vencimento');
  if(!a.gestor) {if(p.responsavel_id&&p.responsavel_id!==a.uid)throw new Error('Consulta de equipe restrita à gestão');q=q.or(`responsavel_id.eq.${a.uid},executor_id.eq.${a.uid},revisor_id.eq.${a.uid}`);}
  const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(['consultar_agenda','listar_compromissos_por_responsavel'].includes(nome))q=q.in('tipo',['audiencia','reuniao','diligencia','pericia','conciliacao']);
  if(nome.startsWith('listar_prazos'))q=q.in('tipo',['prazo_fatal','prazo_processual']);
  if(nome.includes('atrasad'))q=q.lt('data_vencimento',hoje+'T00:00:00-04:00').not('status','in','(concluido,cancelado)');
  if(nome==='listar_prazos_proximos')q=q.gte('data_vencimento',hoje+'T00:00:00-04:00').lte('data_vencimento',new Date(Date.now()+7*86400000).toISOString());
  rows=await resultado(q);ref(rows.slice(0,25),'controladoria');
  if(nome==='resumo_produtividade'){resumo={total_amostra:rows.length,por_status:contar(rows,'status'),por_responsavel:a.gestor?contar(rows,'responsavel_id'):undefined,limite:500};rows=[];}
 }else if(modulo==='financeiro') {
  const periodo=(from:string|null,to:string|null)=>{if(!from||!to)throw new Error('Informe início e fim do período');return [from,to];};
  const [inicio,fim]=periodo(p.inicio,p.fim);
  async function financeiro(de:string,ate:string) {
   const receitas=await resultado(db.from('honorarios_pagamentos').select('id,valor_recebido,data_pagamento,contrato_id').gte('data_pagamento',de).lte('data_pagamento',ate).limit(500));
   const despesas=await resultado(db.from('financeiro_saidas').select('id,valor,status,categoria,data_pagamento').gte('data_pagamento',de).lte('data_pagamento',ate).limit(500));
   const parcelas=await resultado(db.from('honorarios_parcelas').select('id,valor,status,data_vencimento,contrato_id').gte('data_vencimento',de).lte('data_vencimento',ate).neq('status','pago').limit(500));
   return {inicio:de,fim:ate,receitas,despesas,parcelas,recebido:receitas.reduce((s:number,r:any)=>s+Number(r.valor_recebido),0),despesa_registrada:despesas.reduce((s:number,r:any)=>s+Number(r.valor),0),limitado:[receitas,despesas,parcelas].some(x=>x.length===500)};
  }
  const atual=await financeiro(inicio,fim);
  if(nome==='comparar_periodos_financeiros'){const [de,ate]=periodo(p.inicio_anterior,p.fim_anterior);const anterior=await financeiro(de,ate);resumo={atual:compactar(atual),anterior:compactar(anterior)};}
  else if(nome==='resumo_financeiro')resumo=compactar(atual);
  else rows=(nome==='consultar_receitas'?atual.receitas:nome==='consultar_despesas'?atual.despesas:atual.parcelas).slice(0,25);
  fontes.push({titulo:`Financeiro: ${inicio} a ${fim}`,rota:'/financeiro',ferramenta:nome,consultado_em:now});
 }
 return {dados:resumo??rows,fontes,limite:resumo?500:25,limitado:rows.length===25,nota:'Dados registrados e autorizados. Ausência de registro não comprova ausência de fato; resultados limitados não representam o universo completo.'};
}
function contar(rows:any[],campo:string){return rows.reduce((acc:Record<string,number>,r:any)=>{const k=r[campo]??'não informado';acc[k]=(acc[k]??0)+1;return acc;},{});}
function compactar(v:any){return {inicio:v.inicio,fim:v.fim,recebido:v.recebido,despesa_registrada:v.despesa_registrada,pendente:v.parcelas.reduce((s:number,r:any)=>s+Number(r.valor),0),limitado:v.limitado,quantidade_receitas:v.receitas.length,quantidade_despesas:v.despesas.length};}
