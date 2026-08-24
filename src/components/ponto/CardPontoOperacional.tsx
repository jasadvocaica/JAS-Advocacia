import { useState } from "react";
import { Clock, Coffee, CheckCircle2, LogIn, Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMeuPonto, type EventoPonto } from "@/hooks/useMeuPonto";
import { toast } from "sonner";

const LABEL: Record<EventoPonto, string> = {
  entrada: "Registrar entrada",
  saida_almoco: "Saída p/ almoço",
  retorno_almoco: "Retorno do almoço",
  saida: "Encerrar dia",
};

function formatHora(t: string | null): string {
  if (!t) return "—";
  return t.slice(0, 5).replace(":", "h");
}

function formatDuracao(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h${String(m).padStart(2, "0")}`;
}

export function CardPontoOperacional() {
  const { registro, estado, proximo, agora, registrar, loading } = useMeuPonto();
  const [confirmando, setConfirmando] = useState<EventoPonto | null>(null);
  const [submetendo, setSubmetendo] = useState(false);

  const confirmar = async () => {
    if (!confirmando) return;
    setSubmetendo(true);
    try {
      await registrar(confirmando);
      toast.success("Ponto registrado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmetendo(false);
      setConfirmando(null);
    }
  };

  if (loading && !registro) {
    return (
      <Card className="p-3 w-full max-w-xs text-xs text-muted-foreground">Carregando ponto...</Card>
    );
  }

  // Tempo trabalhando ao vivo
  const tempo = (() => {
    if (!registro?.entrada) return null;
    const hoje = new Date();
    const [hh, mm] = registro.entrada.split(":").map(Number);
    const inicio = new Date(hoje); inicio.setHours(hh, mm, 0, 0);
    let ms = agora.getTime() - inicio.getTime();
    if (registro.saida_almoco && registro.retorno_almoco) {
      const [sh, sm] = registro.saida_almoco.split(":").map(Number);
      const [rh, rm] = registro.retorno_almoco.split(":").map(Number);
      ms -= (rh * 60 + rm - sh * 60 - sm) * 60_000;
    } else if (registro.saida_almoco && !registro.retorno_almoco) {
      const [sh, sm] = registro.saida_almoco.split(":").map(Number);
      const sd = new Date(hoje); sd.setHours(sh, sm, 0, 0);
      ms = sd.getTime() - inicio.getTime();
    }
    if (registro.saida) {
      const [eh, em] = registro.saida.split(":").map(Number);
      const fim = new Date(hoje); fim.setHours(eh, em, 0, 0);
      ms = fim.getTime() - inicio.getTime();
      if (registro.saida_almoco && registro.retorno_almoco) {
        const [sh, sm] = registro.saida_almoco.split(":").map(Number);
        const [rh, rm] = registro.retorno_almoco.split(":").map(Number);
        ms -= (rh * 60 + rm - sh * 60 - sm) * 60_000;
      }
    }
    return ms > 0 ? formatDuracao(ms) : "0h00";
  })();

  return (
    <>
      <Card className="p-3 w-full max-w-xs">
        {estado === "sem_entrada" && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">Você ainda não registrou a entrada hoje</p>
            <Button
              size="sm"
              onClick={() => setConfirmando("entrada")}
              className="bg-primary hover:bg-primary/90 w-full"
            >
              <LogIn className="h-3.5 w-3.5 mr-1.5" /> Registrar entrada
            </Button>
          </div>
        )}

        {estado === "trabalhando" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Entrada: <strong>{formatHora(registro?.entrada ?? null)}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>Trabalhando há <strong>{tempo}</strong></span>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setConfirmando("saida_almoco")}>
                <Coffee className="h-3 w-3 mr-1" /> Almoço
              </Button>
              <Button size="sm" variant="default" className="flex-1 h-7 text-xs" onClick={() => setConfirmando("saida")}>
                Encerrar
              </Button>
            </div>
          </div>
        )}

        {estado === "em_almoco" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Coffee className="h-3.5 w-3.5 text-primary" />
              <span>Intervalo desde <strong>{formatHora(registro?.saida_almoco ?? null)}</strong></span>
            </div>
            <Button size="sm" className="w-full h-7 text-xs" onClick={() => setConfirmando("retorno_almoco")}>
              <Play className="h-3 w-3 mr-1" /> Registrar retorno
            </Button>
          </div>
        )}

        {estado === "pos_almoco" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span>Retorno: <strong>{formatHora(registro?.retorno_almoco ?? null)}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>Trabalhadas: <strong>{tempo}</strong></span>
            </div>
            <Button size="sm" className="w-full h-7 text-xs" onClick={() => setConfirmando("saida")}>
              Encerrar dia
            </Button>
          </div>
        )}

        {estado === "encerrado" && (
          <div className="text-center space-y-1">
            <CheckCircle2 className="h-5 w-5 text-success mx-auto" />
            <p className="text-xs">Dia encerrado</p>
            <p className="text-xs text-muted-foreground">
              Total: <strong>{registro?.horas_trabalhadas ? `${registro.horas_trabalhadas}h` : tempo}</strong>
            </p>
          </div>
        )}
      </Card>

      <AlertDialog open={!!confirmando} onOpenChange={(v) => !v && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmando ? `Confirmar ${LABEL[confirmando].toLowerCase()}?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {new Date().toLocaleDateString("pt-BR")} — {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submetendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar} disabled={submetendo}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
