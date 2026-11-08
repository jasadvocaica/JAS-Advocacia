import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {useToast} from '@/hooks/use-toast';
import type {Json} from '@/integrations/supabase/types';

interface Painel {
 config:{telegram_ativo:boolean;monitor_ativo:boolean;avisar_mudancas:boolean;horarios:string[];ultima_checagem:string|null};
 telegram_vinculado:boolean;monitor_cron_ativo:boolean;
 dados:Record<string,unknown>;
 envios:{id:string;tipo:string;estado:string;enviado_em:string|null;criado_em:string;erro:string|null}[];
 entregas:{nome:string;resultado:{resumo?:string;entrega?:unknown};criado_em:string}[];
}
const horario=(v:string|null)=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Cuiaba'}):'Aguardando primeira verificação';
export default function Operacao24hPainel(){
 const {toast}=useToast();const [painel,setPainel]=useState<Painel|null>(null);const [erro,setErro]=useState('');const [ocupado,setOcupado]=useState(false);const [horas,setHoras]=useState<string[]>([]);
 const carregar=useCallback(async()=>{
  const r=await supabase.rpc('operacao24h_painel');
  if(r.error){setErro('Não foi possível consultar a operação automática.');return;}
  const p=r.data as unknown as Painel;setPainel(p);setHoras(p.config.horarios);setErro('');
 },[]);
 useEffect(()=>{void carregar();const timer=setInterval(()=>void carregar(),60000);return()=>clearInterval(timer);},[carregar]);
 async function salvar(dados:Record<string,Json>){
  setOcupado(true);try{const r=await supabase.rpc('operacao24h_painel',{_dados:dados});if(r.error)throw r.error;await carregar();toast({title:'Operação automática atualizada'});}catch{toast({title:'Não foi possível salvar',variant:'destructive'});}finally{setOcupado(false);}
 }
 async function enviar(){
  setOcupado(true);try{const r=await supabase.functions.invoke('telegram',{body:{acao:'resumo_agora'}});if(r.error)throw r.error;
   toast({title:r.data?.enviados>0?'Resumo entregue no Telegram':r.data?.incertos>0?'Entrega sem confirmação; confira o Telegram':r.data?.falhas>0?'Não foi possível entregar o resumo':'Resumo já solicitado neste minuto'});await carregar();
  }catch{toast({title:'Não foi possível enviar o resumo',variant:'destructive'});}finally{setOcupado(false);}
 }
 return <section aria-label="Operação automática 24 horas" className="mt-6 space-y-4 border-t pt-4">
  <h4 className="font-semibold">Operação automática 24 horas</h4>
  <p className="ga-nota">Verificação a cada cinco minutos, todos os dias. Manu, Helena e Sofia recebem triagens quando as pendências mudam, com intervalo mínimo de uma hora por agente. Os limites de uso do motor continuam valendo.</p>
  {erro&&<p role="alert">{erro}</p>}
  {painel&&<>
   <p role="status">Monitor: {painel.monitor_cron_ativo?'agendado':'aguardando ativação'} · Última verificação: {horario(painel.config.ultima_checagem)} · Cuiabá</p>
   <div className="flex flex-col gap-3">
    <label><input type="checkbox" checked={painel.config.monitor_ativo} disabled={ocupado} onChange={e=>void salvar({monitor_ativo:e.target.checked})}/> Triagem automática dos agentes</label>
    <label><input type="checkbox" checked={painel.config.telegram_ativo} disabled={ocupado} onChange={e=>void salvar({telegram_ativo:e.target.checked})}/> Resumos automáticos no meu Telegram</label>
    <label><input type="checkbox" checked={painel.config.avisar_mudancas} disabled={ocupado} onChange={e=>void salvar({avisar_mudancas:e.target.checked})}/> Avisar mudanças, no máximo uma vez por hora</label>
   </div>
   <div className="flex flex-wrap items-end gap-3">
    {horas.map((h,i)=><label key={i} className="flex flex-col gap-1">Resumo {i+1} · Cuiabá<input aria-label={`Horário do resumo ${i+1}`} type="time" value={h} disabled={ocupado} onChange={e=>setHoras(atual=>atual.map((x,j)=>j===i?e.target.value:x))}/></label>)}
    <Button size="sm" variant="outline" disabled={ocupado||horas.some(h=>!h)} onClick={()=>void salvar({horarios:horas})}>Salvar horários</Button>
    <Button size="sm" disabled={ocupado||!painel.telegram_vinculado} onClick={()=>void enviar()}>Enviar resumo agora</Button>
   </div>
   <p className="ga-nota">Os resumos mostram contagens de leads, aprovações, tarefas e falhas. Leads de teste ficam fora dos indicadores comerciais. Alertas operacionais podem chegar fora dos horários escolhidos.</p>
   <div><h5 className="font-medium">Últimos envios</h5>{painel.envios.length?painel.envios.map(e=><p key={e.id}>{horario(e.enviado_em??e.criado_em)} · {e.tipo} · {e.estado}{e.erro?` (${e.erro})`:''}</p>):<p>Nenhum resumo enviado ainda.</p>}</div>
   <div><h5 className="font-medium">Triagens dos agentes</h5>{painel.entregas.length?painel.entregas.map((e,i)=><details key={i}><summary>{e.nome} · {horario(e.criado_em)}</summary><p className="whitespace-pre-wrap">{e.resultado.resumo}</p><pre className="whitespace-pre-wrap break-words font-sans">{typeof e.resultado.entrega==='string'?e.resultado.entrega:JSON.stringify(e.resultado.entrega??'',null,2)}</pre></details>):<p>As triagens concluídas aparecerão aqui.</p>}</div>
  </>}
 </section>;
}
