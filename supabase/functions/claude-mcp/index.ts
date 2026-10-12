import {createClient} from 'npm:@supabase/supabase-js@2.104.1';
import {responderMCP,VERSOES} from './protocol.ts';
import {ferramentas, type Acesso} from '../assistente-chat/tools.ts';
const base=Deno.env.get('SUPABASE_URL')!;const endpoint=base+'/functions/v1/claude-mcp';const metadata=endpoint+'/.well-known/oauth-protected-resource';
const allowed=['https://claude.ai','https://app.julianaaraujoadvocacia.com'];
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');if(origin&&!allowed.includes(origin))return new Response('Origem não autorizada',{status:403});
 const headers:Record<string,string>={'Content-Type':'application/json','Access-Control-Allow-Headers':'authorization, content-type, accept, mcp-protocol-version','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Expose-Headers':'WWW-Authenticate'};if(origin)headers['Access-Control-Allow-Origin']=origin;
 const json=(v:unknown,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{...headers,...extra}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(new URL(req.url).pathname.endsWith('/.well-known/oauth-protected-resource')&&req.method==='GET')return json({resource:endpoint,authorization_servers:[base+'/auth/v1'],bearer_methods_supported:['header'],resource_name:'JAS Advocacia — consultas autorizadas'});
 const db=createClient(base,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')??''}},auth:{persistSession:false}});
 const {data,error}=await db.auth.getUser();if(error||!data.user)return json({error:'Autenticação necessária'},401,{'WWW-Authenticate':`Bearer resource_metadata="${metadata}"`});
 const uid=data.user.id;const {data:active}=await db.rpc('is_interno_ativo',{_user_id:uid});if(!active)return json({error:'Perfil interno ativo necessário'},403);
 const version=req.headers.get('MCP-Protocol-Version');if(version&&!VERSOES.includes(version))return json({error:'Versão MCP não suportada'},400);
 if(req.method!=='POST')return json({error:'Este servidor utiliza POST com respostas JSON'},405,{Allow:'POST, OPTIONS'});
 try{
  const text=await req.text();if(text.length>16000)return json({error:'Solicitação muito grande'},413);const body=JSON.parse(text);
  const {data:gestor}=await db.rpc('is_gestor',{_user_id:uid});const modulos=new Set<string>();
  for(const m of ['clientes','processos','controladoria','financeiro']){const {data,error}=await db.rpc('has_permission',{_user_id:uid,_modulo:m,_acao:'visualizar'});if(!error&&data)modulos.add(m);}
  const {data:roles}=await db.from('user_roles').select('role').eq('user_id',uid);if((roles??[]).some(r=>['gestor','advogado','controladoria'].includes(r.role)))modulos.add('diligencias');
  if(!gestor&&!modulos.size)return json({error:'Sem autorização para consultas'},403);
  const a:Acesso={uid,gestor:!!gestor,modulos,escopo:''};
  if(body.method==='tools/call'){
   const admin=createClient(base,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
   const {count,error}=await admin.from('mcp_chamadas_log').select('id',{count:'exact',head:true}).contains('args',{user_id:uid,origem:'claude-mcp'}).gte('criado_em',new Date(Date.now()-60000).toISOString());
   if(error)return json({error:'Controle de chamadas indisponível'},503);if((count??0)>=30)return json({error:'Limite de consultas por minuto atingido'},429,{'Retry-After':'60'});
   const name=ferramentas(a).some(t=>t.name===body.params?.name)?body.params.name:'desconhecida';
   const {data:log,error:e}=await admin.from('mcp_chamadas_log').insert({ferramenta:name,args:{user_id:uid,origem:'claude-mcp'},sucesso:false}).select('id').single();if(e)return json({error:'Auditoria indisponível'},503);
   const inicio=Date.now();const result:any=await responderMCP(body,db,a);await admin.from('mcp_chamadas_log').update({sucesso:result?.result?.isError===false,duracao_ms:Date.now()-inicio,erro:result?.result?.isError?'consulta_negada':null}).eq('id',log.id);return json(result);
  }
  const result=await responderMCP(body,db,a);return result===null?new Response(null,{status:202,headers}):json(result);
 }catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Solicitação inválida'}},400);}
});
