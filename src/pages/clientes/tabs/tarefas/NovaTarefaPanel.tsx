import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, X, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TIPO_LABELS, PRIORIDADE_LABELS, TipoItem, Prioridade } from "@/pages/controladoria/types";
import SugerirTarefaIADialog, { SugestaoTarefa } from "@/components/tarefas/SugerirTarefaIADialog";

interface ProcessoOpt { id: string; label: string; }
interface PessoaOpt { id: string; nome: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNome: string;
  onCriada?: () => void;
}

const TIPOS_PERMITIDOS: TipoItem[] = ["tarefa", "prazo_fatal", "prazo_processual", "diligencia", "reuniao"];

export default function NovaTarefaPanel({ open, onClose, clienteId, clienteNome, onCriada }: Props) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoItem>("tarefa");
  const [processoId, setProcessoId] = useState<string>("");
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [dataVencimento, setDataVencimento] = useState<Date | undefined>();
  const [hora, setHora] = useState<string>("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmarPrazoFatal, setConfirmarPrazoFatal] = useState(false);
  const [iaOpen, setIaOpen] = useState(false);

  function aplicarSugestao(s: SugestaoTarefa) {
    setTitulo(s.titulo);
    setTipo(s.tipo);
    setPrioridade(s.prioridade);
    setDescricao(s.descricao);
    if (s.data_vencimento) {
      const d = new Date(s.data_vencimento);
      if (!Number.isNaN(d.getTime())) setDataVencimento(d);
    }
    if (s.responsavel_id) setResponsavelId(s.responsavel_id);
  }

  const [processos, setProcessos] = useState<ProcessoOpt[]>([]);
  const [pessoas, setPessoas] = useState<PessoaOpt[]>([]);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setTitulo("");
    setTipo("tarefa");
    setProcessoId("");
    setResponsavelId("");
    setDataVencimento(undefined);
    setHora("");
    setPrioridade("media");
    setDescricao("");
  }, [open]);

  // Carregar dados de apoio
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [pRes, perRes] = await Promise.all([
        supabase
          .from("processos")
          .select("id, numero_cnj, tipo_acao, area_direito")
          .eq("cliente_id", clienteId)
          .order("criado_em", { ascending: false }),
        supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      setProcessos(
        (pRes.data ?? []).map((p: any) => ({
          id: p.id,
          label: `${p.numero_cnj || "Processo s/ CNJ"}${p.tipo_acao ? ` — ${p.tipo_acao}` : p.area_direito ? ` — ${p.area_direito}` : ""}`,
        })),
      );
      setPessoas((perRes.data ?? []) as PessoaOpt[]);
    })();
  }, [open, clienteId]);

  // ESC fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const responsavelNome = useMemo(
    () => pessoas.find((p) => p.id === responsavelId)?.nome,
    [pessoas, responsavelId],
  );
  const processoLabel = useMemo(
    () => processos.find((p) => p.id === processoId)?.label,
    [processos, processoId],
  );

  async function salvar() {
    if (!titulo.trim()) return toast.error("Informe o título");
    if (!dataVencimento) return toast.error("Defina a data de vencimento");

    if (tipo === "prazo_fatal" && !confirmarPrazoFatal) {
      setConfirmarPrazoFatal(true);
      return;
    }

    setSalvando(true);
    // Combina data + hora se houver
    const venc = new Date(dataVencimento);
    if (hora) {
      const [h, m] = hora.split(":").map(Number);
      if (!Number.isNaN(h) && !Number.isNaN(m)) venc.setHours(h, m, 0, 0);
    }

    const { data: criado, error } = await supabase
      .from("controladoria_itens")
      .insert({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        tipo,
        prioridade,
        status: "pendente",
        cliente_id: clienteId,
        processo_id: processoId || null,
        data_vencimento: venc.toISOString(),
        criado_por: user?.id ?? null,
        origem: "perfil_cliente",
      } as any)
      .select("id")
      .single();

    if (error) {
      setSalvando(false);
      toast.error("Não foi possível criar a tarefa", { description: error.message });
      return;
    }

    // Atribui responsável (se selecionado)
    if (responsavelId && criado?.id) {
      const { error: respErr } = await supabase
        .from("controladoria_responsaveis")
        .insert({ item_id: criado.id, user_id: responsavelId, papel: "principal" } as any);
      if (respErr) {
        // Não bloqueia — só avisa
        console.warn("Falha ao vincular responsável:", respErr.message);
      }
    }

    setSalvando(false);
    toast.success("Tarefa criada e enviada para a Controladoria");
    onCriada?.();
    onClose();
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        onClick={onClose}
        aria-hidden
      />

      {/* Painel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-tarefa-titulo"
        className={cn(
          "fixed top-0 right-0 z-50 h-screen w-full sm:w-[420px] bg-background border-l shadow-2xl",
          "flex flex-col transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Nova tarefa</p>
            <h2 id="nova-tarefa-titulo" className="font-display text-base truncate">{clienteNome}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2 border-gold/40 hover:bg-gold/10"
            onClick={() => setIaOpen(true)}
          >
            <Sparkles className="w-4 h-4 text-gold" />
            <span>Sugerir com IA</span>
            <span className="ml-auto text-xs text-muted-foreground">a Bia preenche pra você</span>
          </Button>

          <div className="space-y-1.5">
            <Label htmlFor="t-titulo">Título *</Label>
            <Input
              id="t-titulo"
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Ligar sobre resultado da perícia"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoItem)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_PERMITIDOS.map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORIDADE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Processo vinculado</Label>
            <Select value={processoId || "none"} onValueChange={(v) => setProcessoId(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={processos.length ? "Selecione" : "Sem processos cadastrados"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem processo específico</SelectItem>
                {processos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={responsavelId || "none"} onValueChange={(v) => setResponsavelId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem responsável</SelectItem>
                {pessoas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[1fr,110px] gap-3">
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start font-normal", !dataVencimento && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataVencimento ? format(dataVencimento, "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataVencimento}
                    onSelect={setDataVencimento}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhes adicionais..."
              rows={3}
            />
          </div>

          {/* Resumo */}
          <div className="rounded-md border border-success/30 bg-success/5 p-3 space-y-1 text-xs text-success">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Aparecerá na Controladoria
            </div>
            {responsavelNome && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Atribuída a {responsavelNome}
              </div>
            )}
            {processoLabel && (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Vinculada ao processo
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variant="gold" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar tarefa"}
          </Button>
        </div>
      </aside>

      {/* Confirmação de prazo fatal */}
      <AlertDialog open={confirmarPrazoFatal} onOpenChange={setConfirmarPrazoFatal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" /> Confirmar prazo fatal
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está criando um <strong>prazo fatal</strong>. Tem certeza?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmarPrazoFatal(false); setTimeout(salvar, 50); }}>
              Sim, criar prazo fatal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SugerirTarefaIADialog
        open={iaOpen}
        onOpenChange={setIaOpen}
        cliente={{ id: clienteId, nome: clienteNome }}
        equipe={pessoas}
        onSugerido={aplicarSugestao}
      />
    </>
  );
}
