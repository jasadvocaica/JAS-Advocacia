import { AlertCircle, ExternalLink, LifeBuoy, RefreshCw, ShieldAlert, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type DataJudErrorKind = "auth" | "rate_limit" | "network" | "tribunal" | "generic";

export function classifyDataJudError(message?: string | null): DataJudErrorKind | null {
  if (!message) return null;
  const m = message.toLowerCase();
  if (m.includes("401") || m.includes("unauthorized") || m.includes("authenticate") || m.includes("api key") || m.includes("apikey") || m.includes("security_exception")) {
    return "auth";
  }
  if (m.includes("429") || m.includes("rate") || m.includes("limit")) return "rate_limit";
  if (m.includes("network") || m.includes("fetch failed") || m.includes("timeout") || m.includes("econnrefused")) return "network";
  if (m.includes("tribunal") || m.includes("não suportado") || m.includes("nao suportado")) return "tribunal";
  return "generic";
}

interface Props {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

const COPY: Record<DataJudErrorKind, { title: string; description: string; icon: typeof AlertCircle; showWiki: boolean }> = {
  auth: {
    title: "Chave do DataJud inválida ou expirada",
    description: "O CNJ rejeitou a chave de acesso. Isso costuma acontecer quando a chave pública é rotacionada. Atualize o segredo DATAJUD_API_KEY com a chave atual divulgada na wiki oficial.",
    icon: ShieldAlert,
    showWiki: true,
  },
  rate_limit: {
    title: "Limite de consultas atingido",
    description: "Muitas requisições em pouco tempo. Aguarde alguns minutos antes de tentar novamente.",
    icon: AlertCircle,
    showWiki: false,
  },
  network: {
    title: "Falha de conexão com o DataJud",
    description: "Não foi possível alcançar o servidor do CNJ. Verifique sua conexão e tente novamente.",
    icon: WifiOff,
    showWiki: false,
  },
  tribunal: {
    title: "Tribunal não suportado",
    description: "O tribunal deste processo ainda não está disponível na API pública do DataJud.",
    icon: AlertCircle,
    showWiki: true,
  },
  generic: {
    title: "Erro ao consultar DataJud",
    description: "Não foi possível concluir a consulta. Veja o detalhe abaixo e tente novamente.",
    icon: AlertCircle,
    showWiki: false,
  },
};

export function DataJudErrorBanner({ message, onRetry, retrying, compact }: Props) {
  const kind = classifyDataJudError(message) ?? "generic";
  const copy = COPY[kind];
  const Icon = copy.icon;

  return (
    <Alert variant={kind === "auth" || kind === "generic" ? "destructive" : "default"} className="space-y-2">
      <Icon className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-xs">{copy.description}</p>
        {!compact && (
          <details className="text-[11px] opacity-80">
            <summary className="cursor-pointer">Detalhe técnico</summary>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono">{message}</pre>
          </details>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${retrying ? "animate-spin" : ""}`} />
              Tentar novamente
            </Button>
          )}
          {copy.showWiki && (
            <Button size="sm" variant="outline" asChild>
              <a href="https://datajud-wiki.cnj.jus.br/api-publica/acesso" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Abrir wiki do CNJ
              </a>
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/configuracoes/datajud/troubleshooting#${kind}`}>
              <LifeBuoy className="w-3.5 h-3.5 mr-1.5" />
              Guia de solução
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
