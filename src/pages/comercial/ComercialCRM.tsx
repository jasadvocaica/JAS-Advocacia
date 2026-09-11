import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, Check, CircleDollarSign, ExternalLink, History, Pencil, Plus, Search, UserX, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Lead = {
  id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  area_direito: string | null;
  canal: string;
  campanha_id: string | null;
  status: string;
  valor_contrato: number | null;
  responsavel_id: string | null;
  motivo_perda: string | null;
  observacao_perda: string | null;
  criado_em: string;
};
type Campanha = { id: string; nome: string; status: string };
type Responsavel = { user_id: string; nome: string; ativo: boolean; gestor: boolean };
type Historico = { id: string; evento: string; estado_anterior: Record<string, unknown> | null; estado_novo: Record<string, unknown>; alterado_por: string | null; criado_em: string };
type Atividade = { id: string; lead_id: string; descricao: string; agendado_para: string; responsavel_id: string | null; status: "pendente" | "concluida" | "cancelada" };

const COLUNAS = [
  ["novo", "Recepção"], ["em_atendimento", "Em atendimento"],
  ["proposta_enviada", "Proposta enviada"], ["convertido", "Convertido"], ["perdido", "Perdido"],
] as const;
const AREAS = [
  ["previdenciario", "Previdenciário"], ["familia", "Família"], ["civil", "Cível"],
  ["trabalhista", "Trabalhista"], ["tributario", "Tributário"], ["consumidor", "Consumidor"],
  ["saude", "Saúde"], ["outro", "Outro / a confirmar"],
] as const;
const CANAIS = [
  ["whatsapp_direto", "WhatsApp direto"], ["indicacao_parceiro", "Indicação de parceiro"],
  ["instagram_organico", "Instagram orgânico"], ["meta_ads", "Meta Ads"],
  ["site_seo", "Site / busca"], ["tiktok", "TikTok"], ["outro", "Outro"],
] as const;
const MOTIVOS_PERDA = [
  ["valor", "Valor"], ["concorrente", "Contratou concorrente"], ["caso_inviavel", "Caso inviável"],
  ["sem_retorno", "Sem retorno"], ["nao_urgente", "Não é urgente"], ["outro", "Outro"],
] as const;
const formVazio = {
  id: "", nome: "", whatsapp: "", email: "", area_direito: "", canal: "whatsapp_direto",
  campanha_id: "", valor_contrato: "", responsavel_id: "",
};
const moeda = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);
const whatsappUrl = (telefone: string) => {
  const digitos = telefone.replace(/\D/g, "");
  return `https://web.whatsapp.com/send?phone=${digitos.startsWith("55") ? digitos : `55${digitos}`}`;
};

