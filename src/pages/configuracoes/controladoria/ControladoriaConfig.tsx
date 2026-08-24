import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Clock, Bell, CalendarDays, Save } from "lucide-react";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

interface HorarioTrabalho {
  hora_inicio: string;
  hora_fim: string;
  dias_uteis: string[];
  fuso_horario: string;
}
interface AlertaPrazo {
  ativo: boolean;
  dias: number;
  cor: string;
  destinatario: string;
}
interface FeriadoFixo { dia: number; mes: number; nome: string }

const DIAS = [
  { id: "seg", label: "Seg" },
  { id: "ter", label: "Ter" },
  { id: "qua", label: "Qua" },
  { id: "qui", label: "Qui" },
  { id: "sex", label: "Sex" },
  { id: "sab", label: "Sáb" },
  { id: "dom", label: "Dom" },
];

/**
 * CONFIGURAÇÕES → Controladoria.
 * Horário de trabalho, alertas de prazo e calendário de feriados fixos.
 */
export default function ControladoriaConfig() {
  const { config, loading, salvando, salvarChave } = useConfiguracoes("controladoria");

  const [horario, setHorario] = useState<HorarioTrabalho>({
    hora_inicio: "08:00",
    hora_fim: "18:00",
    dias_uteis: ["seg", "ter", "qua", "qui", "sex"],
    fuso_horario: "America/Cuiaba",
  });

  const [alertas, setAlertas] = useState<Record<string, AlertaPrazo>>({});

  useEffect(() => {
    if (loading) return;
    if (config.horario_trabalho) setHorario(config.horario_trabalho as HorarioTrabalho);
    if (config.alertas_prazo) setAlertas(config.alertas_prazo as Record<string, AlertaPrazo>);
  }, [loading, config]);

  const feriados = (config.feriados_nacionais_fixos as FeriadoFixo[] | undefined) ?? [];

  function toggleDia(id: string) {
    setHorario((h) => {
      const tem = h.dias_uteis.includes(id);
      return { ...h, dias_uteis: tem ? h.dias_uteis.filter((d) => d !== id) : [...h.dias_uteis, id] };
    });
  }

  async function salvarHorario() {
    await salvarChave("horario_trabalho", horario);
  }
  async function salvarAlertas() {
    await salvarChave("alertas_prazo", alertas);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gold" />
            Horário de funcionamento
          </CardTitle>
          <CardDescription>Base para cálculo de prazos e disponibilidade da equipe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input
                type="time"
                value={horario.hora_inicio}
                onChange={(e) => setHorario((h) => ({ ...h, hora_inicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input
                type="time"
                value={horario.hora_fim}
                onChange={(e) => setHorario((h) => ({ ...h, hora_fim: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fuso horário</Label>
              <Input
                value={horario.fuso_horario}
                onChange={(e) => setHorario((h) => ({ ...h, fuso_horario: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dias úteis</Label>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => {
                const ativo = horario.dias_uteis.includes(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleDia(d.id)}
                    type="button"
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      ativo
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground/70 hover:bg-muted"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={salvarHorario} disabled={salvando} size="sm">
              <Save className="w-4 h-4 mr-2" />
              Salvar horário
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gold" />
            Alertas de prazo
          </CardTitle>
          <CardDescription>Quando avisar e para quem antes do vencimento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(alertas).map(([key, alerta]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    background:
                      alerta.cor === "vermelho"
                        ? "#EF4444"
                        : alerta.cor === "amarelo"
                          ? "#F59E0B"
                          : alerta.cor === "verde"
                            ? "#10B981"
                            : "#6B7280",
                  }}
                />
                <div className="min-w-0">
                  <div className="font-medium text-sm capitalize">
                    {key === "vencido" ? "Vencido" : `${alerta.dias} dia${alerta.dias > 1 ? "s" : ""} antes`}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    Notificar: {alerta.destinatario.replace(/_/g, " ")}
                  </div>
                </div>
              </div>
              <Switch
                checked={alerta.ativo}
                onCheckedChange={(v) =>
                  setAlertas((a) => ({ ...a, [key]: { ...a[key], ativo: v } }))
                }
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={salvarAlertas} disabled={salvando} size="sm">
              <Save className="w-4 h-4 mr-2" />
              Salvar alertas
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-gold" />
            Feriados nacionais fixos
          </CardTitle>
          <CardDescription>Aplicados automaticamente no cálculo de prazos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {feriados.map((f) => (
              <Badge key={`${f.dia}-${f.mes}`} variant="secondary">
                {String(f.dia).padStart(2, "0")}/{String(f.mes).padStart(2, "0")} · {f.nome}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Feriados móveis (Carnaval, Páscoa, Corpus Christi) são calculados automaticamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
