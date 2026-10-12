import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from '@/hooks/use-toast';
export function ConsumoAssistente(){
 const {user,isGestor}=useAuth();const qc=useQueryClient();const [aberto,setAberto]=useState(false);const [salvando,setSalvando]=useState(false);
 const {data,error,isLoading}=useQuery({queryKey:['assistente-consumo',user?.id],enabled:aberto&&!!user,queryFn:async()=>{
  const month=new Date();month.setUTCDate(1);month.setUTCHours(0,0,0,0);
  const [cfg,uso]=await Promise.all([supabase.from('assistente_config' as any).select('*').single(),supabase.from('assistente_consumo' as any).select('user_id,tokens_entrada,tokens_saida,custo_estimado_usd,reserva_usd,status').gte('criado_em',month.toISOString()).limit(10000)]);
  if(cfg.error||uso.error)throw new Error('Consumo indisponível');return {config:cfg.data as any,uso:(uso.data??[]) as any[]};
 }});
 const salvar=async(form:HTMLFormElement)=>{const f=new FormData(form);setSalvando(true);const {error}=await supabase.from('assistente_config' as any).update({habilitado:f.get('habilitado')==='on',retencao_dias:Number(f.get('retencao')),limite_usuario_usd:Number(f.get('usuario')),limite_global_usd:Number(f.get('global')),limite_diario:Number(f.get('diario'))}).eq('id',true);setSalvando(false);if(error)toast({title:'Configuração não salva',variant:'destructive'});else{void qc.invalidateQueries({queryKey:['assistente-consumo']});toast({title:'Configuração do assistente salva'});}};
 const grupos:Record<string,{tokens:number;custo:number;reservado:number}>={};data?.uso.forEach(r=>{const g=grupos[r.user_id]??={tokens:0,custo:0,reservado:0};g.tokens+=Number(r.tokens_entrada)+Number(r.tokens_saida);g.custo+=Number(r.custo_estimado_usd);g.reservado+=Math.max(Number(r.reserva_usd),Number(r.custo_estimado_usd));});
 return <div className="rounded border p-3 text-sm"><Button variant="outline" size="sm" onClick={()=>setAberto(v=>!v)} aria-expanded={aberto}>Consumo e configuração da IA</Button>{aberto&&<div className="mt-3 space-y-3">{isLoading?'Carregando…':error?'Não foi possível consultar o consumo.':data&&<>
 <p>Modelo: {data.config.modelo}. Custos estimados em USD; não representam a fatura da OpenAI. Limites incluem reservas conservadoras para solicitações interrompidas.</p>
 <p>Estimativa total visível no mês: USD {Object.values(grupos).reduce((s,g)=>s+g.custo,0).toFixed(4)}.</p>
 {data.uso.length===10000&&<p role="alert">A lista atingiu o limite de exibição; os limites do backend continuam considerando todas as solicitações.</p>}
 <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Usuário</th><th>Tokens</th><th>Estimativa USD</th><th>Uso para limite USD</th></tr></thead><tbody>{Object.entries(grupos).map(([id,g])=><tr key={id}><td>{id===user?.id?'Você':id}</td><td>{g.tokens}</td><td>{g.custo.toFixed(4)}</td><td>{g.reservado.toFixed(4)}</td></tr>)}</tbody></table></div>
 {Object.values(grupos).reduce((s,g)=>s+g.reservado,0)>=Number(data.config.limite_global_usd)*.8&&<p role="alert">O consumo está próximo do limite configurado.</p>}
 {isGestor&&<form onSubmit={e=>{e.preventDefault();void salvar(e.currentTarget);}} className="flex flex-wrap gap-3 items-end">
 <label><input type="checkbox" name="habilitado" defaultChecked={data.config.habilitado}/> Habilitar consultas pela OpenAI</label>
 {([['retencao','Retenção em dias','retencao_dias'],['usuario','Limite mensal por usuário USD','limite_usuario_usd'],['global','Limite global mensal USD','limite_global_usd'],['diario','Solicitações diárias por usuário','limite_diario']] as const).map(([name,label,key])=><label className="text-xs" key={name}>{label}<Input name={name} type="number" min={name==='retencao'||name==='diario'?1:0} max={name==='retencao'?365:name==='diario'?200:name==='usuario'?1000:10000} defaultValue={data.config[key]} required/></label>)}
 <Button type="submit" disabled={salvando}>Salvar configuração</Button>
 <p className="w-full text-xs text-muted-foreground">As mensagens e os campos mínimos das consultas autorizadas são enviados à OpenAI. A chave é configurada apenas nos secrets do Supabase. Avalie as condições de sigilo e retenção do provedor antes de habilitar.</p>
 </form>}
 </>}</div>}</div>;
}
