import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCPF, formatCNPJ, formatPhone } from "@/lib/format";
import { isValidCPF, isValidCNPJ } from "@/lib/cpf";
import { ESPECIALIDADES_SUGESTOES, UFS } from "./types";

interface FormState {
  nome: string;
  nome_social: string;
  tipo: string;
  cpf: string;
  cnpj: string;
  oab_numero: string;
  oab_seccional: string;
  email: string;
  whatsapp: string;
  telefone: string;
  cidade: string;
  estado: string;
  especialidades: string[];
  pix_chave: string;
  pix_tipo: string;
  banco_nome: string;
  banco_agencia: string;
  banco_conta: string;
  banco_tipo: string;
  percentual_padrao: string;
  observacoes: string;
  observacoes_internas: string;
  status: string;
}

const blank: FormState = {
  nome: "",
  nome_social: "",
  tipo: "correspondente",
  cpf: "",
  cnpj: "",
  oab_numero: "",
  oab_seccional: "",
  email: "",
  whatsapp: "",
  telefone: "",
  cidade: "",
  estado: "",
  especialidades: [],
  pix_chave: "",
  pix_tipo: "",
  banco_nome: "",
  banco_agencia: "",
  banco_conta: "",
  banco_tipo: "",
  percentual_padrao: "",
  observacoes: "",
  observacoes_internas: "",
  status: "ativo",
};

