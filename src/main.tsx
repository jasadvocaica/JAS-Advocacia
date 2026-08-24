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

createRoot(document.getElementById("root")!).render(<App />);
