import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Megaphone, Pencil, Plus, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Campanha = {
  id: string;
  nome: string;
  canal: string;
  objetivo: string;
  area_direito: string | null;
  status: string;
  data_inicio: string | null;
  data_fim: string | null;
  orcamento_total: number | null;
  gasto_realizado: number | null;
};
type LeadCampanha = {
  campanha_id: string | null;
  status: string;
  valor_contrato: number | null;
};

const CANAIS = [
  ["meta_ads", "Meta Ads"], ["google_ads", "Google Ads"],
  ["tiktok_ads", "TikTok Ads"], ["outro_pago", "Outro canal pago"],
] as const;
const OBJETIVOS = [
  ["leads", "Geração de leads"], ["trafego", "Tráfego"], ["alcance", "Alcance"],
  ["conversao", "Conversão"], ["engajamento", "Engajamento"],
] as const;
const STATUS = [
  ["planejada", "Planejada"], ["ativa", "Ativa"], ["pausada", "Pausada"], ["encerrada", "Encerrada"],
] as const;

const vazio = {
  id: "", nome: "", canal: "meta_ads", objetivo: "leads", area_direito: "",
  status: "planejada", data_inicio: "", data_fim: "", orcamento_total: "", gasto_realizado: "",
};
const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
const numero = (valor: string) => {
  if (!valor.trim()) return null;
  const n = Number(valor.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error("Informe valores financeiros válidos.");
  return n;
};
const rotulo = (opcoes: readonly (readonly [string, string])[], valor: string) =>
  opcoes.find(([id]) => id === valor)?.[1] || valor;

export default function ComercialCampanhas() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState(vazio);

  const { data, isLoading, error } = useQuery({
    queryKey: ["mkt-campanhas"],
    queryFn: async () => {
      const [campanhas, leads] = await Promise.all([
        (supabase as any).from("mkt_campanhas")
          .select("id,nome,canal,objetivo,area_direito,status,data_inicio,data_fim,orcamento_total,gasto_realizado")
          .order("criado_em", { ascending: false }),
        (supabase as any).from("mkt_leads")
          .select("campanha_id,status,valor_contrato")
          .not("campanha_id", "is", null),
      ]);
      if (campanhas.error) throw campanhas.error;
      if (leads.error) throw leads.error;
      return {
        campanhas: (campanhas.data ?? []) as Campanha[],
        leads: (leads.data ?? []) as LeadCampanha[],
      };
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome da campanha.");
      if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) {
        throw new Error("A data final não pode ser anterior à data inicial.");
      }
      const payload = {
        nome: form.nome.trim(),
        canal: form.canal,
        objetivo: form.objetivo,
        area_direito: form.area_direito.trim() || null,
        status: form.status,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        orcamento_total: numero(form.orcamento_total),
        gasto_realizado: numero(form.gasto_realizado),
        atualizado_em: new Date().toISOString(),
      };
      if (form.id) {
        const { error: erro } = await (supabase as any).from("mkt_campanhas").update(payload).eq("id", form.id);
        if (erro) throw erro;
      } else {
        const { error: erro } = await (supabase as any).from("mkt_campanhas")
          .insert({ ...payload, criado_por: user?.id || null });
        if (erro) throw erro;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mkt-campanhas"] });
      setDialogAberto(false);
      setForm(vazio);
      toast.success("Campanha salva.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar a campanha."),
  });

  const campanhas = data?.campanhas ?? [];
  const leads = data?.leads ?? [];
  const totais = useMemo(() => {
    const investimento = campanhas.reduce((s, c) => s + Number(c.gasto_realizado || 0), 0);
    const receita = leads
      .filter((l) => l.status === "convertido")
      .reduce((s, l) => s + Number(l.valor_contrato || 0), 0);
    return { investimento, receita, leads: leads.length, roas: investimento > 0 ? receita / investimento : null };
  }, [campanhas, leads]);

  const abrirNova = () => { setForm(vazio); setDialogAberto(true); };
  const editar = (c: Campanha) => {
    setForm({
      id: c.id, nome: c.nome, canal: c.canal, objetivo: c.objetivo,
      area_direito: c.area_direito || "", status: c.status,
      data_inicio: c.data_inicio || "", data_fim: c.data_fim || "",
      orcamento_total: c.orcamento_total == null ? "" : String(c.orcamento_total).replace(".", ","),
      gasto_realizado: c.gasto_realizado == null ? "" : String(c.gasto_realizado).replace(".", ","),
    });
    setDialogAberto(true);
  };
  const submit = (evento: FormEvent) => { evento.preventDefault(); salvar.mutate(); };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Comercial</p>
          <h1 className="font-display text-3xl">Campanhas e origens</h1>
          <p className="text-sm text-muted-foreground">Investimento e retorno vinculados aos registros reais do CRM.</p>
        </div>
        <Button className="gap-2" onClick={abrirNova}><Plus className="h-4 w-4" />Nova campanha</Button>
      </header>

      {error && <Card className="border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar as campanhas.</Card>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo icone={Megaphone} rotulo="Campanhas" valor={isLoading ? "…" : String(campanhas.length)} />
        <Resumo icone={Target} rotulo="Leads vinculados" valor={isLoading ? "…" : String(totais.leads)} />
        <Resumo icone={BarChart3} rotulo="Investimento registrado" valor={isLoading ? "…" : moeda(totais.investimento)} />
        <Resumo icone={BarChart3} rotulo="ROAS registrado" valor={isLoading ? "…" : totais.roas == null ? "Sem base" : `${totais.roas.toFixed(1).replace(".", ",")}x`} />
      </div>

      {isLoading ? <p>Carregando…</p> : campanhas.length === 0 ? (
        <Card className="p-10 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-primary/40" />
          <h2 className="mt-3 font-display text-2xl">Nenhuma campanha cadastrada</h2>
          <p className="mt-2 text-sm text-muted-foreground">Cadastre a primeira campanha para vincular atendimentos e medir resultados reais.</p>
          <Button className="mt-5" onClick={abrirNova}>Cadastrar primeira campanha</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {campanhas.map((campanha) => {
            const vinculados = leads.filter((lead) => lead.campanha_id === campanha.id);
            const convertidos = vinculados.filter((lead) => lead.status === "convertido");
            const receita = convertidos.reduce((s, lead) => s + Number(lead.valor_contrato || 0), 0);
            const gasto = Number(campanha.gasto_realizado || 0);
            return (
              <Card key={campanha.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl">{campanha.nome}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {rotulo(CANAIS, campanha.canal)} · {campanha.area_direito || "Todas as áreas"}
                    </p>
                  </div>
                  <Badge variant={campanha.status === "ativa" ? "default" : "secondary"}>
                    {rotulo(STATUS, campanha.status)}
                  </Badge>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Gasto</p><p className="font-medium">{moeda(gasto)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Leads</p><p className="font-medium">{vinculados.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Contratos</p><p className="font-medium">{convertidos.length}</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
                  <span className="text-muted-foreground">Retorno atribuído</span>
                  <strong>{moeda(receita)}</strong>
                </div>
                <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => editar(campanha)}>
                  <Pencil className="h-3.5 w-3.5" />Editar
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        Os valores são calculados apenas com campanhas e leads vinculados no CRM. Zeros significam ausência de registro.
      </p>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar campanha" : "Nova campanha"}</DialogTitle>
              <DialogDescription>Registre somente valores e períodos confirmados.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <Campo label="Nome *" classe="sm:col-span-2"><Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} /></Campo>
              <Campo label="Canal"><Seletor valor={form.canal} opcoes={CANAIS} onChange={(canal) => setForm((f) => ({ ...f, canal }))} /></Campo>
              <Campo label="Objetivo"><Seletor valor={form.objetivo} opcoes={OBJETIVOS} onChange={(objetivo) => setForm((f) => ({ ...f, objetivo }))} /></Campo>
              <Campo label="Área jurídica"><Input value={form.area_direito} onChange={(e) => setForm((f) => ({ ...f, area_direito: e.target.value }))} placeholder="Ex.: Previdenciário" /></Campo>
              <Campo label="Status"><Seletor valor={form.status} opcoes={STATUS} onChange={(status) => setForm((f) => ({ ...f, status }))} /></Campo>
              <Campo label="Data inicial"><Input type="date" value={form.data_inicio} onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))} /></Campo>
              <Campo label="Data final"><Input type="date" value={form.data_fim} onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))} /></Campo>
              <Campo label="Orçamento total"><Input inputMode="decimal" value={form.orcamento_total} onChange={(e) => setForm((f) => ({ ...f, orcamento_total: e.target.value }))} placeholder="0,00" /></Campo>
              <Campo label="Gasto realizado"><Input inputMode="decimal" value={form.gasto_realizado} onChange={(e) => setForm((f) => ({ ...f, gasto_realizado: e.target.value }))} placeholder="0,00" /></Campo>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar campanha"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Resumo({ icone: Icone, rotulo: nome, valor }: { icone: typeof Megaphone; rotulo: string; valor: string }) {
  return <Card className="p-4"><Icone className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-semibold">{valor}</p><p className="text-xs text-muted-foreground">{nome}</p></Card>;
}
function Campo({ label, classe = "", children }: { label: string; classe?: string; children: React.ReactNode }) {
  return <label className={`space-y-1.5 ${classe}`}><span className="text-sm font-medium">{label}</span>{children}</label>;
}
function Seletor({ valor, opcoes, onChange }: { valor: string; opcoes: readonly (readonly [string, string])[]; onChange: (valor: string) => void }) {
  return <Select value={valor} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{opcoes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent></Select>;
}
