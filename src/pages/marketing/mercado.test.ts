import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {lerFeedMercado,pesquisarMercadoPublico} from '../../../supabase/functions/_shared/marketing-mercado';
import {executarRodadas,validarParametros} from '../../../supabase/functions/_shared/motor';
const rss=(titulo:string,extra='')=>`<rss><channel><item><title><![CDATA[${titulo}]]></title><link>https://news.google.com/rss/articles/exemplo</link><pubDate>Sun, 08 Nov 2026 10:00:00 GMT</pubDate>${extra}</item></channel></rss>`;
beforeEach(()=>vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal}));
afterEach(()=>vi.unstubAllGlobals());
describe('pesquisa de mercado',()=>{
 it('executa a ferramenta pelo protocolo real do motor e descarta dados de pessoas nos argumentos',async()=>{
  expect(validarParametros('pesquisar_tendencias_marketing',{leads:['ignorar']})).toEqual({});
  const executar=vi.fn(async()=>({disponivel:false,fontes:[]}));
  const r=await executarRodadas({entrada:{},concedidas:['pesquisar_tendencias_marketing'],chamarIA:async(rodada)=>rodada===0?{output:[{type:'function_call',call_id:'consulta',name:'pesquisar_tendencias_marketing',arguments:'{}'}]}:{output:[{type:'message',content:[{type:'output_text',text:'{"resumo":"Consulta parcial","entrega":"Fonte indisponível","pendencias":[]}'}]}]},executar});
  expect(r.ferramentasUsadas).toContain('pesquisar_tendencias_marketing');expect(executar).toHaveBeenCalledWith('pesquisar_tendencias_marketing',{});
 });
 it('lê evidência pública e mantém indicador aproximado sem convertê-lo em volume mensal',()=>{
  expect(lerFeedMercado(rss('Mudanças no IPVA','<ht:approx_traffic>20K+</ht:approx_traffic>'))[0]).toMatchObject({titulo:'Mudanças no IPVA',buscas_aproximadas:'20K+',data:'2026-11-08T10:00:00.000Z'});
  expect(lerFeedMercado(rss('Conta bloqueada').replace('https://news.google.com/rss/articles/exemplo','javascript:alert(1)'))).toHaveLength(0);
 });
 it('separa notícia recente, tendência confirmada e palavras sugeridas, sem receber CRM',async()=>{
  const fetcher=vi.fn(async(url:string)=>new Response(url.includes('trends.google')?rss('Campeonato de futebol'):rss('Informações sobre pejotização'),{status:200}));vi.stubGlobal('fetch',fetcher);
  const r=await pesquisarMercadoPublico(new Date('2026-11-08T13:00:00Z'));
  expect(r.temas_em_alta_confirmados).toHaveLength(0);expect(r.noticias_recentes.length).toBeGreaterThan(0);
  expect(r.palavras_semente.every(p=>p.volume_mensal===null&&p.cpc===null)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(4);expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/lead|email|telefone/);
 });
 it('registra indisponibilidade sem inventar tendência ou número',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:403})));
  const r=await pesquisarMercadoPublico(new Date('2026-11-08T13:00:00Z'));
  expect(r.disponivel).toBe(false);expect(r.temas_em_alta_confirmados).toHaveLength(0);expect(r.fontes.every(f=>f.erro==='feed_http_403')).toBe(true);
 });
 it('não chama notícia de tendência e exige data recente para sinal do Trends',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url.includes('trends.google')?rss('Mudanças no IPVA','<ht:approx_traffic>20K+</ht:approx_traffic>'):rss('Notícia jurídica'),{status:200})));
  expect((await pesquisarMercadoPublico(new Date('2026-11-08T13:00:00Z'))).temas_em_alta_confirmados[0].buscas_aproximadas).toBe('20K+');
  expect((await pesquisarMercadoPublico(new Date('2026-11-12T13:00:00Z'))).temas_em_alta_confirmados).toHaveLength(0);
 });
 it('recusa resposta não XML e feed excessivo',()=>{expect(()=>lerFeedMercado('<html>Login</html>')).toThrow();expect(()=>lerFeedMercado('a'.repeat(300001))).toThrow();});
});
