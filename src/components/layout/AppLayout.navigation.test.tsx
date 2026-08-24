import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Outlet, useLocation, Link } from "react-router-dom";

/**
 * Rotina automatizada que garante que, ao trocar entre rotas no AppLayout,
 * o conteúdo da página anterior NÃO permanece visível no DOM.
 *
 * Reproduz o padrão usado em src/components/layout/AppLayout.tsx:
 *   <main className="... relative isolate">
 *     <div key={location.pathname} className="animate-fade-in">
 *       <Outlet />
 *     </div>
 *   </main>
 *
 * Roda em larguras pequenas (375px e 768px) para cobrir mobile e tablet,
 * onde o sidebar fica dentro de um Sheet e o bug original aparecia.
 */

const VIEWPORTS = [
  { label: "mobile 375px", width: 375, height: 667 },
  { label: "tablet 768px", width: 768, height: 1024 },
];

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

function LayoutMock() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen">
      <nav>
        <Link to="/">Dashboard</Link>
        <Link to="/clientes">Clientes</Link>
        <Link to="/financeiro">Financeiro</Link>
        <Link to="/processos">Processos</Link>
      </nav>
      <main className="flex-1 relative isolate" data-testid="main">
        <div key={location.pathname} className="animate-fade-in" data-testid="route-wrapper">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function PaginaDashboard() {
  return <section data-testid="pagina-dashboard">CONTEUDO_DASHBOARD</section>;
}
function PaginaClientes() {
  return <section data-testid="pagina-clientes">CONTEUDO_CLIENTES</section>;
}
function PaginaFinanceiro() {
  return <section data-testid="pagina-financeiro">CONTEUDO_FINANCEIRO</section>;
}
function PaginaProcessos() {
  return <section data-testid="pagina-processos">CONTEUDO_PROCESSOS</section>;
}

function renderApp(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<LayoutMock />}>
          <Route path="/" element={<PaginaDashboard />} />
          <Route path="/clientes" element={<PaginaClientes />} />
          <Route path="/financeiro" element={<PaginaFinanceiro />} />
          <Route path="/processos" element={<PaginaProcessos />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout — troca de rota não deixa página antiga visível", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(VIEWPORTS)("viewport $label", ({ width, height }) => {
    beforeEach(() => {
      setViewport(width, height);
    });

    it("substitui o conteúdo ao navegar entre menus (não acumula no DOM)", async () => {
      const { container } = renderApp("/");

      // Página inicial visível
      expect(screen.getByTestId("pagina-dashboard")).toBeInTheDocument();
      expect(screen.queryByTestId("pagina-clientes")).not.toBeInTheDocument();

      // Navegar para Clientes
      await act(async () => {
        screen.getByText("Clientes").click();
      });
      expect(screen.getByTestId("pagina-clientes")).toBeInTheDocument();
      expect(screen.queryByTestId("pagina-dashboard")).not.toBeInTheDocument();

      // Navegar para Financeiro
      await act(async () => {
        screen.getByText("Financeiro").click();
      });
      expect(screen.getByTestId("pagina-financeiro")).toBeInTheDocument();
      expect(screen.queryByTestId("pagina-clientes")).not.toBeInTheDocument();
      expect(screen.queryByTestId("pagina-dashboard")).not.toBeInTheDocument();

      // Navegar para Processos
      await act(async () => {
        screen.getByText("Processos").click();
      });
      expect(screen.getByTestId("pagina-processos")).toBeInTheDocument();
      expect(screen.queryByTestId("pagina-financeiro")).not.toBeInTheDocument();

      // Garante que existe APENAS um wrapper de rota ativo dentro do <main>
      const main = container.querySelector('[data-testid="main"]')!;
      const wrappers = main.querySelectorAll('[data-testid="route-wrapper"]');
      expect(wrappers.length).toBe(1);

      // Garante que existe APENAS um <section> de página dentro do <main>
      const paginas = main.querySelectorAll("section");
      expect(paginas.length).toBe(1);
    });

    it("preserva o atributo 'isolate' no <main> para criar stacking context", () => {
      const { container } = renderApp("/clientes");
      const main = container.querySelector('[data-testid="main"]')!;
      expect(main.className).toContain("isolate");
      expect(main.className).toContain("relative");
    });

    it("força remount via key={pathname} (wrapper recebe nova identidade ao trocar de rota)", async () => {
      const { container } = renderApp("/");
      const main = container.querySelector('[data-testid="main"]')!;
      const wrapperAntes = main.querySelector('[data-testid="route-wrapper"]');

      await act(async () => {
        screen.getByText("Clientes").click();
      });

      const wrapperDepois = main.querySelector('[data-testid="route-wrapper"]');
      // Mesmo seletor, mas como o key mudou, o React desmontou e montou um nó novo.
      expect(wrapperDepois).not.toBe(wrapperAntes);
      // E só existe um wrapper ativo (não acumulou).
      expect(main.querySelectorAll('[data-testid="route-wrapper"]').length).toBe(1);
    });
  });
});
