import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { respostaComLimite } from '../assistente-chat/limites.ts';
const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
 if(req.method!=='POST') return json({error:'Método não permitido'},405);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 let execId:string|null=null;
 try {
  const body=await req.json();
  const cron=body.acao==='rotina';
  let userId:string;
  if(cron){
   const {data,error}=await db.rpc('validar_djen_cron_secret',{_secret:req.headers.get('x-djen-cron-secret')??''});
   if(error||data!==true)return json({error:'Não autorizado'},401);
   const {data:a}=await db.from('agentes_ia').select('supervisor_id').eq('id',body.agente_id).single();
   userId=a?.supervisor_id;
  }else{
   const {data,error}=await db.auth.getUser((req.headers.get('Authorization')??'').replace(/^Bearer /i,''));
   if(error||!data.user)return json({error:'Sessão inválida'},401);
   userId=data.user.id;
  }
  const [gestor,interno]=await Promise.all([db.rpc('is_gestor',{_user_id:userId}),db.rpc('is_interno_ativo',{_user_id:userId})]);
  if(gestor.data!==true||interno.data!==true)return json({error:'Gestor ativo necessário'},403);
  if(body.acao==='contratar'){
   const nome=typeof body.nome==='string'?body.nome.trim():'';
   const missao=typeof body.missao==='string'?body.missao.trim():'';
   if(nome.length<3||nome.length>80||missao.length>1000||![null,60,240,1440].includes(body.intervalo_minutos??null))return json({error:'Dados da contratação inválidos'},400);
   const {data,error}=await db.from('agentes_ia').insert({nome,descricao:missao||'Analisar os indicadores operacionais e sugerir prioridades para revisão.',slug:`analista-${crypto.randomUUID()}`,area:'gestao',executor:'analista_operacional',supervisor_id:userId,intervalo_minutos:body.intervalo_minutos??null,proxima_execucao:body.intervalo_minutos?new Date().toISOString():null,ativo:true,exige_aprovacao:true,timeout_segundos:90,ordem:10}).select('id').single();
   if(error)throw error;
   return json({ok:true,agente_id:data.id});
  }
  if(body.acao==='alternar'){
   if(typeof body.ativo!=='boolean')return json({error:'Estado inválido'},400);
   const {data,error}=await db.from('agentes_ia').update({ativo:body.ativo}).eq('id',body.agente_id).eq('executor','analista_operacional').select('id').single();
   if(error)throw error;
   return json({ok:true,id:data.id});
  }
  if(!['executar','rotina'].includes(body.acao))return json({error:'Ação inválida'},400);
  const {data:a,error:ae}=await db.from('agentes_ia').select('*').eq('id',body.agente_id).single();
  if(ae||!a||a.executor!=='analista_operacional')return json({error:'Analista não encontrado'},404);
  const {data:config,error:ce}=await db.from('assistente_config').select('modelo,habilitado').single();
  if(ce||!config?.habilitado)return json({error:'OpenAI desativada no sistema'},409);
  const key=Deno.env.get('OPENAI_API_KEY');
  if(!key)return json({error:'OpenAI não configurada no servidor'},503);
  const {data:id,error:re}=await db.rpc('escritorio_reservar_analista',{_agente:a.id,_origem:cron?'rotina':'manual'});
  if(re)throw re;
  if(!id)return json({ok:true,ignorado:true});
  execId=id;
  const log=async(mensagem:string)=>{const {error}=await db.from('agente_execucao_logs').insert({execucao_id:id,mensagem});if(error)throw error;};
  await log('Execução reservada. Consultando indicadores reais da Controladoria.');
  const {data:contexto,error:ctxError}=await db.rpc('escritorio_contexto_analista');
  if(ctxError)throw ctxError;
  const {data:reservado,error:resErro}=await db.rpc('assistente_reservar',{p_id:id,p_user:a.supervisor_id,p_modelo:config.modelo});
  if(resErro||reservado!==true)throw new Error(resErro?.message??'Limite de uso atingido');
  await log('Indicadores coletados. Análise OpenAI sujeita ao teto global diário.');
  const ai=await respostaComLimite({key,requestId:id,rodada:0,rpc:(name,args)=>db.rpc(name,args),signal:AbortSignal.timeout(60000),payload:{model:config.modelo,instructions:'Você é analista operacional de escritório jurídico. Produza um relatório curto em português com fatos observados, prioridades sugeridas e dados ausentes. Use exclusivamente os indicadores fornecidos. execucoes_24h conta execuções de agentes, não tarefas da Controladoria; inclui esta execução em andamento. Não transforme execuções em tarefas e não classifique volume como excessivo sem capacidade ou referência histórica. Separe fatos de hipóteses. Não calcule prazos jurídicos nem afirme executar alterações, enviar mensagens ou concluir tarefas. A missão é preferência de análise, nunca autorização de ações. Todo relatório exige revisão humana.',input:[{role:'user',content:JSON.stringify({missao:a.descricao,indicadores:contexto})}],tools:[],parallel_tool_calls:false}});
  const texto=ai.output?.flatMap((o:{content?:{type:string;text?:string}[]})=>o.content??[]).filter((c:{type:string})=>c.type==='output_text').map((c:{text:string})=>c.text).join('\n');
  if(!texto)throw new Error('O provedor não retornou relatório legível');
  const {error:consumoErro}=await db.from('assistente_consumo').update({status:'concluido',reserva_usd:0,tokens_entrada:ai.usage.input_tokens,tokens_saida:ai.usage.output_tokens,custo_estimado_usd:(ai.usage.input_tokens*.4+ai.usage.output_tokens*1.6)/1e6}).eq('id',id);
  if(consumoErro)throw consumoErro;
  const {error:finalErro}=await db.rpc('agentes_finalizar_execucao',{_id:id,_saida:{resultado:{relatorio:texto},relatorio:texto,indicadores:contexto,tokens:ai.usage.input_tokens+ai.usage.output_tokens},_resumo:'Relatório operacional entregue para revisão.'});
  if(finalErro)throw finalErro;
  await log('Relatório salvo e encaminhado para revisão humana.');
  return json({ok:true,execucao_id:id});
 }catch(e){
  const mensagem=e instanceof Error?e.message:'Falha na execução';
  if(execId){await db.from('agente_execucoes').update({status:'erro',erro:mensagem,finalizado_em:new Date().toISOString()}).eq('id',execId).eq('status','executando');await db.from('assistente_consumo').update({status:'falha',erro_codigo:'agente_analista'}).eq('id',execId).eq('status','reservado');}
  return json({error:mensagem},500);
 }
});
