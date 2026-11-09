export type StatusManu='concluido'|'pendente'|'urgente'|'em_andamento'|'nao_verificado';
export interface DocumentoManu {tipo:string;agente:string;referencia:string;status:StatusManu;fonte:string;periodo?:string;secoes:{titulo:string;texto:string}[];objetivo?:string;missao_id?:string;item_id?:string;item_tipo?:string;item_versao?:number;item_status?:string}
export const STATUS_MANU={concluido:'🟢 Concluído',pendente:'🟡 Pendente',urgente:'🔴 Urgente',em_andamento:'🔵 Em andamento',nao_verificado:'⚪ Não verificado'};
export const PADRAO_ENTREGAS_MANU='PADRÃO MANU: linguagem profissional, acolhedora e direta. Entregue material utilizável, não apenas promessa. Identifique período e fonte; separe fatos confirmados, estimativas e informações não verificadas. Relatórios operacionais: resumo executivo, detalhamento, pendências, prioridades, responsáveis e providências recomendadas. Financeiro: separar recebidos, previstos, vencidos e despesas, sem somar categorias sobrepostas. Jurídico: separar prazo identificado de prazo efetivamente conferido no sistema, indicar fonte e revisão humana; não calcular prazos. Se pedir roteiro para gravar, incluir tema, objetivo, público, duração, gancho com frase pronta, TEXTO INTEGRAL FALADO diante da câmera, CTA, orientações de gravação e legenda pronta. Nunca só tópicos, salvo pedido expresso. Sem promessas de resultado, sensacionalismo ou captação indevida. Não afirmar aprovação ou execução sem confirmação do sistema.';
export const esc=(s:unknown)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const informado=(s:unknown)=>typeof s==='string'&&s.trim()?s.trim():'⚪ Não informado; conferir antes de usar.';
const data=(s:string)=>Number.isFinite(Date.parse(s))?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Cuiaba',dateStyle:'short',timeStyle:'short'}):'⚪ Data não informada';
export function modeloTexto(texto:string,meta:Partial<DocumentoManu>={}):DocumentoManu{
 return {tipo:'Atendimento',agente:'Manu',referencia:new Date().toISOString(),status:'nao_verificado',fonte:'Conversa com a diretoria',secoes:[{titulo:'Mensagem',texto}],...meta};
}
export function modeloRoteiro(j:Record<string,unknown>,meta:Partial<DocumentoManu>={}):DocumentoManu{
 return modeloTexto('',{tipo:'🎬 Roteiro para gravação',agente:'Camila · via Manu',status:'pendente',fonte:'Rascunho registrado no Marketing JAS; conteúdo jurídico sujeito à revisão',...meta,secoes:[
  {titulo:'1. Tema, objetivo, público e duração',texto:`Tema: ${informado(j.titulo??j.tema)}\nObjetivo: ${informado(j.objetivo)}\nPúblico: ${informado(j.publico)}\nDuração prevista (estimativa): ${informado(j.duracao)}`},
  {titulo:'2. Gancho inicial — frase pronta',texto:informado(j.gancho)},
  {titulo:'3. Texto integral para falar à câmera',texto:informado(j.texto_falado)},
  {titulo:'4. Encerramento e CTA',texto:informado(j.cta)},
  {titulo:'5. Orientações de gravação',texto:informado(j.orientacoes_gravacao??j.brief_visual)},
  {titulo:'6. Legenda pronta',texto:informado(j.legenda)},
  {titulo:'Conferência e aprovação',texto:informado(j.revisao_necessaria)+'\nA aprovação da pauta não autoriza a publicação do material final.'}
 ]});
}
export function modeloOperacional(j:Record<string,unknown>,meta:Partial<DocumentoManu>={}):DocumentoManu{
 return modeloTexto('',{tipo:'📊 Relatório gerencial',status:'concluido',fonte:'Contagens atuais do banco JAS',referencia:String(j.apurado_em??''),periodo:`Dia de referência: ${String(j.dia??'não informado')}; execuções: últimas 24 horas`,...meta,secoes:[
  {titulo:'Resumo executivo',texto:`Leads comerciais: ${contagem(j.leads_total)}. Pautas para aprovação: ${contagem(j.pautas_aprovacao)}. Tarefas abertas: ${contagem(j.tarefas_abertas)}.`},
  {titulo:'Dados confirmados — CRM e Marketing',texto:`Leads hoje: ${contagem(j.leads_hoje)}\nLeads sem responsável: ${contagem(j.leads_sem_responsavel)}\nPeças para aprovação: ${contagem(j.posts_aprovacao)}\nPautas: ${contagem(j.pautas_aprovacao)}\nAnúncios propostos: ${contagem(j.anuncios_aprovacao)}\nPedidos no motor: ${contagem(j.aprovacoes_motor)}\nLeads marcados como teste estão excluídos dos totais comerciais.`},
  {titulo:'Controladoria',texto:`Abertas: ${contagem(j.tarefas_abertas)}\nCom data cadastrada vencida: ${contagem(j.tarefas_vencidas)}\nSem responsável: ${contagem(j.tarefas_sem_responsavel)}\nEsta comparação não calcula nem confirma prazo jurídico.`},
  {titulo:'Motor e entregas',texto:`Na fila: ${contagem(j.fila_pendente)}\nEm execução: ${contagem(j.fila_executando)}\nConcluídas nas últimas 24h: ${contagem(j.entregas24h)}\nFalhas finais nas últimas 24h: ${contagem(j.fila_falhas)}\nFalhas de agenda: ${contagem(j.agenda_falhas)}\nAgentes com executor: ${contagem(j.agentes_operacionais)}\nPerfis sem executor: ${contagem(j.modelos_sem_executor)}`},
  {titulo:'Responsáveis — até 10 grupos de tarefas abertas',texto:Array.isArray(j.responsaveis_tarefas)?j.responsaveis_tarefas.map((r:{nome?:string;quantidade?:number})=>`${r.nome??'⚪ Não informado'}: ${contagem(r.quantidade)}`).join('\n'):'⚪ Responsáveis não informados neste levantamento; consultar o JAS.'},
  {titulo:'Pendências, prioridades e providências',texto:'Revisar aprovações e as tarefas com data vencida ou sem responsável. Conferir falhas antes de repetir uma execução. Este resumo não redistribui tarefas nem altera conclusões.'},
  {titulo:'Estimativas e informações não verificadas',texto:'Nenhuma estimativa foi usada nas contagens. Revisões jurídicas e resultados comerciais não são comprovados por este relatório.'}
 ]});
}
export const contagem=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n.toLocaleString('pt-BR'):'⚪ Não disponível';
export function modeloCategoria(tipo:'agenda'|'controladoria'|'financeiro'|'marketing'|'tarefas'|'alertas'|'juridico'|'gerencial'|'legenda',j:Record<string,unknown>,meta:Partial<DocumentoManu>={}):DocumentoManu{
 const campos=tipo==='financeiro'?['resumo_executivo','recebidos','previstos','vencidos','despesas','pendencias','providencias']:tipo==='juridico'?['resumo_executivo','prazos_identificados','prazos_conferidos','fonte','revisao_humana','providencias']:tipo==='legenda'?['legenda','revisao_necessaria']:['resumo_executivo','detalhamento','pendencias','prioridades','responsaveis','providencias'];
 return modeloTexto('',{tipo:tipo[0].toUpperCase()+tipo.slice(1),status:'pendente',fonte:informado(j.fonte),periodo:informado(j.periodo),...meta,secoes:campos.map(k=>({titulo:k.replace(/_/g,' '),texto:k==='prazos_conferidos'&&j.confirmacao_sistema!==true?'⚪ Conferência não confirmada pelo sistema; exige revisão humana.':informado(j[k])}))});
}
// Cada trecho é escapado antes do limite: nunca corta entidade HTML ou par Unicode.
function trechos(texto:string,max:number){const partes:string[]=[];let atual='';for(const c of texto){const t=esc(c);if(atual.length+t.length>max){partes.push(atual);atual='';}atual+=t;}if(atual)partes.push(atual);return partes;}
export function formatarDocumento(d:DocumentoManu):string[]{
 const cab=`<b>${esc(d.tipo)}</b>\n<b>Agente responsável:</b> ${esc(d.agente)}\n<b>Referência:</b> ${esc(data(d.referencia))} · Cuiabá\n<b>Status:</b> ${STATUS_MANU[d.status]??STATUS_MANU.nao_verificado}\n<b>Fonte:</b> ${esc(d.fonte)}${d.periodo?`\n<b>Período:</b> ${esc(d.periodo)}`:''}\n────────`;
 if(cab.length>1600)throw Error('cabecalho_longo');
 const paginas:string[]=[];let atual=cab;
 for(const secao of d.secoes){
  const titulo=esc(secao.titulo.slice(0,120));const prefixo=`\n\n<b>${titulo}</b>\n`;
  for(const texto of trechos(secao.texto,Math.min(2800,3800-cab.length-prefixo.length))){
   if(atual.length+prefixo.length+texto.length>3800){paginas.push(atual);atual=cab;}
   atual+=prefixo+texto;
  }
 }
 paginas.push(atual);return paginas.map((p,i)=>p+`\n\n<i>${paginas.length>1?`Parte ${i+1}/${paginas.length} · `:''}Manu | Escritório Inteligente JAS</i>`);
}
