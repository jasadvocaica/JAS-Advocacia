// "O que o cliente vê" — painel consolidado no detalhe do processo.
// Reúne fase atual padronizada, resumo do caso, diligências visíveis e atualizações publicadas.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TIPOS_BENEFICIO, ETAPAS_COMUNS, VIAS_PROCESSUAIS } from "@/portal-cliente/glossario";

interface Props {
  processoId: string;
  clienteId: string;
}

interface Fase { id: string; nome: string; cor: string; ordem: number; }
interface Diligencia { id: string; titulo: string; status: string; visivel_cliente: boolean; categoria: string; }
interface Atualizacao { id: string; titulo: string; texto_simples: string; proximos_passos: string | null; publicado: boolean; publicado_em: string | null; }

export default function ClienteVeTab({ processoId, clienteId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fases, setFases] = useState<Fase[]>([]);
  const [fasePadraoId, setFasePadraoId] = useState<string | null>(null);
  const [faseAtualTexto, setFaseAtualTexto] = useState("");

  const [resumo, setResumo] = useState("");
  const [notificar, setNotificar] = useState(false);
  const [portalLiberado, setPortalLiberado] = useState(false);

  // Ficha humanizada do processo (campos para o cliente entender o caso)
  const [tipoBeneficio, setTipoBeneficio] = useState("");
  const [motivoNegativa, setMotivoNegativa] = useState("");
  const [cidCodigo, setCidCodigo] = useState("");
  const [cidDescricao, setCidDescricao] = useState("");
  const [faseAtualExplicacao, setFaseAtualExplicacao] = useState("");
  const [proximasEtapas, setProximasEtapas] = useState<string[]>([]);
  const [viaProcessual, setViaProcessual] = useState("");
  const [savingFicha, setSavingFicha] = useState(false);

  const [diligencias, setDiligencias] = useState<Diligencia[]>([]);
  const [atualizacoes, setAtualizacoes] = useState<Atualizacao[]>([]);

  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [novoProximos, setNovoProximos] = useState("");
  const [iaSimplificando, setIaSimplificando] = useState(false);

  async function carregar() {
    setLoading(true);
    const [fs, p, pp, dl, at] = await Promise.all([
      supabase.from("processo_fases_padrao").select("id, nome, cor, ordem").eq("ativo", true).order("ordem"),
      supabase.from("processos").select("fase_padrao_id, fase_atual").eq("id", processoId).maybeSingle(),
      supabase.from("cliente_portal_processos").select("resumo_cliente, notificar_cliente_mudancas, visivel, tipo_beneficio, motivo_negativa, cid_codigo, cid_descricao, fase_atual_explicacao, proximas_etapas, via_processual").eq("processo_id", processoId).eq("cliente_id", clienteId).maybeSingle(),
      supabase.from("checklist_diligencias").select("id, titulo, status, visivel_cliente, categoria").eq("processo_id", processoId).order("ordem"),
      supabase.from("cliente_portal_atualizacoes").select("id, titulo, texto_simples, proximos_passos, publicado, publicado_em").eq("processo_id", processoId).order("criado_em", { ascending: false }),
    ]);
    setFases((fs.data as Fase[]) ?? []);
    setFasePadraoId((p.data as any)?.fase_padrao_id ?? null);
    setFaseAtualTexto((p.data as any)?.fase_atual ?? "");
    const ppd: any = pp.data ?? {};
    setResumo(ppd.resumo_cliente ?? "");
    setNotificar(!!ppd.notificar_cliente_mudancas);
    setPortalLiberado(!!ppd.visivel);
    setTipoBeneficio(ppd.tipo_beneficio ?? "");
    setMotivoNegativa(ppd.motivo_negativa ?? "");
    setCidCodigo(ppd.cid_codigo ?? "");
    setCidDescricao(ppd.cid_descricao ?? "");
    setFaseAtualExplicacao(ppd.fase_atual_explicacao ?? "");
    setProximasEtapas(Array.isArray(ppd.proximas_etapas) ? ppd.proximas_etapas : []);
    setViaProcessual(ppd.via_processual ?? "");
    setDiligencias((dl.data as Diligencia[]) ?? []);
    setAtualizacoes((at.data as Atualizacao[]) ?? []);
    setLoading(false);
  }

  async function salvarFicha() {
    setSavingFicha(true);
    const { error } = await supabase.from("cliente_portal_processos").upsert({
      processo_id: processoId,
      cliente_id: clienteId,
      tipo_beneficio: tipoBeneficio || null,
      motivo_negativa: motivoNegativa || null,
      cid_codigo: cidCodigo || null,
      cid_descricao: cidDescricao || null,
      fase_atual_explicacao: faseAtualExplicacao || null,
      proximas_etapas: proximasEtapas,
      via_processual: viaProcessual || null,
      ficha_atualizada_em: new Date().toISOString(),
    }, { onConflict: "cliente_id,processo_id" });
    setSavingFicha(false);
    if (error) { toast.error("Falha ao salvar ficha"); return; }
    toast.success("Ficha do cliente atualizada");
  }

  function toggleEtapa(etapa: string) {
    setProximasEtapas(prev => prev.includes(etapa) ? prev.filter(e => e !== etapa) : [...prev, etapa]);
  }

  useEffect(() => { carregar(); }, [processoId, clienteId]);

  async function salvarFase(novaId: string) {
    const fase = fases.find(f => f.id === novaId);
    setFasePadraoId(novaId);
    setFaseAtualTexto(fase?.nome ?? "");
    setSaving(true);
    const { error } = await supabase.from("processos").update({
      fase_padrao_id: novaId,
      fase_atual: fase?.nome ?? null,
    }).eq("id", processoId);
    setSaving(false);
    if (error) { toast.error("Falha ao salvar fase"); return; }
    toast.success("Fase atualizada");

    if (notificar && portalLiberado) {
      await supabase.from("cliente_portal_atualizacoes").insert({
        processo_id: processoId,
        cliente_id: clienteId,
        titulo: `Nova fase: ${fase?.nome ?? ""}`,
        texto_simples: `Seu processo avançou para a fase "${fase?.nome ?? ""}".`,
        publicado: true,
        publicado_em: new Date().toISOString(),
      });
      toast.success("Cliente notificado");
      carregar();
    }
  }

  async function salvarResumo() {
    setSaving(true);
    const { error } = await supabase.from("cliente_portal_processos").upsert({
      processo_id: processoId,
      cliente_id: clienteId,
      resumo_cliente: resumo,
      notificar_cliente_mudancas: notificar,
    }, { onConflict: "cliente_id,processo_id" });
    setSaving(false);
    if (error) { toast.error("Falha ao salvar resumo"); return; }
    toast.success("Resumo salvo");
  }

  async function toggleNotificar(v: boolean) {
    setNotificar(v);
    await supabase.from("cliente_portal_processos").upsert({
      processo_id: processoId,
      cliente_id: clienteId,
      notificar_cliente_mudancas: v,
    }, { onConflict: "cliente_id,processo_id" });
  }

  async function toggleDiligencia(id: string, v: boolean) {
    setDiligencias(prev => prev.map(d => d.id === id ? { ...d, visivel_cliente: v } : d));
    await supabase.from("checklist_diligencias").update({ visivel_cliente: v }).eq("id", id);
  }

  async function simplificarIA() {
    if (!novoTexto.trim()) { toast.error("Escreva algo primeiro"); return; }
    setIaSimplificando(true);
    try {
      const { data, error } = await supabase.functions.invoke("tarefa-sugerir-ia", {
        body: { modo: "simplificar_cliente", texto: novoTexto },
      });
      if (error) throw error;
      if (data?.titulo) setNovoTitulo(data.titulo);
      if (data?.texto_simples) setNovoTexto(data.texto_simples);
      if (data?.proximos_passos) setNovoProximos(data.proximos_passos);
      toast.success("Texto simplificado");
    } catch {
      toast.error("Não foi possível simplificar agora");
    } finally {
      setIaSimplificando(false);
    }
  }

  async function publicarAtualizacao() {
    if (!novoTitulo.trim() || !novoTexto.trim()) { toast.error("Preencha título e descrição"); return; }
    const { error } = await supabase.from("cliente_portal_atualizacoes").insert({
      processo_id: processoId,
      cliente_id: clienteId,
      titulo: novoTitulo,
      texto_simples: novoTexto,
      proximos_passos: novoProximos || null,
      publicado: true,
      publicado_em: new Date().toISOString(),
    });
    if (error) { toast.error("Falha ao publicar"); return; }
    toast.success("Atualização publicada para o cliente");
    setNovoTitulo(""); setNovoTexto(""); setNovoProximos("");
    carregar();
  }

  async function removerAtualizacao(id: string) {
    const { error } = await supabase.from("cliente_portal_atualizacoes").delete().eq("id", id);
    if (error) { toast.error("Falha ao remover"); return; }
    carregar();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const faseAtual = fases.find(f => f.id === fasePadraoId);

  return (
    <div className="space-y-4">
      {!portalLiberado && (
        <Card className="p-4 border-amber-500/40 bg-amber-500/5 text-sm">
          <p>O portal deste cliente ainda <strong>não está liberado</strong> para este processo. Libere na aba <em>Portal</em> do cadastro do cliente para que ele veja estas informações.</p>
        </Card>
      )}

      {/* Fase atual */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display text-base">Fase atual do processo</h3>
          {faseAtual && <Badge style={{ backgroundColor: faseAtual.cor, color: "#fff" }}>{faseAtual.nome}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">A fase aparece no portal do cliente como linha do tempo visual.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Fase padronizada</Label>
            <Select value={fasePadraoId ?? ""} onValueChange={salvarFase}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {fases.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.cor }} />
                      {f.ordem}. {f.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={notificar} onCheckedChange={toggleNotificar} id="notif" />
              <Label htmlFor="notif" className="text-sm">Notificar cliente ao mudar fase</Label>
            </div>
          </div>
        </div>
        {faseAtualTexto && !faseAtual && (
          <p className="text-xs text-muted-foreground">Texto livre atual: <strong>{faseAtualTexto}</strong> — selecione uma fase padronizada acima para ativar a timeline visual no portal.</p>
        )}
      </Card>

      {/* Resumo */}
      <Card className="p-5 space-y-3">
        <h3 className="font-display text-base">Resumo do caso (visível ao cliente)</h3>
        <p className="text-xs text-muted-foreground">Escreva em linguagem simples o que está acontecendo. Funciona como um diário do caso.</p>
        <Textarea value={resumo} onChange={e => setResumo(e.target.value)} rows={5} placeholder="Ex.: Entramos com a ação em 12/03. Aguardamos a citação do INSS em até 30 dias…" />
        <div className="flex justify-end">
          <Button size="sm" onClick={salvarResumo} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" /> Salvar resumo
          </Button>
        </div>
      </Card>

      {/* Ficha humanizada para o cliente */}
      <Card className="p-5 space-y-4 border-gold/30 bg-gold/5">
        <div>
          <h3 className="font-display text-base">Ficha do caso (linguagem do cliente)</h3>
          <p className="text-xs text-muted-foreground">Estes campos aparecem no portal do cliente como "Sobre o seu caso", com traduções automáticas.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tipo de benefício / pedido</Label>
            <Select value={tipoBeneficio} onValueChange={setTipoBeneficio}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {TIPOS_BENEFICIO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Via processual</Label>
            <Select value={viaProcessual} onValueChange={setViaProcessual}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {VIAS_PROCESSUAIS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Motivo da negativa (se houver)</Label>
          <Textarea value={motivoNegativa} onChange={e => setMotivoNegativa(e.target.value)} rows={2} placeholder="Ex.: INSS negou por falta de qualidade de segurado…" />
        </div>

        <div className="grid sm:grid-cols-[140px_1fr] gap-3">
          <div>
            <Label className="text-xs">CID (código)</Label>
            <Input value={cidCodigo} onChange={e => setCidCodigo(e.target.value)} placeholder="Ex.: M54.5" />
          </div>
          <div>
            <Label className="text-xs">CID — explicação em linguagem simples</Label>
            <Input value={cidDescricao} onChange={e => setCidDescricao(e.target.value)} placeholder="Ex.: Dor lombar crônica" />
          </div>
        </div>

        <div>
          <Label className="text-xs">O que está acontecendo agora (linguagem do cliente)</Label>
          <Textarea value={faseAtualExplicacao} onChange={e => setFaseAtualExplicacao(e.target.value)} rows={3} placeholder="Ex.: Estamos aguardando a perícia médica. O INSS marca a data e avisa por carta…" />
        </div>

        <div>
          <Label className="text-xs mb-2 block">Próximas etapas que dependem do cliente / do processo</Label>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {ETAPAS_COMUNS.map(et => {
              const ativo = proximasEtapas.includes(et);
              return (
                <button
                  key={et}
                  type="button"
                  onClick={() => toggleEtapa(et)}
                  className={`text-left text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                    ativo ? "bg-gold/20 border-gold text-gold-dark font-medium" : "bg-background border-border/60 hover:bg-muted"
                  }`}
                >
                  {ativo ? "✓ " : ""}{et}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={salvarFicha} disabled={savingFicha}>
            <Save className="w-3.5 h-3.5 mr-1" /> Salvar ficha
          </Button>
        </div>
      </Card>


      <Card className="p-5 space-y-3">
        <h3 className="font-display text-base">Diligências visíveis ao cliente</h3>
        <p className="text-xs text-muted-foreground">Marque o que o cliente pode acompanhar. Ao concluir internamente, aparece como ✅ no portal.</p>
        {diligencias.length === 0
          ? <p className="text-sm text-muted-foreground">Nenhuma diligência cadastrada. Adicione em <em>IA &amp; Checklist</em>.</p>
          : <div className="space-y-2">
              {diligencias.map(d => (
                <div key={d.id} className="flex items-center justify-between gap-3 border border-border/40 rounded-md p-2">
                  <div className="min-w-0">
                    <p className="text-sm truncate">{d.titulo}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{d.categoria} · {d.status.replace(/_/g, " ")}</p>
                  </div>
                  <Switch checked={d.visivel_cliente} onCheckedChange={(v) => toggleDiligencia(d.id, v)} />
                </div>
              ))}
            </div>}
      </Card>

      {/* Atualizações publicadas */}
      <Card className="p-5 space-y-3">
        <h3 className="font-display text-base">Atualizações publicadas</h3>
        <div className="space-y-3 border border-dashed border-border/60 rounded-md p-3">
          <Input value={novoTitulo} onChange={e => setNovoTitulo(e.target.value)} placeholder="Título (ex.: Audiência marcada)" />
          <Textarea value={novoTexto} onChange={e => setNovoTexto(e.target.value)} rows={3} placeholder="Mensagem em linguagem simples para o cliente…" />
          <Input value={novoProximos} onChange={e => setNovoProximos(e.target.value)} placeholder="Próximos passos (opcional)" />
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="outline" onClick={simplificarIA} disabled={iaSimplificando}>
              {iaSimplificando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              Simplificar com IA
            </Button>
            <Button size="sm" onClick={publicarAtualizacao}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Publicar para o cliente
            </Button>
          </div>
        </div>

        {atualizacoes.length === 0
          ? <p className="text-sm text-muted-foreground">Nenhuma atualização publicada ainda.</p>
          : <div className="space-y-2">
              {atualizacoes.map(a => (
                <div key={a.id} className="border-l-2 border-gold pl-3 py-1 flex justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      {a.publicado_em ? new Date(a.publicado_em).toLocaleDateString("pt-BR") : "rascunho"}
                      {!a.publicado && <Badge variant="outline" className="ml-2 text-[10px]">rascunho</Badge>}
                    </p>
                    <p className="font-medium text-sm">{a.titulo}</p>
                    <p className="text-sm whitespace-pre-wrap">{a.texto_simples}</p>
                    {a.proximos_passos && <p className="text-xs mt-1 text-muted-foreground"><strong>Próximos passos:</strong> {a.proximos_passos}</p>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removerAtualizacao(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>}
      </Card>
    </div>
  );
}
