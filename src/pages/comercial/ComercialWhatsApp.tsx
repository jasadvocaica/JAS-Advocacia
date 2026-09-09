import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, MessageCircle, Paperclip, Send, MoreVertical, UserRound, PlugZap, Inbox, ExternalLink, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
type Contato = { id: string; nome: string; telefone: string; email: string | null; origem: "lead" | "cliente" };

const hora = (data: string | null) => data ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(data)) : "";
const iniciais = (nome?: string | null) => (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const linkWhatsApp = (telefone?: string | null) => {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return "https://web.whatsapp.com/";
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://web.whatsapp.com/send?phone=${numero}`;
};

export default function ComercialWhatsApp() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "nao_lidas" | "encerradas">("todas");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const [buscaContato, setBuscaContato] = useState("");
  const [texto, setTexto] = useState("");

  const { data: conexao } = useQuery({
    queryKey: ["whatsapp-conexao-ativa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_conexoes").select("id,nome,numero_exibicao,status,ativo").eq("ativo", true).maybeSingle();
      if (error) throw error;
      return data as Conexao | null;
    },
  });
  const { data: contatos = [], isLoading: carregandoContatos } = useQuery({
    queryKey: ["whatsapp-contatos-reais"],
    enabled: novaConversaAberta,
    queryFn: async () => {
      const [leadsResult, clientesResult] = await Promise.all([
        (supabase as any)
          .from("mkt_leads")
          .select("id,nome,whatsapp,email")
          .not("whatsapp", "is", null)
          .order("nome")
          .limit(250),
        (supabase as any)
          .from("clientes")
          .select("id,nome,whatsapp,telefones,email")
          .eq("ativo", true)
          .order("nome")
          .limit(250),
      ]);

      if (leadsResult.error) throw leadsResult.error;

      const leads: Contato[] = (leadsResult.data ?? [])
        .filter((item: any) => item.whatsapp)
        .map((item: any) => ({
          id: item.id,
          nome: item.nome,
          telefone: item.whatsapp,
          email: item.email,
          origem: "lead" as const,
        }));

      const clientes: Contato[] = clientesResult.error
        ? []
        : (clientesResult.data ?? [])
            .map((item: any) => ({
              id: item.id,
              nome: item.nome,
              telefone: item.whatsapp || item.telefones?.[0] || "",
              email: item.email,
              origem: "cliente" as const,
            }))
            .filter((item: Contato) => item.telefone);

      const unicos = new Map<string, Contato>();
      [...leads, ...clientes].forEach((item) => {
        const chave = item.telefone.replace(/\D/g, "");
        if (chave && !unicos.has(chave)) unicos.set(chave, item);
      });
      return Array.from(unicos.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
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

  useEffect(() => {
    const channel = supabase
      .channel(`comercial-whatsapp-${selecionada || "geral"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversas" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
          queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_mensagens",
          ...(selecionada ? { filter: `conversa_id=eq.${selecionada}` } : {}),
        },
        () => {
          if (selecionada) queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens", selecionada] });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conexoes" },
        () => queryClient.invalidateQueries({ queryKey: ["whatsapp-conexao-ativa"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, selecionada]);

  useEffect(() => {
    if (!conversa || conversa.nao_lidas <= 0) return;
    void (supabase as any)
      .from("whatsapp_conversas")
      .update({ nao_lidas: 0, atualizado_em: new Date().toISOString() })
      .eq("id", conversa.id);
  }, [conversa?.id, conversa?.nao_lidas]);

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
  const enviarMensagem = useMutation({
    mutationFn: async () => {
      if (!selecionada || !texto.trim()) throw new Error("Digite uma mensagem.");
      const { data, error } = await supabase.functions.invoke("whatsapp-enviar", {
        body: { conversa_id: selecionada, texto: texto.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      setTexto("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens", selecionada] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
      ]);
      toast.success("Mensagem enviada.");
    },
    onError: (erro: Error) => {
      toast.error(erro.message || "Não foi possível enviar a mensagem.");
    },
  });
  const alterarStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!selecionada) throw new Error("Selecione uma conversa.");
      const { error } = await (supabase as any)
        .from("whatsapp_conversas")
        .update({
          status,
          nao_lidas: status === "encerrada" ? 0 : conversa?.nao_lidas || 0,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", selecionada);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
        queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] }),
      ]);
      toast.success("Situação do atendimento atualizada.");
    },
    onError: () => toast.error("Não foi possível atualizar o atendimento."),
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

  const contatosFiltrados = useMemo(() => {
    const termo = buscaContato.trim().toLowerCase();
    if (!termo) return contatos;
    return contatos.filter((item) =>
      [item.nome, item.telefone, item.email].some((valor) => (valor || "").toLowerCase().includes(termo)),
    );
  }, [buscaContato, contatos]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Comercial</p><h1 className="font-display text-3xl">Conversas</h1><p className="text-sm text-muted-foreground">Atendimento centralizado, vinculado aos cadastros reais do escritório.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={conexao?.status === "conectado" ? "default" : "outline"} className="w-fit gap-2 py-2 px-3">
            <span className={cn("h-2 w-2 rounded-full", conexao?.status === "conectado" ? "bg-emerald-300" : "bg-amber-500")} />
            {conexao?.status === "conectado" ? `${conexao.nome} conectado` : "WhatsApp aguardando conexão"}
          </Badge>
          {conversa && (
            <Button variant="outline" className="gap-2" asChild>
              <a href={linkWhatsApp(conversa.telefone)} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Conversar no WhatsApp
              </a>
            </Button>
          )}
          <Button className="gap-2" onClick={() => setNovaConversaAberta(true)}>
            <Plus className="h-4 w-4" />
            Nova conversa
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
            <div className="border-t bg-background p-3">
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="icon" disabled title="Anexos serão liberados após a homologação do canal">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  value={texto}
                  onChange={(evento) => setTexto(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
                      evento.preventDefault();
                      if (!enviarMensagem.isPending && texto.trim()) enviarMensagem.mutate();
                    }
                  }}
                  disabled={!conexao || conexao.status !== "conectado" || enviarMensagem.isPending}
                  rows={2}
                  maxLength={4096}
                  placeholder={conexao?.status === "conectado" ? "Digite uma mensagem… (Ctrl + Enter para enviar)" : "Envio bloqueado até conectar o provedor oficial"}
                  className="min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Button
                  disabled={!conexao || conexao.status !== "conectado" || !texto.trim() || enviarMensagem.isPending}
                  className="gap-2"
                  onClick={() => enviarMensagem.mutate()}
                >
                  <Send className="h-4 w-4" />
                  {enviarMensagem.isPending ? "Enviando…" : "Enviar"}
                </Button>
              </div>
            </div>
          </> : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary/25" /><h2 className="font-display text-2xl">Central de atendimento</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Selecione uma conversa. A interface está pronta para operar no estilo WhatsApp Web sem inventar dados.</p></div></div>}
        </section>

        <aside className="border-t bg-background p-5 lg:border-l lg:border-t-0">
          <h2 className="font-display text-xl">Contexto comercial</h2>
          {conversa ? <div className="mt-5 space-y-5">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-semibold">{iniciais(conversa.nome_contato)}</div><div><p className="font-semibold">{conversa.nome_contato || conversa.telefone}</p><p className="text-sm text-muted-foreground">{lead ? "Lead cadastrado" : conversa.cliente_id ? "Cliente cadastrado" : "Contato vinculado"}</p></div></div>
            <Info label="Telefone" value={conversa.telefone} /><Info label="E-mail" value={lead?.email || "Não informado"} /><Info label="Área de interesse" value={lead?.area_direito || "Não informada"} /><Info label="Origem" value={lead?.canal || "Não informada"} /><Info label="Etapa no CRM" value={lead?.status || "Sem lead vinculado"} />
            {lead?.valor_contrato != null && <Info label="Valor esperado" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.valor_contrato)} />}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Situação do atendimento</p>
              <Select
                value={conversa.status}
                onValueChange={(status) => alterarStatus.mutate(status)}
                disabled={alterarStatus.isPending}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="aguardando_escritorio">Aguardando escritório</SelectItem>
                  <SelectItem value="aguardando_cliente">Aguardando cliente</SelectItem>
                  <SelectItem value="encerrada">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full gap-2" disabled title="A atribuição será liberada após definir a equipe comercial">
              <UserRound className="h-4 w-4" />Responsável ainda não configurado
            </Button>
          </div> : <p className="mt-4 text-sm text-muted-foreground">O cadastro vinculado aparecerá aqui.</p>}
          {!conexao && <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"><PlugZap className="mb-2 h-5 w-5" /><p className="font-medium">Canal não configurado</p><p className="mt-1 text-xs">Nenhuma mensagem será enviada até a conexão oficial.</p></div>}
        </aside>
      </Card>

      <Dialog open={novaConversaAberta} onOpenChange={setNovaConversaAberta}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Iniciar conversa</DialogTitle>
            <DialogDescription>
              Escolha um lead ou cliente já cadastrado. O WhatsApp Web oficial será aberto no número selecionado.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={buscaContato}
              onChange={(evento) => setBuscaContato(evento.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail"
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {carregandoContatos ? (
              <p className="p-5 text-center text-sm text-muted-foreground">Carregando contatos…</p>
            ) : contatosFiltrados.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <UserRound className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 font-medium">Nenhum contato com WhatsApp encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cadastre o número no CRM ou no cadastro do cliente.
                </p>
              </div>
            ) : (
              contatosFiltrados.map((contato) => (
                <a
                  key={`${contato.origem}-${contato.id}`}
                  href={linkWhatsApp(contato.telefone)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setNovaConversaAberta(false)}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {iniciais(contato.nome)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{contato.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {contato.telefone}{contato.email ? ` · ${contato.email}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{contato.origem === "lead" ? "Lead" : "Cliente"}</Badge>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b pb-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}
