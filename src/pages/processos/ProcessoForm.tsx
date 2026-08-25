import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, Wifi, WifiOff, Plus, Trash2, Users } from "lucide-react";
import { formatCNJ, onlyDigits } from "@/lib/format";
import { TRIBUNAIS, derivarTribunalDoCNJ, validarCNJ, tribunalSuportado } from "@/lib/datajud";
import { toast } from "sonner";
import { useFormDraft } from "@/hooks/useFormDraft";
import { comRetry } from "@/lib/supabase-retry";

const AREAS = [
  "previdenciario", "familia", "civil", "trabalhista",
  "tributario", "consumidor", "criminal", "administrativo", "outro",
];

const AREAS_LABEL: Record<string, string> = {
  previdenciario: "Previdenciário", familia: "Família", civil: "Cível",
  trabalhista: "Trabalhista", tributario: "Tributário", consumidor: "Consumidor",
  criminal: "Criminal", administrativo: "Administrativo", outro: "Outro",
};

const TIPOS_ACAO_SUGERIDOS = [
  "Ação de cobrança",
  "Ação de execução",
  "Ação monitória",
  "Ação de indenização por danos morais",
  "Ação de indenização por danos materiais",
  "Ação revisional",
  "Ação declaratória",
  "Ação de obrigação de fazer",
  "Ação de obrigação de não fazer",
  "Ação de despejo",
  "Ação de divórcio",
  "Ação de alimentos",
  "Ação de guarda",
  "Inventário",
  "Reclamação trabalhista",
  "Mandado de segurança",
  "Embargos à execução",
  "BPC/LOAS",
  "Auxílio por incapacidade",
  "Aposentadoria por idade",
  "Aposentadoria por tempo de contribuição",
  "Pensão por morte",
  "Revisão de benefício INSS",
];

interface ClienteOpt { id: string; nome: string; }
interface ParceiroOpt { id: string; nome: string; }
interface StatusOpt { id: string; nome: string; tipo_processo: string; }

type TipoParte = "autor" | "reu" | "interessado" | "terceiro";
interface ParteForm {
  id?: string;
  tipo: TipoParte;
  nome: string;
  cpf_cnpj: string;
  advogado_nome: string;
  advogado_oab: string;
}

const initialForm = {
  cliente_id: "",
  tipo: "judicial" as "judicial" | "administrativo",
  numero_cnj: "",
  tribunal_sigla: "",
  instancia: "",
  nb_inss: "",
  data_der: "",
  fase_administrativa: "",
  area_direito: "",
  tipo_acao: "",
  status: "Em andamento",
  fase_atual: "",
  vara: "",
  comarca: "",
  juiz: "",
  valor_causa: "",
  data_distribuicao: "",
  parceiro_id: "",
  responsavel_id: "",
  observacoes_internas: "",
  datajud_ativo: true,
};

