import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { comRetry } from "@/lib/supabase-retry";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Cliente { id: string; nome: string; }
interface Processo { id: string; numero_cnj: string | null; tipo_acao: string | null; cliente_id: string; }
interface Parceiro { id: string; nome: string; percentual_padrao: number | null; }
interface Advogado { user_id: string; nome: string; }

export default function ContratoForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Avisa antes de fechar/recarregar a aba se houver alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [advogados, setAdvogados] = useState<Advogado[]>([]);

  const [form, setForm] = useState({
    cliente_id: params.get("cliente") ?? "",
    processo_id: "",
    tipo: "fixo",
    status: "ativo",
    data_assinatura: new Date().toISOString().slice(0, 10),
    valor_fixo: "",
    total_parcelas: "1",
    dia_vencimento: "10",
    percentual_exito: "",
    base_calculo_exito: "valor_recebido",
    valor_exito_estimado: "",
    alta_probabilidade_exito: false,
    data_inicio_mensalidade: "",
    data_fim_mensalidade: "",
    tem_rateio: false,
    parceiro_id: "",
    percentual_parceiro: "",
    valor_fixo_parceiro: "",
    base_rateio: "total_recebido",
    advogado_responsavel_id: "",
    observacoes: "",
  });

  useEffect(() => {
    (async () => {
      const [cli, par, adv] = await Promise.all([
        supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("parceiros").select("id, nome, percentual_padrao").eq("ativo", true).order("nome"),
        supabase
          .from("equipe_membros")
          .select("nome, user_id")
          .eq("cargo", "advogado")
          .eq("status", "ativo")
          .not("user_id", "is", null)
          .order("nome"),
      ]);
      setClientes((cli.data as any[]) ?? []);
      setParceiros((par.data as any[]) ?? []);
      setAdvogados(((adv.data as any[]) ?? []).map((a) => ({ user_id: a.user_id, nome: a.nome })));
    })();
  }, []);

  useEffect(() => {
    if (!form.cliente_id) { setProcessos([]); return; }
    (async () => {
      const { data } = await supabase
        .from("processos")
        .select("id, numero_cnj, tipo_acao, cliente_id")
        .eq("cliente_id", form.cliente_id);
      setProcessos((data as any[]) ?? []);
    })();
  }, [form.cliente_id]);

  useEffect(() => {
    if (!editing || !id) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("honorarios_contratos")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        setForm({
          cliente_id: data.cliente_id,
          processo_id: data.processo_id ?? "",
          tipo: data.tipo,
          status: data.status,
          data_assinatura: data.data_assinatura ?? "",
          valor_fixo: data.valor_fixo?.toString() ?? "",
          total_parcelas: data.total_parcelas?.toString() ?? "1",
          dia_vencimento: data.dia_vencimento?.toString() ?? "10",
          percentual_exito: data.percentual_exito?.toString() ?? "",
          base_calculo_exito: data.base_calculo_exito ?? "valor_recebido",
          valor_exito_estimado: data.valor_exito_estimado?.toString() ?? "",
          alta_probabilidade_exito: data.alta_probabilidade_exito ?? false,
          data_inicio_mensalidade: data.data_inicio_mensalidade ?? "",
          data_fim_mensalidade: data.data_fim_mensalidade ?? "",
          tem_rateio: data.tem_rateio ?? false,
          parceiro_id: data.parceiro_id ?? "",
          percentual_parceiro: data.percentual_parceiro?.toString() ?? "",
          valor_fixo_parceiro: data.valor_fixo_parceiro?.toString() ?? "",
          base_rateio: data.base_rateio ?? "total_recebido",
          advogado_responsavel_id: data.advogado_responsavel_id ?? "",
          observacoes: data.observacoes ?? "",
        });
      }
      setLoading(false);
      setDirty(false);
    })();
  }, [editing, id]);

  const set = (k: string, v: any) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
  const num = (v: string) => v ? Number(v) : null;
  const int = (v: string) => v ? parseInt(v) : null;
  const date = (v: string) => v || null;

  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "salvando" | "salvo" | "erro">("idle");

  const montarPayload = () => {
    const payload: any = {
      cliente_id: form.cliente_id,
      processo_id: form.processo_id || null,
      tipo: form.tipo,
      status: form.status,
      data_assinatura: date(form.data_assinatura),
      observacoes: form.observacoes || null,
      tem_rateio: form.tem_rateio,
      advogado_responsavel_id: form.advogado_responsavel_id || null,
    };
    if (form.tipo === "fixo" || form.tipo === "misto") {
      payload.valor_fixo = num(form.valor_fixo);
      payload.total_parcelas = int(form.total_parcelas) ?? 1;
      payload.dia_vencimento = int(form.dia_vencimento);
    }
    if (form.tipo === "exito" || form.tipo === "misto") {
      payload.percentual_exito = num(form.percentual_exito);
      payload.base_calculo_exito = form.base_calculo_exito;
      payload.valor_exito_estimado = num(form.valor_exito_estimado);
      payload.alta_probabilidade_exito = form.alta_probabilidade_exito;
    }
    if (form.tipo === "mensalidade") {
      payload.valor_fixo = num(form.valor_fixo);
      payload.dia_vencimento = int(form.dia_vencimento);
      payload.data_inicio_mensalidade = date(form.data_inicio_mensalidade);
      payload.data_fim_mensalidade = date(form.data_fim_mensalidade);
    }
    if (form.tem_rateio) {
      payload.parceiro_id = form.parceiro_id || null;
      payload.percentual_parceiro = num(form.percentual_parceiro);
      payload.valor_fixo_parceiro = num(form.valor_fixo_parceiro);
      payload.base_rateio = form.base_rateio;
    } else {
      payload.parceiro_id = null;
    }
    return payload;
  };

  // Mantém referências para o flush ao desmontar (mudança de rota).
  const dirtyRef = useRef(false);
  const formRef = useRef(form);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { formRef.current = form; }, [form]);

  const salvarAgora = async (silencioso = false) => {
    if (!editing || !id) return;
    if (!formRef.current.cliente_id) return;
    if (!silencioso) setAutosaveStatus("salvando");
    const { error } = await supabase
      .from("honorarios_contratos")
      .update(montarPayload())
      .eq("id", id);
    if (error) {
      if (!silencioso) {
        setAutosaveStatus("erro");
        toast.error("Falha ao salvar automaticamente: " + error.message);
      }
      return;
    }
    setDirty(false);
    dirtyRef.current = false;
    if (!silencioso) setAutosaveStatus("salvo");
  };

  // Autosave (apenas em edição): persiste a cada 1.5s após parar de digitar.
  useEffect(() => {
    if (!editing || !id || !dirty || loading || saving) return;
    if (!form.cliente_id) return;
    const t = setTimeout(() => { void salvarAgora(); }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty, editing, id, loading, saving]);

  // Flush ao desmontar (ex: usuário troca de rota antes do debounce).
  useEffect(() => {
    return () => {
      if (dirtyRef.current && editing && id && formRef.current.cliente_id) {
        // fire-and-forget: garante que o último estado vá para o banco
        void supabase
          .from("honorarios_contratos")
          .update(montarPayload())
          .eq("id", id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id) { toast.error("Selecione o cliente"); return; }
    if (!form.tipo) { toast.error("Selecione o tipo"); return; }

    setSaving(true);
    const payload = montarPayload();

    let contratoId = id;
    if (editing) {
      const { error } = await comRetry(async () =>
        await supabase.from("honorarios_contratos").update(payload).eq("id", id!).select("id").single(),
      );
      if (error) { toast.error("Erro ao atualizar: " + error.message); setSaving(false); return; }
    } else {
      payload.criado_por = user?.id;
      const { data, error } = await comRetry(async () =>
        await supabase.from("honorarios_contratos").insert(payload).select("id").single(),
      );
      if (error) { toast.error("Erro ao criar: " + error.message); setSaving(false); return; }
      contratoId = data.id;
      // Gerar parcelas para fixo, misto, mensalidade
      if (form.tipo !== "exito") {
        const { error: errGen } = await supabase.rpc("gerar_parcelas_contrato", { _contrato_id: contratoId });
        if (errGen) toast.warning("Contrato criado, mas falha ao gerar parcelas: " + errGen.message);
      }
    }

    setDirty(false);
    setSaving(false);
    toast.success(editing ? "Contrato atualizado" : "Contrato criado");
    navigate(`/financeiro/contratos/${contratoId}`);
  };

  if (loading) {
    return <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader
        title={editing ? "Editar contrato" : "Novo contrato"}
        description="Defina honorários, parcelas e rateio com parceiros"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            if (dirty && !window.confirm("Você tem alterações não salvas. Deseja sair mesmo assim?")) {
              e.preventDefault();
              return;
            }
            navigate("/financeiro/contratos");
          }}
          type="button"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        {editing && (
          <span className="text-xs text-muted-foreground self-center">
            {autosaveStatus === "salvando" && "Salvando…"}
            {autosaveStatus === "salvo" && !dirty && "✓ Salvo automaticamente"}
            {autosaveStatus === "erro" && "⚠ Falha ao salvar"}
            {dirty && autosaveStatus !== "salvando" && "Alterações pendentes…"}
          </span>
        )}
        <Button type="submit" variant="gold" disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </PageHeader>

      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Identificação</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Cliente *</Label>
            <Select value={form.cliente_id} onValueChange={(v) => set("cliente_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Processo (opcional)</Label>
            <Select value={form.processo_id || "none"} onValueChange={(v) => set("processo_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {processos.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.numero_cnj ?? p.tipo_acao ?? "processo"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Fixo</SelectItem>
                <SelectItem value="exito">Êxito</SelectItem>
                <SelectItem value="misto">Misto (fixo + êxito)</SelectItem>
                <SelectItem value="mensalidade">Mensalidade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data de assinatura</Label>
            <Input type="date" value={form.data_assinatura} onChange={(e) => set("data_assinatura", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Advogado responsável</Label>
            <Select
              value={form.advogado_responsavel_id || "none"}
              onValueChange={(v) => set("advogado_responsavel_id", v === "none" ? "" : v)}
            >
              <SelectTrigger><SelectValue placeholder="Nenhum (visível só para gestores)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum (visível só para gestores)</SelectItem>
                {advogados.map((a) => (
                  <SelectItem key={a.user_id} value={a.user_id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Define qual advogado vê este contrato (e suas parcelas, pagamentos e repasses) no módulo Financeiro. Gestores e controladoria veem todos.
            </p>
          </div>
        </div>
      </Card>


      {(form.tipo === "fixo" || form.tipo === "misto") && (
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-lg">Honorário fixo</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>Valor total (R$) *</Label>
              <InputMoeda value={form.valor_fixo} onChange={(v) => set("valor_fixo", v)} />
            </div>
            <div>
              <Label>Número de parcelas *</Label>
              <Input type="number" min="1" value={form.total_parcelas} onChange={(e) => set("total_parcelas", e.target.value)} />
            </div>
            <div>
              <Label>Dia de vencimento</Label>
              <Input type="number" min="1" max="28" value={form.dia_vencimento} onChange={(e) => set("dia_vencimento", e.target.value)} />
            </div>
          </div>
          {!editing && (
            <p className="text-xs text-muted-foreground">
              As parcelas serão geradas automaticamente ao salvar.
            </p>
          )}
        </Card>
      )}

      {(form.tipo === "exito" || form.tipo === "misto") && (
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-lg">Honorário de êxito</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>Percentual (%) *</Label>
              <Input type="number" step="0.01" value={form.percentual_exito} onChange={(e) => set("percentual_exito", e.target.value)} />
            </div>
            <div>
              <Label>Base de cálculo</Label>
              <Select value={form.base_calculo_exito} onValueChange={(v) => set("base_calculo_exito", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor_recebido">Valor recebido</SelectItem>
                  <SelectItem value="valor_causa">Valor da causa</SelectItem>
                  <SelectItem value="valor_condenacao">Valor da condenação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimativa (R$)</Label>
              <InputMoeda value={form.valor_exito_estimado} onChange={(v) => set("valor_exito_estimado", v)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.alta_probabilidade_exito} onCheckedChange={(v) => set("alta_probabilidade_exito", v)} />
            <Label className="cursor-pointer" onClick={() => set("alta_probabilidade_exito", !form.alta_probabilidade_exito)}>
              Alta probabilidade de êxito (incluir nas projeções)
            </Label>
          </div>
        </Card>
      )}

      {form.tipo === "mensalidade" && (
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-lg">Mensalidade</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>Valor mensal (R$) *</Label>
              <InputMoeda value={form.valor_fixo} onChange={(v) => set("valor_fixo", v)} />
            </div>
            <div>
              <Label>Dia de vencimento</Label>
              <Input type="number" min="1" max="28" value={form.dia_vencimento} onChange={(e) => set("dia_vencimento", e.target.value)} />
            </div>
            <div />
            <div>
              <Label>Início *</Label>
              <Input type="date" value={form.data_inicio_mensalidade} onChange={(e) => set("data_inicio_mensalidade", e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="date" value={form.data_fim_mensalidade} onChange={(e) => set("data_fim_mensalidade", e.target.value)} />
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Rateio com parceiro</h3>
          <Switch checked={form.tem_rateio} onCheckedChange={(v) => set("tem_rateio", v)} />
        </div>
        {form.tem_rateio && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Parceiro</Label>
              <Select value={form.parceiro_id} onValueChange={(v) => {
                set("parceiro_id", v);
                const p = parceiros.find(x => x.id === v);
                if (p?.percentual_padrao && !form.percentual_parceiro) {
                  set("percentual_parceiro", String(p.percentual_padrao));
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {parceiros.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Base do rateio</Label>
              <Select value={form.base_rateio} onValueChange={(v) => set("base_rateio", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total_recebido">Sobre valor recebido (%)</SelectItem>
                  <SelectItem value="apenas_exito">Apenas sobre êxito (%)</SelectItem>
                  <SelectItem value="fixo_por_processo">Valor fixo por processo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.base_rateio !== "fixo_por_processo" ? (
              <div>
                <Label>Percentual do parceiro (%)</Label>
                <Input type="number" step="0.01" value={form.percentual_parceiro} onChange={(e) => set("percentual_parceiro", e.target.value)} />
              </div>
            ) : (
              <div>
                <Label>Valor fixo do parceiro (R$)</Label>
                <InputMoeda value={form.valor_fixo_parceiro} onChange={(v) => set("valor_fixo_parceiro", v)} />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Observações</h3>
        <Textarea rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Cláusulas especiais, condições de cancelamento, etc." />
      </Card>
    </form>
  );
}
