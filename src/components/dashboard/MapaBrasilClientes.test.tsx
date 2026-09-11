import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapaBrasilClientes } from "./MapaBrasilClientes";

describe("MapaBrasilClientes", () => {
  it("renderiza o mapa completo mesmo sem dados de UF", () => {
    render(<MapaBrasilClientes dados={[]} />);

    expect(
      screen.getByRole("img", {
        name: "Mapa do Brasil com distribuição de clientes por estado",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 em 0 UFs")).toBeInTheDocument();
  });

  it("expõe estados com clientes como áreas interativas", () => {
    const selecionar = vi.fn();
    render(
      <MapaBrasilClientes
        dados={[{ estado: "MT", total: 3 }]}
        onSelectUf={selecionar}
      />,
    );

    const matoGrosso = screen.getByRole("button", {
      name: "Mato Grosso: 3 clientes",
    });
    fireEvent.click(matoGrosso);

    expect(selecionar).toHaveBeenCalledWith("MT");
    expect(screen.getByText("3 em 1 UF")).toBeInTheDocument();
  });
});
