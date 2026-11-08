import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
export class FalhaTelegram extends Error {
 constructor(public codigo:string,public incerto=false,public retryAfter?:number){super(codigo);}
}
const numero=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v.toLocaleString('pt-BR'):'indisponível';
export function textoResumoOperacao(d:Record<string,unknown>,tipo='programado'){
 const quando=typeof d.apurado_em==='string'&&Number.isFinite(Date.parse(d.apurado_em))?new Date(d.apurado_em).toLocaleString('pt-BR',{timeZone:'America/Cuiaba',dateStyle:'short',timeStyle:'short'}):'horário indisponível';
 return [tipo==='alerta'?'JAS · Alerta operacional':'JAS · Resumo automático',`Atualizado em ${quando} · Cuiabá`,'',
  `CRM: ${numero(d.leads_total)} leads comerciais; ${numero(d.leads_hoje)} cadastros hoje.`,
  `Leads sem responsável: ${numero(d.leads_sem_responsavel)}.`,
  '',`Aguardando aprovação: ${numero(d.posts_aprovacao)} peças, ${numero(d.pautas_aprovacao)} pautas e ${numero(d.anuncios_aprovacao)} anúncios propostos.`,
  `Pedidos do motor: ${numero(d.aprovacoes_motor)}.`,
  '',`Controladoria: ${numero(d.tarefas_abertas)} tarefas abertas; ${numero(d.tarefas_vencidas)} com data cadastrada vencida; ${numero(d.tarefas_sem_responsavel)} sem responsável.`,
  '',`Fila do motor: ${numero(d.fila_pendente)} tarefas pendentes, ${numero(d.fila_executando)} em execução e ${numero(d.entregas24h)} concluídas nas últimas 24h.`,
  `Agentes com executor: ${numero(d.agentes_operacionais)}. Perfis sem executor: ${numero(d.modelos_sem_executor)}.`,
  `Falhas finais nas últimas 24h: ${numero(d.fila_falhas)}. Falhas na fila de agenda: ${numero(d.agenda_falhas)}.`,
  `Motor: ${d.motor_ligado===true?'ligado':d.motor_ligado===false?'pausado':'indisponível'}. Pulso: ${d.cron_ativo===true&&d.pulso_atrasado===false?'regular':d.pulso_atrasado===true?'atrasado':'verificar'}.`,
  '', 'Aprovações: https://app.julianaaraujoadvocacia.com/marketing?secao=aprovacoes',
  'Controladoria: https://app.julianaaraujoadvocacia.com/controladoria',
  'Use /resumo para consultar novamente. Dados de teste ficam fora dos totais de leads.'
 ].join('\n').slice(0,3900);
}
export async function enviarResumos(db:SupabaseClient,enviar:(chat:number,texto:string)=>Promise<{message_id?:number}>,id?:string){
 const fila=await db.rpc('operacao24h_reservar_envios',{_id:id??null,_limite:5});
 if(fila.error)throw new FalhaTelegram('resumo_fila_indisponivel');
 let enviados=0,falhas=0,incertos=0;
 for(const e of fila.data??[]){
  const validacao=await db.rpc('operacao24h_validar_envio',{_id:e.id,_reserva:e.reserva});
  const confirmar=async(estado:string,extra:Record<string,unknown>={})=>db.rpc('operacao24h_confirmar_envio',{_id:e.id,_reserva:e.reserva,_estado:estado,...extra});
  if(validacao.error||validacao.data!==true){await confirmar('falhou',{_erro:'destino_inativo'});falhas++;continue;}
  let mensagem:{message_id?:number};
  try{mensagem=await enviar(e.chat_id,textoResumoOperacao(e.dados,e.tipo));}
  catch(erro){
   const f=erro instanceof FalhaTelegram?erro:new FalhaTelegram('telegram_transporte_incerto',true);
   const estado=f.incerto?'incerto':f.retryAfter?'pendente':'falhou';
   await confirmar(estado,{_erro:f.codigo,_retry_after:f.retryAfter??null});
   if(f.incerto)incertos++;else falhas++;continue;
  }
  if(!Number.isSafeInteger(mensagem.message_id)||Number(mensagem.message_id)<=0){await confirmar('incerto',{_erro:'telegram_sem_confirmacao'});incertos++;continue;}
  const r=await confirmar('enviado',{_mensagem:mensagem.message_id});
  if(r.error||r.data!==true){incertos++;continue;}
  enviados++;
 }
 return {enviados,falhas,incertos};
}
