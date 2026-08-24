import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Clock, Save } from "lucide-react";
import { toast } from "sonner";

interface Props { membroId: string; }

const DIAS: { key: string; label: string }[] = [
  { key: "seg", label: "Seg" },
  { key: "ter", label: "Ter" },
  { key: "qua", label: "Qua" },
  { key: "qui", label: "Qui" },
  { key: "sex", label: "Sex" },
  { key: "sab", label: "Sáb" },
  { key: "dom", label: "Dom" },
];

const PADRAO = {
  dias_trabalho: ["seg", "ter", "qua", "qui", "sex"],
  horas_diarias: "8.0",
  horario_entrada: "08:00",
  horario_saida: "18:00",
  intervalo_almoco_minutos: "60",
  tolerancia_entrada_minutos: "10",
  banco_horas_ativo: true,
};

export function JornadaTabEdit({ membroId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existeId, setExisteId] = useState<string | null>(null);
  const [form, setForm] = useState(PADRAO);

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("gp_ponto_config")
      .select("*")
      .eq("membro_id", membroId)
      .maybeSingle();
    if (data) {
      setExisteId((data as any).id);
      setForm({
        dias_trabalho: (data as any).dias_trabalho ?? PADRAO.dias_trabalho,
        horas_diarias: String((data as any).horas_diarias ?? "8.0"),
        horario_entrada: String((data as any).horario_entrada ?? "08:00").slice(0, 5),
        horario_saida: String((data as any).horario_saida ?? "18:00").slice(0, 5),
        intervalo_almoco_minutos: String((data as any).intervalo_almoco_minutos ?? "60"),
        tolerancia_entrada_minutos: String((data as any).tolerancia_entrada_minutos ?? "10"),
        banco_horas_ativo: !!(data as any).banco_horas_ativo,
      });
    } else {
      setExisteId(null);
      setForm(PADRAO);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [membroId]);

  const toggleDia = (key: string) => {
    setForm((f) => ({
      ...f,
      dias_trabalho: f.dias_trabalho.includes(key)
        ? f.dias_trabalho.filter((d) => d !== key)
        : [...f.dias_trabalho, key],
    }));
  };

  const salvar = async () => {
    if (form.dias_trabalho.length === 0) {
      toast.error("Selecione pelo menos um dia de trabalho");
      return;
    }
    const payload = {
      membro_id: membroId,
      dias_trabalho: form.dias_trabalho,
      horas_diarias: Number(form.horas_diarias.replace(",", ".")) || 8,
      horario_entrada: form.horario_entrada + ":00",
      horario_saida: form.horario_saida + ":00",
      intervalo_almoco_minutos: Number(form.intervalo_almoco_minutos) || 60,
      tolerancia_entrada_minutos: Number(form.tolerancia_entrada_minutos) || 10,
      banco_horas_ativo: form.banco_horas_ativo,
    };
    setSaving(true);
    let error: any = null;
    if (existeId) {
      ({ error } = await supabase.from("gp_ponto_config").update(payload).eq("id", existeId));
    } else {
      ({ error } = await supabase.from("gp_ponto_config").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Jornada salva");
      carregar();
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gold" />
          <h3 className="font-semibold">Jornada de trabalho</h3>
          {existeId ? (
            <Badge variant="outline" className="bg-success/15 text-success border-success/30 ml-auto">
              Configurada
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto">Usando padrão</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-3">
          Define os horários esperados para o registro de ponto e cálculo de horas extras/faltas.
        </p>

        <div>
          <Label className="text-xs">Dias de trabalho</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {DIAS.map((d) => {
              const ativo = form.dias_trabalho.includes(d.key);
              return (
                <Button
                  key={d.key}
                  type="button"
                  size="sm"
                  variant={ativo ? "gold" : "outline"}
                  onClick={() => toggleDia(d.key)}
                  className="w-14"
                >
                  {d.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="entrada" className="text-xs">Entrada</Label>
            <Input
              id="entrada"
              type="time"
              value={form.horario_entrada}
              onChange={(e) => setForm({ ...form, horario_entrada: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="saida" className="text-xs">Saída</Label>
            <Input
              id="saida"
              type="time"
              value={form.horario_saida}
              onChange={(e) => setForm({ ...form, horario_saida: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="almoco" className="text-xs">Intervalo almoço (min)</Label>
            <Input
              id="almoco"
              type="number"
              min={0}
              max={240}
              value={form.intervalo_almoco_minutos}
              onChange={(e) => setForm({ ...form, intervalo_almoco_minutos: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="horasd" className="text-xs">Horas diárias</Label>
            <Input
              id="horasd"
              inputMode="decimal"
              value={form.horas_diarias}
              onChange={(e) => setForm({ ...form, horas_diarias: e.target.value })}
              placeholder="8.0"
            />
          </div>
          <div>
            <Label htmlFor="tol" className="text-xs">Tolerância entrada (min)</Label>
            <Input
              id="tol"
              type="number"
              min={0}
              max={60}
              value={form.tolerancia_entrada_minutos}
              onChange={(e) => setForm({ ...form, tolerancia_entrada_minutos: e.target.value })}
            />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Switch
              id="banco"
              checked={form.banco_horas_ativo}
              onCheckedChange={(v) => setForm({ ...form, banco_horas_ativo: v })}
            />
            <Label htmlFor="banco" className="text-sm cursor-pointer">Banco de horas</Label>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="gold" onClick={salvar} disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar jornada"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
