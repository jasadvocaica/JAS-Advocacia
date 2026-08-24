import { useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ESTADOS_BR, TabelaOAB } from "./types";

export default function GerenciarTabelasOAB() {
  const { isGestor } = useAuth();
  const [tabelas, setTabelas] = useState<TabelaOAB[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState("");
  const [anoVigencia, setAnoVigencia] = useState(new Date().getFullYear());
  const [observacoes, setObservacoes] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [tabelaJsonText, setTabelaJsonText] = useState("[]");
  const [parsing, setParsing] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Upload direto por card (estado → id da tabela em processamento)
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ferramentas_oab_tabelas")
      .select("*")
      .order("estado")
      .order("ano_vigencia", { ascending: false });
    setTabelas((data ?? []) as unknown as TabelaOAB[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isGestor) {
      carregar();
    }
  }, [isGestor]);

  if (!isGestor) return <Navigate to="/ferramentas" replace />;

  const reset = () => {
    setEstado(""); setAnoVigencia(new Date().getFullYear());
    setObservacoes(""); setPdf(null); setTabelaJsonText("[]");
  };

  const handleParseIA = async () => {
    if (!pdf || !estado) {
      toast.error("Selecione estado e PDF antes de extrair");
      return;
    }
    setParsing(true);
    const path = `oab_${estado.toLowerCase()}_${anoVigencia}_${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("ferramentas-tabelas")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      toast.error("Erro no upload: " + upErr.message);
      setParsing(false); return;
    }
    const { data, error } = await supabase.functions.invoke("ferramentas-parse-tabela-oab", {
      body: { storage_path: path },
    });
    setParsing(false);
    if (error || !data?.tabela_json) {
      toast.error("Erro ao extrair: " + (error?.message ?? "desconhecido"));
      return;
    }
    setTabelaJsonText(JSON.stringify(data.tabela_json, null, 2));
    toast.success("Tabela extraída — revise antes de salvar");
  };

  const handleSalvar = async () => {
    if (!estado) { toast.error("Selecione o estado"); return; }
    let tabelaJson;
    try { tabelaJson = JSON.parse(tabelaJsonText); }
    catch { toast.error("JSON inválido"); return; }

    setSalvando(true);
    let arquivo_url: string | null = null;
    if (pdf) {
      const path = `oab_${estado.toLowerCase()}_${anoVigencia}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("ferramentas-tabelas")
        .upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (!upErr) arquivo_url = path;
    }

    const estNome = ESTADOS_BR.find((e) => e.sigla === estado)?.nome ?? estado;
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("ferramentas_oab_tabelas")
      .upsert({
        estado, estado_nome: estNome, oab_seccional: `OAB/${estado}`,
        ano_vigencia: anoVigencia, tabela_json: tabelaJson,
        observacoes, arquivo_url, carregado_por: user?.id, ativo: true,
      }, { onConflict: "estado,ano_vigencia" });

    setSalvando(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Tabela salva");
    setOpen(false); reset(); carregar();
  };

  const handleDesativar = async (id: string) => {
    if (!confirm("Desativar esta tabela?")) return;
    const { error } = await supabase
      .from("ferramentas_oab_tabelas")
      .update({ ativo: false })
      .eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Desativada"); carregar(); }
  };

  // Fluxo "anexar PDF e ativar" direto no card
  const handleUploadDireto = async (tabela: TabelaOAB, file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Envie um arquivo PDF");
      return;
    }
    setProcessandoId(tabela.id);
    try {
      const path = `oab_${tabela.estado.toLowerCase()}_${tabela.ano_vigencia}_${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("ferramentas-tabelas")
        .upload(path, file, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(upErr.message);

      toast.info(`Extraindo tabela de ${tabela.estado_nome} com IA…`);
      const { data, error } = await supabase.functions.invoke("ferramentas-parse-tabela-oab", {
        body: { storage_path: path },
      });
      if (error || !data?.tabela_json) {
        throw new Error(error?.message ?? "IA não retornou dados");
      }

      // Caminho persistente (sem timestamp) para referência
      const pathPersistente = `oab_${tabela.estado.toLowerCase()}_${tabela.ano_vigencia}.pdf`;
      await supabase.storage
        .from("ferramentas-tabelas")
        .upload(pathPersistente, file, { contentType: "application/pdf", upsert: true });

      const { data: { user } } = await supabase.auth.getUser();
      const { error: updErr } = await supabase
        .from("ferramentas_oab_tabelas")
        .update({
          tabela_json: data.tabela_json,
          arquivo_url: pathPersistente,
          carregado_por: user?.id,
          ativo: true,
        })
        .eq("id", tabela.id);
      if (updErr) throw new Error(updErr.message);

      const totalCat = (data.tabela_json ?? []).length;
      const totalItens = (data.tabela_json ?? []).reduce(
        (s: number, c: { itens?: unknown[] }) => s + (c.itens?.length ?? 0), 0,
      );
      toast.success(`${tabela.estado_nome}: ${totalCat} categorias e ${totalItens} itens importados`);
      await carregar();
    } catch (err) {
      toast.error("Falha ao importar: " + (err instanceof Error ? err.message : "desconhecido"));
    } finally {
      setProcessandoId(null);
      const input = fileInputsRef.current[tabela.id];
      if (input) input.value = "";
    }
  };

  const triggerUpload = (id: string) => {
    fileInputsRef.current[id]?.click();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Tabelas OAB" description="Gerencie as tabelas de honorários por estado">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ferramentas/calculadora-honorarios"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Button variant="gold" size="sm" onClick={() => { reset(); setOpen(true); }}>
          <Plus className="w-4 h-4" /> Nova tabela
        </Button>
      </PageHeader>

      {loading ? (
        <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>
      ) : tabelas.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma tabela cadastrada</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabelas.map((t) => {
            const totalItens = (t.tabela_json ?? []).reduce((s: number, c) => s + (c.itens?.length ?? 0), 0);
            const totalCategorias = (t.tabela_json ?? []).length;
            const vazia = totalCategorias === 0;
            const processando = processandoId === t.id;
            return (
              <Card
                key={t.id}
                className={`p-4 space-y-3 ${vazia ? "border-dashed" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-lg truncate">{t.oab_seccional}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.estado_nome} · {t.ano_vigencia}</p>
                  </div>
                  {t.ativo ? (
                    <Badge variant="default" className="gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3" /> Ativa
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Inativa</Badge>
                  )}
                </div>

                <div className="text-xs text-muted-foreground">
                  {vazia ? (
                    <span className="italic">Tabela ainda não preenchida</span>
                  ) : (
                    <>{totalCategorias} categorias · {totalItens} itens</>
                  )}
                </div>

                {t.observacoes && <p className="text-xs italic line-clamp-2">{t.observacoes}</p>}

                <input
                  ref={(el) => { fileInputsRef.current[t.id] = el; }}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadDireto(t, f);
                  }}
                />

                <div className="flex flex-wrap gap-1 pt-1">
                  <Button
                    variant={vazia ? "gold" : "outline"}
                    size="sm"
                    onClick={() => triggerUpload(t.id)}
                    disabled={processando}
                  >
                    {processando ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Processando…</>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        {vazia ? "Anexar PDF e ativar" : "Substituir PDF"}
                      </>
                    )}
                  </Button>
                  {t.ativo && !vazia && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDesativar(t.id)}
                      disabled={processando}
                    >
                      <Trash2 className="w-3 h-3" /> Desativar
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova tabela OAB</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={estado} onValueChange={setEstado}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BR.map((e) => <SelectItem key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ano de vigência</Label>
                <Input type="number" value={anoVigencia} onChange={(e) => setAnoVigencia(parseInt(e.target.value) || new Date().getFullYear())} />
              </div>
            </div>

            <div>
              <Label>PDF da tabela (opcional)</Label>
              <div className="flex gap-2">
                <Input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" size="sm" onClick={handleParseIA} disabled={!pdf || !estado || parsing}>
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Extrair com IA
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">A IA lê o PDF e preenche o JSON automaticamente — sempre revise.</p>
            </div>

            <div>
              <Label>Estrutura JSON (categorias e itens)</Label>
              <Textarea
                value={tabelaJsonText}
                onChange={(e) => setTabelaJsonText(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button variant="gold" onClick={handleSalvar} disabled={salvando}>
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
