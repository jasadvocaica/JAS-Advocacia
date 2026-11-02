import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OfficeShell from "../OfficeShell";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    profile: { nome: "Juliana Araújo" },
    user: null,
    hasPermission: () => true,
    signOut: vi.fn(),
  }),
}));
const abrir = () =>
  render(
    <MemoryRouter>
      <OfficeShell
        secao="comando"
        contratar={vi.fn()}
        recarregar={vi.fn()}
        loading={false}
        pendentes={0}
        trabalhando={0}
        atualizadoEm={null}
      >
        <p>Conteúdo de trabalho</p>
      </OfficeShell>
    </MemoryRouter>,
  );
beforeEach(() => { try { localStorage.clear(); } catch { /* Node sem localStorage */ } });
describe("Navegação e aparência do escritório", () => {
  it("preserva a preferência de tema e restaura o ambiente ao sair", () => {
    const before = document.documentElement.getAttribute("data-office-theme");
    const dark = document.documentElement.classList.contains("dark");
    const view = abrir();
    expect(document.documentElement).toHaveAttribute(
      "data-office-theme",
      "light",
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar tema escuro" }));
    expect(document.documentElement).toHaveAttribute(
      "data-office-theme",
      "dark",
    );
    expect(localStorage.getItem("jas-office-theme")).toBe("dark");
    view.unmount();
    expect(document.documentElement.getAttribute("data-office-theme")).toBe(
      before,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(dark);
    abrir();
    expect(document.documentElement).toHaveAttribute(
      "data-office-theme",
      "dark",
    );
  });
  it("mostra só as áreas do escritório e volta ao JAS", () => {
    abrir();
    const barra = screen.getByRole("navigation", { name: "Áreas do escritório" });
    expect(barra).toHaveTextContent("Escritório");
    expect(screen.getByRole("link", { name: "Comando" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Financeiro" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao sistema JAS" })).toHaveAttribute("href", "/");
  });
  it("no modo imersivo some a moldura", () => {
    render(
      <MemoryRouter>
        <OfficeShell secao="escritorio" contratar={vi.fn()} recarregar={vi.fn()} loading={false} pendentes={0} trabalhando={0} atualizadoEm={null} imersivo>
          <p>Cena</p>
        </OfficeShell>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("navigation", { name: "Áreas do escritório" })).not.toBeInTheDocument();
    expect(screen.getByText("Cena")).toBeInTheDocument();
  });
});
