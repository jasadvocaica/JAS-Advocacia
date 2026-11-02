import { useCallback, useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { AgenteIA } from "../../hooks/useAgentesIA";
import { OfficeStatus } from "../design/OfficeUI";
import { chamarMotor } from "./motor";

export interface Gatilhos {
  djen_automatico: boolean;
  gestora_id: string | null;
  djen_max_dia: number;
  na_fila: number;
  criadas_hoje: number;
}

/**
 * Publicação nova do DJEN → missão automática para a Gestora. Começa desligado; o backend confere
 * gestor ativo, Gestora válida e teto diário. A gravação na Controladoria continua pedindo aprovação.
 */
export default function GatilhoDjen({ agentes, motorLigado }: { agentes: AgenteIA[]; motorLigado: boolean }) {
  const { toast } = useToast();
  const [g, setG] = useState<Gatilhos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [gestora, setGestora] = useState("");
  const [maxDia, setMaxDia] = useState(20);
  // Só agentes contratados no escritório recebem missões do motor.
  const candidatas = agentes.filter((a) => a.ativo && a.executor === "analista_operacional");

  const carregar = useCallback(async () => {
    try {
      const r = await chamarMotor<Gatilhos>({ acao: "gatilhos" });
      setG(r);
      setGestora(r.gestora_id ?? "");
      setMaxDia(r.djen_max_dia);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler os gatilhos.");
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const escolhida = gestora || candidatas.find((a) => /manu/i.test(a.nome))?.id || candidatas[0]?.id || "";

  async function salvar(ligar: boolean) {
    setSalvando(true);
    try {
      const r = await chamarMotor<Gatilhos>({
        acao: "ajustar_gatilhos", djen_automatico: ligar, gestora_id: escolhida || null, djen_max_dia: maxDia,
      });
      setG(r);
      toast({ title: ligar ? "Publicações do DJEN viram missões" : "Missões automáticas do DJEN desligadas" });
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="op-panel ga-gatilho" aria-label="Missões automáticas do DJEN">
      <h3><Newspaper size={18} /> Publicações do DJEN</h3>
      {erro && <p className="mi-aviso">{erro}</p>}
      {g && (
        <>
          <p className="ga-nota">
            Cada publicação nova vira uma missão para a Gestora, que analisa, consulta o processo e propõe a providência à
            Controladoria. Gravar na Controladoria continua pedindo a sua aprovação.
          </p>
          <div className="ga-gatilho-campos">
            <label>
              <span>Gestora</span>
              <select value={escolhida} onChange={(e) => setGestora(e.target.value)} disabled={salvando}>
                {candidatas.length === 0 && <option value="">Crie a Manu em Criar agente</option>}
                {candidatas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
            <label>
              <span>Máximo por dia</span>
              <input type="number" min={1} max={100} value={maxDia} disabled={salvando}
                onChange={(e) => setMaxDia(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
          </div>
          <div className="ga-motor">
            <OfficeStatus tone={g.djen_automatico ? (motorLigado ? "success" : "warning") : "neutral"}>
              {g.djen_automatico ? (motorLigado ? "Ligado" : "Ligado · motor desligado") : "Desligado"}
            </OfficeStatus>
            <Button size="sm" variant={g.djen_automatico ? "outline" : "default"} disabled={salvando || (!g.djen_automatico && !escolhida)}
              aria-label={g.djen_automatico ? "Desligar missões automáticas do DJEN" : "Ligar missões automáticas do DJEN"}
              onClick={() => void salvar(!g.djen_automatico)}>
              {g.djen_automatico ? "Desligar" : "Ligar"}
            </Button>
          </div>
          <p className="ga-nota">
            Hoje: {g.criadas_hoje} de {g.djen_max_dia} missões criadas{g.na_fila > 0 ? ` · ${g.na_fila} esperando na fila` : ""}.
            O excedente fica para o dia seguinte.
          </p>
        </>
      )}
    </div>
  );
}