export default function ProcessoForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = (location.state as { prefill?: Partial<typeof initialForm> } | null)?.prefill;
  const { user } = useAuth();

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [parceiros, setParceiros] = useState<ParceiroOpt[]>([]);
  const [statusList, setStatusList] = useState<StatusOpt[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ ...initialForm, ...(prefill ?? {}) });
  const [partes, setPartes] = useState<ParteForm[]>([]);

  // Auto-save de rascunho — protege contra fechar/minimizar/trocar de aba
  const draftKey = `processo:rascunho:${id ?? "novo"}`;
  const { clear: clearDraft } = useFormDraft(draftKey, { form, partes }, {
    enabled: !loading,
    hasContent: (v) => Boolean(v.form.numero_cnj || v.form.tipo_acao || v.form.observacoes_internas || v.partes.length > 0),
    onRestore: (d) => {
      if (d.form) setForm((f) => ({ ...f, ...d.form }));
      if (Array.isArray(d.partes)) setPartes(d.partes);
    },
  });

  const addParte = (tipo: TipoParte = "reu") =>
    setPartes((arr) => [...arr, { tipo, nome: "", cpf_cnpj: "", advogado_nome: "", advogado_oab: "" }]);
  const updateParte = (idx: number, patch: Partial<ParteForm>) =>
    setPartes((arr) => arr.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  const removeParte = (idx: number) => setPartes((arr) => arr.filter((_, i) => i !== idx));

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: ps }, { data: st }] = await Promise.all([
        supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("parceiros").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("processo_status").select("id, nome, tipo_processo").eq("ativo", true).order("ordem"),
      ]);
      setClientes((cs ?? []) as ClienteOpt[]);
      setParceiros((ps ?? []) as ParceiroOpt[]);
      setStatusList((st ?? []) as StatusOpt[]);
    })();
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("processos").select("*").eq("id", id!).maybeSingle();
      if (error || !data) { toast.error("Processo não encontrado"); navigate("/processos"); return; }
      setForm({
        cliente_id: data.cliente_id,
        tipo: data.tipo,
        numero_cnj: data.numero_cnj_limpo ?? data.numero_cnj ?? "",
        tribunal_sigla: data.tribunal_sigla ?? "",
        instancia: data.instancia ?? "",
        nb_inss: data.nb_inss ?? "",
        data_der: data.data_der ?? "",
        fase_administrativa: data.fase_administrativa ?? "",
        area_direito: data.area_direito ?? "",
        tipo_acao: data.tipo_acao ?? "",
        status: data.status,
        fase_atual: data.fase_atual ?? "",
        vara: data.vara ?? "",
        comarca: data.comarca ?? "",
        juiz: data.juiz ?? "",
        valor_causa: data.valor_causa?.toString() ?? "",
        data_distribuicao: data.data_distribuicao ?? "",
        parceiro_id: data.parceiro_id ?? "",
        responsavel_id: data.responsavel_id ?? "",
        observacoes_internas: data.observacoes_internas ?? "",
        datajud_ativo: data.datajud_ativo ?? true,
      });
      const { data: pts } = await supabase
        .from("processo_partes")
        .select("id, tipo, nome, cpf_cnpj, advogado_nome, advogado_oab")
        .eq("processo_id", id!);
      setPartes((pts ?? []).map((p: any) => ({
        id: p.id,
        tipo: p.tipo,
        nome: p.nome ?? "",
        cpf_cnpj: p.cpf_cnpj ?? "",
        advogado_nome: p.advogado_nome ?? "",
        advogado_oab: p.advogado_oab ?? "",
      })));
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  // Auto-detectar tribunal ao digitar CNJ
  const tribunalDetectado = useMemo(() => {
    const limpo = onlyDigits(form.numero_cnj);
    if (limpo.length !== 20) return null;
    return derivarTribunalDoCNJ(limpo);
  }, [form.numero_cnj]);

  useEffect(() => {
    if (tribunalDetectado && !form.tribunal_sigla) {
      setForm((f) => ({ ...f, tribunal_sigla: tribunalDetectado }));
    }
  }, [tribunalDetectado]); // eslint-disable-line

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error("Selecione um cliente"); return; }
    if (form.tipo === "judicial" && !form.numero_cnj) {
      toast.error("Informe o número CNJ do processo judicial");
      return;
    }
    if (form.tipo === "judicial" && !validarCNJ(form.numero_cnj)) {
      toast.error("Número CNJ inválido");
      return;
    }

    const cnjLimpo = form.numero_cnj ? onlyDigits(form.numero_cnj) : null;
    if (cnjLimpo) {
      let duplicadoQuery = supabase.from("processos").select("id").eq("numero_cnj", cnjLimpo);
      if (id) duplicadoQuery = duplicadoQuery.neq("id", id);
      const { data: duplicado } = await duplicadoQuery.maybeSingle();
      if (duplicado) {
        toast.error("Este processo já está cadastrado", { description: "Abra o processo existente para atualizar os dados." });
        return;
      }
    }
    setSaving(true);
    const tribunalInfo = form.tribunal_sigla ? TRIBUNAIS[form.tribunal_sigla] : null;
    const datajudPodeUsar = form.tipo === "judicial" && tribunalSuportado(form.tribunal_sigla);

    const payload: any = {
      cliente_id: form.cliente_id,
      tipo: form.tipo,
      numero_cnj: cnjLimpo,
      numero_cnj_limpo: cnjLimpo,
      tribunal_sigla: form.tribunal_sigla || null,
      tribunal_nome: tribunalInfo?.nome ?? null,
      datajud_alias: tribunalInfo?.alias ?? null,
      instancia: form.instancia || null,
      nb_inss: form.nb_inss || null,
      data_der: form.data_der || null,
      fase_administrativa: form.fase_administrativa || null,
      area_direito: form.area_direito || null,
      tipo_acao: form.tipo_acao || null,
      status: form.status,
      fase_atual: form.fase_atual || null,
      vara: form.vara || null,
      comarca: form.comarca || null,
      juiz: form.juiz || null,
      valor_causa: form.valor_causa ? parseFloat(form.valor_causa) : null,
      data_distribuicao: form.data_distribuicao || null,
      parceiro_id: form.parceiro_id || null,
      responsavel_id: form.responsavel_id || null,
      observacoes_internas: form.observacoes_internas || null,
      datajud_ativo: datajudPodeUsar ? form.datajud_ativo : false,
    };

    let processoId = id;
    if (isEdit) {
      const { error } = await comRetry(async () =>
        await supabase.from("processos").update(payload).eq("id", id!).select("id").single(),
      );
      if (error) {
        setSaving(false);
        return toast.error(error.code === "23505" ? "Número CNJ já cadastrado" : "Erro ao salvar", {
          description: error.code === "23505" ? "Use o processo existente para evitar duplicidade." : error.message,
        });
      }
    } else {
      payload.criado_por = user?.id;
      const { data, error } = await comRetry(async () =>
        await supabase.from("processos").insert(payload).select("id").single(),
      );
      if (error) {
        setSaving(false);
        return toast.error(error.code === "23505" ? "Número CNJ já cadastrado" : "Erro ao criar", {
          description: error.code === "23505" ? "Use o processo existente para evitar duplicidade." : error.message,
        });
      }
      processoId = data.id;
    }

    // Sincronizar partes (manuais — preserva as importadas via DataJud apenas para edição existente)
    if (processoId) {
      // Apaga as manuais e reinserir; mantém origem datajud
      await supabase.from("processo_partes").delete().eq("processo_id", processoId).eq("origem", "manual");
      const validas = partes.filter((p) => p.nome.trim());
      if (validas.length > 0) {
        const rows = validas.map((p) => ({
          processo_id: processoId,
          tipo: p.tipo,
          nome: p.nome.trim(),
          cpf_cnpj: p.cpf_cnpj || null,
          advogado_nome: p.advogado_nome || null,
          advogado_oab: p.advogado_oab || null,
          origem: "manual" as const,
        }));
        const { error: pErr } = await supabase.from("processo_partes").insert(rows);
        if (pErr) toast.error("Erro ao salvar partes", { description: pErr.message });
      }
    }

    setSaving(false);
    clearDraft();
    toast.success(isEdit ? "Processo atualizado" : "Processo cadastrado");
    navigate(`/processos/${processoId}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const statusFiltrados = statusList.filter((s) => s.tipo_processo === "ambos" || s.tipo_processo === form.tipo);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title={isEdit ? "Editar processo" : "Novo processo"} description="Dados completos do processo judicial ou administrativo">
        <Button variant="outline" asChild><Link to="/processos"><ArrowLeft className="w-4 h-4" /> Voltar</Link></Button>
      </PageHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-xl">Identificação</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="judicial">Judicial</SelectItem>
                  <SelectItem value="administrativo">Administrativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.tipo === "judicial" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
                <div className="space-y-2">
                  <Label>Número CNJ</Label>
                  <Input
                    value={form.numero_cnj ? formatCNJ(form.numero_cnj) : ""}
                    onChange={(e) => setForm({ ...form, numero_cnj: onlyDigits(e.target.value) })}
                    placeholder="0000000-00.0000.0.00.0000"
                    className="font-mono"
                  />
                  {tribunalDetectado && (
                    <p className="text-xs flex items-center gap-1.5">
                      {tribunalSuportado(tribunalDetectado) ? (
                        <><Wifi className="w-3 h-3 text-success" /> <span className="text-success">{TRIBUNAIS[tribunalDetectado]?.nome}</span></>
                      ) : (
                        <><WifiOff className="w-3 h-3 text-warning" /> <span className="text-warning">Tribunal {tribunalDetectado} sem suporte DataJud</span></>
                      )}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Instância</Label>
                  <Select value={form.instancia} onValueChange={(v) => setForm({ ...form, instancia: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1grau">1º grau</SelectItem>
                      <SelectItem value="2grau">2º grau</SelectItem>
                      <SelectItem value="superior">Superior</SelectItem>
                      <SelectItem value="turma_recursal">Turma recursal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tribunal (auto-detectado pelo CNJ — editável)</Label>
                <Select value={form.tribunal_sigla} onValueChange={(v) => setForm({ ...form, tribunal_sigla: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tribunal" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Object.entries(TRIBUNAIS).map(([sigla, info]) => (
                      <SelectItem key={sigla} value={sigla}>{sigla} — {info.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>NB / Protocolo</Label>
                  <Input value={form.nb_inss} onChange={(e) => setForm({ ...form, nb_inss: e.target.value })} placeholder="Número do benefício" />
                </div>
                <div className="space-y-2">
                  <Label>DER (Data de entrada do requerimento)</Label>
                  <Input type="date" value={form.data_der} onChange={(e) => setForm({ ...form, data_der: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fase administrativa</Label>
                <Input value={form.fase_administrativa} onChange={(e) => setForm({ ...form, fase_administrativa: e.target.value })} placeholder="Ex: Recurso CRPS, Análise INSS" />
              </div>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Área do direito</Label>
              <Select value={form.area_direito} onValueChange={(v) => setForm({ ...form, area_direito: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => <SelectItem key={a} value={a}>{AREAS_LABEL[a]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de ação</Label>
              <Input
                value={form.tipo_acao}
                onChange={(e) => setForm({ ...form, tipo_acao: e.target.value })}
                placeholder="Ex: Ação de cobrança, BPC/LOAS, Auxílio por Incapacidade"
                list="tipos-acao-sugeridos"
              />
              <datalist id="tipos-acao-sugeridos">
                {TIPOS_ACAO_SUGERIDOS.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>
        </Card>

        {form.tipo === "judicial" && (
          <Card className="p-6 space-y-4">
            <h3 className="font-display text-xl">Tramitação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Vara</Label>
                <Input value={form.vara} onChange={(e) => setForm({ ...form, vara: e.target.value })} placeholder="1ª Vara Federal" />
              </div>
              <div className="space-y-2">
                <Label>Comarca</Label>
                <Input value={form.comarca} onChange={(e) => setForm({ ...form, comarca: e.target.value })} placeholder="São Paulo" />
              </div>
              <div className="space-y-2">
                <Label>Juiz(a)</Label>
                <Input value={form.juiz} onChange={(e) => setForm({ ...form, juiz: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data da distribuição</Label>
                <Input type="date" value={form.data_distribuicao} onChange={(e) => setForm({ ...form, data_distribuicao: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fase atual</Label>
                <Input value={form.fase_atual} onChange={(e) => setForm({ ...form, fase_atual: e.target.value })} placeholder="Ex: Aguardando perícia" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm pt-2">
              <input
                type="checkbox"
                checked={form.datajud_ativo}
                onChange={(e) => setForm({ ...form, datajud_ativo: e.target.checked })}
                className="rounded border-border"
              />
              Consultar DataJud automaticamente neste processo
            </label>
          </Card>
        )}

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-gold" /> Partes do processo
            </h3>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => addParte("autor")}>
                <Plus className="w-3.5 h-3.5" /> Autor
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => addParte("reu")}>
                <Plus className="w-3.5 h-3.5" /> Parte contrária
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Cadastre a parte contrária (réu/requerido) e demais envolvidos. Importações via DataJud são preservadas.
          </p>
          {partes.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
              Nenhuma parte cadastrada manualmente. Clique em <strong>Parte contrária</strong> para adicionar.
            </div>
          ) : (
            <div className="space-y-3">
              {partes.map((p, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_180px_auto] gap-2">
                    <Select value={p.tipo} onValueChange={(v) => updateParte(idx, { tipo: v as TipoParte })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="autor">Autor / Requerente</SelectItem>
                        <SelectItem value="reu">Réu / Requerido (contrária)</SelectItem>
                        <SelectItem value="interessado">Interessado</SelectItem>
                        <SelectItem value="terceiro">Terceiro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Nome / Razão social"
                      value={p.nome}
                      onChange={(e) => updateParte(idx, { nome: e.target.value })}
                    />
                    <Input
                      placeholder="CPF / CNPJ"
                      value={p.cpf_cnpj}
                      onChange={(e) => updateParte(idx, { cpf_cnpj: e.target.value })}
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeParte(idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
                    <Input
                      placeholder="Advogado(a) da parte (opcional)"
                      value={p.advogado_nome}
                      onChange={(e) => updateParte(idx, { advogado_nome: e.target.value })}
                    />
                    <Input
                      placeholder="OAB"
                      value={p.advogado_oab}
                      onChange={(e) => updateParte(idx, { advogado_oab: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <h3 className="font-display text-xl">Status, valor e parceria</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusFiltrados.map((s) => <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor da causa (R$)</Label>
              <Input type="number" step="0.01" value={form.valor_causa} onChange={(e) => setForm({ ...form, valor_causa: e.target.value })} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Parceiro / Correspondente</Label>
              <Select value={form.parceiro_id || "_none"} onValueChange={(v) => setForm({ ...form, parceiro_id: v === "_none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {parceiros.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações internas</Label>
            <Textarea value={form.observacoes_internas} onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })} rows={4} placeholder="Anotações privadas sobre o processo (nunca visível para parceiros)" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild><Link to="/processos">Cancelar</Link></Button>
          <Button type="submit" variant="gold" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Salvar</>}
          </Button>
        </div>
      </form>
    </div>
  );
}
