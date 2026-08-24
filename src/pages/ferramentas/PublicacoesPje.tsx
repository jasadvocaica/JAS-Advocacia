import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Bell,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Search,
  CheckCircle2,
  Loader2,
  Link2,
  Archive,
  AlertCircle,
  Copy,
  Building2,
  Gavel,
  Calendar,
  Users,
  FileText,
  IdCard,
  Hash,
  UserSquare,
  ScanText,
} from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { formatarMensagemSync } from "./publicacoes-pje/sync-message";
import { UltimaSyncPanel } from "./publicacoes-pje/UltimaSyncPanel";
import { BiaAcoesButton } from "@/components/assistente/BiaAcoesButton";

type MonitoramentoRow = Tables<"pje_monitoramentos">;
type PubRow = Tables<"pje_publicacoes">;
type ClienteRow = Pick<Tables<"clientes">, "id" | "nome" | "cpf_cnpj">;

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE",
  "PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type TipoMon = "oab" | "nome" | "cpf_cnpj" | "cnj";

const TIPO_LABEL: Record<TipoMon, string> = {
  oab: "OAB",
  nome: "Nome",
  cpf_cnpj: "CPF/CNPJ",
  cnj: "CNJ",
};

const TIPO_ICON: Record<TipoMon, typeof IdCard> = {
  oab: UserSquare,
  nome: ScanText,
  cpf_cnpj: IdCard,
  cnj: Hash,
};

function formatarData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function descricaoMonitoramento(m: MonitoramentoRow): string {
  if (m.tipo === "oab") return `OAB/${m.uf_oab ?? ""} ${m.valor}`;
  if (m.tipo === "cnj") return m.valor;
  return m.rotulo ?? m.valor;
}

