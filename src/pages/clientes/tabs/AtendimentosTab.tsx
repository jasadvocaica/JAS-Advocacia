import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Sparkles, Headphones, ExternalLink, Plus, Trash2, Wand2,
  ArrowRightCircle, Briefcase, FileSignature, ClipboardCheck, CalendarClock, ListChecks,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { FERRAMENTA_LABEL, registrarAtendimento, type FerramentaAtendimento } from "@/lib/atendimentos";
import { FichaAtendimentoSheet } from "./FichaAtendimentoSheet";
import { converterAtendimento, TIPO_CONVERSAO_LABEL, type TipoConversao } from "@/lib/converterAtendimento";

interface Props { clienteId: string }

interface AtendimentoRow {
  id: string;
  titulo: string;
  resumo: string;
  origem: string;
  ferramenta: string | null;
  link: string | null;
  criado_em: string;
  status?: string | null;
  area?: string | null;
  processo_id?: string | null;
  processos?: { numero_cnj: string | null; tipo: string } | null;
}

export default function AtendimentosTab({ clienteId }: Props) {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const podeCriar = hasPermission("clientes", "criar");
  const podeExcluir = hasPermission("clientes", "excluir");
  const podeCriarProcesso = hasPermission("processos", "criar");
  const podeCriarControladoria = hasPermission("controladoria", "criar");
  const [confirmar, setConfirmar] = useState<{ id: string; titulo: string; tipo: TipoConversao } | null>(null);
  const [convertendo, setConvertendo] = useState(false);

  const [items, setItems] = useState<AtendimentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adicionando, setAdicionando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [resumo, setResumo] = useState("");
  const [criandoFicha, setCriandoFicha] = useState(false);
  const [fichaAberta, setFichaAberta] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cliente_atendimentos")
      .select("id, titulo, resumo, origem, ferramenta, link, criado_em, status, area, processo_id, processos:processo_id(numero_cnj, tipo)")
      .eq("cliente_id", clienteId)
      .order("criado_em", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as AtendimentoRow[]);
    setLoading(false);
  }

  async function novaFichaIA() {
    setCriandoFicha(true);
    const { data, error } = await supabase
      .from("cliente_atendimentos")
      .insert({
        cliente_id: clienteId,
        titulo: "Nova ficha de atendimento",
        resumo: "",
        origem: "manual",
        ferramenta: "manual",
        status: "rascunho",
        criado_por: user?.id ?? null,
      })
      .select("id")
      .maybeSingle();
    setCriandoFicha(false);
    if (error || !data) {
      toast.error(error?.message ?? "Falha ao criar ficha");
      return;
    }
    setFichaAberta(data.id);
    load();
  }

  useEffect(() => { load(); }, [clienteId]);

  async function adicionar() {
    if (!titulo.trim() || !resumo.trim()) return;
    const { error } = await registrarAtendimento({
      clienteId,
      titulo,
      resumo,
      ferramenta: "manual",
      origem: "manual",
      criadoPor: user?.id ?? null,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Atendimento registrado");
      setTitulo("");
      setResumo("");
      setAdicionando(false);
      load();
    }
  }

  async function executarConversao() {
    if (!confirmar) return;
    const it = items.find((x) => x.id === confirmar.id);
    if (!it) return;
    setConvertendo(true);
    try {
      const { processoId, itemId } = await converterAtendimento({
        atendimentoId: it.id,
        clienteId,
        tipo: confirmar.tipo,
        titulo: it.titulo,
        resumo: it.resumo,
        area: it.area ?? null,
        userId: user?.id ?? null,
      });
      toast.success(`Convertido em ${TIPO_CONVERSAO_LABEL[confirmar.tipo]}`);
      setConfirmar(null);
      load();
      if (processoId) navigate(`/processos/${processoId}`);
      else if (itemId) navigate(`/controladoria`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao converter");
    } finally {
      setConvertendo(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este atendimento?")) return;
    const { error } = await supabase.from("cliente_atendimentos").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Atendimento excluído"); load(); }
  }

  return (
    <div className="space-y-4">
      {podeCriar && (
        <Card className="p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-lg">Registrar atendimento</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="gold" onClick={novaFichaIA} disabled={criandoFicha} className="gap-1">
                {criandoFicha ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Nova ficha com IA
              </Button>
              {!adicionando && (
                <Button size="sm" variant="outline" onClick={() => setAdicionando(true)}>
                  <Plus className="w-4 h-4" /> Manual
                </Button>
              )}
            </div>
          </div>
          {adicionando && (
            <div className="space-y-3">
              <Input placeholder="Título do atendimento" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              <Textarea rows={4} placeholder="Resumo do que foi tratado..." value={resumo} onChange={(e) => setResumo(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setAdicionando(false); setTitulo(""); setResumo(""); }}>Cancelar</Button>
                <Button variant="gold" size="sm" onClick={adicionar} disabled={!titulo.trim() || !resumo.trim()}>Salvar</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-6">
        <h3 className="font-display text-lg mb-4">Atendimentos do cliente</h3>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum atendimento registrado ainda. Use o Analisador de Caso ou a Análise de Publicações IA — os resumos enviados ao cadastro aparecerão aqui automaticamente.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((it) => {
              const isSistema = it.origem === "sistema";
              const Icon = isSistema ? Sparkles : Headphones;
              const ferramentaLabel = it.ferramenta
                ? FERRAMENTA_LABEL[it.ferramenta as FerramentaAtendimento] ?? it.ferramenta
                : null;
              return (
                <div key={it.id} className="flex gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-gold/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0 pb-4 border-b border-border/50 last:border-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{isSistema ? "Sistema" : "Manual"}</Badge>
                        {ferramentaLabel && (
                          <Badge variant="secondary" className="text-xs">{ferramentaLabel}</Badge>
                        )}
                        {it.processos?.numero_cnj && (
                          <Badge variant="outline" className="text-xs">
                            Proc. {it.processos.numero_cnj}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(it.criado_em)}</span>
                    </div>
                    <p className="font-medium text-sm mb-1">{it.titulo}</p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{it.resumo}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {it.link && (
                        <Button variant="link" size="sm" asChild className="h-auto p-0 text-gold">
                          <Link to={it.link}><ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir registro original</Link>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1 ml-auto"
                            disabled={it.status === "convertido"}
                          >
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                            {it.status === "convertido" ? "Convertido" : "Transformar em"}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Gerar registro</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!podeCriarProcesso}
                            onClick={() => setConfirmar({ id: it.id, titulo: it.titulo, tipo: "processo" })}
                          >
                            <Briefcase className="w-3.5 h-3.5 mr-2" /> Processo judicial
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!podeCriarProcesso}
                            onClick={() => setConfirmar({ id: it.id, titulo: it.titulo, tipo: "processo_administrativo" })}
                          >
                            <FileSignature className="w-3.5 h-3.5 mr-2" /> Processo administrativo
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!podeCriarControladoria}
                            onClick={() => setConfirmar({ id: it.id, titulo: it.titulo, tipo: "diligencia" })}
                          >
                            <ClipboardCheck className="w-3.5 h-3.5 mr-2" /> Diligência
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!podeCriarControladoria}
                            onClick={() => setConfirmar({ id: it.id, titulo: it.titulo, tipo: "prazo" })}
                          >
                            <CalendarClock className="w-3.5 h-3.5 mr-2" /> Prazo
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!podeCriarControladoria}
                            onClick={() => setConfirmar({ id: it.id, titulo: it.titulo, tipo: "tarefa" })}
                          >
                            <ListChecks className="w-3.5 h-3.5 mr-2" /> Tarefa
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {podeExcluir && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-1 text-muted-foreground hover:text-destructive"
                          onClick={() => excluir(it.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {fichaAberta && (
        <FichaAtendimentoSheet
          atendimentoId={fichaAberta}
          clienteId={clienteId}
          open={!!fichaAberta}
          onOpenChange={(o) => !o && setFichaAberta(null)}
          onChanged={load}
        />
      )}

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transformar atendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar && (
                <>
                  O atendimento <strong>"{confirmar.titulo}"</strong> será marcado como
                  convertido e um novo registro de{" "}
                  <strong>{TIPO_CONVERSAO_LABEL[confirmar.tipo]}</strong> será criado e
                  vinculado ao cliente. Você poderá completar os campos depois.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convertendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={convertendo} onClick={executarConversao}>
              {convertendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Converter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
