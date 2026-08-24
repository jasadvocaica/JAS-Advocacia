import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, Save, Trash2, ArrowUp, ArrowDown, X } from "lucide-react";
import {
  AREA_OPTIONS, GATILHO_OPTIONS, TIPO_ETAPA_OPTIONS, RESPONSAVEL_PADRAO_OPTIONS,
  PRAZO_TIPO_OPTIONS, EtapaTemplate,
} from "./types";
import { toast } from "sonner";

interface EtapaForm extends Omit<EtapaTemplate, "id" | "template_id"> {
  id?: string;
  _new?: boolean;
}

const emptyEtapa = (ordem: number): EtapaForm => ({
  ordem,
  titulo: "",
  descricao: "",
  tipo: "tarefa",
  prazo_dias: 1,
  prazo_tipo: "uteis",
  prazo_referencia: "gatilho",
  responsavel_padrao: "advogado_caso",
  checklist_itens: [],
  template_texto: "",
  obrigatorio: true,
  prioridade: "media",
  _new: true,
});

export default function FluxoEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "novo";
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [meta, setMeta] = useState({
    nome: "",
    descricao: "",
    gatilho: "manual",
    area: "previdenciario",
    ativo: true,
  });

  const [etapas, setEtapas] = useState<EtapaForm[]>([]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const [{ data: tpl }, { data: ets }] = await Promise.all([
        (supabase as any).from("fluxos_templates").select("*").eq("id", id).maybeSingle(),
        (supabase as any).from("fluxo_etapas_template").select("*").eq("template_id", id).order("ordem"),
      ]);
      if (!tpl) { toast.error("Fluxo não encontrado"); navigate("/fluxos"); return; }
      setMeta({
        nome: tpl.nome ?? "",
        descricao: tpl.descricao ?? "",
        gatilho: tpl.gatilho ?? "manual",
        area: tpl.area ?? "previdenciario",
        ativo: tpl.ativo ?? true,
      });
      setEtapas((ets ?? []).map((e: any) => ({
        ...e,
        checklist_itens: Array.isArray(e.checklist_itens) ? e.checklist_itens : [],
      })));
      setLoading(false);
    })();
  }, [id, isNew, navigate]);

  const addEtapa = () => setEtapas((p) => [...p, emptyEtapa(p.length + 1)]);

  const updateEtapa = (idx: number, patch: Partial<EtapaForm>) =>
    setEtapas((p) => p.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const removeEtapa = (idx: number) =>
    setEtapas((p) => p.filter((_, i) => i !== idx).map((e, i) => ({ ...e, ordem: i + 1 })));

  const moveEtapa = (idx: number, dir: -1 | 1) => {
    setEtapas((p) => {
      const novo = [...p];
      const j = idx + dir;
      if (j < 0 || j >= novo.length) return p;
      [novo[idx], novo[j]] = [novo[j], novo[idx]];
      return novo.map((e, i) => ({ ...e, ordem: i + 1 }));
    });
  };

  const addChecklistItem = (idx: number, val: string) => {
    if (!val.trim()) return;
    updateEtapa(idx, { checklist_itens: [...(etapas[idx].checklist_itens ?? []), val.trim()] });
  };
  const removeChecklistItem = (idx: number, ci: number) => {
    updateEtapa(idx, { checklist_itens: etapas[idx].checklist_itens.filter((_, i) => i !== ci) });
  };

  const save = async () => {
    if (!meta.nome.trim()) return toast.error("Informe um nome para o fluxo");
    if (!etapas.length) return toast.error("Adicione pelo menos uma etapa");
    if (etapas.some((e) => !e.titulo.trim())) return toast.error("Todas as etapas precisam de título");

    setSaving(true);
    let templateId = id;

    if (isNew) {
      const { data, error } = await (supabase as any)
        .from("fluxos_templates")
        .insert({ ...meta, etapas: [] })
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error("Erro ao criar fluxo: " + error.message); }
      templateId = data.id;
    } else {
      const { error } = await (supabase as any)
        .from("fluxos_templates")
        .update(meta)
        .eq("id", id);
      if (error) { setSaving(false); return toast.error("Erro ao salvar: " + error.message); }
      // Limpa etapas antigas
      await (supabase as any).from("fluxo_etapas_template").delete().eq("template_id", id);
    }

    // Insere etapas
    const payload = etapas.map((e) => ({
      template_id: templateId,
      ordem: e.ordem,
      titulo: e.titulo,
      descricao: e.descricao || null,
      tipo: e.tipo,
      prazo_dias: e.prazo_dias,
      prazo_tipo: e.prazo_tipo,
      prazo_referencia: e.prazo_referencia,
      responsavel_padrao: e.responsavel_padrao === "_none" ? null : e.responsavel_padrao,
      checklist_itens: e.checklist_itens,
      template_texto: e.template_texto || null,
      obrigatorio: e.obrigatorio,
      prioridade: e.prioridade,
    }));
    const { error: errE } = await (supabase as any).from("fluxo_etapas_template").insert(payload);
    if (errE) { setSaving(false); return toast.error("Erro ao salvar etapas: " + errE.message); }

    toast.success(isNew ? "Fluxo criado" : "Fluxo atualizado");
    setSaving(false);
    navigate("/fluxos");
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/fluxos"><ArrowLeft className="w-4 h-4 mr-2" /> Voltar</Link>
      </Button>

      <PageHeader title={isNew ? "Novo fluxo" : "Editar fluxo"} description="Defina as etapas que serão criadas automaticamente quando o fluxo for disparado.">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar
        </Button>
      </PageHeader>

      <Card className="p-6 mb-6">
        <h2 className="font-semibold mb-4">Informações gerais</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Nome do fluxo *</Label>
            <Input value={meta.nome} onChange={(e) => setMeta({ ...meta, nome: e.target.value })} placeholder="Ex: BPC negado — ação judicial" />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea value={meta.descricao} onChange={(e) => setMeta({ ...meta, descricao: e.target.value })} rows={2} />
          </div>
          <div>
            <Label>Gatilho</Label>
            <Select value={meta.gatilho} onValueChange={(v) => setMeta({ ...meta, gatilho: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GATILHO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Área do direito</Label>
            <Select value={meta.area} onValueChange={(v) => setMeta({ ...meta, area: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AREA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={meta.ativo} onCheckedChange={(v) => setMeta({ ...meta, ativo: v })} />
            <Label>Fluxo ativo</Label>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Etapas ({etapas.length})</h2>
        <Button variant="outline" size="sm" onClick={addEtapa}><Plus className="w-4 h-4 mr-2" /> Adicionar etapa</Button>
      </div>

      {etapas.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          Nenhuma etapa. Clique em "Adicionar etapa" para começar.
        </Card>
      ) : (
        <div className="space-y-4">
          {etapas.map((e, idx) => (
            <EtapaCard
              key={idx}
              etapa={e}
              idx={idx}
              total={etapas.length}
              onChange={(p) => updateEtapa(idx, p)}
              onRemove={() => removeEtapa(idx)}
              onMove={(d) => moveEtapa(idx, d)}
              onAddChecklist={(v) => addChecklistItem(idx, v)}
              onRemoveChecklist={(ci) => removeChecklistItem(idx, ci)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EtapaCard({
  etapa, idx, total, onChange, onRemove, onMove, onAddChecklist, onRemoveChecklist,
}: {
  etapa: EtapaForm; idx: number; total: number;
  onChange: (p: Partial<EtapaForm>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  onAddChecklist: (v: string) => void;
  onRemoveChecklist: (ci: number) => void;
}) {
  const [novoItem, setNovoItem] = useState("");

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 mb-4">
        <Badge className="shrink-0 mt-1">{etapa.ordem}</Badge>
        <Input
          value={etapa.titulo}
          onChange={(e) => onChange({ titulo: e.target.value })}
          placeholder="Título da etapa"
          className="font-medium"
        />
        <div className="flex gap-1 shrink-0">
          <Button size="icon" variant="ghost" onClick={() => onMove(-1)} disabled={idx === 0}><ArrowUp className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onMove(1)} disabled={idx === total - 1}><ArrowDown className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onRemove} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-3">
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={etapa.tipo} onValueChange={(v) => onChange({ tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPO_ETAPA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Prazo (dias)</Label>
          <Input type="number" value={etapa.prazo_dias} onChange={(e) => onChange({ prazo_dias: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Tipo de prazo</Label>
          <Select value={etapa.prazo_tipo} onValueChange={(v) => onChange({ prazo_tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRAZO_TIPO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Responsável padrão</Label>
          <Select value={etapa.responsavel_padrao ?? "_none"} onValueChange={(v) => onChange({ responsavel_padrao: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESPONSAVEL_PADRAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Prioridade</Label>
          <Select value={etapa.prioridade} onValueChange={(v) => onChange({ prioridade: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Switch checked={etapa.obrigatorio} onCheckedChange={(v) => onChange({ obrigatorio: v })} />
          <Label className="text-xs">Obrigatória</Label>
        </div>
      </div>

      <div className="mb-3">
        <Label className="text-xs">Descrição</Label>
        <Textarea value={etapa.descricao ?? ""} onChange={(e) => onChange({ descricao: e.target.value })} rows={2} />
      </div>

      <div className="mb-3">
        <Label className="text-xs">Checklist ({etapa.checklist_itens.length})</Label>
        <div className="flex gap-2 mb-2">
          <Input
            value={novoItem}
            onChange={(e) => setNovoItem(e.target.value)}
            placeholder="Novo item..."
            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); onAddChecklist(novoItem); setNovoItem(""); } }}
          />
          <Button type="button" variant="outline" onClick={() => { onAddChecklist(novoItem); setNovoItem(""); }}>Adicionar</Button>
        </div>
        {etapa.checklist_itens.length > 0 && (
          <ul className="space-y-1">
            {etapa.checklist_itens.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-1.5 rounded">
                <span className="flex-1">{item}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRemoveChecklist(i)}>
                  <X className="w-3 h-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <Label className="text-xs">Texto modelo (use variáveis: {"{{nome_cliente}}"}, {"{{processo_numero}}"})</Label>
        <Textarea value={etapa.template_texto ?? ""} onChange={(e) => onChange({ template_texto: e.target.value })} rows={2} placeholder="Ex: Olá, {{nome_cliente}}! Sua audiência foi marcada..." />
      </div>
    </Card>
  );
}