export default function PublicacoesPje() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"publicacoes" | "monitoramentos" | "historico">("publicacoes");
  const [filtroStatus, setFiltroStatus] = useState<"todas" | "nova" | "vista" | "arquivada">("nova");
  const [busca, setBusca] = useState("");
  const [monFiltro, setMonFiltro] = useState<string>("__all__");
  const [selecionada, setSelecionada] = useState<PubRow | null>(null);

  // ---- Queries ----
  const { data: monitoramentos = [] } = useQuery({
    queryKey: ["pje-monitoramentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pje_monitoramentos")
        .select("*")
        .order("tipo")
        .order("rotulo");
      if (error) throw error;
      return data as MonitoramentoRow[];
    },
  });

  const { data: pubs = [], isLoading: pubsLoading } = useQuery({
    queryKey: ["pje-pubs", filtroStatus, monFiltro, busca],
    queryFn: async () => {
      let q = supabase
        .from("pje_publicacoes")
        .select("*")
        .order("data_disponibilizacao", { ascending: false, nullsFirst: false })
        .order("capturada_em", { ascending: false })
        .limit(200);
      if (filtroStatus !== "todas") q = q.eq("status_leitura", filtroStatus);
      if (monFiltro !== "__all__") q = q.eq("monitoramento_id", monFiltro);
      if (busca.trim()) {
        const t = busca.replace(/\D/g, "");
        if (t.length >= 4) q = q.ilike("numero_processo_limpo", `%${t}%`);
        else q = q.ilike("texto_publicacao", `%${busca}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as PubRow[];
    },
  });

  const { data: historico = [] } = useQuery({
    queryKey: ["pje-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pje_sync_log")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });

  // ---- Mutations ----
  const sincronizar = useMutation({
    mutationFn: async (monitoramento_id?: string) => {
      const { data, error } = await supabase.functions.invoke("pje-comunica-sync", {
        body: { modo: "manual", monitoramento_id, dias: 14 },
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        message?: string;
        totais?: { consultadas: number; novas: number; vinculadas: number; erros: number };
      };
    },
    onSuccess: (r) => {
      const msg = formatarMensagemSync(r);
      toast({
        title: msg.title,
        description: msg.description,
        action: msg.precisaCadastrar ? (
          <ToastAction
            altText="Cadastrar monitoramento"
            onClick={() => setTab("monitoramentos")}
          >
            Cadastrar agora
          </ToastAction>
        ) : undefined,
      });
      qc.invalidateQueries({ queryKey: ["pje-pubs"] });
      qc.invalidateQueries({ queryKey: ["pje-monitoramentos"] });
      qc.invalidateQueries({ queryKey: ["pje-historico"] });
    },
    onError: (e: Error) => {
      toast({ title: "Falha ao sincronizar", description: e.message, variant: "destructive" });
    },
  });

  const marcarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "vista" | "arquivada" }) => {
      const { error } = await supabase
        .from("pje_publicacoes")
        .update({
          status_leitura: status,
          vista_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pje-pubs"] }),
  });

  const novas = pubs.filter((p) => p.status_leitura === "nova").length;
  const ativos = monitoramentos.filter((m) => m.ativo).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intimações e Publicações do DJEN"
        description="Monitoramento automático da API oficial do DJEN por OAB, nome, parte ou número de processo"
      >
        <Button
          variant="outline"
          onClick={() => sincronizar.mutate(undefined)}
          disabled={sincronizar.isPending}
        >
          {sincronizar.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Sincronizar agora
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Novas</p>
          <p className="text-3xl font-serif text-gold tabular-nums">{novas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Total exibido</p>
          <p className="text-3xl font-serif tabular-nums">{pubs.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Monitoramentos ativos</p>
          <p className="text-3xl font-serif tabular-nums">{ativos}</p>
          {ativos === 0 && (
            <Button
              variant="link"
              size="sm"
              className="px-0 h-auto text-xs text-gold"
              onClick={() => setTab("monitoramentos")}
            >
              Cadastrar monitoramento →
            </Button>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Próx. sync auto.</p>
          <p className="text-sm font-medium">Diário, 06h30 Cuiabá</p>
          <p className="text-xs text-muted-foreground">Janela: últimos 7 dias</p>
        </Card>
      </div>

      {/* Painel: status da última sincronização */}
      <UltimaSyncPanel ultima={historico[0] ?? null} onVerHistorico={() => setTab("historico")} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="publicacoes">
            Publicações {novas > 0 && <Badge className="ml-2 bg-gold text-background">{novas}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="monitoramentos">Monitoramentos ({monitoramentos.length})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ---------------- Publicações ---------------- */}
        <TabsContent value="publicacoes" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as typeof filtroStatus)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nova">Novas</SelectItem>
                <SelectItem value="vista">Vistas</SelectItem>
                <SelectItem value="arquivada">Arquivadas</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={monFiltro} onValueChange={setMonFiltro}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Monitoramento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os monitoramentos</SelectItem>
                {monitoramentos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    [{TIPO_LABEL[m.tipo as TipoMon]}] {descricaoMonitoramento(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por CNJ ou texto"
                className="pl-8"
              />
            </div>
          </div>

          <Card>
            <ScrollArea className="h-[600px]">
              {pubsLoading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Carregando publicações…
                </div>
              ) : pubs.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground space-y-3">
                  <Bell className="w-8 h-8 mx-auto opacity-40" />
                  <p>Nenhuma publicação encontrada com os filtros atuais.</p>
                  {ativos === 0 ? (
                    <>
                      <p className="text-xs">
                        Você ainda não possui monitoramentos ativos. Cadastre uma OAB, nome, CPF/CNPJ ou CNJ para começar a receber publicações.
                      </p>
                      <Button variant="gold" size="sm" onClick={() => setTab("monitoramentos")}>
                        <Plus className="w-4 h-4 mr-2" />
                        Ir para Monitoramentos
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs">
                      Cadastre um monitoramento e clique em <strong>Sincronizar agora</strong>.
                    </p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {pubs.map((p) => (
                    <PublicacaoItem
                      key={p.id}
                      pub={p}
                      onMarcar={(status) => marcarStatus.mutate({ id: p.id, status })}
                      onSelecionar={() => {
                        setSelecionada(p);
                        if (p.status_leitura === "nova") {
                          marcarStatus.mutate({ id: p.id, status: "vista" });
                        }
                      }}
                      ativo={selecionada?.id === p.id}
                      onAcaoBia={() => qc.invalidateQueries({ queryKey: ["pje-pubs"] })}
                    />
                  ))}
                </ul>
              )}
            </ScrollArea>
          </Card>
        </TabsContent>

        {/* ---------------- Monitoramentos ---------------- */}
        <TabsContent value="monitoramentos" className="space-y-4">
          <div className="flex justify-between items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Cadastre os critérios que devem ser pesquisados diariamente no DJEN.
              CPF/CNPJ é resolvido pelo nome do cliente vinculado (a API pública não aceita documento).
            </p>
            <NovoMonitoramentoDialog onCriado={() => qc.invalidateQueries({ queryKey: ["pje-monitoramentos"] })} />
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Identificação</TableHead>
                  <TableHead>Última sync</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monitoramentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum monitoramento cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  monitoramentos.map((m) => (
                    <MonitoramentoRowComp
                      key={m.id}
                      mon={m}
                      onSync={() => sincronizar.mutate(m.id)}
                      syncing={sincronizar.isPending}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ---------------- Histórico ---------------- */}
        <TabsContent value="historico">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">Consultadas</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Vinculadas</TableHead>
                  <TableHead className="text-right">Erros</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma execução ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  historico.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">
                        {new Date(h.iniciado_em).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {h.modo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{h.total_consultadas}</TableCell>
                      <TableCell className="text-right tabular-nums text-gold">{h.total_novas}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.total_vinculadas}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {h.total_erros}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            h.status === "concluido"
                              ? "border-gold/40 text-gold"
                              : h.status === "erro"
                                ? "border-destructive/40 text-destructive"
                                : ""
                          }
                        >
                          {h.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={!!selecionada} onOpenChange={(o) => !o && setSelecionada(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {selecionada && <DetalhePublicacaoSheet pub={selecionada} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --------------------------------------------------------------------
// Item de publicação
// --------------------------------------------------------------------
function PublicacaoItem({
  pub,
  onMarcar,
  onSelecionar,
  ativo,
  onAcaoBia,
}: {
  pub: PubRow;
  onMarcar: (s: "vista" | "arquivada") => void;
  onSelecionar: () => void;
  ativo: boolean;
  onAcaoBia?: () => void;
}) {
  return (
    <li
      className={`p-4 hover:bg-muted/20 transition-colors cursor-pointer ${
        ativo ? "bg-muted/30 border-l-2 border-l-gold" : ""
      }`}
      onClick={onSelecionar}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {pub.status_leitura === "nova" && (
            <Badge className="bg-gold text-background text-[10px] uppercase">Nova</Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {pub.sigla_tribunal ?? "—"}
          </Badge>
          <span className="text-xs text-muted-foreground">{pub.tipo_comunicacao ?? "Comunicação"}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{formatarData(pub.data_disponibilizacao)}</span>
        </div>
        <div className="flex gap-1 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <BiaAcoesButton alvo="publicacao" id={pub.id} onAcaoExecutada={onAcaoBia} />
          {pub.processo_id ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/processos/${pub.processo_id}`}>
                <Link2 className="w-3.5 h-3.5 mr-1" /> Ver processo
              </Link>
            </Button>
          ) : pub.numero_processo_limpo ? (
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
              <AlertCircle className="w-3 h-3 mr-1" /> sem processo cadastrado
            </Badge>
          ) : null}
          {pub.status_leitura !== "vista" && (
            <Button size="sm" variant="ghost" onClick={() => onMarcar("vista")}>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </Button>
          )}
          {pub.status_leitura !== "arquivada" && (
            <Button size="sm" variant="ghost" onClick={() => onMarcar("arquivada")}>
              <Archive className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <p className="font-mono text-xs mb-1 text-gold hover:underline">
        {pub.numero_processo ?? "CNJ não informado"}
      </p>
      {pub.nome_orgao && <p className="text-xs text-muted-foreground mb-2">{pub.nome_orgao}</p>}
      <p className="text-sm leading-relaxed line-clamp-3">{pub.texto_publicacao}</p>

      {pub.link_certidao && (
        <a
          href={pub.link_certidao}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-gold hover:underline mt-2"
        >
          <ExternalLink className="w-3 h-3" /> certidão
        </a>
      )}
    </li>
  );
}

// --------------------------------------------------------------------
// Drawer: detalhes da publicação
// --------------------------------------------------------------------
type ParteExtraida = { tipo: string; nome: string; documento?: string; advogados?: string[] };

function extrairPartes(pub: PubRow): ParteExtraida[] {
  const partes: ParteExtraida[] = [];
  const payload = (pub.payload_bruto ?? {}) as Record<string, unknown>;

  const poloAtivo = payload.poloAtivo;
  const poloPassivo = payload.poloPassivo;
  if (Array.isArray(poloAtivo)) {
    poloAtivo.forEach((p: any) =>
      partes.push({
        tipo: "Autor",
        nome: p.nome ?? p.parte ?? "—",
        documento: p.cpfCnpj ?? p.documento,
        advogados: Array.isArray(p.advogados) ? p.advogados.map((a: any) => a.nome ?? a) : undefined,
      }),
    );
  }
  if (Array.isArray(poloPassivo)) {
    poloPassivo.forEach((p: any) =>
      partes.push({
        tipo: "Réu",
        nome: p.nome ?? p.parte ?? "—",
        documento: p.cpfCnpj ?? p.documento,
        advogados: Array.isArray(p.advogados) ? p.advogados.map((a: any) => a.nome ?? a) : undefined,
      }),
    );
  }

  if (partes.length === 0 && Array.isArray(payload.partes)) {
    (payload.partes as any[]).forEach((p) => {
      const polo = (p.polo ?? p.tipo ?? "").toString().toLowerCase();
      const tipo =
        polo.includes("ativ") || polo === "autor"
          ? "Autor"
          : polo.includes("passiv") || polo === "reu" || polo === "réu"
            ? "Réu"
            : (p.tipo ?? "Parte");
      partes.push({
        tipo,
        nome: p.nome ?? "—",
        documento: p.cpfCnpj ?? p.documento,
        advogados: Array.isArray(p.advogados) ? p.advogados.map((a: any) => a.nome ?? a) : undefined,
      });
    });
  }

  if (partes.length === 0 && Array.isArray(pub.destinatarios) && pub.destinatarios.length > 0) {
    (pub.destinatarios as any[]).forEach((d) =>
      partes.push({
        tipo: d.polo ?? "Destinatário",
        nome: d.nome ?? String(d),
        documento: d.cpfCnpj,
      }),
    );
  }

  return partes;
}

function copiarTexto(texto: string, label = "Copiado") {
  navigator.clipboard.writeText(texto);
  toast({ title: label, description: texto });
}

function DetalhePublicacaoSheet({ pub }: { pub: PubRow }) {
  const partes = extrairPartes(pub);
  const autores = partes.filter((p) => p.tipo === "Autor");
  const reus = partes.filter((p) => p.tipo === "Réu");
  const outros = partes.filter((p) => p.tipo !== "Autor" && p.tipo !== "Réu");

  const payload = (pub.payload_bruto ?? {}) as Record<string, any>;
  const vara = payload.nomeOrgao ?? payload.vara ?? pub.nome_orgao ?? null;
  const classe = payload.classe ?? payload.nomeClasse ?? null;
  const assunto = payload.assunto ?? payload.nomeAssunto ?? null;

  return (
    <>
      <SheetHeader className="space-y-2">
        <SheetTitle className="font-serif italic text-2xl">Detalhes da publicação</SheetTitle>
        <SheetDescription>
          Confira partes, órgão julgador e datas antes de tomar uma ação.
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-6">
        <section>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Número do processo
          </p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm">{pub.numero_processo ?? "—"}</p>
            {pub.numero_processo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copiarTexto(pub.numero_processo!, "CNJ copiado")}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            )}
            {pub.processo_id && (
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link to={`/processos/${pub.processo_id}`}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> Abrir
                </Link>
              </Button>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Tribunal
            </p>
            <p className="text-sm">{pub.sigla_tribunal ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
              <Gavel className="w-3 h-3" /> Tipo
            </p>
            <p className="text-sm">{pub.tipo_comunicacao ?? "—"}</p>
          </div>
          {vara && (
            <div className="col-span-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                Órgão julgador / vara
              </p>
              <p className="text-sm">{vara}</p>
            </div>
          )}
          {classe && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Classe</p>
              <p className="text-sm">{classe}</p>
            </div>
          )}
          {assunto && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Assunto</p>
              <p className="text-sm">{assunto}</p>
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-4 p-3 rounded-md border border-border bg-muted/10">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Disponibilização
            </p>
            <p className="text-sm">{formatarData(pub.data_disponibilizacao)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Publicação
            </p>
            <p className="text-sm">{formatarData(pub.data_publicacao)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Capturada em
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(pub.capturada_em).toLocaleString("pt-BR")}
            </p>
          </div>
        </section>

        <section>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
            <Users className="w-3 h-3" /> Partes
          </p>
          {partes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Não foi possível extrair as partes do retorno do DJEN.
            </p>
          ) : (
            <div className="space-y-3">
              {autores.length > 0 && (
                <ParteGrupo titulo="Polo ativo (autor)" partes={autores} cor="text-gold" />
              )}
              {reus.length > 0 && (
                <ParteGrupo titulo="Polo passivo (réu)" partes={reus} cor="text-foreground" />
              )}
              {outros.length > 0 && (
                <ParteGrupo titulo="Outros" partes={outros} cor="text-muted-foreground" />
              )}
            </div>
          )}
        </section>

        <section>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
            <FileText className="w-3 h-3" /> Texto da publicação
          </p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap p-3 rounded-md border border-border bg-muted/10 max-h-72 overflow-y-auto">
            {pub.texto_publicacao ?? "—"}
          </div>
          {pub.link_certidao && (
            <a
              href={pub.link_certidao}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gold hover:underline mt-2"
            >
              <ExternalLink className="w-3 h-3" /> abrir certidão oficial
            </a>
          )}
        </section>
      </div>
    </>
  );
}

function ParteGrupo({
  titulo,
  partes,
  cor,
}: {
  titulo: string;
  partes: ParteExtraida[];
  cor: string;
}) {
  return (
    <div>
      <p className={`text-xs font-medium mb-1 ${cor}`}>{titulo}</p>
      <ul className="space-y-1">
        {partes.map((p, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium">{p.nome}</span>
            {p.documento && (
              <span className="text-xs text-muted-foreground ml-2">{p.documento}</span>
            )}
            {p.advogados && p.advogados.length > 0 && (
              <p className="text-xs text-muted-foreground ml-2">
                Adv.: {p.advogados.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --------------------------------------------------------------------
// Linha de monitoramento
// --------------------------------------------------------------------
function MonitoramentoRowComp({
  mon,
  onSync,
  syncing,
}: {
  mon: MonitoramentoRow;
  onSync: () => void;
  syncing: boolean;
}) {
  const qc = useQueryClient();
  const Icon = TIPO_ICON[mon.tipo as TipoMon];

  const toggleAtivo = useMutation({
    mutationFn: async (ativo: boolean) => {
      const { error } = await supabase
        .from("pje_monitoramentos")
        .update({ ativo })
        .eq("id", mon.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pje-monitoramentos"] }),
  });

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pje_monitoramentos")
        .delete()
        .eq("id", mon.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Monitoramento removido" });
      qc.invalidateQueries({ queryKey: ["pje-monitoramentos"] });
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
  });

  return (
    <TableRow>
      <TableCell>
        <Badge variant="outline" className="gap-1">
          <Icon className="w-3 h-3" />
          {TIPO_LABEL[mon.tipo as TipoMon]}
        </Badge>
      </TableCell>
      <TableCell>
        <p className="font-medium">{mon.rotulo ?? mon.valor}</p>
        <p className="text-xs text-muted-foreground font-mono">
          {descricaoMonitoramento(mon)}
        </p>
      </TableCell>
      <TableCell className="text-xs">
        {mon.ultima_sync_em
          ? `${new Date(mon.ultima_sync_em).toLocaleString("pt-BR")} · ${mon.ultima_sync_qtd} novas`
          : "Nunca"}
      </TableCell>
      <TableCell>
        <Switch
          checked={mon.ativo}
          onCheckedChange={(v) => toggleAtivo.mutate(v)}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onSync} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm(`Remover monitoramento "${mon.rotulo ?? mon.valor}"?`)) remover.mutate();
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// --------------------------------------------------------------------
// Diálogo: novo monitoramento (oab/nome/cpf_cnpj/cnj)
// --------------------------------------------------------------------
function NovoMonitoramentoDialog({ onCriado }: { onCriado: () => void }) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoMon>("oab");
  const [valor, setValor] = useState("");
  const [uf, setUf] = useState("");
  const [rotulo, setRotulo] = useState("");
  const [clienteId, setClienteId] = useState<string>("");

  // Busca clientes só quando o tipo precisa
  const { data: clientes = [] } = useQuery({
    queryKey: ["pje-monit-clientes", tipo, valor],
    enabled: open && tipo === "cpf_cnpj",
    queryFn: async () => {
      let q = supabase
        .from("clientes")
        .select("id,nome,cpf_cnpj")
        .order("nome")
        .limit(50);
      const t = valor.replace(/\D/g, "");
      if (t.length >= 3) q = q.ilike("cpf_cnpj", `%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as ClienteRow[];
    },
  });

  function reset() {
    setTipo("oab");
    setValor("");
    setUf("");
    setRotulo("");
    setClienteId("");
  }

  const criar = useMutation({
    mutationFn: async () => {
      const valorNorm =
        tipo === "oab" ? valor.replace(/\D/g, "")
        : tipo === "cnj" ? valor.replace(/\D/g, "")
        : tipo === "cpf_cnpj" ? valor.replace(/\D/g, "")
        : valor.trim();

      if (!valorNorm) throw new Error("Informe o valor a monitorar");
      if (tipo === "oab" && !uf) throw new Error("Selecione a UF da OAB");
      if (tipo === "cnj" && valorNorm.length !== 20)
        throw new Error("CNJ precisa ter 20 dígitos");
      if (tipo === "cpf_cnpj" && !clienteId)
        throw new Error("Selecione o cliente vinculado");
      if (tipo === "nome" && valorNorm.length < 4)
        throw new Error("Nome deve ter ao menos 4 caracteres");

      const payload: any = {
        tipo,
        valor: valorNorm,
        uf_oab: tipo === "oab" ? uf.toUpperCase() : null,
        rotulo: rotulo.trim() || null,
        cliente_id: tipo === "cpf_cnpj" ? clienteId : null,
      };

      const { error } = await supabase.from("pje_monitoramentos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Monitoramento cadastrado" });
      reset();
      setOpen(false);
      onCriado();
    },
    onError: (e: Error) =>
      toast({ title: "Erro ao cadastrar", description: e.message, variant: "destructive" }),
  });

  function clienteSelecionadoNome() {
    return clientes.find((c) => c.id === clienteId)?.nome ?? "";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" /> Novo monitoramento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif italic text-2xl">Novo monitoramento PJe</DialogTitle>
          <DialogDescription>
            As publicações encontradas ficarão na aba <strong>Publicações</strong> para tratamento.
            Só viram tarefas da Controladoria depois de vinculadas a um processo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tipo de monitoramento</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoMon); setValor(""); setClienteId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oab">OAB do advogado</SelectItem>
                <SelectItem value="nome">Nome da parte</SelectItem>
                <SelectItem value="cpf_cnpj">CPF/CNPJ (busca pelo nome do cliente)</SelectItem>
                <SelectItem value="cnj">Número CNJ do processo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === "oab" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Número OAB</Label>
                <Input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="123456"
                />
              </div>
              <div>
                <Label>UF</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label>Nome do advogado (rótulo)</Label>
                <Input
                  value={rotulo}
                  onChange={(e) => setRotulo(e.target.value)}
                  placeholder="Ex: Dra. Juliana Araújo"
                />
              </div>
            </div>
          )}

          {tipo === "nome" && (
            <>
              <div>
                <Label>Nome da parte</Label>
                <Input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Nome completo como aparece nas publicações"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Mínimo 4 caracteres. A busca usa o termo exato fornecido pela API do PJe.
                </p>
              </div>
              <div>
                <Label>Rótulo (opcional)</Label>
                <Input
                  value={rotulo}
                  onChange={(e) => setRotulo(e.target.value)}
                  placeholder="Como exibir na lista"
                />
              </div>
            </>
          )}

          {tipo === "cpf_cnpj" && (
            <>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Apenas dígitos"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A API pública não aceita CPF/CNPJ. Vincule a um cliente — usaremos o nome dele como termo.
                </p>
              </div>
              <div>
                <Label>Cliente vinculado</Label>
                <Select value={clienteId} onValueChange={(v) => {
                  setClienteId(v);
                  const c = clientes.find((cli) => cli.id === v);
                  if (c) setRotulo(`${c.nome} (CPF ${c.cpf_cnpj ?? ""})`);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={
                      clientes.length === 0
                        ? "Digite o CPF/CNPJ acima para buscar"
                        : "Selecione o cliente"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} {c.cpf_cnpj ? `· ${c.cpf_cnpj}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clienteId && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Termo de busca efetivo: <strong>{clienteSelecionadoNome()}</strong>
                  </p>
                )}
              </div>
            </>
          )}

          {tipo === "cnj" && (
            <>
              <div>
                <Label>Número CNJ do processo</Label>
                <Input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0000000-00.0000.0.00.0000 ou 20 dígitos"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Acompanha todas as publicações deste processo no PJe Comunica.
                </p>
              </div>
              <div>
                <Label>Rótulo (opcional)</Label>
                <Input
                  value={rotulo}
                  onChange={(e) => setRotulo(e.target.value)}
                  placeholder="Ex: Cliente João vs INSS"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
            {criar.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
