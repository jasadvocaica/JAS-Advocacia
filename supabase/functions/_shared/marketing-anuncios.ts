// Contrato explícito de criação pausada; nenhuma função deste módulo ativa anúncios.
import type { ClienteZernio } from './zernio.ts';
export const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const https=(v:unknown)=>{try{const u=new URL(str(v));return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(u.hostname);}catch{return false;}};
export function prepararAnuncio(d:Record<string,unknown>,conta:string,adConta:string,pagina:string,validar:boolean){
 const ausentes=['nome','titulo','texto','criativo','publico','inicio','fim'].filter(k=>!str(d[k]));
 if(ausentes.length)throw Error('Complete nome, título, texto, criativo, público e período.');
 const diario=d.tipo_orcamento==='diario';
 if(d.tipo_orcamento!=null&&!['total','diario'].includes(str(d.tipo_orcamento)))throw Error('Tipo de orçamento inválido.');
 const verba=Number(d.orcamento),min=Number(d.idade_min),max=Number(d.idade_max);
 if(!Number.isFinite(verba)||verba<=0||verba>100000||!Number.isInteger(min)||min<18||!Number.isInteger(max)||max<min||max>65)throw Error('Confira o orçamento total e a faixa etária (18 a 65).');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(str(d.inicio))||!/^\d{4}-\d{2}-\d{2}$/.test(str(d.fim))||!Number.isFinite(Date.parse(str(d.inicio)))||str(d.fim)<str(d.inicio))throw Error('Período inválido.');
 if(!https(d.midia_url))throw Error('Informe o HTTPS público da imagem final aprovada.');
 if(d.revisao_etica!==true||d.revisao_privacidade!==true)throw Error('Conclua a revisão humana de texto e público.');
 if(!['traffic','lead_generation','engagement'].includes(str(d.objetivo)))throw Error('Objetivo não suportado nesta etapa.');
 if(!/^[A-Z]{2}$/.test(str(d.pais)))throw Error('Selecione o país do público.');
 if(/(voc[eê]|seu filho|sua filha).{0,60}(autista|defici[eê]ncia|doen[cç]a|recebe bpc)/i.test(`${d.titulo} ${d.texto} ${d.descricao??''}`))throw Error('O texto presume atributo pessoal sensível. Revise a redação.');
 if(diario&&verba>20&&(d.excecao_orcamento_aprovada!==true||str(d.justificativa_orcamento).length<10))throw Error('Acima de R$ 20/dia, registre a justificativa e aprove a exceção desta versão.');
 const corpo:Record<string,unknown>={accountId:conta,adAccountId:adConta,pageId:pagina,name:str(d.nome),goal:d.objetivo,budgetAmount:verba,budgetType:diario?'daily':'lifetime',currency:'BRL',headline:str(d.titulo),body:str(d.texto),description:str(d.descricao),imageUrl:str(d.midia_url),callToAction:'LEARN_MORE',countries:[d.pais],ageMin:min,ageMax:max,startDate:d.inicio,endDate:d.fim,status:'PAUSED',campaignStatus:'PAUSED',adSetStatus:'PAUSED',adStatus:'PAUSED'};
 if(d.objetivo==='lead_generation'){if(!/^\d+$/.test(str(d.formulario_id)))throw Error('Selecione um formulário instantâneo existente.');corpo.leadGenFormId=d.formulario_id;corpo.promotedObject={pageId:pagina};}
 else {if(!https(d.destino))throw Error('Informe o destino HTTPS aprovado.');corpo.linkUrl=str(d.destino);}
 if(str(d.audiencia_id)){if(!/^\d+$/.test(str(d.audiencia_id)))throw Error('Público inválido.');corpo.targeting={audienceInclude:[str(d.audiencia_id)]};}
 if(validar)corpo.validateOnly=true;
 return corpo;
}
export function validarLista(origem:unknown,naoSensivel:unknown,autorizada:unknown,linhas:unknown){
 if(naoSensivel!==true||autorizada!==true||typeof origem!=='string'||origem.trim().length<5||/autis|bpc|defici|doen[cç]|sa[uú]de|relig|pol[ií]tic|racial|sindica|sexual|criminal|crian[cç]|menor/i.test(origem))throw Error('Esta origem não pode ser utilizada para público de anúncios. Use somente contatos adultos com permissão de uso publicitário e sem segmentação por dados sensíveis.');
 if(!Array.isArray(linhas)||!linhas.length||linhas.length>1000)throw Error('Envie de 1 a 1.000 contatos por lote.');
 const vistos=new Set<string>();const users:Record<string,string>[]=[];
 for(const linha of linhas){const l=obj(linha);if(Object.keys(l).some(k=>!['email','phone'].includes(k)))throw Error('Use apenas as colunas email e phone.');const email=str(l.email).toLowerCase(),phone=str(l.phone).replace(/[\s().-]/g,'');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone&&!/^\+[1-9]\d{7,14}$/.test(phone)||!email&&!phone)throw Error('Há contatos inválidos; corrija a lista antes de enviar.');const key=email+'|'+phone;if(!vistos.has(key)){vistos.add(key);users.push({...email?{email}:{},...phone?{phone}:{}});}}
 return users;
}
export async function criarPausado(api:ClienteZernio,corpo:Record<string,unknown>,chave:string){
 const r=await api.post<Record<string,unknown>>('/v1/ads/create',corpo,chave);const a=obj(r.dados.ad);
 if(corpo.validateOnly===true){if(r.dados.validateOnly!==true||!Array.isArray(r.dados.results))throw Error('validacao_sem_confirmacao');return {validacao_parcial:true,etapas:r.dados.results.map(v=>{const e=obj(v);return {etapa:e.node,estado:e.status};})};}
 if(typeof a._id!=='string'||!/^\d+$/.test(str(a.platformCampaignId)))throw Error('criacao_sem_confirmacao');
 const ids={ad_id:a._id,campanha_id:a.platformCampaignId,conjunto_id:a.platformAdSetId,anuncio_id:a.platformAdId};
 try{const l=await api.get<Record<string,unknown>>('/v1/ads/'+encodeURIComponent(a._id));const ad=obj(l.dados.ad??l.dados);
 if(ad.platformCampaignId!==a.platformCampaignId||str(ad.configuredStatus).toUpperCase()!=='PAUSED')throw Error('criacao_sem_confirmacao');
 return {...ids,estado:'PAUSED'};
 }catch{throw Object.assign(Error('criacao_sem_confirmacao'),{ids});}
}