export default function ComercialCRM() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busca, setBusca] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [leadPerda, setLeadPerda] = useState<Lead | null>(null);
  const [leadHistorico, setLeadHistorico] = useState<Lead | null>(null);
  const [perda, setPerda] = useState({ motivo: "", observacao: "" });
  const [leadAcao, setLeadAcao] = useState<Lead | null>(null);
  const [novaAcao, setNovaAcao] = useState({ descricao: "", agendado_para: "" });

  const { data: atividades = [] } = useQuery({
    queryKey: ["mkt-lead-atividades-pendentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mkt_lead_atividades")
        .select("id,lead_id,descricao,agendado_para,responsavel_id,status")
        .eq("status", "pendente")
        .order("agendado_para", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Atividade[];
    },
  });

  const { data: campanhas = [] } = useQuery({
    queryKey: ["crm-campanhas-selecao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mkt_campanhas")
        .select("id,nome,status").in("status", ["planejada", "ativa", "pausada"]).order("nome");
      if (error) throw error;
      return (data ?? []) as Campanha[];
    },
  });
  const { data: responsaveis = [] } = useQuery({
    queryKey: ["comercial-responsaveis-autorizados"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("comercial_responsaveis_autorizados");
      if (error) throw error;
      return (data ?? []) as Responsavel[];
    },
  });
  const { data: historico = [], isLoading: carregandoHistorico } = useQuery({
    queryKey: ["mkt-lead-historico", leadHistorico?.id],
    enabled: !!leadHistorico,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mkt_lead_historico")
        .select("id,evento,estado_anterior,estado_novo,alterado_por,criado_em")
        .eq("lead_id", leadHistorico!.id).order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Historico[];
    },
  });

  const { data: leads = [], isLoading, error } = useQuery({
    queryKey: ["crm-leads"],
    queryFn: async () => {
      const { data, error: erro } = await (supabase as any).from("mkt_leads")
        .select("id,nome,whatsapp,email,area_direito,canal,campanha_id,status,valor_contrato,responsavel_id,motivo_perda,observacao_perda,criado_em")
        .order("criado_em", { ascending: false });
      if (erro) throw erro;
      return (data ?? []) as Lead[];
    },
  });

  useEffect(() => {
    const leadId = searchParams.get("lead");
    const acao = searchParams.get("acao");
    if (!leadId || acao !== "abrir") return;
    const lead = leads.find((item) => item.id === leadId);
    if (lead) setLeadAcao(lead);
  }, [leads, searchParams]);

  const criarAtividade = useMutation({
    mutationFn: async () => {
      if (!leadAcao || novaAcao.descricao.trim().length < 2 || !novaAcao.agendado_para) {
        throw new Error("Informe a próxima ação e a data.");
      }
      const data = new Date(novaAcao.agendado_para);
      if (Number.isNaN(data.getTime())) throw new Error("Data inválida.");
      const { error } = await (supabase as any).from("mkt_lead_atividades").insert({
        lead_id: leadAcao.id,
        descricao: novaAcao.descricao.trim(),
        agendado_para: data.toISOString(),
        responsavel_id: leadAcao.responsavel_id || user?.id || null,
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNovaAcao({ descricao: "", agendado_para: "" });
      await queryClient.invalidateQueries({ queryKey: ["mkt-lead-atividades-pendentes"] });
      toast.success("Próxima ação agendada.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível agendar a ação."),
  });

  const atualizarAtividade = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "concluida" | "cancelada" }) => {
      const agora = new Date().toISOString();
      const { error } = await (supabase as any).from("mkt_lead_atividades").update({
        status,
        concluido_em: status === "concluida" ? agora : null,
        concluido_por: status === "concluida" ? user?.id : null,
        cancelado_em: status === "cancelada" ? agora : null,
        cancelado_por: status === "cancelada" ? user?.id : null,
        atualizado_em: agora,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mkt-lead-atividades-pendentes"] });
      toast.success("Atividade comercial atualizada.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível atualizar a atividade."),
  });

  const salvarLead = useMutation({
    mutationFn: async () => {
      const nome = form.nome.trim();
      if (!nome) throw new Error("Informe o nome do contato.");
      const valor = form.valor_contrato.trim() ? Number(form.valor_contrato.replace(/\./g, "").replace(",", ".")) : null;
      if (valor !== null && (!Number.isFinite(valor) || valor < 0)) throw new Error("Informe um valor válido.");
      const payload = {
        nome, whatsapp: form.whatsapp.trim() || null, email: form.email.trim() || null,
        area_direito: form.area_direito || null, canal: form.canal,
        campanha_id: form.campanha_id || null, valor_contrato: valor,
        responsavel_id: form.responsavel_id || null, atualizado_em: new Date().toISOString(),
      };
      if (form.id) {
        const { error: erro } = await (supabase as any).from("mkt_leads").update(payload).eq("id", form.id);
        if (erro) throw erro;
      } else {
        const { error: erro } = await (supabase as any).from("mkt_leads")
          .insert({ ...payload, status: "novo", registrado_por: user?.id || null });
        if (erro) throw erro;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm-leads"] }),
        queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] }),
        queryClient.invalidateQueries({ queryKey: ["mkt-campanhas"] }),
      ]);
      setFormAberto(false); setForm(formVazio);
      toast.success(form.id ? "Atendimento atualizado." : "Atendimento incluído no CRM.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar o atendimento."),
  });

  const alterarEtapa = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const alteracoes: Record<string, unknown> = { status, atualizado_em: new Date().toISOString() };
      if (status === "convertido") alteracoes.data_conversao = new Date().toISOString().slice(0, 10);
      const { error: erro } = await (supabase as any).from("mkt_leads").update(alteracoes).eq("id", id);
      if (erro) throw erro;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm-leads"] }),
        queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] }),
        queryClient.invalidateQueries({ queryKey: ["mkt-campanhas"] }),
      ]);
      toast.success("Etapa atualizada.");
    },
    onError: () => toast.error("Não foi possível alterar a etapa."),
  });

  const registrarPerda = useMutation({
    mutationFn: async () => {
      if (!leadPerda || !perda.motivo) throw new Error("Selecione o motivo da perda.");
      const { error: erro } = await (supabase as any).from("mkt_leads").update({
        status: "perdido", motivo_perda: perda.motivo,
        observacao_perda: perda.observacao.trim() || null, atualizado_em: new Date().toISOString(),
      }).eq("id", leadPerda.id);
      if (erro) throw erro;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm-leads"] }),
        queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] }),
      ]);
      setLeadPerda(null); setPerda({ motivo: "", observacao: "" });
      toast.success("Perda registrada com o motivo.");
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const mudarEtapa = (lead: Lead, status: string) => {
    if (status === "perdido" && lead.status !== "perdido") {
      setLeadPerda(lead); setPerda({ motivo: lead.motivo_perda || "", observacao: lead.observacao_perda || "" });
      return;
    }
    alterarEtapa.mutate({ id: lead.id, status });
  };
  const abrirNovo = () => { setForm(formVazio); setFormAberto(true); };
  const editar = (lead: Lead) => {
    setForm({
      id: lead.id, nome: lead.nome, whatsapp: lead.whatsapp || "", email: lead.email || "",
      area_direito: lead.area_direito || "", canal: lead.canal, campanha_id: lead.campanha_id || "",
      valor_contrato: lead.valor_contrato == null ? "" : String(lead.valor_contrato).replace(".", ","),
      responsavel_id: lead.responsavel_id || "",
    });
    setFormAberto(true);
  };
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return leads;
    return leads.filter((lead) => [lead.nome, lead.whatsapp, lead.email, lead.area_direito, lead.canal].some((v) => (v || "").toLowerCase().includes(termo)));
  }, [busca, leads]);
  const proximaAtividade = useMemo(() => {
    const mapa = new Map<string, Atividade>();
    atividades.forEach((atividade) => {
      if (!mapa.has(atividade.lead_id)) mapa.set(atividade.lead_id, atividade);
    });
    return mapa;
  }, [atividades]);
  const total = useMemo(() => leads.reduce((s, lead) => s + Number(lead.valor_contrato || 0), 0), [leads]);
  const submit = (evento: FormEvent) => { evento.preventDefault(); salvarLead.mutate(); };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Comercial</p><h1 className="font-display text-3xl">CRM</h1><p className="text-sm text-muted-foreground">Negociações e contratos registrados no sistema.</p></div>
        <Button className="gap-2" onClick={abrirNovo}><Plus className="h-4 w-4" />Novo atendimento</Button>
      </header>
      {error && <Card className="border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar o CRM.</Card>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-primary" /><div><p className="text-2xl font-semibold">{leads.length}</p><p className="text-xs text-muted-foreground">Negociações reais</p></div></Card>
        <Card className="flex items-center gap-3 p-4"><CircleDollarSign className="h-5 w-5 text-primary" /><div><p className="text-2xl font-semibold">{moeda(total)}</p><p className="text-xs text-muted-foreground">Valor informado</p></div></Card>
      </div>
      <div className="relative max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone, e-mail, área ou origem" className="pl-9" /></div>

      <div className="grid gap-4 overflow-x-auto pb-2 xl:grid-cols-5">
        {COLUNAS.map(([status, titulo]) => {
          const itens = filtrados.filter((lead) => lead.status === status);
          return (
            <section key={status} className="min-w-[270px] rounded-xl border bg-muted/25 p-3">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg">{titulo}</h2><span className="rounded-full bg-background px-2 py-0.5 text-xs">{itens.length}</span></div>
              <div className="space-y-3">
                {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : itens.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma negociação</p> : itens.map((lead) => (
                  <Card key={lead.id} className="space-y-3 p-4">
                    <div>
                      <div className="flex items-start justify-between gap-2"><p className="font-semibold">{lead.nome}</p><div className="flex">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLeadHistorico(lead)} aria-label="Ver histórico"><History className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLeadAcao(lead)} aria-label="Agendar próxima ação"><CalendarClock className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editar(lead)} aria-label="Editar atendimento"><Pencil className="h-3.5 w-3.5" /></Button>
                      </div></div>
                      <p className="mt-1 text-sm text-muted-foreground">{lead.area_direito || "Área não informada"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Origem: {lead.canal}</p>
                      {lead.whatsapp && <a className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline" href={whatsappUrl(lead.whatsapp)} target="_blank" rel="noreferrer">{lead.whatsapp}<ExternalLink className="h-3 w-3" /></a>}
                      {lead.valor_contrato != null && <p className="mt-2 font-medium text-primary">{moeda(Number(lead.valor_contrato))}</p>}
                      {proximaAtividade.get(lead.id) && (() => {
                        const atividade = proximaAtividade.get(lead.id)!;
                        const vencida = new Date(atividade.agendado_para).getTime() < Date.now();
                        return (
                          <div className={`mt-3 rounded-md border p-2 text-xs ${vencida ? "border-destructive/30 bg-destructive/5" : "bg-muted/40"}`}>
                            <p className="font-medium">{atividade.descricao}</p>
                            <p className={vencida ? "mt-1 text-destructive" : "mt-1 text-muted-foreground"}>
                              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(atividade.agendado_para))}
                            </p>
                          </div>
                        );
                      })()}
                      {lead.status === "perdido" && lead.motivo_perda && <p className="mt-2 text-xs text-destructive">Motivo: {MOTIVOS_PERDA.find(([id]) => id === lead.motivo_perda)?.[1] || lead.motivo_perda}</p>}
                    </div>
                    <Select value={lead.status} onValueChange={(novoStatus) => mudarEtapa(lead, novoStatus)} disabled={alterarEtapa.isPending}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{COLUNAS.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={!!leadAcao} onOpenChange={(aberto) => {
        if (!aberto) {
          setLeadAcao(null);
          setNovaAcao({ descricao: "", agendado_para: "" });
          if (searchParams.has("lead") || searchParams.has("acao")) {
            const proximos = new URLSearchParams(searchParams);
            proximos.delete("lead");
            proximos.delete("acao");
            setSearchParams(proximos, { replace: true });
          }
        }
      }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Próximas ações</DialogTitle>
            <DialogDescription>{leadAcao?.nome} · compromissos comerciais registrados.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[260px] space-y-2 overflow-y-auto py-2">
            {atividades.filter((atividade) => atividade.lead_id === leadAcao?.id).length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma ação pendente.</p>
            ) : atividades.filter((atividade) => atividade.lead_id === leadAcao?.id).map((atividade) => (
              <div key={atividade.id} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{atividade.descricao}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(atividade.agendado_para))}
                  </p>
                </div>
                <Button size="icon" variant="outline" title="Concluir" disabled={atualizarAtividade.isPending} onClick={() => atualizarAtividade.mutate({ id: atividade.id, status: "concluida" })}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="Cancelar" disabled={atualizarAtividade.isPending} onClick={() => atualizarAtividade.mutate({ id: atividade.id, status: "cancelada" })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="space-y-3 border-t pt-4">
            <Input value={novaAcao.descricao} maxLength={500} onChange={(e) => setNovaAcao((a) => ({ ...a, descricao: e.target.value }))} placeholder="Ex.: retornar com proposta revisada" />
            <Input type="datetime-local" value={novaAcao.agendado_para} onChange={(e) => setNovaAcao((a) => ({ ...a, agendado_para: e.target.value }))} />
            <Button disabled={criarAtividade.isPending || novaAcao.descricao.trim().length < 2 || !novaAcao.agendado_para} onClick={() => criarAtividade.mutate()}>
              {criarAtividade.isPending ? "Agendando…" : "Agendar próxima ação"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={formAberto} onOpenChange={setFormAberto}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submit}>
            <DialogHeader><DialogTitle>{form.id ? "Editar atendimento" : "Novo atendimento comercial"}</DialogTitle><DialogDescription>O cadastro alimenta o CRM e não envia mensagens automaticamente.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <Campo label="Nome *" classe="sm:col-span-2"><Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} /></Campo>
              <Campo label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="(65) 99999-9999" /></Campo>
              <Campo label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Campo>
              <Campo label="Área jurídica"><SeletorComVazio valor={form.area_direito} vazio="nao_informada" labelVazio="Não informada" opcoes={AREAS} onChange={(area_direito) => setForm((f) => ({ ...f, area_direito }))} /></Campo>
              <Campo label="Origem *"><Seletor valor={form.canal} opcoes={CANAIS} onChange={(canal) => setForm((f) => ({ ...f, canal }))} /></Campo>
              <Campo label="Campanha" classe="sm:col-span-2">
                <Select value={form.campanha_id || "sem_campanha"} onValueChange={(v) => setForm((f) => ({ ...f, campanha_id: v === "sem_campanha" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem_campanha">Sem campanha vinculada</SelectItem>{campanhas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome} · {c.status}</SelectItem>)}</SelectContent></Select>
              </Campo>
              <Campo label="Responsável">
                <Select value={form.responsavel_id || "sem_responsavel"} onValueChange={(v) => setForm((f) => ({ ...f, responsavel_id: v === "sem_responsavel" ? "" : v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem_responsavel">Sem responsável</SelectItem>{responsaveis.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.nome}{r.gestor ? " · Gestora" : ""}</SelectItem>)}</SelectContent></Select>
              </Campo>
              <Campo label="Valor estimado"><Input value={form.valor_contrato} onChange={(e) => setForm((f) => ({ ...f, valor_contrato: e.target.value }))} placeholder="0,00" inputMode="decimal" /></Campo>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setFormAberto(false)}>Cancelar</Button><Button type="submit" disabled={salvarLead.isPending}>{salvarLead.isPending ? "Salvando…" : "Salvar atendimento"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leadHistorico} onOpenChange={(aberto) => !aberto && setLeadHistorico(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Histórico comercial</DialogTitle><DialogDescription>{leadHistorico?.nome} · alterações registradas a partir da ativação da auditoria.</DialogDescription></DialogHeader>
          <div className="max-h-[480px] space-y-3 overflow-y-auto py-2">
            {carregandoHistorico ? <p className="text-sm text-muted-foreground">Carregando…</p> : historico.length === 0 ? (
              <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Nenhuma alteração registrada após a ativação do histórico.</p>
            ) : historico.map((item) => {
              const antes = item.estado_anterior || {};
              const mudancas = Object.entries(item.estado_novo).filter(([chave, valor]) => antes[chave] !== valor);
              const autor = responsaveis.find((r) => r.user_id === item.alterado_por)?.nome || (item.alterado_por ? "Usuário autorizado" : "Sistema");
              return <Card key={item.id} className="p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-medium">{item.evento === "criado" ? "Atendimento criado" : "Cadastro atualizado"}</p><span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.criado_em))}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">Por {autor}</p>
                <div className="mt-3 space-y-1 text-xs">{mudancas.map(([chave, valor]) => <p key={chave}><span className="text-muted-foreground">{chave.replace(/_/g, " ")}:</span> {String(valor ?? "não informado")}</p>)}</div>
              </Card>;
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!leadPerda} onOpenChange={(aberto) => !aberto && setLeadPerda(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserX className="h-5 w-5 text-destructive" />Registrar perda</DialogTitle><DialogDescription>Informe por que {leadPerda?.nome} não avançou. O registro poderá ser consultado depois.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <Campo label="Motivo *"><SeletorComVazio valor={perda.motivo} vazio="selecione" labelVazio="Selecione" opcoes={MOTIVOS_PERDA} onChange={(motivo) => setPerda((p) => ({ ...p, motivo }))} /></Campo>
            <Campo label="Observação"><textarea rows={4} maxLength={1000} value={perda.observacao} onChange={(e) => setPerda((p) => ({ ...p, observacao: e.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" /></Campo>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLeadPerda(null)}>Cancelar</Button><Button variant="destructive" disabled={!perda.motivo || registrarPerda.isPending} onClick={() => registrarPerda.mutate()}>{registrarPerda.isPending ? "Registrando…" : "Confirmar perda"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, classe = "", children }: { label: string; classe?: string; children: React.ReactNode }) {
  return <label className={`space-y-1.5 ${classe}`}><span className="text-sm font-medium">{label}</span>{children}</label>;
}
function Seletor({ valor, opcoes, onChange }: { valor: string; opcoes: readonly (readonly [string, string])[]; onChange: (valor: string) => void }) {
  return <Select value={valor} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{opcoes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent></Select>;
}
function SeletorComVazio({ valor, vazio, labelVazio, opcoes, onChange }: { valor: string; vazio: string; labelVazio: string; opcoes: readonly (readonly [string, string])[]; onChange: (valor: string) => void }) {
  return <Select value={valor || vazio} onValueChange={(v) => onChange(v === vazio ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={vazio}>{labelVazio}</SelectItem>{opcoes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent></Select>;
}
