import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, CircleDollarSign, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Lead={id:string;nome:string;area_direito:string|null;canal:string|null;status:string;valor_contrato:number|null;criado_em:string};
const colunas=[
  {titulo:"Recepção",status:["novo","recepcao"]},
  {titulo:"Qualificação",status:["qualificado","qualificacao"]},
  {titulo:"Análise de viabilidade",status:["analise","em_analise"]},
  {titulo:"Proposta",status:["proposta","proposta_enviada"]},
  {titulo:"Contrato assinado",status:["convertido","contrato_assinado"]},
];
const moeda=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(v);
export default function ComercialCRM(){
 const {data:leads=[],isLoading}=useQuery({queryKey:["crm-leads"],queryFn:async()=>{const {data,error}=await (supabase as any).from("mkt_leads").select("id,nome,area_direito,canal,status,valor_contrato,criado_em").order("criado_em",{ascending:false});if(error)throw error;return(data??[]) as Lead[];}});
 const total=useMemo(()=>leads.reduce((s,l)=>s+Number(l.valor_contrato||0),0),[leads]);
 return <div className="space-y-5"><header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Comercial</p><h1 className="font-display text-3xl">CRM</h1><p className="text-sm text-muted-foreground">Negociações e contratos registrados no sistema.</p></div><Button className="gap-2" asChild><a href="/atendimentos"><Plus className="h-4 w-4"/>Novo atendimento</a></Button></header>
 <div className="grid gap-3 sm:grid-cols-2"><Card className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-primary"/><div><p className="text-2xl font-semibold">{leads.length}</p><p className="text-xs text-muted-foreground">Negociações reais</p></div></Card><Card className="flex items-center gap-3 p-4"><CircleDollarSign className="h-5 w-5 text-primary"/><div><p className="text-2xl font-semibold">{moeda(total)}</p><p className="text-xs text-muted-foreground">Valor informado</p></div></Card></div>
 <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground"><Search className="h-4 w-4"/>O quadro é alimentado apenas pelos leads cadastrados.</div>
 <div className="grid gap-4 overflow-x-auto pb-2 xl:grid-cols-5">{colunas.map(col=>{const itens=leads.filter(l=>col.status.includes((l.status||"novo").toLowerCase()));return <section key={col.titulo} className="min-w-[260px] rounded-xl border bg-muted/25 p-3"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg">{col.titulo}</h2><span className="rounded-full bg-background px-2 py-0.5 text-xs">{itens.length}</span></div><div className="space-y-3">{isLoading?<p className="text-sm text-muted-foreground">Carregando…</p>:itens.length===0?<p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma negociação</p>:itens.map(l=><Card key={l.id} className="p-4"><p className="font-semibold">{l.nome}</p><p className="mt-1 text-sm text-muted-foreground">{l.area_direito||"Área não informada"}</p><p className="mt-3 text-xs text-muted-foreground">Origem: {l.canal||"não informada"}</p>{l.valor_contrato!=null&&<p className="mt-2 font-medium text-primary">{moeda(Number(l.valor_contrato))}</p>}</Card>)}</div></section>})}</div></div>;
}