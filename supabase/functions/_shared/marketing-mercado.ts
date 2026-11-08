// Fontes públicas fixas. Não recebe leads, identificadores de pessoas ou URLs arbitrárias.
export const TEMAS_MERCADO = [
 { tema: 'Trabalho e pejotização', sementes: ['pejotização direitos', 'contrato PJ subordinação'] },
 { tema: 'Gestante e trabalho', sementes: ['gestante contrato experiência', 'gravidez após demissão'] },
 { tema: 'Família', sementes: ['pensão alimentícia documentos', 'revisão de alimentos'] },
 { tema: 'Plataformas digitais', sementes: ['motorista aplicativo bloqueado', 'recuperação conta WhatsApp'] },
 { tema: 'Passageiro aéreo', sementes: ['voo cancelado direitos', 'bagagem extraviada documentos'] },
 { tema: 'Isenções e acessibilidade', sementes: ['isenção IPVA requisitos', 'isenção imposto renda doença grave'] },
 { tema: 'Informação sobre direitos', sementes: ['BPC critérios legais', 'IPVA autismo legislação'] },
] as const;
const xml = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '')
 .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
 .replace(/&#(\d+);/g, (_, n) => { const i=Number(n);return i>0&&i<=0x10ffff?String.fromCodePoint(i):''; }).trim();
const tag=(s: string,k: string)=>xml(s.match(new RegExp(`<${k}(?:\\s[^>]*)?>([\\s\\S]*?)</${k}>`,'i'))?.[1]??'');
export function lerFeedMercado(texto: string) {
 if(texto.length>300000 || !/<(?:rss|feed)[\s>]/i.test(texto)) throw new Error('feed_invalido');
 return [...texto.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,25).flatMap(m=>{
  const titulo=tag(m[1],'title').slice(0,250), link=tag(m[1],'link'), data=tag(m[1],'pubDate');
  try {const u=new URL(link);if(u.protocol!=='https:'||u.username||u.password||link.length>2048||!titulo)return [];} catch{return [];}
  return [{titulo,link,data:Number.isFinite(Date.parse(data))?new Date(data).toISOString():null,
   buscas_aproximadas:tag(m[1],'ht:approx_traffic')||null, fonte:tag(m[1],'source').slice(0,120)||null}];
 });
}
async function baixarFeed(url: string) {
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/rss+xml, application/xml, text/xml'}});
 if(!r.ok) throw new Error(`feed_http_${r.status}`);
 const reader=r.body?.getReader(); if(!reader) throw new Error('feed_vazio');
 const decoder=new TextDecoder();let texto='',bytes=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>300000)throw new Error('feed_excede_limite');texto+=decoder.decode(value,{stream:true});}texto+=decoder.decode();}
 finally {await reader.cancel().catch(()=>{});}
 return lerFeedMercado(texto);
}
export async function pesquisarMercadoPublico(agora=new Date()) {
 const dia=agora.toLocaleDateString('en-CA',{timeZone:'America/Cuiaba'});
 const base=Math.floor(Date.parse(`${dia}T00:00:00Z`)/86400000);
 const temas=[0,1,2].map(i=>TEMAS_MERCADO[(base*3+i)%TEMAS_MERCADO.length]);
 const fontes=[{tipo:'google_trends',url:'https://trends.google.com/trending/rss?geo=BR'},
  ...temas.map(t=>({tipo:'noticias',url:`https://news.google.com/rss/search?q=${encodeURIComponent(t.sementes[0]+' when:7d')}&hl=pt-BR&gl=BR&ceid=BR%3Apt-419`}))];
 const resultados=await Promise.allSettled(fontes.map(f=>baixarFeed(f.url)));
 const registros=fontes.map((f,i)=>{const r=resultados[i];return {...f,status:r.status==='fulfilled'?'consultado':'indisponivel',
  erro:r.status==='rejected'&&r.reason instanceof Error&&/^feed_[a-z_0-9]+$/.test(r.reason.message)?r.reason.message:r.status==='rejected'?'fonte_indisponivel':null,
  itens:r.status==='fulfilled'?r.value:[]};});
 const recente=(data:string|null,dias:number)=>!!data&&Date.parse(data)>=agora.getTime()-dias*86400000&&Date.parse(data)<=agora.getTime()+3600000;
 const institucional=(fonte:string|null)=>/tribunal|senado|c[aâ]mara|ag[eê]ncia brasil|stj|tst|defensoria|receita|sefaz|ibdfam/i.test(fonte??'');
 const noticias=registros.filter(r=>r.tipo==='noticias').flatMap(r=>r.itens.filter(n=>recente(n.data,7))
  .sort((a,b)=>Number(institucional(b.fonte))-Number(institucional(a.fonte))).slice(0,5));
 const alta=registros.filter(r=>r.tipo==='google_trends').flatMap(r=>r.itens).filter(n=>recente(n.data,2)&&/ipva|bpc|pejotiza|trabalh|pens[aã]o|gestante|autismo|motorista|a[eé]reo|inss/i.test(n.titulo));
 return {consultado_em:agora.toISOString(),recorte:'Brasil; data civil America/Cuiaba',
  disponivel:registros.some(r=>r.status==='consultado'),fontes:registros.map(({itens:_,...r})=>r),
  palavras_semente:temas.flatMap(t=>t.sementes.map(p=>({termo:p,tema:t.tema,origem:'semente_editorial',volume_mensal:null,cpc:null,concorrencia:null}))),
  noticias_recentes:noticias.slice(0,15),temas_em_alta_confirmados:alta.slice(0,8),priorizacao:'Até cinco notícias por consulta temática, priorizando fontes institucionais; não é ranking de popularidade.',
  limites:['Sementes são sugestões editoriais, não volumes medidos.','Notícia recente não comprova alta de buscas.',
   'Google Trends RSS mostra tendências gerais; ausência de tema jurídico não comprova ausência de demanda.',
   'Google Ads Keyword Planner e APIs privadas não estão conectados: volume mensal, CPC e concorrência indisponíveis.',
   'Nenhuma lista de leads foi lida ou enviada. Não criar públicos a partir de saúde, deficiência, benefício ou outras condições sensíveis.']};
}