export default function ParceiroForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isGestor, roles, user } = useAuth();
  const podeEditar = isGestor || roles.includes("advogado");
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blank);
  const [novaEspecialidade, setNovaEspecialidade] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data } = await supabase.from("parceiros").select("*").eq("id", id!).maybeSingle();
      if (!data) { toast.error("Parceiro não encontrado"); navigate("/parceiros"); return; }
      setForm({
        nome: data.nome ?? "",
        nome_social: (data as any).nome_social ?? "",
        tipo: ((data as any).tipo ?? "correspondente"),
        cpf: (data as any).cpf ?? "",
        cnpj: (data as any).cnpj ?? "",
        oab_numero: (data as any).oab_numero ?? "",
        oab_seccional: (data as any).oab_seccional ?? "",
        email: data.email ?? "",
        whatsapp: (data as any).whatsapp ?? "",
        telefone: data.telefone ?? "",
        cidade: (data as any).cidade ?? "",
        estado: (data as any).estado ?? "",
        especialidades: (data as any).especialidades ?? [],
        pix_chave: (data as any).pix_chave ?? "",
        pix_tipo: (data as any).pix_tipo ?? "",
        banco_nome: (data as any).banco_nome ?? "",
        banco_agencia: (data as any).banco_agencia ?? "",
        banco_conta: (data as any).banco_conta ?? "",
        banco_tipo: (data as any).banco_tipo ?? "",
        percentual_padrao: data.percentual_padrao != null ? String(data.percentual_padrao) : "",
        observacoes: data.observacoes ?? "",
        observacoes_internas: (data as any).observacoes_internas ?? "",
        status: ((data as any).status ?? "ativo"),
      });
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const toggleEspecialidade = (e: string) => {
    setForm((f) => ({
      ...f,
      especialidades: f.especialidades.includes(e)
        ? f.especialidades.filter((x) => x !== e)
        : [...f.especialidades, e],
    }));
  };

  const adicionarEspecialidade = () => {
    const v = novaEspecialidade.trim().toLowerCase();
    if (!v) return;
    if (!form.especialidades.includes(v)) {
      setForm((f) => ({ ...f, especialidades: [...f.especialidades, v] }));
    }
    setNovaEspecialidade("");
  };

  const handleSave = async () => {
    if (!podeEditar) { toast.error("Sem permissão para editar parceiros"); return; }
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }

    if (form.tipo === "escritorio") {
      if (!form.cnpj) { toast.error("Escritório precisa de CNPJ"); return; }
      if (!isValidCNPJ(form.cnpj)) { toast.error("CNPJ inválido"); return; }
    } else if (form.cpf) {
      if (!isValidCPF(form.cpf)) { toast.error("CPF inválido"); return; }
    }

    setSaving(true);
    const payload: any = {
      nome: form.nome.trim(),
      nome_social: form.nome_social || null,
      tipo: form.tipo,
      cpf: form.cpf ? form.cpf.replace(/\D/g, "") : null,
      cnpj: form.cnpj ? form.cnpj.replace(/\D/g, "") : null,
      oab_numero: form.oab_numero || null,
      oab_seccional: form.oab_seccional || null,
      oab: form.oab_numero && form.oab_seccional
        ? `OAB/${form.oab_seccional} ${form.oab_numero}`
        : (form.oab_numero || null),
      email: form.email || null,
      whatsapp: form.whatsapp ? form.whatsapp.replace(/\D/g, "") : null,
      telefone: form.telefone ? form.telefone.replace(/\D/g, "") : null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      especialidades: form.especialidades,
      pix_chave: form.pix_chave || null,
      pix_tipo: form.pix_tipo || null,
      banco_nome: form.banco_nome || null,
      banco_agencia: form.banco_agencia || null,
      banco_conta: form.banco_conta || null,
      banco_tipo: form.banco_tipo || null,
      percentual_padrao: form.percentual_padrao ? Number(form.percentual_padrao) : null,
      observacoes: form.observacoes || null,
      observacoes_internas: form.observacoes_internas || null,
      status: form.status,
      ativo: form.status === "ativo",
    };

    const res = isEdit
      ? await supabase.from("parceiros").update(payload).eq("id", id!)
      : await supabase.from("parceiros").insert({ ...payload, criado_por: user?.id });

    setSaving(false);
    if (res.error) { toast.error("Erro: " + res.error.message); return; }
    toast.success(isEdit ? "Parceiro atualizado" : "Parceiro cadastrado");
    navigate(isEdit ? `/parceiros/${id}` : "/parceiros");
  };

  if (loading) {
    return <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={isEdit ? "Editar parceiro" : "Novo parceiro"} description="Cadastro completo · dados bancários para repasse">
        <Button asChild variant="ghost" size="sm">
          <Link to={isEdit ? `/parceiros/${id}` : "/parceiros"}><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        <Button variant="gold" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </PageHeader>

      {/* Identificação */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Identificação</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Tipo de parceiro *</Label>
            <Select value={form.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="correspondente">Correspondente</SelectItem>
                <SelectItem value="indicador">Indicador</SelectItem>
                <SelectItem value="escritorio">Escritório (CNPJ)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="suspenso">Suspenso</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Nome / Razão social *</Label>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Nome social (opcional)</Label>
            <Input value={form.nome_social} onChange={(e) => set("nome_social", e.target.value)} />
          </div>
          {form.tipo === "escritorio" ? (
            <div>
              <Label>CNPJ *</Label>
              <Input value={formatCNPJ(form.cnpj)} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
            </div>
          ) : (
            <div>
              <Label>CPF</Label>
              <Input value={formatCPF(form.cpf)} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 sm:col-span-1">
            <div className="col-span-2">
              <Label>OAB</Label>
              <Input value={form.oab_numero} onChange={(e) => set("oab_numero", e.target.value)} placeholder="41.856" />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={form.oab_seccional} onValueChange={(v) => set("oab_seccional", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.oab_numero && form.oab_seccional && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Será exibido como: <span className="font-mono">OAB/{form.oab_seccional} {form.oab_numero}</span>
            </p>
          )}
        </div>
      </Card>

      {/* Contato */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Contato</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="parceiro@exemplo.com" />
            <p className="text-[11px] text-muted-foreground mt-1">Será o login do portal do parceiro no futuro.</p>
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={formatPhone(form.whatsapp)} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={formatPhone(form.telefone)} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 0000-0000" />
          </div>
          <div className="sm:col-span-1">
            <Label>Cidade</Label>
            <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={form.estado} onValueChange={(v) => set("estado", v)}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>
                {UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Especialidades */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Especialidades</h3>
        <div className="flex flex-wrap gap-2">
          {ESPECIALIDADES_SUGESTOES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => toggleEspecialidade(e)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors capitalize ${
                form.especialidades.includes(e)
                  ? "bg-gold text-sidebar border-gold"
                  : "bg-background text-muted-foreground border-border hover:border-gold/50"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        {form.especialidades.filter((e) => !ESPECIALIDADES_SUGESTOES.includes(e)).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {form.especialidades.filter((e) => !ESPECIALIDADES_SUGESTOES.includes(e)).map((e) => (
              <Badge key={e} variant="outline" className="bg-gold/10 text-gold-dark border-gold/30 capitalize gap-1">
                {e}
                <button onClick={() => toggleEspecialidade(e)}><X className="w-3 h-3" /></button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Adicionar especialidade personalizada..."
            value={novaEspecialidade}
            onChange={(e) => setNovaEspecialidade(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarEspecialidade(); } }}
          />
          <Button type="button" variant="outline" onClick={adicionarEspecialidade}>Adicionar</Button>
        </div>
      </Card>

      {/* Dados bancários para repasse */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Dados para repasse</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Tipo de chave PIX</Label>
            <Select value={form.pix_tipo} onValueChange={(v) => set("pix_tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Chave aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chave PIX</Label>
            <Input value={form.pix_chave} onChange={(e) => set("pix_chave", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Banco</Label>
            <Input value={form.banco_nome} onChange={(e) => set("banco_nome", e.target.value)} placeholder="Ex: Itaú, Bradesco..." />
          </div>
          <div>
            <Label>Agência</Label>
            <Input value={form.banco_agencia} onChange={(e) => set("banco_agencia", e.target.value)} />
          </div>
          <div>
            <Label>Conta</Label>
            <Input value={form.banco_conta} onChange={(e) => set("banco_conta", e.target.value)} />
          </div>
          <div>
            <Label>Tipo de conta</Label>
            <Select value={form.banco_tipo} onValueChange={(v) => set("banco_tipo", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>% padrão de repasse</Label>
            <Input type="number" min="0" max="100" step="0.01"
              value={form.percentual_padrao}
              onChange={(e) => set("percentual_padrao", e.target.value)}
              placeholder="Ex: 30" />
            <p className="text-[11px] text-muted-foreground mt-1">Sugestão usada ao vincular a um processo.</p>
          </div>
        </div>
      </Card>

      {/* Observações */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Observações</h3>
        <div>
          <Label>Observações públicas</Label>
          <Textarea rows={3} value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </div>
        <div>
          <Label className="flex items-center gap-2">
            Observações internas
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
              Não visível para o parceiro
            </Badge>
          </Label>
          <Textarea
            rows={4}
            value={form.observacoes_internas}
            onChange={(e) => set("observacoes_internas", e.target.value)}
            placeholder="Avaliação, acordos informais, alertas..."
          />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost">
          <Link to={isEdit ? `/parceiros/${id}` : "/parceiros"}>Cancelar</Link>
        </Button>
        <Button variant="gold" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </div>
    </div>
  );
}
