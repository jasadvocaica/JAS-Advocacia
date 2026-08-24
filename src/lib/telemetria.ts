import { supabase } from "@/integrations/supabase/client";

/**
 * Telemetria centralizada de erros de UI e API. Persiste em `ui_error_logs`
 * (tabela com RLS — usuário só insere para si mesmo, gestor lê tudo).
 *
 * Falhas no envio são engolidas silenciosamente: telemetria nunca pode
 * quebrar a aplicação que está tentando reportar o erro.
 */

export type TipoErro = "ui" | "api";

export interface RegistroErro {
  tipo: TipoErro;
  mensagem: string;
  modulo?: string | null;
  stack?: string | null;
  componentStack?: string | null;
  statusHttp?: number | null;
  endpoint?: string | null;
  contexto?: Record<string, unknown>;
}

function moduloDaRota(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return "dashboard";
  if (seg[0] === "portal-parceiro") return `portal-parceiro/${seg[1] ?? "root"}`;
  return seg[0];
}

function ambienteAtual() {
  if (typeof window === "undefined") {
    return { rota: "(ssr)", modulo: "ssr", userAgent: null, viewport: null };
  }
  return {
    rota: window.location.pathname + window.location.search,
    modulo: moduloDaRota(window.location.pathname),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
  };
}

export async function registrarErro(reg: RegistroErro): Promise<void> {
  const env = ambienteAtual();
  const modulo = reg.modulo ?? env.modulo;

  // eslint-disable-next-line no-console
  console.error(`[telemetria:${reg.tipo}]`, {
    modulo,
    rota: env.rota,
    mensagem: reg.mensagem,
    statusHttp: reg.statusHttp,
    endpoint: reg.endpoint,
    stack: reg.stack,
    componentStack: reg.componentStack,
    contexto: reg.contexto,
    timestamp: new Date().toISOString(),
  });

  try {
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("ui_error_logs").insert({
      user_id: auth.user?.id ?? null,
      tipo: reg.tipo,
      rota: env.rota,
      modulo,
      mensagem: reg.mensagem.slice(0, 2000),
      stack: reg.stack?.slice(0, 8000) ?? null,
      component_stack: reg.componentStack?.slice(0, 8000) ?? null,
      status_http: reg.statusHttp ?? null,
      endpoint: reg.endpoint?.slice(0, 1000) ?? null,
      user_agent: env.userAgent,
      viewport: env.viewport,
      contexto: {
        ...(reg.contexto ?? {}),
        referrer: typeof document !== "undefined" ? document.referrer : null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[telemetria] falha ao persistir log", e);
  }
}

/** Endpoints que NÃO devem gerar telemetria (evita loop infinito). */
const ENDPOINTS_IGNORADOS = [
  "/rest/v1/ui_error_logs",
  "/auth/v1/token",
  "/auth/v1/user",
];

function deveIgnorar(url: string): boolean {
  return ENDPOINTS_IGNORADOS.some((ig) => url.includes(ig));
}

function extrairEndpoint(input: RequestInfo | URL): string {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    if (input instanceof Request) return input.url;
  } catch {
    /* ignore */
  }
  return "(unknown)";
}

let interceptorInstalado = false;

/**
 * Intercepta `window.fetch` para reportar:
 *  - exceptions de rede (servidor inacessível, CORS, abort não-controlado)
 *  - respostas com status 5xx
 *  - respostas 4xx críticas (408, 429) que indicam degradação
 *
 * Erros de validação 400/401/403/404 NÃO são registrados — são fluxo normal
 * de negócio e gerariam ruído.
 */
export function instalarInterceptorFetch() {
  if (interceptorInstalado || typeof window === "undefined" || typeof window.fetch !== "function") return;
  interceptorInstalado = true;

  try {
    const fetchOriginal = window.fetch.bind(window);

    const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const endpoint = extrairEndpoint(input);
      const metodo = init?.method ?? (input instanceof Request ? input.method : "GET");

      try {
        const resp = await fetchOriginal(input, init);

        if (!deveIgnorar(endpoint)) {
          const status = resp.status;
          const ehErroServidor = status >= 500 && status <= 599;
          const ehDegradacao = status === 408 || status === 429;

          if (ehErroServidor || ehDegradacao) {
            // Não consumimos o body para não quebrar o consumidor original.
            void registrarErro({
              tipo: "api",
              mensagem: `HTTP ${status} ${resp.statusText || ""}`.trim(),
              statusHttp: status,
              endpoint,
              contexto: { metodo },
            });
          }
        }

        return resp;
      } catch (err) {
        if (!deveIgnorar(endpoint)) {
          const e = err as Error;
          // AbortError costuma ser navegação/cancelamento — ignoramos.
          if (e?.name !== "AbortError") {
            void registrarErro({
              tipo: "api",
              mensagem: e?.message ?? "Falha de rede",
              stack: e?.stack ?? null,
              endpoint,
              contexto: { metodo, name: e?.name ?? null },
            });
          }
        }
        throw err;
      }
    };

    try {
      window.fetch = wrappedFetch;
    } catch {
      try {
        Object.defineProperty(window, "fetch", {
          value: wrappedFetch,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } catch {
        // Se o ambiente proibir estritamente override de window.fetch, ignora sem travar a aplicação
      }
    }
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[telemetria] Não foi possível interceptar fetch:", err);
    }
  }
}

/** Captura promises rejeitadas e erros globais não tratados. */
export function instalarHandlersGlobais() {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const mensagem =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Promise rejeitada sem motivo";
    void registrarErro({
      tipo: "ui",
      mensagem: `[unhandledrejection] ${mensagem}`,
      stack: reason instanceof Error ? reason.stack : null,
      contexto: { origem: "unhandledrejection" },
    });
  });

  window.addEventListener("error", (event) => {
    // Ignora erros de carregamento de recursos (img/script) — geram muito ruído.
    if (event.error == null && event.message === "ResourceLoadError") return;
    void registrarErro({
      tipo: "ui",
      mensagem: `[window.error] ${event.message}`,
      stack: event.error?.stack ?? null,
      contexto: {
        origem: "window.error",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });
}
