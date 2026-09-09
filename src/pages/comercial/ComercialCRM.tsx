import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type Lead = {
  id: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  area_direito: string | null;
  canal: string;
  status: string;
  valor_contrato: number | null;
  criado_em: string;
};

const COLUNAS = [
  { titulo: "Recepção", status: "novo" },
  { titulo: "Em atendimento", status: "em_atendimento" },
  { titulo: "Proposta enviada", status: "proposta_enviada" },
  { titulo: "Convertido", status: "convertido" },
  { titulo: "Perdido", status: "perdido" },
] as const;

const AREAS = [
  ["previdenciario", "Previdenciário"],
  ["familia", "Família"],
  ["civil", "Cível"],
  ["trabalhista", "Trabalhista"],
  ["tributario", "Tributário"],
  ["consumidor", "Consumidor"],
  ["saude", "Saúde"],
  ["outro", "Outro / a confirmar"],
] as const;

const CANAIS = [
  ["whatsapp_direto", "WhatsApp direto"],
  ["indicacao_parceiro", "Indicação de parceiro"],
  ["instagram_organico", "Instagram orgânico"],
  ["meta_ads", "Meta Ads"],
  ["site_seo", "Site / busca"],
  ["tiktok", "TikTok"],
  ["outro", "Outro"],
] as const;

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor);

export default function ComercialCRM() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    whatsapp: "",
    email: "",
    area_direito: "",
    canal: "whatsapp_direto",
    valor_contrato: "",
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["crm-leads"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("mkt_leads")
        .select("id,nome,whatsapp,email,area_direito,canal,status,valor_contrato,criado_em")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const criarLead = useMutation({
    mutationFn: async () => {
      const nome = form.nome.trim();
      if (!nome) throw new Error("Informe o nome do contato.");
      const valor = form.valor_contrato.trim()
        ? Number(form.valor_contrato.replace(/\./g, "").replace(",", "."))
        : null;
      if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
        throw new Error("Informe um valor válido.");
      }

      const { error } = await (supabase as any).from("mkt_leads").insert({
        nome,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        area_direito: form.area_direito || null,
        canal: form.canal,
        status: "novo",
        valor_contrato: valor,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      await queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] });
      setNovoAberto(false);
      setForm({ nome: "", whatsapp: "", email: "", area_direito: "", canal: "whatsapp_direto", valor_contrato: "" });
      toast.success("Atendimento incluído no CRM.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível cadastrar o atendimento."),
  });

  const alterarEtapa = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase as any)
        .from("mkt_leads")
        .update({ status, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      await queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] });
      toast.success("Etapa atualizada.");
    },
    onError: () => toast.error("Não foi possível alterar a etapa."),
  });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return leads;
    return leads.filter((lead) =>
      [lead.nome, lead.whatsapp, lead.email, lead.area_direito, lead.canal]
        .some((valor) => (valor || "").toLowerCase().includes(termo)),
    );
  }, [busca, leads]);

  const total = useMemo(
    () => leads.reduce((soma, lead) => soma + Number(lead.valor_contrato || 0), 0),
    [leads],
  );

  const submit = (evento: FormEvent) => {
    evento.preventDefault();
    criarLead.mutate();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Comercial</p>
          <h1 className="font-display text-3xl">CRM</h1>
          <p className="text-sm text-muted-foreground">Negociações e contratos registrados no sistema.</p>
        </div>
        <Button className="gap-2" onClick={() => setNovoAberto(true)}>
          <Plus className="h-4 w-4" />Novo atendimento
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <Users className="h-5 w-5 text-primary" />
          <div><p className="text-2xl font-semibold">{leads.length}</p><p className="text-xs text-muted-foreground">Negociações reais</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <CircleDollarSign className="h-5 w-5 text-primary" />
          <div><p className="text-2xl font-semibold">{moeda(total)}</p><p className="text-xs text-muted-foreground">Valor informado</p></div>
        </Card>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar por nome, telefone, e-mail, área ou origem"
          className="pl-9"
        />
      </div>

      <div className="grid gap-4 overflow-x-auto pb-2 xl:grid-cols-5">
        {COLUNAS.map((coluna) => {
          const itens = filtrados.filter((lead) => lead.status === coluna.status);
          return (
            <section key={coluna.status} className="min-w-[270px] rounded-xl border bg-muted/25 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg">{coluna.titulo}</h2>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs">{itens.length}</span>
              </div>
              <div className="space-y-3">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : itens.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nenhuma negociação
                  </p>
                ) : (
                  itens.map((lead) => (
                    <Card key={lead.id} className="space-y-3 p-4">
                      <div>
                        <p className="font-semibold">{lead.nome}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{lead.area_direito || "Área não informada"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Origem: {lead.canal}</p>
                        {lead.whatsapp && <p className="mt-1 text-xs text-muted-foreground">{lead.whatsapp}</p>}
                        {lead.valor_contrato != null && (
                          <p className="mt-2 font-medium text-primary">{moeda(Number(lead.valor_contrato))}</p>
                        )}
                      </div>
                      <Select
                        value={lead.status}
                        onValueChange={(status) => alterarEtapa.mutate({ id: lead.id, status })}
                        disabled={alterarEtapa.isPending}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COLUNAS.map((opcao) => (
                            <SelectItem key={opcao.status} value={opcao.status}>{opcao.titulo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Card>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={novoAberto} onOpenChange={setNovoAberto}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Novo atendimento comercial</DialogTitle>
              <DialogDescription>
                O contato será gravado na recepção do CRM. Nenhuma mensagem será enviada automaticamente.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Nome *</span>
                <Input value={form.nome} onChange={(e) => setForm((atual) => ({ ...atual, nome: e.target.value }))} required />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">WhatsApp</span>
                <Input value={form.whatsapp} onChange={(e) => setForm((atual) => ({ ...atual, whatsapp: e.target.value }))} placeholder="(65) 99999-9999" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">E-mail</span>
                <Input type="email" value={form.email} onChange={(e) => setForm((atual) => ({ ...atual, email: e.target.value }))} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Área jurídica</span>
                <Select value={form.area_direito} onValueChange={(valor) => setForm((atual) => ({ ...atual, area_direito: valor }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>{AREAS.map(([valor, label]) => <SelectItem key={valor} value={valor}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Origem *</span>
                <Select value={form.canal} onValueChange={(valor) => setForm((atual) => ({ ...atual, canal: valor }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CANAIS.map(([valor, label]) => <SelectItem key={valor} value={valor}>{label}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Valor estimado</span>
                <Input value={form.valor_contrato} onChange={(e) => setForm((atual) => ({ ...atual, valor_contrato: e.target.value }))} placeholder="0,00" inputMode="decimal" />
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNovoAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={criarLead.isPending}>
                {criarLead.isPending ? "Salvando…" : "Criar atendimento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
