import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {pedidoInterpretacao,validarDecisao,consultaDireta,textoAndamento,type AgenteTelegram,type DecisaoTelegram} from './inteligencia.ts';
import {validarAudio,caminhoAudio,lerAudioLimitado} from './audio.ts';
import {enviarResumos} from './resumos.ts';
import {dadosBotao,textoAprovacao,type Aprovacao} from './mensagens.ts';
interface Entrada {id:string;reserva:string;usuario_id:string;chat_id:number;tipo:string;texto:string;audio:ReturnType<typeof validarAudio>|null}
interface Dependencias {telegram:(metodo:string,corpo:Record<string,unknown>)=>Promise<unknown>;key:()=>string;token:()=>string;fetcher?:typeof fetch;aprovacoes?:(usuario:string)=>Promise<Aprovacao[]>}
async function reservar(db:SupabaseClient,e:Entrada,agente:string,modelo:string,entrada:number,saida:number,rodada:number){
 const r=await db.rpc('ia_reservar',{_id:e.id,_rodada:rodada,_agente:agente,_tarefa:null,_modelo:modelo,_entrada:entrada,_saida_max:saida});
 if(r.error||r.data?.ok!==true)throw Error('orcamento_indisponivel');
}
async function confirmar(db:SupabaseClient,e:Entrada,entrada:number,saida:number,rodada:number){
 const r=await db.rpc('ia_confirmar',{_id:e.id,_rodada:rodada,_entrada:entrada,_saida:saida});if(r.error||r.data!==true)throw Error('consumo_nao_confirmado');
}
export async function interpretarPedido(db:SupabaseClient,e:Entrada,agentes:AgenteTelegram[],dialogo:unknown[],modelo:string,key:string,fetcher=fetch):Promise<DecisaoTelegram>{
 const gestora=agentes.find(a=>a.nome==='Manu')??agentes[0];if(!gestora||!key)throw Error('ia_indisponivel');
 const payload=pedidoInterpretacao(e.texto,{agentes,dialogo},modelo);
 const init={method:'POST',redirect:'error' as const,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000)};
 const count=await fetcher('https://api.openai.com/v1/responses/input_tokens',{...init,body:JSON.stringify(payload)});
 if(!count.ok)throw Error('contagem_indisponivel');const {input_tokens}=await count.json();if(!Number.isSafeInteger(input_tokens)||input_tokens<0)throw Error('contagem_invalida');
 await reservar(db,e,gestora.id,modelo,input_tokens,1400,1);
 const r=await fetcher('https://api.openai.com/v1/responses',{...init,body:JSON.stringify({...payload,store:false,max_output_tokens:1400})});
 if(!r.ok)throw Error('ia_indisponivel');const ai=await r.json();
 const entrada=ai.usage?.input_tokens,saida=ai.usage?.output_tokens;
 if(![entrada,saida].every(v=>Number.isSafeInteger(v)&&v>=0))throw Error('consumo_nao_confirmado');
 await confirmar(db,e,entrada,saida,1);
 const texto=(ai.output??[]).flatMap((o:{content?:{type:string;text?:string}[]})=>o.content??[]).filter((c:{type:string})=>c.type==='output_text').map((c:{text:string})=>c.text).join('\n');
 return validarDecisao(JSON.parse(texto),agentes);
}
export async function transcreverPedido(db:SupabaseClient,e:Entrada,agente:string,deps:Dependencias){
 const audio=validarAudio(e.audio??{});const fetcher=deps.fetcher??fetch;const key=deps.key();if(!key)throw Error('ia_indisponivel');
 const info=await deps.telegram('getFile',{file_id:audio.file_id}) as {file_path?:unknown};const path=caminhoAudio(info.file_path);
 let resposta:Response;try{resposta=await fetcher(`https://api.telegram.org/file/bot${deps.token()}/${path}`,{redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('audio_download');}
 const bytes=await lerAudioLimitado(resposta);
 await reservar(db,e,agente,'whisper-1',audio.duration+10,1,0);
 const form=new FormData();form.append('model','whisper-1');form.append('language','pt');form.append('response_format','verbose_json');form.append('file',new Blob([bytes as BlobPart],{type:path.endsWith('.oga')||path.endsWith('.ogg')?'audio/ogg':'application/octet-stream'}),path.split('/').pop()!.replace(/\.oga$/i,'.ogg'));
 const r=await fetcher('https://api.openai.com/v1/audio/transcriptions',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('audio_transcricao');const d=await r.json();
 if(!Number.isFinite(d.duration)||d.duration<=0)throw Error('audio_duracao');
 await confirmar(db,e,Math.ceil(d.duration),0,0);
 if(typeof d.text!=='string'||d.text.trim().length<2||d.text.length>12000)throw Error('audio_sem_texto');
 return d.text.trim();
}
export async function processarPedidos(db:SupabaseClient,deps:Dependencias){
 let processados=0;const inicio=Date.now();
 for(let i=0;i<3&&Date.now()-inicio<100000;i++){
  const fila=await db.rpc('telegram_reservar_pedido');if(fila.error)throw Error('fila_indisponivel');if(!fila.data)break;
  const e=fila.data as Entrada;
  let registrado=false;let resumoId:string|null=null;let aprovacoes:Aprovacao[]=[];
  try{
   const ctx=await db.rpc('telegram_contexto_pedido',{_id:e.id,_reserva:e.reserva});if(ctx.error)throw Error('vinculo_inativo');
   const agentes=ctx.data.agentes as AgenteTelegram[];const gestora=agentes.find(a=>a.nome==='Manu')??agentes[0];
   if(!gestora)throw Error('equipe_indisponivel');
   if(e.tipo==='audio')e.texto=await transcreverPedido(db,e,gestora.id,deps);
   let tipo=consultaDireta(e.texto);let decisao:DecisaoTelegram|null=null;
   if(!tipo){
    const cfg=await db.from('assistente_config').select('modelo,habilitado').single();if(cfg.error||!cfg.data?.habilitado)throw Error('ia_indisponivel');
    decisao=await interpretarPedido(db,e,agentes,ctx.data.dialogo??[],cfg.data.modelo,deps.key(),deps.fetcher??fetch);
    if(decisao.tipo==='resumo'||decisao.tipo==='andamento'||decisao.tipo==='aprovacoes')tipo=decisao.tipo;
   }
   let resposta=decisao?.resposta??'';
   if(tipo==='andamento'){const r=await db.rpc('telegram_andamento',{_chat:e.chat_id});if(r.error)throw Error('consulta_indisponivel');resposta=textoAndamento(r.data);}
   if(tipo==='resumo'){
    const r=await db.rpc('operacao24h_pedir_resumo',{_usuario:e.usuario_id});if(r.error)throw Error('consulta_indisponivel');
    resumoId=r.data;
    // A fila de resumos possui sua própria reserva e confirmação; não enviar uma cópia.
    resposta='Solicitei seu resumo atualizado. Ele será entregue por este Telegram, com confirmação registrada no JAS.';
   }
   if(tipo==='aprovacoes'){
    if(!deps.aprovacoes)throw Error('consulta_indisponivel');
    aprovacoes=(await deps.aprovacoes(e.usuario_id)).slice(0,10);
    resposta=aprovacoes.length?`${aprovacoes.length} pedido(s) aguardando sua decisão. Use os botões do pedido para aprovar ou recusar.`:'Nenhum pedido de ação aguardando sua aprovação no motor.';
   }
   const plano=decisao&&['missao','marketing'].includes(decisao.tipo)?decisao:null;
   const r=await db.rpc('telegram_concluir_pedido',{_id:e.id,_reserva:e.reserva,_texto:e.texto,_plano:plano,_resposta:resposta,_erro:false});
   if(r.error)throw Error('registro_indisponivel');
   registrado=true;
   const valido=await db.rpc('telegram_usuario',{_chat:e.chat_id});if(valido.data!==e.usuario_id)continue;
   if(resumoId){await enviarResumos(db,async(chat,texto)=>deps.telegram('sendMessage',{chat_id:chat,text:texto}) as Promise<{message_id?:number}>,resumoId);processados++;continue;}
   const audio=e.tipo==='audio'?`Entendi do áudio: ${e.texto.slice(0,300)}\n\n`:'';
   const mensagem=await deps.telegram('sendMessage',{chat_id:e.chat_id,text:(audio+r.data.resposta).slice(0,3900)}) as {message_id?:number};
   if(Number.isSafeInteger(mensagem.message_id))await db.rpc('telegram_confirmar_resposta',{_id:e.id,_reserva:e.reserva,_mensagem:mensagem.message_id});
   for(const a of aprovacoes){
    const ativo=await db.rpc('telegram_usuario',{_chat:e.chat_id});if(ativo.data!==e.usuario_id)break;
    await deps.telegram('sendMessage',{chat_id:e.chat_id,text:textoAprovacao(a),reply_markup:{inline_keyboard:[[{text:'✅ Aprovar e executar',callback_data:dadosBotao(a.id,true)},{text:'✖️ Recusar',callback_data:dadosBotao(a.id,false)}]]}});
   }
   processados++;
  }catch(erro){
   if(registrado){console.error('telegram_resposta_sem_confirmacao');continue;}
   const codigo=erro instanceof Error&&/^[a-z_]{3,80}$/.test(erro.message)?erro.message:'processamento_nao_confirmado';
   const texto=codigo==='orcamento_indisponivel'?'O limite de IA foi atingido. Seu pedido não foi encaminhado. O orçamento pode ser consultado na Sala da Gestora.':codigo==='audio_limite'?'Envie um áudio de até 3 minutos e 5 MB, ou escreva o pedido.':'Não consegui confirmar o processamento deste pedido. Consulte /andamento antes de reenviar; uma missão já registrada não será apagada.';
   await db.rpc('telegram_concluir_pedido',{_id:e.id,_reserva:e.reserva,_texto:e.texto,_plano:null,_resposta:texto,_erro:true});
   const valido=await db.rpc('telegram_usuario',{_chat:e.chat_id});if(valido.data===e.usuario_id)await deps.telegram('sendMessage',{chat_id:e.chat_id,text:texto}).catch(()=>{});
  }
 }
 return {processados};
}
