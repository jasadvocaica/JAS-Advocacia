import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import type { ClienteZernio } from '../_shared/zernio.ts';
import {obj,prepararAnuncio,criarPausado,validarLista} from '../_shared/marketing-anuncios.ts';
import {consultarMetaSelecionada} from '../_shared/marketing-formularios.ts';
export async function anuncios(db:SupabaseClient,api:ClienteZernio,usuario:string,b:Record<string,unknown>){
 const painel=await db.rpc('zernio_painel',{_aba:'visao',_dias:30});if(painel.error)throw Error('Conexão indisponível');
 const selecionadas=(painel.data?.contas??[]).filter((c:Record<string,unknown>)=>c.plataforma==='metaads'&&c.ativa===true&&c.selecionada===true&&c.precisa_reconectar!==true);
 const meta=await consultarMetaSelecionada(selecionadas,(p,q)=>api.get(p,q).then(r=>r.dados));
 // Este executor só admite operações novas, pausadas e confirmadas individualmente.
 const habilitado=true;
 if(b.acao==='ads_contexto')return {...meta,escrita_habilitada:habilitado};
 const c=meta.contas.find(c=>c.id===b.conta_id);const conta=c?.anuncios.find(a=>a.id===b.ad_conta_id);
 if(!c||!conta||!c.pagina)throw Error('Escolha a conta de anúncios e a Página conectadas.');
 const contas=await api.get<Record<string,unknown>>('/v1/ads/accounts',{accountId:c.id,inScopeOnly:true});const real=(Array.isArray(contas.dados.accounts)?contas.dados.accounts:[]).map(obj).find(a=>a.id===conta.id);
 if(real?.currency!=='BRL')throw Error('A moeda BRL da conta precisa ser confirmada antes de enviar.');
 const acao=String(b.tipo??'');if(!['validar','criar_pausada','lista','semelhante'].includes(acao))throw Error('Ação de anúncios inválida');
 if(b.confirmado!==true)throw Error('Revise e confirme a operação específica.');
 if(acao!=='validar'&&!habilitado)throw Error('Envio real ainda bloqueado na configuração da integração. A validação e os rascunhos continuam disponíveis.');
 let users:Record<string,string>[]=[];
 if(acao==='lista')users=validarLista(b.origem,b.nao_sensivel,b.autorizada,b.users);
 if(['lista','semelhante'].includes(acao)&&(!/^[\p{L}\p{N} |._-]{3,100}$/u.test(String(b.nome))||/autis|bpc|defici|doen[cç]|sa[uú]de|relig|pol[ií]tic|racial|sexual|criminal|crian[cç]/i.test(String(b.nome)+' '+String(b.origem??''))))throw Error('Nome ou origem de público não permitido.');
 if(acao==='semelhante'&&(b.nao_sensivel!==true||b.autorizada!==true||!/^\d+$/.test(String(b.fonte_id))||!Number.isFinite(Number(b.razao))||Number(b.razao)<.01||Number(b.razao)>.2))throw Error('Revise a origem não sensível e o tamanho do semelhante.');
 if(!/^[0-9a-f-]{36}$/i.test(String(b.chave??'')))throw Error('Identificador do pedido inválido.');
 const chave=['validar','criar_pausada'].includes(acao)?`ads:${usuario}:${b.plano_id}:${b.versao}:${c.id}:${conta.id}:${acao}`:`aud:${usuario}:${b.chave}`;
 const reserva=await db.rpc('mkt_ads_reservar',{_usuario:usuario,_plano:b.plano_id??null,_versao:b.versao??null,_acao:acao,_chave:chave});if(reserva.error)throw Error(reserva.error.message);
 const id=reserva.data.id;let enviado=false;let parcial:Record<string,unknown>={};
 try{
  let resultado:Record<string,unknown>;
  if(['validar','criar_pausada'].includes(acao)){
   const corpo=prepararAnuncio(obj(reserva.data.dados),c.id,conta.id,c.pagina.id,acao==='validar');
   if(corpo.leadGenFormId&&!c.formularios.some(f=>f.id===corpo.leadGenFormId))throw Error('Formulário não pertence à Página selecionada.');
   enviado=true;resultado=await criarPausado(api,corpo,chave);
  }else if(acao==='lista'){
   enviado=true;const r=await api.post<Record<string,unknown>>('/v1/ads/audiences',{accountId:c.id,adAccountId:conta.id,type:'customer_list',name:b.nome,customerFileSource:'USER_PROVIDED_ONLY'},chave);const a=obj(r.dados.audience);
   if(typeof a.id!=='string'||typeof a.platformAudienceId!=='string')throw Error('audiencia_sem_confirmacao');
   parcial={audiencia_id:a.id,fonte_id:a.platformAudienceId};
   // Só os IDs e contagens entram no histórico; nenhum contato é persistido ou enviado à IA.
   const envio=await api.post<Record<string,unknown>>('/v1/ads/audiences/'+encodeURIComponent(a.id)+'/users',{users},chave+':users');
   resultado={audiencia_id:a.id,fonte_id:a.platformAudienceId,recebidos:envio.dados.numReceived,invalidos:envio.dados.numInvalid,tipo:'customer_list'};
  }else{
   const fonte=await api.get<Record<string,unknown>>('/v1/ads/audiences',{accountId:c.id,adAccountId:conta.id});
   const aa=Array.isArray(fonte.dados.audiences)?fonte.dados.audiences.map(obj):[];
   if(!aa.some(a=>a.platformAudienceId===b.fonte_id&&Number(a.size)>=100))throw Error('A origem deve pertencer à conta e ter pelo menos 100 correspondências confirmadas.');
   enviado=true;const r=await api.post<Record<string,unknown>>('/v1/ads/audiences',{accountId:c.id,adAccountId:conta.id,type:'lookalike',name:b.nome,sourceAudienceId:b.fonte_id,country:'BR',ratio:Number(b.razao)},chave);const a=obj(r.dados.audience);if(typeof a.id!=='string')throw Error('audiencia_sem_confirmacao');resultado={audiencia_id:a.id,fonte_id:a.platformAudienceId,tipo:'lookalike'};
  }
  const gravar=await db.rpc('mkt_ads_finalizar',{_id:id,_estado:'confirmada',_resultado:{...resultado,conta_id:conta.id,pagina_id:c.pagina.id}});if(gravar.error||gravar.data!==true)throw Error('gravacao_sem_confirmacao');return {ok:true,...resultado};
 }catch(erro){
  const ids=obj(obj(erro).ids);for(const k of ['ad_id','campanha_id','conjunto_id','anuncio_id'])if(typeof ids[k]==='string'&&/^[a-z0-9_-]{1,100}$/i.test(ids[k] as string))parcial[k]=ids[k];
  await db.rpc('mkt_ads_finalizar',{_id:id,_estado:enviado?'incerta':'falhou',_resultado:{...parcial,conta_id:conta.id,pagina_id:c.pagina.id,codigo:enviado?'Confira a Meta antes de repetir; o resultado externo não foi confirmado.':'Plano incompleto ou origem indisponível; revise antes de enviar.'}});
  throw Error(enviado?'Não houve confirmação completa. Consulte o histórico e o Gerenciador antes de repetir.':'Complete os campos e confira a origem antes de enviar.');
 }
}
