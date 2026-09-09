import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Pause, Pencil, Play, Plus, ShieldCheck, Workflow } from "lucide-react";
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

type Automacao = {
  id: string;
  nome: string;
  categoria: string;
  gatilho: string;
  atraso_minutos: number;
  mensagem_template: string;
  status: string;
  atualizado_em: string;
};
type Execucao = { automacao_id: string; status: string; executada_em: string | null };

const CATEGORIAS = [
  ["follow_up", "Follow-up"], ["crm", "CRM"], ["captacao", "Captação"], ["mensagem", "Mensagem"],
] as const;
const GATILHOS = [
  ["lead_criado", "Atendimento criado"],
  ["etapa_alterada", "Etapa do CRM alterada"],
  ["contrato_assinado", "Contrato assinado"],
] as const;
const vazio = { id: "", nome: "", categoria: "follow_up", gatilho: "lead_criado", atraso_minutos: "0", mensagem_template: "" };
const label = (opcoes: readonly (readonly [string, string])[], valor: string) => opcoes.find(([id]) => id === valor)?.[1] || valor;

export default function ComercialAutomacoes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState(vazio);

  const { data, isLoading, error } = useQuery({
    queryKey: ["mkt-automacoes"],
    queryFn: async () => {
      const [automacoes, execucoes, conexao] = await Promise.all([
        (supabase as any).from("mkt_automacoes")
          .select("id,nome,categoria,gatilho,atraso_minutos,mensagem_template,status,atualizado_em")
          .order("criado_em", { ascending: false }),
        (supabase as any).from("mkt_automacao_execucoes")
          .select("automacao_id,status,executada_em")
          .order("criado_em", { ascending: false }).limit(200),
        (supabase as any).from("whatsapp_conexoes")
          .select("id,status").eq("ativo", true).maybeSingle(),
      ]);
      if (automacoes.error) throw automacoes.error;
      if (execucoes.error) throw execucoes.error;
      if (conexao.error) throw conexao.error;
      return {
        automacoes: (automacoes.data ?? []) as Automacao[],
        execucoes: (execucoes.data ?? []) as Execucao[],
        canalConectado: conexao.data?.status === "conectado",
      };
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const atraso = Number(form.atraso_minutos);
      if (!form.nome.trim()) throw new Error("Informe o nome da automação.");
      if (!form.mensagem_template.trim()) throw new Error("Informe a mensagem.");
      if (!Number.isInteger(atraso) || atraso < 0 || atraso > 43200) throw new Error("O atraso deve estar entre 0 e 43.200 minutos.");
      const payload = {
        nome: form.nome.trim(),
        categoria: form.categoria,
        gatilho: form.gatilho,
        atraso_minutos: atraso,
        mensagem_template: form.mensagem_template.trim(),
        status: "rascunho",
        atualizado_por: user?.id || null,
        atualizado_em: new Date().toISOString(),
      };
      if (form.id) {
        const { error: erro } = await (supabase as any).from("mkt_automacoes").update(payload).eq("id", form.id);
        if (erro) throw erro;
      } else {
        const { error: erro } = await (supabase as any).from("mkt_automacoes").insert({ ...payload, criado_por: user?.id || null });
        if (erro) throw erro;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mkt-automacoes"] });
      setDialogAberto(false);
      setForm(vazio);
      toast.success("Automação salva como rascunho.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar a automação."),
  });

  const alterarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error: erro } = await (supabase as any).rpc("mkt_automacao_definir_status", { _id: id, _status: status });
      if (erro) throw erro;
    },
    onSuccess: async (_, variaveis) => {
      await queryClient.invalidateQueries({ queryKey: ["mkt-automacoes"] });
      toast.success(variaveis.status === "ativa" ? "Automação ativada." : "Automação pausada.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível alterar a automação."),
  });

  const automacoes = data?.automacoes ?? [];
  const execucoes = data?.execucoes ?? [];
  const ativas = automacoes.filter((item) => item.status === "ativa").length;
  const sucessos = execucoes.filter((item) => item.status === "sucesso").length;
  const falhas = execucoes.filter((item) => item.status === "falha").length;

  const abrirNova = () => { setForm(vazio); setDialogAberto(true); };
  const editar = (item: Automacao) => {
    setForm({
      id: item.id, nome: item.nome, categoria: item.categoria, gatilho: item.gatilho,
      atraso_minutos: String(item.atraso_minutos), mensagem_template: item.mensagem_template,
    });
    setDialogAberto(true);
  };
  const submit = (evento: FormEvent) => { evento.preventDefault(); salvar.mutate(); };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Comercial</p><h1 className="font-display text-3xl">Automações</h1><p className="text-sm text-muted-foreground">Regras comerciais controladas e auditáveis.</p></div>
        <Button className="gap-2" onClick={abrirNova}><Plus className="h-4 w-4" />Nova automação</Button>
      </header>

      {!data?.canalConectado && (
        <Card className="flex gap-3 border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div><p className="font-medium">Ativação protegida</p><p className="text-sm">Você pode preparar rascunhos, mas nenhuma regra será ativada até a homologação do WhatsApp oficial.</p></div>
        </Card>
      )}
      {error && <Card className="border-destructive/40 p-4 text-sm text-destructive">Não foi possível carregar as automações.</Card>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo icone={Workflow} label="Ativas" valor={isLoading ? "…" : String(ativas)} />
        <Resumo icone={CheckCircle2} label="Execuções com sucesso" valor={isLoading ? "…" : String(sucessos)} />
        <Resumo icone={AlertTriangle} label="Execuções com falha" valor={isLoading ? "…" : String(falhas)} />
      </div>

      {isLoading ? <p>Carregando…</p> : automacoes.length === 0 ? (
        <Card className="p-8"><div className="mx-auto max-w-xl text-center"><Workflow className="mx-auto h-10 w-10 text-primary/50" /><h2 className="mt-4 font-display text-2xl">Nenhuma automação cadastrada</h2><p className="mt-2 text-sm text-muted-foreground">Crie rascunhos agora. A ativação continuará bloqueada até o canal estar conectado.</p><Button className="mt-5" onClick={abrirNova}>Criar primeiro rascunho</Button></div></Card>
      ) : (
        <div className="space-y-3">
          {automacoes.map((item) => {
            const historico = execucoes.filter((execucao) => execucao.automacao_id === item.id);
            return (
              <Card key={item.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{item.nome}</h2>
                      <Badge variant={item.status === "ativa" ? "default" : "secondary"}>{item.status}</Badge>
                      <Badge variant="outline">{label(CATEGORIAS, item.categoria)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {label(GATILHOS, item.gatilho)} · {item.atraso_minutos === 0 ? "imediato" : `após ${item.atraso_minutos} min`}
                    </p>
                    <p className="mt-2 max-w-3xl truncate text-sm">{item.mensagem_template}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="mr-2 text-xs text-muted-foreground">{historico.length} execução(ões)</span>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => editar(item)}><Pencil className="h-3.5 w-3.5" />Editar</Button>
                    {item.status === "ativa" ? (
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => alterarStatus.mutate({ id: item.id, status: "pausada" })}><Pause className="h-3.5 w-3.5" />Pausar</Button>
                    ) : (
                      <Button size="sm" className="gap-2" disabled={!data?.canalConectado} onClick={() => alterarStatus.mutate({ id: item.id, status: "ativa" })}><Play className="h-3.5 w-3.5" />Ativar</Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-5"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 text-emerald-700" /><div><p className="font-medium">Proteções aplicadas</p><p className="mt-1 text-sm text-muted-foreground">Canal homologado obrigatório, rascunho por padrão, permissões, fila idempotente e histórico de execução. Os gatilhos usam eventos reais do CRM e dos contratos; o motor jurídico de Fluxos permanece separado.</p></div></div></Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submit}>
            <DialogHeader><DialogTitle>{form.id ? "Editar automação" : "Nova automação"}</DialogTitle><DialogDescription>Salvar ou editar sempre devolve a regra ao estado de rascunho para revisão.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <Campo label="Nome *" classe="sm:col-span-2"><Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} /></Campo>
              <Campo label="Categoria"><Seletor valor={form.categoria} opcoes={CATEGORIAS} onChange={(categoria) => setForm((f) => ({ ...f, categoria }))} /></Campo>
              <Campo label="Gatilho"><Seletor valor={form.gatilho} opcoes={GATILHOS} onChange={(gatilho) => setForm((f) => ({ ...f, gatilho }))} /></Campo>
              <Campo label="Espera em minutos"><Input type="number" min="0" max="43200" value={form.atraso_minutos} onChange={(e) => setForm((f) => ({ ...f, atraso_minutos: e.target.value }))} /></Campo>
              <div className="flex items-end text-xs text-muted-foreground"><Clock3 className="mr-2 h-4 w-4" />Máximo de 30 dias.</div>
              <Campo label="Mensagem *" classe="sm:col-span-2"><textarea required maxLength={4096} rows={5} value={form.mensagem_template} onChange={(e) => setForm((f) => ({ ...f, mensagem_template: e.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Escreva a mensagem que deverá ser revisada antes da ativação." /></Campo>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button><Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar rascunho"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Resumo({ icone: Icone, label, valor }: { icone: typeof Workflow; label: string; valor: string }) {
  return <Card className="p-4"><Icone className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-semibold">{valor}</p><p className="text-xs text-muted-foreground">{label}</p></Card>;
}
function Campo({ label, classe = "", children }: { label: string; classe?: string; children: React.ReactNode }) {
  return <label className={`space-y-1.5 ${classe}`}><span className="text-sm font-medium">{label}</span>{children}</label>;
}
function Seletor({ valor, opcoes, onChange }: { valor: string; opcoes: readonly (readonly [string, string])[]; onChange: (valor: string) => void }) {
  return <Select value={valor} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{opcoes.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}</SelectContent></Select>;
}
