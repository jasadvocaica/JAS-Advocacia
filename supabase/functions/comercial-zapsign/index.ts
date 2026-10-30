import {createClient} from 'npm:@supabase/supabase-js@2.104.1';
import {ZapSign,statusDocumento,tokenValido,segredoIgual,arquivoPdfValido,type Ambiente} from './core.ts';
import {gerarDocx} from './documento.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-jas-zapsign-secret','Access-Control-Allow-Methods':'POST,OPTIONS'};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
function keyFor(ambiente:Ambiente){const key=Deno.env.get(ambiente==='sandbox'?'ZAPSIGN_SANDBOX_TOKEN':'ZAPSIGN_PRODUCTION_TOKEN');if(!key)throw new Error('Configure a credencial do ambiente no servidor');return key;}
function provider(ambiente:Ambiente){return new ZapSign(keyFor(ambiente),ambiente,fetch,Deno.env.get('ZAPSIGN_REGION')??'global');}
async function persistir(admin:any,d:any,p:any){
 if(!tokenValido(p.token)||p.external_id!==d.id||(d.externo_id&&d.externo_id!==p.token))throw new Error('documento_externo_divergente');
 if(typeof p.sandbox==='boolean'&&p.sandbox!==(d.ambiente==='sandbox'))throw new Error('ambiente_externo_divergente');
 const estado=statusDocumento(p,d.signatarios);let path=d.arquivo_assinado_path;let storageErro:string|null=null;
 if(estado==='assinado'&&!path){try{
  const url=new URL(p.signed_file);if(url.protocol!=='https:'||!['zapsign.s3.amazonaws.com','zapsign.s3.sa-east-1.amazonaws.com','zapsign.s3.us-east-1.amazonaws.com'].includes(url.hostname))throw new Error('cdn_assinada_nao_admitida');
  const r=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'error'});if(!r.ok||Number(r.headers.get('content-length')??0)>10485760)throw new Error('download_assinado_indisponivel');const bytes=new Uint8Array(await r.arrayBuffer());if(!arquivoPdfValido(bytes))throw new Error('arquivo_assinado_invalido');
  const destino=`provedor/${d.contratacao_id}/${d.id}.pdf`;const {error}=await admin.storage.from('contratacoes').upload(destino,bytes,{contentType:'application/pdf',upsert:false});if(error&&String(error.statusCode)!=='409')throw new Error('armazenamento_pendente');path=destino;
 }catch{storageErro='preservacao_pdf_pendente';}}
 const links=(p.signers??[]).filter((s:any)=>d.signatarios.some((e:any)=>e.papel===s.external_id)).map((s:any)=>({papel:s.external_id,nome:s.name,url:s.sign_url})).filter((s:any)=>{try{const u=new URL(s.url);return u.protocol==='https:'&&['app.zapsign.com.br','sandbox.app.zapsign.com.br','app.br.zapsign.com.br'].includes(u.hostname);}catch{return false;}});
 const {error}=await admin.rpc('comercial_registrar_provedor',{p_documento:d.id,p_lease:null,p_dados:{estado,externo_id:p.token,external_id:p.external_id,provider_status:p.status,links_assinatura:links,assinaturas:(p.signers??[]).map((s:any)=>({external_id:s.external_id,status:s.status,signed_at:s.signed_at})),arquivo_assinado_path:path,erro_codigo:storageErro}});if(error)throw new Error('registro_status_pendente');return {id:d.id,estado,preservacao_pendente:!!storageErro};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return json({error:'Método não permitido'},405);
 try{
 const url=Deno.env.get('SUPABASE_URL')!;const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});const query=new URL(req.url).searchParams;
 if(query.get('webhook')==='1'){
  const ambiente=query.get('ambiente') as Ambiente;if(!['sandbox','producao'].includes(ambiente))return json({error:'Ambiente inválido'},400);
  const expected=Deno.env.get(ambiente==='sandbox'?'ZAPSIGN_WEBHOOK_SECRET_SANDBOX':'ZAPSIGN_WEBHOOK_SECRET_PRODUCTION')??'';
  if(!segredoIgual(req.headers.get('X-JAS-ZapSign-Secret')??'',expected))return json({error:'Não autorizado'},401);
  const text=await req.text();if(text.length>1048576)return json({error:'Evento muito grande'},413);const body=JSON.parse(text);const token=body.token??body.doc_token??body.document?.token;if(!tokenValido(token))return json({ignorado:true});
  const {data:d,error}=await admin.from('comercial_documentos').select('*').eq('ambiente',ambiente).eq('externo_id',token).maybeSingle();if(error)throw new Error('consulta_evento_pendente');if(!d)return json({ignorado:true,motivo:'documento_nao_vinculado_reconciliar_envio'});
  const atualizado=await provider(ambiente).detalhar(token);return json(await persistir(admin,d,atualizado));
 }
 const db=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:req.headers.get('Authorization')??''}},auth:{persistSession:false}});
 const {data:auth,error:authError}=await db.auth.getUser();if(authError||!auth.user)return json({error:'Sessão inválida'},401);
 const {data:ativo}=await db.rpc('is_interno_ativo',{_user_id:auth.user.id});if(!ativo)return json({error:'Acesso interno ativo necessário'},403);
 const raw=await req.text();if(raw.length>20000)return json({error:'Solicitação muito grande'},413);const body=JSON.parse(raw);
 const op=async(operacao:string,payload:any={})=>{const {data,error}=await db.rpc('comercial_operar',{operacao,payload});if(error)throw new Error(error.message);return data;};
 if(body.acao==='configuracao_integracao'){
  const ctx=await op('contexto');if(!ctx.permissoes.gerenciar)return json({error:'Sem permissão de configuração'},403);
  return json({sandbox_configurado:!!Deno.env.get('ZAPSIGN_SANDBOX_TOKEN'),producao_configurada:!!Deno.env.get('ZAPSIGN_PRODUCTION_TOKEN'),producao_liberada:Deno.env.get('ZAPSIGN_PRODUCTION_ENABLED')==='true',webhook_sandbox_configurado:!!Deno.env.get('ZAPSIGN_WEBHOOK_SECRET_SANDBOX'),webhook_producao_configurado:!!Deno.env.get('ZAPSIGN_WEBHOOK_SECRET_PRODUCTION'),plano_conta_verificado:false,contador_provedor_disponivel:false});
 }
 if(!uuid(body.id))return json({error:'Contratação inválida'},400);
 const {data:c,error:ctError}=await db.from('comercial_contratacoes').select('*').eq('id',body.id).single();if(ctError||!c)return json({error:'Contratação não autorizada'},403);
 const {data:todos,error:docError}=await db.from('comercial_documentos').select('*').eq('contratacao_id',c.id).eq('versao',c.versao);if(docError)throw new Error('Não foi possível consultar os documentos');
 if(['baixar_previa','baixar_assinado'].includes(body.acao)){
  const d=(todos??[]).find((x:any)=>x.id===body.documento_id);if(!d)return json({error:'Documento não autorizado'},403);
  if(body.acao==='baixar_previa')return json({base64:await gerarDocx(d.conteudo_html),nome:`${d.tipo}-v${d.versao}.docx`});
  if(!d.arquivo_assinado_path)return json({error:'PDF assinado ainda precisa ser preservado; consulte o status novamente'},409);
  const {data,error}=await admin.storage.from('contratacoes').createSignedUrl(d.arquivo_assinado_path,120);if(error)throw new Error('Arquivo assinado indisponível');return json({url:data.signedUrl});
 }
 if(body.acao==='enviar'){
  if(body.confirmado!==true)return json({error:'Confirmação explícita necessária'},400);
  const {data:cfg}=await db.from('comercial_config').select('*').single();if(!cfg)throw new Error('Configuração indisponível');keyFor(cfg.ambiente as Ambiente);
  if(cfg.ambiente==='producao'&&Deno.env.get('ZAPSIGN_PRODUCTION_ENABLED')!=='true')return json({error:'Produção bloqueada no servidor; valide a conta e configure a liberação explícita'},409);
  const docs=await op('reservar_envio',{id:c.id,confirmado:true});const resultados:any[]=[];
  for(const d of docs){
   let solicitado=false;try{
    const base64=await gerarDocx(d.conteudo_html);solicitado=true;const p=await provider(d.ambiente).criar(d,base64);
    if(!tokenValido(p.token)||p.external_id!==d.id)throw new Error('resposta_incerta_reconciliar');
    const {error}=await admin.rpc('comercial_registrar_provedor',{p_documento:d.id,p_lease:d.lease_id,p_dados:{estado:'criado',externo_id:p.token}});if(error)throw new Error('persistencia_incerta_reconciliar');
    resultados.push(await persistir(admin,{...d,externo_id:p.token},await provider(d.ambiente).detalhar(p.token)));
   }catch(e){const known=!solicitado||(e as any).confirmadamenteNaoCriado===true;
    await admin.rpc('comercial_registrar_provedor',{p_documento:d.id,p_lease:d.lease_id,p_dados:{estado:known?'falha':'incerto',erro_codigo:known?'provedor_rejeitou_envio':'resposta_incerta_reconciliar'}});
    resultados.push({id:d.id,estado:known?'falha':'incerto',mensagem:known?'O provedor recusou a criação; verifique a configuração antes de repetir.':'Não repita este envio antes de reconciliar com o provedor.'});
   }
  }
  return json({resultados});
 }
 if(['consultar','reconciliar'].includes(body.acao)){
  const resultados:any[]=[];for(const d of todos??[]){
   if(!d.externo_id&&!['incerto','em_envio'].includes(d.estado))continue;
   try{const api=provider(d.ambiente);const p=d.externo_id?await api.detalhar(d.externo_id):(await api.reconciliar(d.id,(d.tentado_em??new Date().toISOString()).slice(0,10))).documento;
    if(!p){resultados.push({id:d.id,estado:d.estado,mensagem:'Documento não localizado na consulta paginada. A listagem tem cache; ausência não confirma que não houve criação. Envio continua bloqueado.'});continue;}
    resultados.push(await persistir(admin,d,p));
   }catch{resultados.push({id:d.id,estado:d.estado,mensagem:'Consulta indisponível; o estado anterior foi preservado. Nenhum documento foi recriado.'});}
  }return json({resultados});
 }
 return json({error:'Ação não suportada'},400);
 }catch(e){return json({error:(e as Error).message||'Falha na integração; nenhuma confirmação deve ser presumida'},409);}
});
