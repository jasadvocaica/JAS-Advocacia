import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LABEL_CARGO, LABEL_VINCULO, type CargoEquipe, type TipoVinculoEquipe, type StatusMembro } from "./types";
const formatCPF = (v: string) => v.replace(/\D/g, "").slice(0, 11)
  .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");

export default function EquipeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isGestor } = useAuth();
  const isEdit = !!id;

  const [vinculoMode, setVinculoMode] = useState<"existente" | "novo">("existente");
  const [usuariosLivres, setUsuariosLivres] = useState<{ id: string; nome: string; email: string }[]>([]);
  const [novoUserEmail, setNovoUserEmail] = useState("");
  const [novoUserNome, setNovoUserNome] = useState("");

  const [form, setForm] = useState({
    user_id: "",
    nome: "",
    cpf: "",
    data_nascimento: "",
    telefone: "",
    email_pessoal: "",
    cargo: "advogado" as CargoEquipe,
    oab_numero: "",
    oab_seccional: "",
    tipo_vinculo: "clt" as TipoVinculoEquipe,
    data_admissao: new Date().toISOString().slice(0, 10),
    pix_chave: "",
    pix_tipo: "",
    banco_nome: "",
    banco_agencia: "",
    banco_conta: "",
    status: "ativo" as StatusMembro,
    observacoes_internas: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isGestor) {
      toast.error("Apenas gestores podem cadastrar membros");
      navigate("/equipe");
    }
  }, [isGestor, navigate]);

  useEffect(() => {
    (async () => {
      // Usuários sem membro vinculado
      const { data: profiles } = await supabase.from("profiles").select("id, nome, email");
      const { data: vinculados } = await supabase.from("equipe_membros").select("user_id");
      const setVinc = new Set((vinculados ?? []).map((v: any) => v.user_id));
      setUsuariosLivres((profiles ?? []).filter((p: any) => !setVinc.has(p.id) || p.id === id));

      if (isEdit) {
        const { data } = await supabase.from("equipe_membros").select("*").eq("id", id).maybeSingle();
        if (data) {
          setForm({
            user_id: data.user_id,
            nome: data.nome,
            cpf: data.cpf ?? "",
            data_nascimento: data.data_nascimento ?? "",
            telefone: data.telefone ?? "",
            email_pessoal: data.email_pessoal ?? "",
            cargo: data.cargo,
            oab_numero: data.oab_numero ?? "",
            oab_seccional: data.oab_seccional ?? "",
            tipo_vinculo: data.tipo_vinculo,
            data_admissao: data.data_admissao,
            pix_chave: data.pix_chave ?? "",
            pix_tipo: data.pix_tipo ?? "",
            banco_nome: data.banco_nome ?? "",
            banco_agencia: data.banco_agencia ?? "",
            banco_conta: data.banco_conta ?? "",
            status: data.status,
            observacoes_internas: data.observacoes_internas ?? "",
          });
        }
      }
    })();
  }, [id, isEdit]);

  const handleSelectUser = (uid: string) => {
    setForm((f) => ({ ...f, user_id: uid }));
    const u = usuariosLivres.find((x) => x.id === uid);
    if (u && !form.nome) setForm((f) => ({ ...f, user_id: uid, nome: u.nome }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let userId = form.user_id;

    // Criar usuário novo (convite)
    if (!isEdit && vinculoMode === "novo") {
      if (!novoUserEmail || !novoUserNome) {
        toast.error("Informe nome e e-mail do novo usuário");
        setLoading(false); return;
      }
      // Cria via signUp com senha temporária aleatória — usuário recebe link para resetar
      const senhaTmp = crypto.randomUUID();
      const { data: signed, error: signErr } = await supabase.auth.signUp({
        email: novoUserEmail,
        password: senhaTmp,
        options: { data: { nome: novoUserNome }, emailRedirectTo: `${window.location.origin}/reset-password` },
      });
      if (signErr || !signed.user) {
        toast.error("Falha ao criar usuário", { description: signErr?.message });
        setLoading(false); return;
      }
      userId = signed.user.id;
      if (!form.nome) setForm((f) => ({ ...f, nome: novoUserNome }));
      toast.info("Usuário criado. Será necessário resetar a senha pelo e-mail.");
    }

    if (!userId) {
      toast.error("Selecione ou crie um usuário vinculado");
      setLoading(false); return;
    }

    const payload: any = {
      ...form,
      user_id: userId,
      cpf: form.cpf || null,
      data_nascimento: form.data_nascimento || null,
      criado_por: user?.id,
    };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });

    const { error } = isEdit
      ? await supabase.from("equipe_membros").update(payload).eq("id", id)
      : await supabase.from("equipe_membros").insert(payload);

    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success(isEdit ? "Membro atualizado" : "Membro cadastrado");
      navigate("/equipe");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={isEdit ? "Editar membro" : "Novo membro"} description="Cadastro da equipe">
        <Button variant="outline" onClick={() => navigate("/equipe")}><ArrowLeft className="w-4 h-4" /> Voltar</Button>
      </PageHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        {!isEdit && (
          <Card><CardContent className="p-5 space-y-4">
            <h3 className="font-semibold">Vínculo com usuário do sistema</h3>
            <RadioGroup value={vinculoMode} onValueChange={(v) => setVinculoMode(v as any)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="existente" id="rm-existente" />
                <Label htmlFor="rm-existente">Vincular a usuário existente</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="novo" id="rm-novo" />
                <Label htmlFor="rm-novo">Criar novo usuário (convite por e-mail)</Label>
              </div>
            </RadioGroup>
            {vinculoMode === "existente" ? (
              <div>
                <Label>Usuário</Label>
                <Select value={form.user_id} onValueChange={handleSelectUser}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {usuariosLivres.length === 0
                      ? <div className="p-2 text-sm text-muted-foreground">Nenhum usuário livre</div>
                      : usuariosLivres.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.nome} · {u.email}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                <div><Label>Nome</Label><Input value={novoUserNome} onChange={(e) => setNovoUserNome(e.target.value)} required /></div>
                <div><Label>E-mail</Label><Input type="email" value={novoUserEmail} onChange={(e) => setNovoUserEmail(e.target.value)} required /></div>
              </div>
            )}
          </CardContent></Card>
        )}

        <Card><CardContent className="p-5 space-y-4">
          <h3 className="font-semibold">Dados pessoais</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Nome completo *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required /></div>
            <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} maxLength={14} /></div>
            <div><Label>Data de nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>E-mail pessoal</Label><Input type="email" value={form.email_pessoal} onChange={(e) => setForm({ ...form, email_pessoal: e.target.value })} /></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5 space-y-4">
          <h3 className="font-semibold">Dados profissionais</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Cargo *</Label>
              <Select value={form.cargo} onValueChange={(v) => setForm({ ...form, cargo: v as CargoEquipe })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LABEL_CARGO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de vínculo *</Label>
              <Select value={form.tipo_vinculo} onValueChange={(v) => setForm({ ...form, tipo_vinculo: v as TipoVinculoEquipe })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LABEL_VINCULO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>OAB nº</Label><Input value={form.oab_numero} onChange={(e) => setForm({ ...form, oab_numero: e.target.value })} /></div>
            <div><Label>OAB seccional</Label><Input value={form.oab_seccional} onChange={(e) => setForm({ ...form, oab_seccional: e.target.value.toUpperCase() })} maxLength={2} /></div>
            <div><Label>Data de admissão *</Label><Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} required /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as StatusMembro })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="afastado">Afastado</SelectItem>
                  <SelectItem value="inativo">Inativo (desligado)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5 space-y-4">
          <h3 className="font-semibold">Dados bancários</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Tipo de PIX</Label>
              <Select value={form.pix_tipo} onValueChange={(v) => setForm({ ...form, pix_tipo: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="aleatoria">Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>Chave PIX</Label><Input value={form.pix_chave} onChange={(e) => setForm({ ...form, pix_chave: e.target.value })} /></div>
            <div><Label>Banco</Label><Input value={form.banco_nome} onChange={(e) => setForm({ ...form, banco_nome: e.target.value })} /></div>
            <div><Label>Agência</Label><Input value={form.banco_agencia} onChange={(e) => setForm({ ...form, banco_agencia: e.target.value })} /></div>
            <div><Label>Conta</Label><Input value={form.banco_conta} onChange={(e) => setForm({ ...form, banco_conta: e.target.value })} /></div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5 space-y-4">
          <h3 className="font-semibold">Observações internas</h3>
          <p className="text-xs text-muted-foreground">Visíveis apenas para o gestor. O membro nunca vê este campo.</p>
          <Textarea rows={4} value={form.observacoes_internas} onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })} />
        </CardContent></Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/equipe")}>Cancelar</Button>
          <Button type="submit" variant="gold" disabled={loading}>
            <Save className="w-4 h-4" /> {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
