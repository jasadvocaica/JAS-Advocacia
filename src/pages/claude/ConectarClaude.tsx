import {useEffect,useState} from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {supabase} from '@/integrations/supabase/client';
import {PageHeader} from '@/components/layout/PageHeader';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
const url=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-mcp`;
export default function ConectarClaude(){
 const {user,profile}=useAuth();const [grants,setGrants]=useState<any[]>([]);const [status,setStatus]=useState('Carregando conexões…');
 const carregar=async()=>{const {data,error}=await supabase.auth.oauth.listGrants();if(error)setStatus('OAuth ainda precisa ser habilitado no Supabase para concluir a conexão.');else{setGrants(data??[]);setStatus('Autorizações desta conta');}};
 useEffect(()=>{if(user)void carregar();},[user?.id]);
 if(!profile?.ativo||(profile.tipo_portal??'interno')!=='interno')return <p>Acesso restrito às contas internas ativas.</p>;
 return <div className="space-y-4"><PageHeader title="Conectar Claude" description="MCP remoto com consultas autorizadas, sem ações de escrita."/><Card className="p-5 space-y-3"><p>No Claude, abra Configurações → Conectores → Adicionar conector personalizado. Funciona no site e no aplicativo por conexão remota.</p><p>Nome: JAS Advocacia</p><code className="block break-all">{url}</code><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(url)}>Copiar endereço MCP</Button><p>Após adicionar, entre com sua conta do escritório e autorize a conexão. Não copie chaves do Supabase nem tokens para o Claude. Esta conexão não exige OPENAI_API_KEY.</p><p className="text-sm">Se OAuth estiver desativado: Supabase JAS → Authentication → OAuth Server. Habilite OAuth 2.1, defina Authorization Path como /oauth/consent e permita registro dinâmico. A Site URL deve apontar para https://app.julianaaraujoadvocacia.com. Não altere a URL global se outros fluxos dependem de outro domínio sem verificar essas dependências.</p></Card><Card className="p-5 space-y-3"><h2 className="font-semibold">Suas conexões</h2><p>{status}</p>{grants.map(g=><div key={g.client.id} className="flex flex-wrap gap-3 items-center"><span>{g.client.name}</span><Button variant="outline" onClick={async()=>{const {error}=await supabase.auth.oauth.revokeGrant({clientId:g.client.id});if(error)setStatus('Não foi possível revogar a conexão.');else await carregar();}}>Revogar acesso</Button></div>)}</Card></div>;
}
