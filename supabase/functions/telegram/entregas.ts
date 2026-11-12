import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {FalhaTelegram} from './resumos.ts';
import {formatarDocumento,modeloTexto,modeloRoteiro,modeloOperacional,modeloCategoria,type DocumentoManu} from './modelos.ts';
type Telegram=(metodo:string,corpo:Record<string,unknown>)=>Promise<{message_id?:number}>;
export interface MetaEntrega {documento?:DocumentoManu;chave?:string;tipo?:string;status?:DocumentoManu['status'];agente?:string;missao_id?:string;envio_id?:string;dados?:Record<string,unknown>}
export async function documentoMissao(db:SupabaseClient,chat:number,missao:string):Promise<DocumentoManu>{
 const r=await db.rpc('telegram_manu_missao',{_chat:chat,_missao:missao});if(r.error)throw Error('entrega_indisponivel');const d=r.data;
 const consultas=Array.isArray(d.resultado?.ferramentas)?d.resultado.ferramentas as string[]:[];
 const meta:Partial<DocumentoManu>={agente:`${d.agente??'Equipe'} · via Manu`,referencia:d.referencia??'',status:d.estado==='falhou'?'urgente':d.item?'pendente':'nao_verificado',fonte:consultas.length?'Consultas registradas no JAS; disponibilidade e evidências descritas na entrega':'Pedido da diretoria e análise de IA; sem consulta externa confirmada',objetivo:d.objetivo,missao_id:missao,item_id:d.item?.id,item_tipo:d.item?.tipo,item_versao:d.item?.versao,item_status:d.item?.status};
 let j:Record<string,unknown>|null=null;try{j=JSON.parse(String(d.resultado?.entrega??''));}catch{/* texto preservado integralmente */}
 if(j&&typeof j==='object'&&('roteiro' in j||'texto_falado' in j))return modeloRoteiro(j,{...meta,objetivo:`Prepare nova versão de roteiro para gravação sobre ${String(j.titulo??d.titulo)}, mantendo tema, público e finalidade: ${String(j.objetivo??d.objetivo)}. Sem publicar.`});
 if(j&&typeof j==='object')return modeloCategoria(/financeir/i.test(d.titulo)?'financeiro':/jur[ií]dic|prazo|process/i.test(d.titulo)?'juridico':'gerencial',{...j,confirmacao_sistema:false},meta);
 return modeloTexto(String(d.resultado?.entrega??'Nenhuma entrega textual foi confirmada nesta missão.'),{...meta,tipo:d.sala==='marketing'?'📣 Marketing':/financeir/i.test(d.titulo)?'💰 Relatório financeiro':/jur[ií]dic|prazo|process/i.test(d.titulo)?'⚖️ Análise jurídica':'📋 Entrega operacional',secoes:[{titulo:'Resumo executivo',texto:String(d.resultado?.resumo??d.titulo)},{titulo:'Entrega detalhada',texto:String(d.resultado?.entrega??'⚪ Entrega não confirmada.')},{titulo:'Pendências e providências',texto:Array.isArray(d.resultado?.pendencias)?d.resultado.pendencias.join('\n')||'Revisar a análise e as fontes antes de executar ações.':'Conferir informações e responsáveis no JAS.'}]});
}
function botoes(id:string,d:DocumentoManu){
 const linhas:Record<string,unknown>[][]=[[{text:'Consultar detalhes',callback_data:`en:${id}:d`}]];
 if(d.objetivo){linhas.push([{text:'Solicitar ajustes',callback_data:`en:${id}:j`},{text:'Gerar nova versão',callback_data:`en:${id}:n`}]);}
 if(d.item_id&&d.item_tipo==='pauta'&&d.item_status==='aguardando_aprovacao')linhas.unshift([{text:'Aprovar pauta',callback_data:`en:${id}:p`}]);
 else if(d.missao_id)linhas.push([{text:'Abrir no JAS',url:'https://app.julianaaraujoadvocacia.com/escritorio/missoes'}]);
 return {inline_keyboard:linhas};
}
export async function enviarDocumento(db:SupabaseClient,api:Telegram,chat:number,d:DocumentoManu,chave:string,markup?:unknown){
 const r=await db.rpc('telegram_manu_registrar',{_chat:chat,_chave:chave,_documento:d});if(r.error||!r.data)throw new FalhaTelegram('entrega_nao_registrada');
 const id=r.data as string;const paginas=formatarDocumento(d);let ultima:number|undefined;
 for(let i=0;i<paginas.length;i++){
  const p=await db.rpc('telegram_manu_parte',{_entrega:id,_numero:i});if(p.error)throw new FalhaTelegram('entrega_reserva_incerta',true);
  if(p.data?.estado==='enviada'){ultima=Number(p.data.mensagem_id);continue;}
  if(p.data?.estado!=='reservada')throw new FalhaTelegram('entrega_ja_reservada',true);
  const confirmar=(estado:string,mensagem:number|null=null)=>db.rpc('telegram_manu_parte',{_entrega:id,_numero:i,_estado:estado,_reserva:p.data.reserva,_mensagem:mensagem});
  let m:{message_id?:number};
  try{m=await api('sendMessage',{chat_id:chat,text:paginas[i],parse_mode:'HTML',link_preview_options:{is_disabled:true},...(i===paginas.length-1?{reply_markup:markup??botoes(id,d)}:{})});}
  catch(e){const f=e instanceof FalhaTelegram?e:new FalhaTelegram('telegram_transporte_incerto',true);await confirmar(f.incerto?'incerta':f.retryAfter?'pendente':'falhou');throw f;}
  if(!Number.isSafeInteger(m.message_id)||Number(m.message_id)<=0){await confirmar('incerta');throw new FalhaTelegram('entrega_sem_confirmacao',true);}
  const c=await confirmar('enviada',m.message_id!);if(c.error)throw new FalhaTelegram('entrega_confirmacao_incerta',true);ultima=m.message_id;
 }
 return {message_id:ultima};
}
export async function enviarManu(db:SupabaseClient,api:Telegram,metodo:string,corpo:Record<string,unknown>){
 if(metodo!=='sendMessage')return api(metodo,corpo);
 const meta=(corpo._jas??{}) as MetaEntrega;const chat=Number(corpo.chat_id);
 let d=meta.documento??modeloTexto(String(corpo.text??''),{...(meta.tipo?{tipo:meta.tipo}:{}),...(meta.status?{status:meta.status}:{}),...(meta.agente?{agente:meta.agente}: {})});
 if(meta.envio_id&&meta.dados){
  if(meta.tipo==='missao'&&typeof meta.dados.missao_id==='string')d=await documentoMissao(db,chat,meta.dados.missao_id);
  else if(meta.tipo!=='missao')d=modeloOperacional(meta.dados,{tipo:meta.tipo==='alerta'?'🚨 Alerta operacional':'📊 Relatório gerencial',status:meta.tipo==='alerta'?'urgente':'concluido'});
 }
 return enviarDocumento(db,api,chat,d,meta.chave??(meta.envio_id?`envio:${meta.envio_id}`:crypto.randomUUID()),corpo.reply_markup);
}
