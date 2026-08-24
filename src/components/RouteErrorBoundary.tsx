import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { registrarErro } from "@/lib/telemetria";

interface Props {
  children: ReactNode;
  /** Reseta o estado de erro quando esta key muda (ex: pathname). */
  resetKey?: string;
  /** Identifica o módulo/contexto onde o boundary está montado (ex: "app", "portal-parceiro"). */
  modulo?: string;
}

interface State {
  error: Error | null;
}

/**
 * Captura erros de renderização em qualquer rota/página filha e mostra uma
 * tela de fallback amigável em vez de "tela branca". Reseta automaticamente
 * quando o usuário navega para outra rota (resetKey muda).
 *
 * Telemetria:
 * - Loga no console com módulo/rota/stack para inspeção rápida no preview.
 * - Persiste em `ui_error_logs` (tabela protegida por RLS) para análise posterior.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  async componentDidCatch(error: Error, info: ErrorInfo) {
    const modulo = this.props.modulo ?? undefined;
    const msg = error?.message ?? "";
    const isTransientDomError =
      error?.name === "NotFoundError" &&
      (msg.includes("removeChild") || msg.includes("insertBefore") || msg.includes("not a child"));

    await registrarErro({
      tipo: "ui",
      mensagem: msg || "(sem mensagem)",
      modulo,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
      contexto: { name: error.name, transient: isTransientDomError || undefined },
    });

    // Erro causado por extensões de tradução / mutações externas no DOM.
    // Estratégia: na PRIMEIRA ocorrência por rota, recarrega automaticamente
    // (sessionStorage marca a rota para evitar loop). Se já recarregou e
    // continua quebrando, recupera silenciosamente sem novo reload.
    if (isTransientDomError) {
      try {
        const rota = this.props.resetKey ?? window.location.pathname;
        const chave = `dom-auto-reload:${rota}`;
        const jaRecarregou = sessionStorage.getItem(chave);
        if (!jaRecarregou) {
          sessionStorage.setItem(chave, String(Date.now()));
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage indisponível: cai para reset silencioso.
      }
      setTimeout(() => this.setState({ error: null }), 0);
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey) {
      // Trocou de rota: limpa o flag de auto-reload da rota anterior
      // para que a nova rota tenha sua própria "chance única".
      try {
        const chaveAnterior = `dom-auto-reload:${prevProps.resetKey}`;
        sessionStorage.removeItem(chaveAnterior);
      } catch {}
      if (this.state.error) {
        this.setState({ error: null });
      }
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-display">Algo deu errado nesta página</h2>
              <p className="text-sm text-muted-foreground">
                Encontramos um erro ao carregar este conteúdo. Você pode tentar novamente ou
                recarregar a página.
              </p>
              {import.meta.env.DEV && (
                <pre className="text-left text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 mt-3">
                  {this.state.error.message}
                </pre>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={this.handleReset}>
                Tentar novamente
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Recarregar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;
