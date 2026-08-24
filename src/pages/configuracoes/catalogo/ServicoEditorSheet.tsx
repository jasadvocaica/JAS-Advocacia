import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CatalogoServico, CatalogoPergunta, CatalogoDocumento,
  STATUS_HOMOLOGACAO_LABEL, PUBLICO_LABEL, TIPO_PERGUNTA_LABEL,
  TipoPergunta, StatusHomologacao, PublicoServico, validarServico,
  Classificacao, CLASSIFICACAO_LABEL, CLASSIFICACAO_COR, ACAO_RECOMENDADA_LABEL,
  montarPatchHomologacao, validarServicoPrincipal, podeAtivarOperacional, rotuloArea,
} from "@/lib/catalogo-servicos";

interface Opcao { id: string; nome: string }

interface Props {
  servicoId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

const SEM = "__sem__";

export function ServicoEditorSheet({ servicoId, open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [servico, setServico] = useState<CatalogoServico | null>(null);
  const [perguntas, setPerguntas] = useState<CatalogoPergunta[]>([]);
  const [documentos, setDocumentos] = useState<CatalogoDocumento[]>([]);
  const [templates, setTemplates] = useState<Opcao[]>([]);
  const [pessoas, setPessoas] = useState<Opcao[]>([]);
  const [parceiros, setParceiros] = useState<Opcao[]>([]);
  const [outros, setOutros] = useState<Opcao[]>([]);

  useEffect(() => {
    if (!open || !servicoId) return;
    let cancelado = false;
    (async () => {
      setLoading(true);
      const [s, p, d, t, u, pa, os] = await Promise.all([
        supabase.from("catalogo_servicos").select("*").eq("id", servicoId).maybeSingle(),
        supabase.from("catalogo_servico_perguntas").select("*").eq("servico_id", servicoId).order("ordem"),
        supabase.from("catalogo_servico_documentos").select("*").eq("servico_id", servicoId).order("ordem"),
        supabase.from("fluxos_templates").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("profiles").select("id, nome").eq("ativo", true).eq("tipo_portal", "interno").order("nome"),
        supabase.from("parceiros").select("id, nome").order("nome"),
        supabase.from("catalogo_servicos").select("id, nome").neq("id", servicoId).order("nome"),
      ]);
      if (cancelado) return;
      setServico((s.data as unknown as CatalogoServico) ?? null);
      setPerguntas(((p.data ?? []) as unknown as CatalogoPergunta[]));
      setDocumentos(((d.data ?? []) as unknown as CatalogoDocumento[]));
      setTemplates((t.data ?? []) as Opcao[]);
      setPessoas((u.data ?? []) as Opcao[]);
      setParceiros((pa.data ?? []) as Opcao[]);
      setOutros((os.data ?? []) as Opcao[]);
      setLoading(false);
    })();
    return () => { cancelado = true; };
  }, [open, servicoId]);

  function set<K extends keyof CatalogoServico>(campo: K, valor: CatalogoServico[K]) {
    setServico((s) => (s ? { ...s, [campo]: valor } : s));
  }

  async function salvar() {
    if (!servico) return;
    const erros = validarServico(servico);
    const erroFk = validarServicoPrincipal(servico.id, servico.servico_principal_id);
    if (erros.length || erroFk) {
      toast.error(erros[0]?.mensagem ?? erroFk!.mensagem);
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("catalogo_servicos").update({
      nome: servico.nome,
      area: servico.area,
      subtipo: servico.subtipo,
      descricao: servico.descricao,
      status_homologacao: servico.status_homologacao,
      publico: servico.publico,
      ativo_operacional: servico.ativo_operacional,
      valor_referencia: servico.valor_referencia,
      observacao_comercial: servico.observacao_comercial,
      template_id: servico.template_id,
      responsavel_id: servico.responsavel_id,
      revisor_id: servico.revisor_id,
      parceiro_id: servico.parceiro_id,
      sla_dias_uteis: servico.sla_dias_uteis,
      conteudo: servico.conteudo as never,
      // Decisão homologada (nunca ativa nada)
      ...montarPatchHomologacao(servico as unknown as Record<string, unknown>),
    }).eq("id", servico.id);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Serviço atualizado");
    onSaved();
  }

  /** Aplica a sugestão automática como decisão homologada (sem ativar nada). */
  function aplicarSugestao() {
    if (!servico) return;
    setServico({
      ...servico,
      classificacao: servico.classificacao_sugerida,
      area: servico.area_sugerida ?? servico.area,
      modalidade: servico.modalidade ?? servico.modalidade_sugerida,
      servico_principal_id: servico.servico_principal_id ?? servico.servico_principal_sugerido_id,
      possivel_duplicidade: servico.possivel_duplicidade || servico.duplicidade_sugerida,
    });
    toast.info("Sugestão copiada para a decisão. Revise e salve.");
  }


  async function addPergunta() {
    if (!servicoId) return;
    const { data, error } = await supabase.from("catalogo_servico_perguntas").insert({
      servico_id: servicoId,
      ordem: perguntas.length + 1,
      pergunta: `Nova pergunta ${perguntas.length + 1}`,
      tipo: "texto",
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setPerguntas((l) => [...l, data as unknown as CatalogoPergunta]);
  }

  async function salvarPergunta(p: CatalogoPergunta) {
    const { error } = await supabase.from("catalogo_servico_perguntas").update({
      pergunta: p.pergunta, tipo: p.tipo, obrigatoria: p.obrigatoria,
      ordem: p.ordem, opcoes: p.opcoes as never,
    }).eq("id", p.id);
    if (error) toast.error(error.message);
    else toast.success("Pergunta salva");
  }

  async function removerPergunta(id: string) {
    const { error } = await supabase.from("catalogo_servico_perguntas").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setPerguntas((l) => l.filter((x) => x.id !== id));
  }

  async function addDocumento() {
    if (!servicoId) return;
    const { data, error } = await supabase.from("catalogo_servico_documentos").insert({
      servico_id: servicoId, ordem: documentos.length + 1,
      nome: `Novo documento ${documentos.length + 1}`,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setDocumentos((l) => [...l, data as unknown as CatalogoDocumento]);
  }

  async function salvarDocumento(d: CatalogoDocumento) {
    const { error } = await supabase.from("catalogo_servico_documentos").update({
      nome: d.nome, obrigatorio: d.obrigatorio, ordem: d.ordem, observacao: d.observacao,
    }).eq("id", d.id);
    if (error) toast.error(error.message);
    else toast.success("Documento salvo");
  }

  async function removerDocumento(id: string) {
    const { error } = await supabase.from("catalogo_servico_documentos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDocumentos((l) => l.filter((x) => x.id !== id));
  }

  const conteudo = (servico?.conteudo ?? {}) as { notas?: string; referencias?: string };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {loading || !servico ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8">{servico.nome}</SheetTitle>
              <SheetDescription>
                {servico.origem_texto
                  ? `Origem: ${servico.origem_tabela} · ${servico.origem_texto}`
                  : "Cadastro manual"}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="homologacao" className="mt-4">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="homologacao">Homologação</TabsTrigger>
                <TabsTrigger value="geral">Geral</TabsTrigger>
                <TabsTrigger value="triagem">Triagem</TabsTrigger>
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
                <TabsTrigger value="comercial">Comercial</TabsTrigger>
                <TabsTrigger value="operacao">Operação</TabsTrigger>
                <TabsTrigger value="modelos">Modelos</TabsTrigger>
              </TabsList>

              {/* HOMOLOGAÇÃO — Sugestão x Decisão */}
              <TabsContent value="homologacao" className="space-y-4 pt-4">
                <div className="rounded-md border border-dashed p-3 space-y-2" data-testid="bloco-sugestao">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">Sugestão automática</Badge>
                    <Button size="sm" variant="ghost" onClick={aplicarSugestao}>Usar sugestão</Button>
                  </div>
                  <p className="text-sm">
                    Classificação:{" "}
                    <span className={cn("rounded px-1.5 py-0.5 text-xs", CLASSIFICACAO_COR[servico.classificacao_sugerida])}>
                      {CLASSIFICACAO_LABEL[servico.classificacao_sugerida]}
                    </span>
                  </p>
                  {servico.classificacao_justificativa && (
                    <p className="text-xs text-muted-foreground">{servico.classificacao_justificativa}</p>
                  )}
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    <li>Ação recomendada: <strong>{ACAO_RECOMENDADA_LABEL[servico.acao_recomendada]}</strong></li>
                    {servico.servico_principal_sugerido_nome && (
                      <li>Serviço principal sugerido: <strong>{servico.servico_principal_sugerido_nome}</strong>
                        {!servico.servico_principal_sugerido_id && " (este próprio item)"}</li>
                    )}
                    {servico.modalidade_sugerida && <li>Modalidade sugerida: <strong>{servico.modalidade_sugerida}</strong></li>}
                    {servico.area_sugerida && (
                      <li>Área sugerida: <strong>{rotuloArea(servico.area_sugerida)}</strong>
                        {servico.area_sugerida_justificativa ? ` — ${servico.area_sugerida_justificativa}` : ""}</li>
                    )}
                    {servico.duplicidade_sugerida_justificativa && (
                      <li>Duplicidade: {servico.duplicidade_sugerida_justificativa}</li>
                    )}
                  </ul>
                  <p className="text-[11px] text-muted-foreground">
                    Sugestão não altera nada: a decisão abaixo é a única que vale.
                  </p>
                </div>

                <div className="space-y-4 rounded-md border p-3" data-testid="bloco-decisao">
                  <Badge>Decisão homologada</Badge>
                  <div className="space-y-1.5">
                    <Label>Classificação homologada</Label>
                    <Select value={servico.classificacao}
                      onValueChange={(v) => set("classificacao", v as Classificacao)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CLASSIFICACAO_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Área (homologada)</Label>
                      <Input value={servico.area} onChange={(e) => set("area", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Modalidade</Label>
                      <Input value={servico.modalidade ?? ""}
                        onChange={(e) => set("modalidade", e.target.value || null)} />
                    </div>
                  </div>
                  <SelectCampo label="Serviço principal" value={servico.servico_principal_id}
                    opcoes={outros} onChange={(v) => set("servico_principal_id", v)} />
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">Marcar como possível duplicidade</p>
                      <p className="text-xs text-muted-foreground">Marcação de análise — não consolida nada.</p>
                    </div>
                    <Switch checked={servico.possivel_duplicidade}
                      onCheckedChange={(v) => set("possivel_duplicidade", v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Justificativa da duplicidade</Label>
                    <Textarea rows={2} value={servico.duplicidade_justificativa ?? ""}
                      onChange={(e) => set("duplicidade_justificativa", e.target.value || null)} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Homologar classificação, área ou modalidade não ativa o serviço nem dispara POP,
                    responsável, SLA ou qualquer integração.
                  </p>
                </div>
              </TabsContent>



              {/* GERAL */}
              <TabsContent value="geral" className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Nome do serviço</Label>
                  <Input value={servico.nome} onChange={(e) => set("nome", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Área do direito</Label>
                    <Input value={servico.area} onChange={(e) => set("area", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subtipo</Label>
                    <Input value={servico.subtipo ?? ""} onChange={(e) => set("subtipo", e.target.value || null)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea rows={3} value={servico.descricao ?? ""} onChange={(e) => set("descricao", e.target.value || null)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Status de homologação</Label>
                    <Select value={servico.status_homologacao}
                      onValueChange={(v) => set("status_homologacao", v as StatusHomologacao)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_HOMOLOGACAO_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Público</Label>
                    <Select value={servico.publico} onValueChange={(v) => set("publico", v as PublicoServico)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PUBLICO_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="text-sm font-medium">Ativo operacionalmente</p>
                    <p className="text-xs text-muted-foreground">
                      Independente do status de homologação. Não integra POP nesta etapa.
                    </p>
                  </div>
                  <Switch checked={servico.ativo_operacional}
                    disabled={!podeAtivarOperacional(servico)}
                    onCheckedChange={(v) => set("ativo_operacional", v)} />
                </div>
                {servico.possivel_duplicidade && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                    <Badge variant="outline" className="mb-1">POSSÍVEL DUPLICIDADE · grupo {servico.duplicidade_grupo}</Badge>
                    <p className="text-muted-foreground">{servico.duplicidade_justificativa}</p>
                  </div>
                )}
              </TabsContent>

              {/* TRIAGEM */}
              <TabsContent value="triagem" className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{perguntas.length} pergunta(s)</p>
                  <Button size="sm" variant="outline" onClick={addPergunta}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Pergunta
                  </Button>
                </div>
                {perguntas.map((p, i) => (
                  <div key={p.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-xs text-muted-foreground">{i + 1}.</span>
                      <Input value={p.pergunta}
                        onChange={(e) => setPerguntas((l) => l.map((x) => x.id === p.id ? { ...x, pergunta: e.target.value } : x))} />
                      <Button size="icon" variant="ghost" onClick={() => removerPergunta(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={p.tipo}
                        onValueChange={(v) => setPerguntas((l) => l.map((x) => x.id === p.id ? { ...x, tipo: v as TipoPergunta } : x))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIPO_PERGUNTA_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Switch checked={p.obrigatoria}
                          onCheckedChange={(v) => setPerguntas((l) => l.map((x) => x.id === p.id ? { ...x, obrigatoria: v } : x))} />
                        <span className="text-xs text-muted-foreground">Obrigatória</span>
                      </div>
                    </div>
                    {(p.tipo === "opcao" || p.tipo === "multipla") && (
                      <Input placeholder="Opções separadas por ;"
                        value={(p.opcoes ?? []).join("; ")}
                        onChange={(e) => setPerguntas((l) => l.map((x) => x.id === p.id
                          ? { ...x, opcoes: e.target.value.split(";").map((o) => o.trim()).filter(Boolean) } : x))} />
                    )}
                    <Button size="sm" variant="secondary" onClick={() => salvarPergunta(perguntas.find((x) => x.id === p.id)!)}>
                      Salvar pergunta
                    </Button>
                  </div>
                ))}
              </TabsContent>

              {/* DOCUMENTOS */}
              <TabsContent value="documentos" className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{documentos.length} documento(s)</p>
                  <Button size="sm" variant="outline" onClick={addDocumento}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Documento
                  </Button>
                </div>
                {documentos.map((d, i) => (
                  <div key={d.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-xs text-muted-foreground">{i + 1}.</span>
                      <Input value={d.nome}
                        onChange={(e) => setDocumentos((l) => l.map((x) => x.id === d.id ? { ...x, nome: e.target.value } : x))} />
                      <Button size="icon" variant="ghost" onClick={() => removerDocumento(d.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={d.obrigatorio}
                        onCheckedChange={(v) => setDocumentos((l) => l.map((x) => x.id === d.id ? { ...x, obrigatorio: v } : x))} />
                      <span className="text-xs text-muted-foreground">Obrigatório</span>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => salvarDocumento(documentos.find((x) => x.id === d.id)!)}>
                      Salvar documento
                    </Button>
                  </div>
                ))}
              </TabsContent>

              {/* COMERCIAL */}
              <TabsContent value="comercial" className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Valor de referência (R$)</Label>
                  <Input type="number" value={servico.valor_referencia ?? ""}
                    onChange={(e) => set("valor_referencia", e.target.value === "" ? null : Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">
                    Referência interna do catálogo. Não integra o Financeiro nesta etapa.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Observações comerciais</Label>
                  <Textarea rows={4} value={servico.observacao_comercial ?? ""}
                    onChange={(e) => set("observacao_comercial", e.target.value || null)} />
                </div>
              </TabsContent>

              {/* OPERAÇÃO */}
              <TabsContent value="operacao" className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Todas as referências são opcionais e não ativam POP nem produção jurídica nesta etapa.
                </p>
                <SelectCampo label="POP / template de fluxo" value={servico.template_id}
                  opcoes={templates} onChange={(v) => set("template_id", v)} />
                <SelectCampo label="Responsável" value={servico.responsavel_id}
                  opcoes={pessoas} onChange={(v) => set("responsavel_id", v)} />
                <SelectCampo label="Revisor" value={servico.revisor_id}
                  opcoes={pessoas} onChange={(v) => set("revisor_id", v)} />
                <SelectCampo label="Parceiro" value={servico.parceiro_id}
                  opcoes={parceiros} onChange={(v) => set("parceiro_id", v)} />
                <div className="space-y-1.5">
                  <Label>SLA (dias úteis)</Label>
                  <Input type="number" value={servico.sla_dias_uteis ?? ""}
                    onChange={(e) => set("sla_dias_uteis", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
              </TabsContent>

              {/* MODELOS / CONTEÚDO */}
              <TabsContent value="modelos" className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Modelos e conteúdos relacionados</Label>
                  <Textarea rows={4} placeholder="Referências de modelos, peças ou conteúdos (texto livre)"
                    value={conteudo.referencias ?? ""}
                    onChange={(e) => set("conteudo", { ...conteudo, referencias: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notas internas</Label>
                  <Textarea rows={4} value={conteudo.notas ?? ""}
                    onChange={(e) => set("conteudo", { ...conteudo, notas: e.target.value })} />
                </div>
              </TabsContent>
            </Tabs>

            <Separator className="my-4" />
            <Button onClick={salvar} disabled={salvando} className="w-full">
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar serviço
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SelectCampo({
  label, value, opcoes, onChange,
}: { label: string; value: string | null; opcoes: Opcao[]; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ?? SEM} onValueChange={(v) => onChange(v === SEM ? null : v)}>
        <SelectTrigger><SelectValue placeholder="Não definido" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM}>Não definido</SelectItem>
          {opcoes.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
