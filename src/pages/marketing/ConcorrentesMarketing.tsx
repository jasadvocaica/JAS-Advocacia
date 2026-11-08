import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Plus,ExternalLink,Search} from 'lucide-react';
import {toast} from 'sonner';
interface Fontes {fontes:string[];pode_configurar:boolean}
export function normalizarConcorrente(valor:string,exigirPerfil=true){
 let texto=valor.trim();
 if(texto.startsWith('@')){
  if(!/^@[A-Za-z0-9._]{1,30}$/.test(texto))throw new Error('Informe um perfil válido do Instagram.');
  texto=`https://www.instagram.com/${texto.slice(1).toLowerCase()}/`;
 }
 let u:URL;try{u=new URL(texto);}catch{throw new Error('Informe um link HTTPS público ou um @perfil do Instagram.');}
 if(texto.length>300||u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||
  !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname)||/\.(local|internal|invalid|test)$/i.test(u.hostname))
  throw new Error('Use um link HTTPS público, sem parâmetros, credenciais ou fragmentos.');
 if(/^(www\.)?instagram\.com$/i.test(u.hostname)){
  if(exigirPerfil&&(!/^\/[A-Za-z0-9._]+\/?$/.test(u.pathname)||/^\/(p|reel|reels|stories)\/?$/i.test(u.pathname)))throw new Error('Informe o endereço do perfil do Instagram.');
  u.hostname='www.instagram.com';u.pathname=u.pathname.toLowerCase().replace(/\/+$/,'')+'/';
 }
 return u.toString();
}
const chave=(v:string)=>{const u=new URL(v);return u.hostname.replace(/^www\./,'')+u.pathname.replace(/\/+$/,'');};
function rotulo(v:string){const u=new URL(v),perfil=u.pathname.split('/').filter(Boolean)[0];return /(^|\.)instagram\.com$/.test(u.hostname)&&perfil?(/^(p|reel|reels|stories)$/i.test(perfil)?'Publicação no Instagram':'@'+perfil):u.hostname.replace(/^www\./,'');}
async function consultar():Promise<Fontes>{
 const {data,error}=await supabase.rpc('mkt_rotinas_ia' as never);
 if(error)throw error;
 const r=data as unknown as Fontes;
 if(!r||!Array.isArray(r.fontes)||!r.fontes.every(f=>typeof f==='string'))throw new Error('Não foi possível ler os concorrentes cadastrados.');
 r.fontes.forEach(f=>normalizarConcorrente(f,false));
 return r;
}
export default function ConcorrentesMarketing(){
 const {user,isGestor}=useAuth();const qc=useQueryClient();
 const [busca,setBusca]=useState(''),[novo,setNovo]=useState(false),[fonte,setFonte]=useState('');
 const key=['mkt-rotinas-ia',user?.id];
 const q=useQuery({queryKey:key,enabled:!!user,queryFn:consultar,retry:false});
 const salvar=useMutation({mutationFn:async()=>{
  const url=normalizarConcorrente(fonte),atual=await consultar();
  if(atual.fontes.some(f=>chave(f)===chave(url)))throw new Error('Esse perfil ou site já está cadastrado.');
  if(atual.fontes.length>=40)throw new Error('O acompanhamento aceita até 40 fontes públicas.');
  const {data,error}=await supabase.rpc('mkt_rotinas_ia' as never,{_fontes:[...atual.fontes,url]} as never);
  if(error)throw error;return data as unknown as Fontes;
 },onSuccess:(data)=>{qc.setQueryData(key,data);setFonte('');setNovo(false);toast.success('Concorrente cadastrado nas fontes de pesquisa da Bia.');},onError:(e:Error)=>toast.error(e.message)});
 const fontes=q.data?.fontes??[],filtradas=fontes.filter(f=>`${rotulo(f)} ${f}`.toLowerCase().includes(busca.toLowerCase()));
 return <section className="space-y-5" aria-label="Concorrentes cadastrados">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Concorrentes e referências</h2><p className="text-sm text-muted-foreground">Perfis e sites cadastrados para as pesquisas da Bia.</p></div>
   {isGestor&&q.data?.pode_configurar&&<Button onClick={()=>setNovo(true)} disabled={salvar.isPending||fontes.length>=40}><Plus className="h-4 w-4 mr-2"/>Novo concorrente</Button>}
  </div>
  {novo&&<form className="rounded-lg border p-4 space-y-3" onSubmit={e=>{e.preventDefault();salvar.mutate();}}>
   <div className="space-y-2"><Label htmlFor="fonte-concorrente">Perfil ou site público</Label><Input id="fonte-concorrente" autoFocus required maxLength={300} value={fonte} onChange={e=>setFonte(e.target.value)} placeholder="@perfil ou https://site.com.br/" disabled={salvar.isPending}/></div>
   <p className="text-xs text-muted-foreground">A nova fonte será considerada nas próximas pesquisas automáticas da Bia.</p>
   <div className="flex flex-wrap gap-2"><Button type="submit" disabled={salvar.isPending||!fonte.trim()}>{salvar.isPending?'Cadastrando…':'Cadastrar concorrente'}</Button><Button type="button" variant="outline" disabled={salvar.isPending} onClick={()=>{setNovo(false);setFonte('');}}>Cancelar</Button></div>
  </form>}
  {q.isLoading?<p>Carregando concorrentes…</p>:q.error?<div role="alert" className="rounded-lg border p-4"><p>Não foi possível carregar os concorrentes.</p><Button variant="outline" onClick={()=>q.refetch()}>Tentar novamente</Button></div>:<>
   <div className="flex flex-wrap items-center justify-between gap-3"><Label className="flex items-center gap-2"><Search className="h-4 w-4"/><Input aria-label="Buscar concorrente" placeholder="Buscar perfil ou site…" value={busca} onChange={e=>setBusca(e.target.value)}/></Label><p className="text-sm text-muted-foreground">{fontes.length} de 40 fontes cadastradas</p></div>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtradas.map(f=><article key={f} className="rounded-lg border bg-card p-4 space-y-3 min-w-0"><div><h3 className="font-medium break-words">{rotulo(f)}</h3><p className="text-xs text-muted-foreground break-all mt-1">{f}</p></div><a href={f} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm underline underline-offset-2">Abrir perfil ou site<ExternalLink className="w-3 h-3"/></a></article>)}</div>
   {!filtradas.length&&<p className="rounded-lg border p-5 text-sm text-muted-foreground">{fontes.length?'Nenhum concorrente corresponde à busca.':'Nenhum concorrente cadastrado. Adicione o primeiro perfil ou site público.'}</p>}
   <p className="text-xs text-muted-foreground">Referências para estudar temas e formatos e produzir conteúdo original. A Bia pesquisa grupos de até oito fontes por rodada, conforme a disponibilidade pública.</p>
  </>}
 </section>;
}
