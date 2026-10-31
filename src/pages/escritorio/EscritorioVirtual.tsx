import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { useEscritorioData } from "./useEscritorioData";

/**
 * Escritório virtual (estilo Habbo) — visão geral só da gestora.
 * O desenho roda em /escritorio/index.html (public/) dentro de um iframe;
 * os dados reais só chegam por postMessage desta página autenticada.
 */
export default function EscritorioVirtual() {
  const { profile } = useAuth();
  const { iniciarPreview } = usePreviewMode();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [pronto, setPronto] = useState(false);

  const gestor = useMemo(() => (profile ? { id: profile.id, nome: profile.nome } : null), [profile]);
  const { data: pessoas, error, isFetching, refetch, dataUpdatedAt } = useEscritorioData(gestor);
  const pessoasRef = useRef(pessoas);
  pessoasRef.current = pessoas;

  useEffect(() => {
    const aoReceber = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data ?? {};
      if (m.tipo === "pronto") {
        setPronto(true);
        if (pessoasRef.current) frame.current?.contentWindow?.postMessage({ tipo: "equipe", pessoas: pessoasRef.current }, window.location.origin);
      }
      if (m.tipo === "abrir") {
        const p = pessoasRef.current?.find((q) => q.id === m.id);
        if (!p) return;
        if (p.dona) { navigate("/painel-juliana"); return; }
        iniciarPreview("estagiaria", p.user_id, p.nome, p.email ?? undefined);
        navigate("/painel-operacional");
      }
    };
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, [navigate, iniciarPreview]);

  useEffect(() => {
    if (!pronto || !pessoas) return;
    frame.current?.contentWindow?.postMessage({ tipo: "equipe", pessoas }, window.location.origin);
  }, [pronto, pessoas]);

  return (
    <div className="space-y-4">
      <PageHeader title="Escritório virtual" description="A equipe em tempo real, pelo ponto de hoje e pelos prazos da Controladoria.">
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground">
            Atualizado às {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </PageHeader>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          Não foi possível carregar a equipe: {(error as Error).message}
        </div>
      )}

      <div className="h-[calc(100dvh-15rem)] min-h-[520px] overflow-hidden rounded-xl border bg-[#020726]">
        <iframe ref={frame} src="/escritorio/index.html" title="Escritório virtual" className="h-full w-full border-0" />
      </div>
    </div>
  );
}
