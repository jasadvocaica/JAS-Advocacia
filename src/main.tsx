import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { instalarInterceptorFetch, instalarHandlersGlobais } from "./lib/telemetria";

// Aplica o tema (claro/escuro) o quanto antes para evitar flash de tela branca.
try {
  const salvo = localStorage.getItem("app:tema");
  const usaEscuro = salvo === "dark" || (!salvo && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!usaEscuro);
} catch {}

// Instala telemetria de erros (API 5xx + exceptions globais) o mais cedo possível
// para capturar falhas inclusive durante o bootstrap da aplicação.
instalarInterceptorFetch();
instalarHandlersGlobais();

// =============================================================================
// Patch defensivo para extensões de tradução (Google Translate, etc.)
// -----------------------------------------------------------------------------
// Essas extensões substituem text nodes dentro do DOM gerenciado pelo React.
// Quando o React tenta `removeChild` / `insertBefore` em um nó que a extensão
// já moveu, o navegador lança `NotFoundError: Failed to execute 'removeChild'
// on 'Node': The node to be removed is not a child of this node.` — isso
// derruba a árvore inteira e provoca o loop "Recarregar página".
//
// Patch em Node.prototype: se o nó alvo não é mais filho do `this`, fazemos
// um no-op (ou inserimos no lugar correto). É a solução padrão recomendada
// pela comunidade React para conviver com o Google Translate.
// =============================================================================
if (typeof Node !== "undefined") {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      // O nó já foi removido/movido (provavelmente por uma extensão).
      // Devolve o próprio nó sem lançar para o React seguir o ciclo de vida.
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[dom-patch] removeChild ignorado: nó não é mais filho deste pai.");
      }
      return child;
    }
    // eslint-disable-next-line prefer-rest-params
    return originalRemoveChild.apply(this, arguments as any) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // Reference foi movida pela extensão — apenas anexa ao final.
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn("[dom-patch] insertBefore caiu para appendChild: reference não é filho.");
      }
      return this.appendChild(newNode) as T;
    }
    // eslint-disable-next-line prefer-rest-params
    return originalInsertBefore.apply(this, arguments as any) as T;
  } as typeof Node.prototype.insertBefore;
}

// =============================================================================
// Bootstrap resiliente
// -----------------------------------------------------------------------------
// Um erro lançado durante o IMPORT do módulo (ex: variável de ambiente do
// Supabase ausente em `integrations/supabase/client.ts`) acontece ANTES de
// qualquer ErrorBoundary do React existir — o resultado é tela branca total,
// sem nenhuma pista visual. Aqui capturamos e desenhamos uma tela de
// diagnóstico legível, que aponta exatamente o que corrigir.
// =============================================================================
function renderFalhaBootstrap(erro: unknown) {
  const raiz = document.getElementById("root");
  if (!raiz) return;
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  raiz.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0d;color:#f5f1e6">
      <div style="max-width:560px;width:100%;background:#15151a;border:1px solid #2a2a32;border-radius:16px;padding:28px">
        <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#d4af37;font-weight:600">Configuração necessária</div>
        <h1 style="font-size:22px;margin:10px 0 8px;font-weight:600">O sistema não conseguiu iniciar</h1>
        <p style="font-size:14px;line-height:1.6;color:#a8a8b3;margin:0 0 16px">
          Faltam variáveis de ambiente obrigatórias. Crie o arquivo <code style="background:#22222a;padding:2px 6px;border-radius:4px">.env</code>
          na raiz do projeto (copie de <code style="background:#22222a;padding:2px 6px;border-radius:4px">.env.example</code>),
          preencha os valores do painel do Supabase e reinicie o servidor de desenvolvimento.
        </p>
        <pre style="font-size:12px;line-height:1.5;background:#0d0d11;border:1px solid #2a2a32;border-radius:8px;padding:12px;overflow:auto;color:#ffb4b4;white-space:pre-wrap;margin:0">${mensagem.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))}</pre>
        <button onclick="location.reload()" style="margin-top:18px;width:100%;padding:11px;border:0;border-radius:8px;background:#d4af37;color:#15151a;font-weight:600;font-size:14px;cursor:pointer">Recarregar</button>
      </div>
    </div>`;
}

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (erro) {
  // eslint-disable-next-line no-console
  console.error("[bootstrap] Falha ao iniciar a aplicação:", erro);
  renderFalhaBootstrap(erro);
}

