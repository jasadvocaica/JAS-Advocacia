import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function ConfiguracoesFinanceiro() {
  const { isGestor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("financeiro_configuracoes").select("*").maybeSingle();
      setConfig(data ?? {
        alerta_d1: true, alerta_d5: true, alerta_d15: true, alerta_d30_tarefa: true,
        gerar_mensalidade_dia: 1, incluir_exito_na_projecao: false, forma_padrao: "pix",
      });
      setLoading(false);
    })();
  }, []);

  const set = (k: string, v: any) => setConfig((c: any) => ({ ...c, [k]: v }));

  const handleSave = async () => {
    if (!isGestor) { toast.error("Apenas gestor pode salvar"); return; }
    setSaving(true);
    const payload = { ...config };
    delete payload.id;
    delete payload.atualizado_em;
    const { error } = config.id
      ? await supabase.from("financeiro_configuracoes").update(payload).eq("id", config.id)
      : await supabase.from("financeiro_configuracoes").insert(payload);
    if (error) { toast.error("Erro: " + error.message); setSaving(false); return; }
    toast.success("Configurações salvas");
    setSaving(false);
  };

  if (loading) return <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>;

  return (
    <div className="space-y-6">
      <PageHeader title="Configurações financeiras" description="Padrões de cobrança, alertas e projeções">
        <Button asChild variant="ghost" size="sm">
          <Link to="/financeiro"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
        {isGestor && (
          <Button variant="gold" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </Button>
        )}
      </PageHeader>

      {!isGestor && (
        <Card className="p-4 bg-amber-500/10 border-amber-500/30">
          <p className="text-sm">Apenas gestor pode editar estas configurações.</p>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Alertas de vencimento</h3>
        <p className="text-sm text-muted-foreground">Define quando criar tarefas automáticas para parcelas em atraso.</p>
        <div className="space-y-3">
          <SwitchRow label="Alertar 1 dia após o vencimento" value={config.alerta_d1} onChange={(v) => set("alerta_d1", v)} />
          <SwitchRow label="Alertar 5 dias após o vencimento" value={config.alerta_d5} onChange={(v) => set("alerta_d5", v)} />
          <SwitchRow label="Alertar 15 dias após o vencimento" value={config.alerta_d15} onChange={(v) => set("alerta_d15", v)} />
          <SwitchRow label="Criar tarefa de cobrança a partir de 30 dias" value={config.alerta_d30_tarefa} onChange={(v) => set("alerta_d30_tarefa", v)} />
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Padrões</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label>Dia padrão de geração de mensalidade</Label>
            <Input type="number" min="1" max="28" value={config.gerar_mensalidade_dia}
              onChange={(e) => set("gerar_mensalidade_dia", parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <Label>Forma de pagamento padrão</Label>
            <Select value={config.forma_padrao} onValueChange={(v) => set("forma_padrao", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-display text-lg">Projeções</h3>
        <SwitchRow
          label="Incluir êxito estimado nas projeções (apenas alta probabilidade)"
          value={config.incluir_exito_na_projecao}
          onChange={(v) => set("incluir_exito_na_projecao", v)}
        />
      </Card>
    </div>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <Label className="cursor-pointer flex-1" onClick={() => onChange(!value)}>{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
