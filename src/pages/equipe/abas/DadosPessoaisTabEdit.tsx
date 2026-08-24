import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { buscarCep } from "@/lib/cep";
import { LABEL_CARGO, LABEL_VINCULO, type MembroEquipe } from "../types";

const formatCPF = (v: string) => v.replace(/\D/g, "").slice(0, 11)
  .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const formatCEP = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

interface Props {
  membro: MembroEquipe;
  onSaved?: () => void;
}

export function DadosPessoaisTabEdit({ membro, onSaved }: Props) {
  const [form, setForm] = useState({
    nome: membro.nome,
    cpf: membro.cpf ?? "",
    rg: membro.rg ?? "",
    data_nascimento: membro.data_nascimento ?? "",
    telefone: membro.telefone ?? "",
    email_pessoal: membro.email_pessoal ?? "",
    cargo: membro.cargo,
    oab_numero: membro.oab_numero ?? "",
    oab_seccional: membro.oab_seccional ?? "",
    tipo_vinculo: membro.tipo_vinculo,
    data_admissao: membro.data_admissao,
    data_desligamento: membro.data_desligamento ?? "",
    estado_civil: membro.estado_civil ?? "",
    escolaridade: membro.escolaridade ?? "",
    dependentes: membro.dependentes ?? 0,
    endereco_cep: membro.endereco_cep ?? "",
    endereco_logradouro: membro.endereco_logradouro ?? "",
    endereco_numero: membro.endereco_numero ?? "",
    endereco_complemento: membro.endereco_complemento ?? "",
    endereco_bairro: membro.endereco_bairro ?? "",
    endereco_cidade: membro.endereco_cidade ?? "",
    endereco_estado: membro.endereco_estado ?? "",
    contato_emergencia_nome: membro.contato_emergencia_nome ?? "",
    contato_emergencia_telefone: membro.contato_emergencia_telefone ?? "",
    contato_emergencia_parentesco: membro.contato_emergencia_parentesco ?? "",
    pix_chave: membro.pix_chave ?? "",
    pix_tipo: membro.pix_tipo ?? "",
    banco_nome: membro.banco_nome ?? "",
    banco_agencia: membro.banco_agencia ?? "",
    banco_conta: membro.banco_conta ?? "",
    observacoes_internas: membro.observacoes_internas ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const cep = form.endereco_cep.replace(/\D/g, "");
    if (cep.length === 8) {
      buscarCep(cep).then((r) => {
        if (r) setForm((f) => ({
          ...f,
          endereco_logradouro: f.endereco_logradouro || r.logradouro || "",
          endereco_bairro: f.endereco_bairro || r.bairro || "",
          endereco_cidade: f.endereco_cidade || r.cidade || "",
          endereco_estado: f.endereco_estado || r.estado || "",
        }));
      });
    }
  }, [form.endereco_cep]);

  const salvar = async () => {
    setSaving(true);
    const payload: any = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
    payload.dependentes = Number(form.dependentes) || 0;
    const { error } = await supabase.from("equipe_membros").update(payload).eq("id", membro.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else { toast.success("Dados atualizados"); onSaved?.(); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="font-semibold">Identificação</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div><Label>Nome completo *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
          <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} maxLength={14} /></div>
          <div><Label>RG</Label><Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
          <div><Label>Data de nascimento</Label><Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} /></div>
          <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
          <div><Label>E-mail pessoal</Label><Input type="email" value={form.email_pessoal} onChange={(e) => setForm({ ...form, email_pessoal: e.target.value })} /></div>
          <div>
            <Label>Estado civil</Label>
            <Select value={form.estado_civil} onValueChange={(v) => setForm({ ...form, estado_civil: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                <SelectItem value="casado">Casado(a)</SelectItem>
                <SelectItem value="uniao_estavel">União estável</SelectItem>
                <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                <SelectItem value="viuvo">Viúvo(a)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Escolaridade</Label>
            <Select value={form.escolaridade} onValueChange={(v) => setForm({ ...form, escolaridade: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fundamental">Fundamental</SelectItem>
                <SelectItem value="medio">Médio</SelectItem>
                <SelectItem value="superior_incompleto">Superior incompleto</SelectItem>
                <SelectItem value="superior">Superior completo</SelectItem>
                <SelectItem value="pos">Pós-graduação</SelectItem>
                <SelectItem value="mestrado">Mestrado</SelectItem>
                <SelectItem value="doutorado">Doutorado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Dependentes</Label><Input type="number" min={0} value={form.dependentes} onChange={(e) => setForm({ ...form, dependentes: Number(e.target.value) })} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="font-semibold">Vínculo profissional</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Cargo *</Label>
            <Select value={form.cargo} onValueChange={(v) => setForm({ ...form, cargo: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(LABEL_CARGO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de vínculo *</Label>
            <Select value={form.tipo_vinculo} onValueChange={(v) => setForm({ ...form, tipo_vinculo: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(LABEL_VINCULO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>OAB nº</Label><Input value={form.oab_numero} onChange={(e) => setForm({ ...form, oab_numero: e.target.value })} /></div>
          <div><Label>OAB seccional</Label><Input value={form.oab_seccional} onChange={(e) => setForm({ ...form, oab_seccional: e.target.value.toUpperCase() })} maxLength={2} /></div>
          <div><Label>Data de admissão</Label><Input type="date" value={form.data_admissao} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} /></div>
          <div><Label>Data de desligamento</Label><Input type="date" value={form.data_desligamento} onChange={(e) => setForm({ ...form, data_desligamento: e.target.value })} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="font-semibold">Endereço</h3>
        <div className="grid md:grid-cols-6 gap-3">
          <div className="md:col-span-2"><Label>CEP</Label><Input value={form.endereco_cep} onChange={(e) => setForm({ ...form, endereco_cep: formatCEP(e.target.value) })} maxLength={9} /></div>
          <div className="md:col-span-3"><Label>Logradouro</Label><Input value={form.endereco_logradouro} onChange={(e) => setForm({ ...form, endereco_logradouro: e.target.value })} /></div>
          <div><Label>Número</Label><Input value={form.endereco_numero} onChange={(e) => setForm({ ...form, endereco_numero: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Complemento</Label><Input value={form.endereco_complemento} onChange={(e) => setForm({ ...form, endereco_complemento: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Bairro</Label><Input value={form.endereco_bairro} onChange={(e) => setForm({ ...form, endereco_bairro: e.target.value })} /></div>
          <div><Label>UF</Label>
            <Select value={form.endereco_estado} onValueChange={(v) => setForm({ ...form, endereco_estado: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3"><Label>Cidade</Label><Input value={form.endereco_cidade} onChange={(e) => setForm({ ...form, endereco_cidade: e.target.value })} /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="font-semibold">Contato de emergência</h3>
        <div className="grid md:grid-cols-3 gap-3">
          <div><Label>Nome</Label><Input value={form.contato_emergencia_nome} onChange={(e) => setForm({ ...form, contato_emergencia_nome: e.target.value })} /></div>
          <div><Label>Telefone</Label><Input value={form.contato_emergencia_telefone} onChange={(e) => setForm({ ...form, contato_emergencia_telefone: e.target.value })} /></div>
          <div><Label>Parentesco</Label><Input value={form.contato_emergencia_parentesco} onChange={(e) => setForm({ ...form, contato_emergencia_parentesco: e.target.value })} placeholder="Ex.: Mãe, Cônjuge..." /></div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h3 className="font-semibold">Dados bancários (PIX e conta)</h3>
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

      <Card><CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">Observações internas</h3>
        <p className="text-xs text-muted-foreground">Visíveis apenas para o gestor.</p>
        <Textarea rows={4} value={form.observacoes_internas} onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })} />
      </CardContent></Card>

      <div className="flex justify-end sticky bottom-4">
        <Button variant="gold" onClick={salvar} disabled={saving} size="lg">
          <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
