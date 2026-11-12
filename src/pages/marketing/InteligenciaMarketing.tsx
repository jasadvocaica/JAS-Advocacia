import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
interface Sinal { titulo: string; link: string; data: string|null; buscas_aproximadas?: string|null; }
interface Pesquisa {item_id:string;dados:{consultado_em:string;disponivel:boolean;palavras_semente:{termo:string;tema:string}[];noticias_recentes:Sinal[];temas_em_alta_confirmados:Sinal[];fontes:{tipo:string;url:string;status:string}[]}}
interface Painel {pesquisas:Pesquisa[];referencias:{dados:{fontes:{url:string;titulo:string}[]}}[];estrategias:{planejamento_id:string|null;anuncio_id:string|null;artigo_id:string|null;tiktok_id:string|null;erro:string|null;titulo:string|null}[]}
const seguro=(valor:string)=>{try{const u=new URL(valor);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
function Fonte({titulo,link}:{titulo:string;link:string}) {const href=seguro(link);return href?<a className="underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">{titulo}</a>:<span>{titulo}</span>;}
export default function InteligenciaMarketing(){
 const {user}=useAuth();
 const q=useQuery({queryKey:['mkt-inteligencia',user?.id],enabled:!!user,refetchInterval:60000,retry:false,queryFn:async()=>{const {data,error}=await supabase.rpc('mkt_inteligencia_mercado' as never);if(error)throw error;const p=data as unknown as Painel;if(!p||!Array.isArray(p.pesquisas)||!Array.isArray(p.estrategias)||!Array.isArray(p.referencias))throw new Error('Resposta de pesquisa inválida');return p;}});
 const pesquisa=q.data?.pesquisas[0]?.dados;
 return <section className="rounded-xl border bg-card p-5 space-y-4" aria-label="Inteligência de mercado">
  <div><h2 className="text-lg font-semibold">Inteligência de mercado</h2><p className="text-sm text-muted-foreground">Pesquisa → estratégia → anúncio e conteúdo para sua aprovação.</p></div>
  {q.isLoading?<p className="text-sm">Consultando entregas…</p>:q.error?<p role="alert" className="text-sm">Não foi possível carregar as pesquisas. Tente novamente.</p>:<>
   <div className="grid gap-5 lg:grid-cols-2">
    <div className="space-y-3"><h3 className="font-medium">Palavras-chave e sinais recentes</h3>
     {pesquisa?<><p className="text-xs text-muted-foreground">Consulta: {new Date(pesquisa.consultado_em).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'})} · Cuiabá</p>
      <div className="flex flex-wrap gap-2">{pesquisa.palavras_semente.map(p=><span key={p.termo} title={p.tema} className="rounded-full border px-2 py-1 text-xs">{p.termo}</span>)}</div>
      <p className="text-xs text-muted-foreground">Sementes editoriais. Volume mensal, CPC e concorrência indisponíveis: Keyword Planner não está conectado.</p>
      {!pesquisa.disponivel&&<p role="status" className="text-sm">As fontes públicas ficaram indisponíveis nesta consulta. As sementes acima não comprovam demanda.</p>}
      <h4 className="text-sm font-medium">Tendências verificadas no Google Trends</h4>
      {pesquisa.temas_em_alta_confirmados.length?<ul className="text-sm space-y-1">{pesquisa.temas_em_alta_confirmados.map(s=><li key={s.link}><Fonte titulo={s.titulo} link={s.link}/>{s.buscas_aproximadas&&` · indicador aproximado do feed: ${s.buscas_aproximadas}`}</li>)}</ul>:<p className="text-sm text-muted-foreground">Nenhum tema jurídico em alta confirmado nesta consulta. Isso não significa ausência de demanda.</p>}
      <h4 className="text-sm font-medium">Notícias recentes — não são medida de procura</h4>
      <ul className="text-sm space-y-2 max-h-64 overflow-y-auto">{pesquisa.noticias_recentes.slice(0,15).map(s=><li key={s.link}><Fonte titulo={s.titulo} link={s.link}/>{s.data&&<span className="text-xs text-muted-foreground"> · {new Date(s.data).toLocaleDateString('pt-BR',{timeZone:'America/Cuiaba'})}</span>}</li>)}</ul>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Cobertura das fontes</summary>{pesquisa.fontes.map(f=><p key={f.url}>{f.tipo}: {f.status}</p>)}</details>
     </>:<p className="text-sm text-muted-foreground">Aguardando a primeira coleta de palavras-chave e sinais públicos. Não há volume medido para exibir.</p>}
    </div>
    <div className="space-y-3"><h3 className="font-medium">Estratégias e anúncios propostos</h3>
     {!q.data?.estrategias.length&&<p className="text-sm text-muted-foreground">As propostas do Theo aparecerão aqui após a pesquisa.</p>}
     {q.data?.estrategias.map((e,i)=><article key={e.planejamento_id??i} className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">{e.titulo??'Proposta com pendência de geração'}</p>
      {e.erro?<p className="text-sm">A entrega exige correção antes de gerar propostas.</p>:<div className="flex flex-wrap gap-3 text-sm">
       {e.planejamento_id&&<Link className="underline" to={`/marketing?item=${e.planejamento_id}`}>Estratégia e público proposto</Link>}
       {e.anuncio_id&&<Link className="underline" to="/marketing?secao=anuncios">Rascunho do anúncio</Link>}
       {e.artigo_id&&<Link className="underline" to={`/marketing?item=${e.artigo_id}`}>Pauta de artigo</Link>}
       {e.tiktok_id&&<Link className="underline" to={`/marketing?item=${e.tiktok_id}`}>Roteiro de vídeo curto</Link>}
      </div>}
     </article>)}
     <p className="text-xs text-muted-foreground">Públicos amplos ou contexto da busca, para revisão. Nenhuma lista de leads é enviada. Criação de campanha, público externo, ativação e orçamento continuam separados da aprovação editorial.</p>
    </div>
   </div>
   {!!q.data?.referencias[0]?.dados.fontes.length&&<div><h3 className="font-medium mb-2">Referências públicas consultadas pela Bia</h3><ul className="text-sm space-y-1">{q.data.referencias[0].dados.fontes.slice(0,8).map(f=><li key={f.url}><Fonte titulo={f.titulo} link={f.url}/></li>)}</ul></div>}
  </>}
 </section>;
}
