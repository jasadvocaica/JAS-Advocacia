import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, MessageCircle, Paperclip, Send, MoreVertical, UserRound, PlugZap, Inbox, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Conversa = {
  id: string;
  lead_id: string | null;
  cliente_id: string | null;
  nome_contato: string | null;
  telefone: string;
  status: string;
  ultima_mensagem_em: string | null;
  ultima_mensagem_resumo: string | null;
  nao_lidas: number;
};
type Mensagem = { id: string; direcao: string; tipo: string; conteudo: string | null; ocorrida_em: string; status: string };
type Conexao = { id: string; nome: string; numero_exibicao: string | null; status: string; ativo: boolean };
type Lead = { id: string; nome: string; email: string | null; area_direito: string | null; status: string; canal: string | null; valor_contrato: number | null };

const hora = (data: string | null) => data ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(data)) : "";
const iniciais = (nome?: string | null) => (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const linkWhatsApp = (telefone?: string | null) => {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return "https://web.whatsapp.com/";
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://web.whatsapp.com/send?phone=${numero}`;
};

export default function ComercialWhatsApp() {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas" | "encerradas">("todas");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const { data: conexao } = useQuery({
    queryKey: ["whatsapp-conexao-ativa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_conexoes").select("id,nome,numero_exibicao,status,ativo").eq("ativo", true).maybeSingle();
      if (error) throw error;
      return data as Conexao | null;
    },
  });
  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_conversas")
        .select("id,lead_id,cliente_id,nome_contato,telefone,status,ultima_mensagem_em,ultima_mensagem_resumo,nao_lidas")
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });
  useEffect(() => { if (!selecionada && conversas[0]) setSelecionada(conversas[0].id); }, [conversas, selecionada]);
  const conversa = conversas.find((item) => item.id === selecionada) ?? null;

  const { data: mensagens = [] } = useQuery({
    queryKey: ["whatsapp-mensagens", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_mensagens").select("id,direcao,tipo,conteudo,ocorrida_em,status")
        .eq("conversa_id", selecionada).order("ocorrida_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });
  const { data: lead } = useQuery({
    queryKey: ["whatsapp-lead", conversa?.lead_id],
    enabled: !!conversa?.lead_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mkt_leads").select("id,nome,email,area_direito,status,canal,valor_contrato").eq("id", conversa!.lead_id).single();
      if (error) throw error;
      return data as Lead;
    },
  });

  const filtradas = useMemo(() => conversas.filter((item) => {
    const bateBusca = [item.nome_contato, item.telefone, item.ultima_mensagem_resumo].some((v) => (v || "").toLowerCase().includes(busca.toLowerCase()));
    const bateFiltro = filtro === "todas" || (filtro === "nao_lidas" ? item.nao_lidas > 0 : item.status === "encerrada");
    return bateBusca && bateFiltro;
  }), [conversas, busca, filtro]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Comercial</p><h1 className="font-display text-3xl">Conversas</h1><p className="text-sm text-muted-foreground">Atendimento centralizado, vinculado aos cadastros reais do escritório.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={conexao?.status === "conectado" ? "default" : "outline"} className="w-fit gap-2 py-2 px-3">
            <span className={cn("h-2 w-2 rounded-full", conexao?.status === "conectado" ? "bg-emerald-300" : "bg-amber-500")} />
            {conexao?.status === "conectado" ? `${conexao.nome} conectado` : "WhatsApp aguardando conexão"}
          </Badge>
          <Button variant="outline" className="gap-2" asChild>
            <a href={linkWhatsApp(conversa?.telefone)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              {conversa ? "Conversar no WhatsApp" : "Abrir WhatsApp Web"}
            </a>
          </Button>
        </div>
      </header>

      <Card className="grid min-h-[680px] overflow-hidden border-border/80 lg:grid-cols-[330px_minmax(420px,1fr)_310px]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b p-4">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa ou contato" className="pl-9" /></div>
            <div className="flex gap-1">
              {([["todas","Todas"],["nao_lidas","Não lidas"],["encerradas","Fechadas"]] as const).map(([valor, rotulo]) => <Button key={valor} size="sm" variant={filtro === valor ? "secondary" : "ghost"} onClick={() => setFiltro(valor)}>{rotulo}</Button>)}
            </div>
          </div>
          <div className="max-h-[590px] overflow-y-auto">
            {isLoading ? <p className="p-5 text-sm text-muted-foreground">Carregando conversas…</p> : filtradas.length === 0 ? (
              <div className="p-8 text-center"><Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" /><p className="font-medium">Nenhuma conversa</p><p className="mt-1 text-xs text-muted-foreground">{conexao ? "Nenhum atendimento corresponde ao filtro." : "Conecte o canal oficial para sincronizar atendimentos."}</p></div>
            ) : filtradas.map((item) => (
              <button key={item.id} onClick={() => setSelecionada(item.id)} className={cn("flex w-full gap-3 border-b p-4 text-left transition-colors hover:bg-muted/60", selecionada === item.id && "bg-primary/5")}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{iniciais(item.nome_contato)}</div>
                <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate font-medium">{item.nome_contato || item.telefone}</p><span className="text-[11px] text-muted-foreground">{hora(item.ultima_mensagem_em)}</span></div><p className="truncate text-sm text-muted-foreground">{item.ultima_mensagem_resumo || "Sem mensagem registrada"}</p></div>
                {item.nao_lidas > 0 && <Badge className="h-5 min-w-5 px-1.5">{item.nao_lidas}</Badge>}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[560px] flex-col bg-muted/15">
          {conversa ? <>
            <div className="flex items-center gap-3 border-b bg-background p-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{iniciais(conversa.nome_contato)}</div><div className="min-w-0 flex-1"><p className="truncate font-medium">{conversa.nome_contato || conversa.telefone}</p><p className="text-xs text-muted-foreground">{conversa.telefone}</p></div><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {mensagens.length === 0 ? <div className="flex h-full items-center justify-center"><div className="text-center"><MessageCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground/35" /><p className="font-medium">Histórico vazio</p><p className="text-sm text-muted-foreground">As mensagens oficiais aparecerão aqui após a sincronização.</p></div></div> : mensagens.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.direcao === "saida" ? "justify-end" : "justify-start")}><div className={cn("max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm", msg.direcao === "saida" ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm border bg-background")}><p className="whitespace-pre-wrap">{msg.conteudo || `[${msg.tipo}]`}</p><p className="mt-1 text-right text-[10px] opacity-60">{hora(msg.ocorrida_em)}</p></div></div>
              ))}
            </div>
            <div className="border-t bg-background p-3"><div className="flex items-end gap-2"><Button variant="ghost" size="icon" disabled={!conexao}><Paperclip className="h-4 w-4" /></Button><textarea disabled={!conexao || conexao.status !== "conectado"} rows={2} placeholder={conexao?.status === "conectado" ? "Digite uma mensagem…" : "Envio bloqueado até conectar o provedor oficial"} className="min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60" /><Button disabled={!conexao || conexao.status !== "conectado"} className="gap-2"><Send className="h-4 w-4" />Enviar</Button></div></div>
          </> : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary/25" /><h2 className="font-display text-2xl">Central de atendimento</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Selecione uma conversa. A interface está pronta para operar no estilo WhatsApp Web sem inventar dados.</p></div></div>}
        </section>

        <aside className="border-t bg-background p-5 lg:border-l lg:border-t-0">
          <h2 className="font-display text-xl">Contexto comercial</h2>
          {conversa ? <div className="mt-5 space-y-5">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-semibold">{iniciais(conversa.nome_contato)}</div><div><p className="font-semibold">{conversa.nome_contato || conversa.telefone}</p><p className="text-sm text-muted-foreground">{lead ? "Lead cadastrado" : conversa.cliente_id ? "Cliente cadastrado" : "Contato vinculado"}</p></div></div>
            <Info label="Telefone" value={conversa.telefone} /><Info label="E-mail" value={lead?.email || "Não informado"} /><Info label="Área de interesse" value={lead?.area_direito || "Não informada"} /><Info label="Origem" value={lead?.canal || "Não informada"} /><Info label="Etapa no CRM" value={lead?.status || conversa.status} />
            {lead?.valor_contrato != null && <Info label="Valor esperado" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.valor_contrato)} />}
            <Button variant="outline" className="w-full gap-2" disabled><UserRound className="h-4 w-4" />Editar responsável</Button>
          </div> : <p className="mt-4 text-sm text-muted-foreground">O cadastro vinculado aparecerá aqui.</p>}
          {!conexao && <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"><PlugZap className="mb-2 h-5 w-5" /><p className="font-medium">Canal não configurado</p><p className="mt-1 text-xs">Nenhuma mensagem será enviada até a conexão oficial.</p></div>}
        </aside>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b pb-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}
