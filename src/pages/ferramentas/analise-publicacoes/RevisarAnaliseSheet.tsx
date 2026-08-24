import { useEffect, useMemo, useState } from "react";
import { format, addDays, addBusinessDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Loader2, FileText, Scale, User, Gavel, CalendarClock, ExternalLink,
  CheckCircle2, X, RefreshCw, Link2, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { TipoItem, Prioridade } from "../../controladoria/types";
import { registrarAtendimento } from "@/lib/atendimentos";

interface Props {
  analiseId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onItemConvertido: () => void;
}

interface PessoaItem { nome: string; oab?: string | null; polo?: string | null; }

interface ItemExtraido {
  id: string;
  ordem: number;
  numero_processo: string | null;
  numero_processo_normalizado: string | null;
  tribunal: string | null;
  orgao_julgador: string | null;
  tipo_ato: string | null;
  intimados: PessoaItem[];
  partes: PessoaItem[];
  advogados: PessoaItem[];
  data_publicacao: string | null;
  prazo_dias: number | null;
  prazo_tipo: string | null;
  prazo_base_legal: string | null;
  resumo_simples: string | null;
  trecho_original: string | null;
  confianca: number | null;
  processo_id: string | null;
  cliente_id: string | null;
  status_revisao: "novo" | "revisado" | "ignorado" | "convertido";
  item_controladoria_id: string | null;
  observacoes: string | null;
}

interface AnaliseInfo {
  id: string;
  titulo: string;
  status: string;
  total_itens: number;
  erro: string | null;
}

const TIPO_ATO_LABEL: Record<string, string> = {
  intimacao: "Intimação",
  decisao_interlocutoria: "Decisão interlocutória",
  sentenca: "Sentença",
  despacho: "Despacho",
  acordao: "Acórdão",
  edital: "Edital",
  citacao: "Citação",
  audiencia_designada: "Audiência designada",
  outro: "Outro",
};

// Mapeia tipo de ato extraído para tipo da Controladoria
const TIPO_ATO_PARA_CONTROLADORIA: Record<string, TipoItem> = {
  intimacao: "prazo_processual",
  decisao_interlocutoria: "prazo_processual",
  sentenca: "prazo_fatal",
  despacho: "prazo_processual",
  acordao: "prazo_fatal",
  edital: "prazo_processual",
  citacao: "prazo_processual",
  audiencia_designada: "audiencia",
  outro: "tarefa",
};

export default function RevisarAnaliseSheet({
  analiseId, open, onOpenChange, onItemConvertido,
}: Props) {
  const { user } = useAuth();
  const [analise, setAnalise] = useState<AnaliseInfo | null>(null);
  const [itens, setItens] = useState<ItemExtraido[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = async () => {
    setLoading(true);
    const [a, i] = await Promise.all([
      supabase
        .from("dje_analises")
        .select("id, titulo, status, total_itens, erro")
        .eq("id", analiseId)
        .maybeSingle(),
      supabase
        .from("dje_itens_extraidos")
        .select("*")
        .eq("analise_id", analiseId)
        .order("ordem"),
    ]);

    if (a.data) setAnalise(a.data as AnaliseInfo);
    if (i.data) setItens((i.data as unknown) as ItemExtraido[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) carregar();
  }, [open, analiseId]);

  // Atualiza em tempo real durante o processamento
  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel(`analise_${analiseId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dje_analises", filter: `id=eq.${analiseId}` },
        () => carregar(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dje_itens_extraidos", filter: `analise_id=eq.${analiseId}` },
        () => carregar(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [open, analiseId]);

  const atualizarItem = async (
    id: string,
    patch: {
      processo_id?: string | null;
      cliente_id?: string | null;
      status_revisao?: ItemExtraido["status_revisao"];
      observacoes?: string | null;
    },
  ) => {
    const { error } = await supabase
      .from("dje_itens_extraidos")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      setItens((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    }
  };

  const ignorar = (id: string) => {
    atualizarItem(id, { status_revisao: "ignorado" });
    toast.success("Item ignorado");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold" />
            {analise?.titulo ?? "Carregando…"}
          </SheetTitle>
          <SheetDescription>
            Revise as publicações extraídas pela IA antes de criar atividades na Controladoria.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Carregando…</div>
        ) : analise?.status === "processando" || analise?.status === "pendente" ? (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              A IA está analisando o documento. Isso pode levar até 60 segundos…
            </p>
          </div>
        ) : analise?.status === "falha" ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-destructive font-medium">A análise falhou</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{analise.erro}</p>
          </div>
        ) : itens.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            A IA não encontrou publicações estruturadas neste documento.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {itens.map((it) => (
              <ItemCard
                key={it.id}
                item={it}
                userId={user?.id ?? null}
                onSalvar={(patch) => atualizarItem(it.id, patch)}
                onIgnorar={() => ignorar(it.id)}
                onConvertido={() => {
                  carregar();
                  onItemConvertido();
                }}
              />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============== Card de cada item ==============

interface CardProps {
  item: ItemExtraido;
  userId: string | null;
  onSalvar: (patch: { processo_id?: string | null; cliente_id?: string | null }) => void;
  onIgnorar: () => void;
  onConvertido: () => void;
}

interface ProcessoOpcao { id: string; numero_cnj: string | null; cliente_id: string | null; cliente_nome?: string; }
interface ClienteOpcao { id: string; nome: string; }

function ItemCard({ item, userId, onSalvar, onIgnorar, onConvertido }: CardProps) {
  const [expandido, setExpandido] = useState(item.status_revisao === "novo");
  const [convertendo, setConvertendo] = useState(false);
  const [processos, setProcessos] = useState<ProcessoOpcao[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [titulo, setTitulo] = useState(() => gerarTitulo(item));
  const [tipoControladoria, setTipoControladoria] = useState<TipoItem>(
    item.tipo_ato ? (TIPO_ATO_PARA_CONTROLADORIA[item.tipo_ato] ?? "tarefa") : "tarefa",
  );
  const [prioridade, setPrioridade] = useState<Prioridade>(
    item.tipo_ato === "sentenca" || item.tipo_ato === "acordao" ? "alta" : "media",
  );

  const dataSugerida = useMemo(() => {
    if (!item.prazo_dias || !item.data_publicacao) return "";
    const base = new Date(item.data_publicacao + "T00:00:00");
    const d = item.prazo_tipo === "dias_corridos"
      ? addDays(base, item.prazo_dias)
      : addBusinessDays(base, item.prazo_dias);
    return format(d, "yyyy-MM-dd");
  }, [item.prazo_dias, item.prazo_tipo, item.data_publicacao]);

  const [dataVencimento, setDataVencimento] = useState(dataSugerida);

  useEffect(() => {
    setDataVencimento(dataSugerida);
  }, [dataSugerida]);

  // Carrega processos e clientes para vincular
  useEffect(() => {
    if (!expandido) return;
    (async () => {
      const [{ data: procs }, { data: cls }] = await Promise.all([
        supabase
          .from("processos")
          .select("id, numero_cnj, cliente_id, clientes(nome)")
          .order("criado_em", { ascending: false })
          .limit(200),
        supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome").limit(200),
      ]);
      setProcessos(
        ((procs ?? []) as Array<{ id: string; numero_cnj: string | null; cliente_id: string | null; clientes: { nome: string } | null }>)
          .map((p) => ({
            id: p.id,
            numero_cnj: p.numero_cnj,
            cliente_id: p.cliente_id,
            cliente_nome: p.clientes?.nome,
          })),
      );
      setClientes((cls ?? []) as ClienteOpcao[]);
    })();
  }, [expandido]);

  const converter = async () => {
    if (!userId) {
      toast.error("Sessão expirada");
      return;
    }
    if (!titulo.trim()) {
      toast.error("Informe um título para a atividade");
      return;
    }
    if (!dataVencimento) {
      toast.error("Informe a data de vencimento");
      return;
    }

    setConvertendo(true);
    try {
      const { data: criado, error } = await supabase
        .from("controladoria_itens")
        .insert({
          titulo: titulo.trim(),
          descricao: [
            item.resumo_simples,
            item.tribunal && item.orgao_julgador
              ? `\n\n${item.tribunal} — ${item.orgao_julgador}`
              : "",
            item.prazo_base_legal ? `\nBase legal: ${item.prazo_base_legal}` : "",
          ].filter(Boolean).join(""),
          tipo: tipoControladoria,
          status: "pendente",
          prioridade,
          data_vencimento: dataVencimento,
          data_intimacao: item.data_publicacao,
          cliente_id: item.cliente_id,
          processo_id: item.processo_id,
          vara: item.orgao_julgador,
          origem: "dje_ia",
          criado_por: userId,
        })
        .select("id")
        .single();

      if (error) throw error;

      await supabase
        .from("dje_itens_extraidos")
        .update({
          status_revisao: "convertido",
          item_controladoria_id: criado.id,
        })
        .eq("id", item.id);

      // Se houver cliente vinculado, registra também na aba Atendimentos do cliente
      if (item.cliente_id) {
        const partes = [
          item.resumo_simples,
          item.tribunal && item.orgao_julgador ? `${item.tribunal} — ${item.orgao_julgador}` : null,
          item.prazo_base_legal ? `Base legal: ${item.prazo_base_legal}` : null,
          item.numero_processo ? `Processo: ${item.numero_processo}` : null,
        ].filter(Boolean) as string[];
        await registrarAtendimento({
          clienteId: item.cliente_id,
          titulo: titulo.trim(),
          resumo: partes.length > 0 ? partes.join("\n\n") : "Publicação convertida em atividade.",
          ferramenta: "analise_publicacoes_ia",
          link: `/controladoria?item=${criado.id}`,
          processoId: item.processo_id ?? null,
          metadados: {
            tipo: tipoControladoria,
            prioridade,
            data_vencimento: dataVencimento,
          },
          criadoPor: userId,
        });
      }

      toast.success("Atividade criada na Controladoria", {
        description: titulo,
      });
      onConvertido();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error("Falha ao criar atividade", { description: msg });
    } finally {
      setConvertendo(false);
    }
  };

  const isConvertido = item.status_revisao === "convertido";
  const isIgnorado = item.status_revisao === "ignorado";

  return (
    <Card className={`p-4 ${isIgnorado ? "opacity-50" : ""} ${isConvertido ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className="text-xs">#{item.ordem}</Badge>
            {item.tipo_ato && (
              <Badge variant="secondary" className="text-xs">
                {TIPO_ATO_LABEL[item.tipo_ato] ?? item.tipo_ato}
              </Badge>
            )}
            {item.confianca !== null && (
              <span className="text-xs text-muted-foreground">
                Confiança: {Math.round((item.confianca ?? 0) * 100)}%
              </span>
            )}
            {isConvertido && (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs gap-1">
                <CheckCircle2 className="w-3 h-3" /> Convertido
              </Badge>
            )}
            {isIgnorado && (
              <Badge variant="outline" className="text-xs">Ignorado</Badge>
            )}
          </div>
          {item.numero_processo && (
            <div className="text-sm font-mono">{item.numero_processo}</div>
          )}
          {(item.tribunal || item.orgao_julgador) && (
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {[item.tribunal, item.orgao_julgador].filter(Boolean).join(" — ")}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpandido((e) => !e)}
        >
          {expandido ? "Recolher" : "Expandir"}
        </Button>
      </div>

      {item.resumo_simples && (
        <p className="text-sm text-foreground/90 mt-2">{item.resumo_simples}</p>
      )}

      {item.prazo_dias !== null && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <CalendarClock className="w-4 h-4 text-warning" />
          <span className="font-medium">{item.prazo_dias} {item.prazo_tipo === "dias_corridos" ? "dias corridos" : "dias úteis"}</span>
          {item.prazo_base_legal && (
            <span className="text-xs text-muted-foreground">({item.prazo_base_legal})</span>
          )}
          {dataSugerida && (
            <span className="text-xs text-muted-foreground">
              → vence em {format(new Date(dataSugerida + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          )}
        </div>
      )}

      {expandido && !isConvertido && !isIgnorado && (
        <>
          <Separator className="my-4" />

          {/* Detalhes extraídos */}
          {(item.intimados.length > 0 || item.partes.length > 0 || item.advogados.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
              {item.intimados.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Gavel className="w-3 h-3" /> Intimados
                  </Label>
                  <ul className="space-y-1">
                    {item.intimados.map((p, i) => (
                      <li key={i}>{p.nome}{p.oab ? ` (OAB ${p.oab})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.partes.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <User className="w-3 h-3" /> Partes
                  </Label>
                  <ul className="space-y-1">
                    {item.partes.map((p, i) => (
                      <li key={i}>{p.nome}{p.polo ? ` (${p.polo})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
              {item.advogados.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Scale className="w-3 h-3" /> Advogados
                  </Label>
                  <ul className="space-y-1">
                    {item.advogados.map((p, i) => (
                      <li key={i}>{p.nome}{p.oab ? ` (OAB ${p.oab})` : ""}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {item.trecho_original && (
            <details className="mb-4">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Ver trecho original
              </summary>
              <p className="text-xs mt-2 p-2 bg-muted/40 rounded border-l-2 border-muted-foreground/30 whitespace-pre-wrap font-mono">
                {item.trecho_original}
              </p>
            </details>
          )}

          <Separator className="my-4" />

          {/* Form de criação na Controladoria */}
          <div className="space-y-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Criar atividade na Controladoria
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Título *</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título da atividade"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Tipo</Label>
                <Select value={tipoControladoria} onValueChange={(v) => setTipoControladoria(v as TipoItem)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prazo_fatal">Prazo fatal</SelectItem>
                    <SelectItem value="prazo_processual">Prazo processual</SelectItem>
                    <SelectItem value="audiencia">Audiência</SelectItem>
                    <SelectItem value="diligencia">Diligência</SelectItem>
                    <SelectItem value="tarefa">Tarefa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Prioridade</Label>
                <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Vencimento *</Label>
              <Input
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Processo vinculado
                </Label>
                <Select
                  value={item.processo_id ?? "__nenhum"}
                  onValueChange={(v) => {
                    if (v === "__nenhum") {
                      onSalvar({ processo_id: null });
                    } else {
                      const p = processos.find((x) => x.id === v);
                      onSalvar({ processo_id: v, cliente_id: p?.cliente_id ?? item.cliente_id });
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Vincular processo…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum">— Nenhum —</SelectItem>
                    {processos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {(p.numero_cnj ?? "Sem CNJ")}
                        {p.cliente_nome ? ` — ${p.cliente_nome}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <User className="w-3 h-3" /> Cliente
                </Label>
                <Select
                  value={item.cliente_id ?? "__nenhum"}
                  onValueChange={(v) => onSalvar({ cliente_id: v === "__nenhum" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Vincular cliente…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum">— Nenhum —</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={onIgnorar} className="gap-1.5">
                <X className="w-3.5 h-3.5" /> Ignorar
              </Button>
              <Button onClick={converter} disabled={convertendo} size="sm" className="gap-1.5">
                {convertendo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Criar atividade
              </Button>
            </div>
          </div>
        </>
      )}

      {isConvertido && item.item_controladoria_id && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
          <span className="text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Atividade criada
          </span>
          <Button asChild variant="ghost" size="sm" className="gap-1 h-7">
            <a href={`/controladoria?item=${item.item_controladoria_id}`}>
              Abrir <ExternalLink className="w-3 h-3" />
            </a>
          </Button>
        </div>
      )}
    </Card>
  );
}

function gerarTitulo(item: ItemExtraido): string {
  const parts: string[] = [];
  if (item.tipo_ato) parts.push(TIPO_ATO_LABEL[item.tipo_ato] ?? item.tipo_ato);
  if (item.numero_processo) parts.push(`proc. ${item.numero_processo}`);
  if (parts.length === 0 && item.resumo_simples) {
    return item.resumo_simples.slice(0, 80);
  }
  return parts.join(" — ");
}
