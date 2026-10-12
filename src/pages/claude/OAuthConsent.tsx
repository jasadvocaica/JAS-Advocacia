import {useEffect,useState} from 'react';
import {Navigate,useParams,useSearchParams} from 'react-router-dom';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
export function callbackClaude(url:string){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='claude.ai'&&u.pathname==='/api/mcp/auth_callback'&&!u.username&&!u.password;}catch{return false;}}
export default function OAuthConsent(){
 const {user,profile,loading}=useAuth();const [params]=useSearchParams();const path=useParams();const id=path.authorizationId??params.get('authorization_id');
 const [details,setDetails]=useState<any>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{let current=true;if(!user||!id)return;setDetails(null);setError('');void supabase.auth.oauth.getAuthorizationDetails(id).then(({data,error})=>{if(!current)return;if(error||!data){setError('Solicitação indisponível. Confira se OAuth está habilitado e tente conectar novamente pelo Claude.');return;}if(!callbackClaude('redirect_url' in data?data.redirect_url:data.redirect_uri)){setError('Esta solicitação não possui um retorno válido para o Claude.');return;}setDetails(data);});return()=>{current=false;};},[user?.id,id]);
 if(loading)return <p className="p-6">Carregando…</p>;
 if(!id)return <p className="p-6">Inicie a conexão nas configurações de conectores do Claude.</p>;
 if(!user)return <Navigate to="/login" state={{from:{pathname:`/oauth/consent/${encodeURIComponent(id)}`}}} replace/>;
 if(!profile?.ativo||(profile.tipo_portal??'interno')!=='interno')return <p className="p-6">A conexão exige uma conta interna ativa.</p>;
 const decidir=async(approve:boolean)=>{setBusy(true);setError('');try{if(details.redirect_url){if(approve)window.location.assign(details.redirect_url);else setError('Retorno cancelado. Você pode revogar a conexão na página Conectar Claude.');return;}
 const {data,error}=await (approve?supabase.auth.oauth.approveAuthorization(id,{skipBrowserRedirect:true}):supabase.auth.oauth.denyAuthorization(id,{skipBrowserRedirect:true}));if(error||!data||!callbackClaude(data.redirect_url))throw new Error('Não foi possível concluir a autorização');window.location.assign(data.redirect_url);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <main className="min-h-screen flex items-center justify-center p-4"><Card className="max-w-xl p-6 space-y-4"><h1 className="text-xl font-semibold">Conectar Claude ao escritório</h1><p>Conta: {profile.nome}. O servidor MCP oferece apenas consultas e utiliza as permissões atuais desta conta. Não oferece criação, edição, exclusão ou pagamentos.</p><p>Os registros consultados serão enviados ao Claude. Autorize apenas a conexão que você iniciou.</p>{details?.client&&<><p>Aplicação: {details.client.name}</p><p className="text-sm">Escopos solicitados: {details.scope||'identidade da conta'}</p></>}{error&&<p role="alert">{error}</p>}{!details&&!error&&<p>Carregando solicitação…</p>}<div className="flex gap-3"><Button disabled={!details||busy} onClick={()=>void decidir(true)}>Autorizar Claude</Button><Button variant="outline" disabled={!details||busy} onClick={()=>void decidir(false)}>Negar</Button></div></Card></main>;
}
