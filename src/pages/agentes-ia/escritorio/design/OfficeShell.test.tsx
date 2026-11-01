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
beforeEach(() => localStorage.clear());
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
  it("encontra módulos por busca sem acentos e mantém navegação acessível recolhida", () => {
    abrir();
    fireEvent.change(screen.getByRole("textbox", { name: "Pesquisar menu" }), {
      target: { value: "publicacoes" },
    });
    expect(
      screen.getByRole("link", { name: "Publicações DJEN" }),
    ).toHaveAttribute("href", "/ferramentas/publicacoes-pje");
    expect(
      screen.queryByRole("link", { name: "Financeiro" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Limpar pesquisa do menu" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Recolher menu lateral" }),
    );
    expect(screen.getByRole("link", { name: "Financeiro" })).toHaveAttribute(
      "href",
      "/financeiro",
    );
    expect(
      screen.getByRole("button", { name: "Expandir menu lateral" }),
    ).toBeInTheDocument();
  });
});
