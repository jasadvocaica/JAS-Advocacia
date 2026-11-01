import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Agenda from "./Agenda";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: mocks.from, functions: { invoke: mocks.invoke },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn(),
} }));

describe("Agenda interna da Controladoria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    const query = {
      select: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [{
        id: "00000000-0000-0000-0000-000000000001", titulo: "Conferir publicação DJEN",
        tipo: "intimacao", status: "pendente", origem: "pje_publicacao",
        data_vencimento: "2026-11-03T22:00:00Z", data_prazo_judicial: null, prazo_conferido: false,
      }], error: null }),
    };
    mocks.from.mockReturnValue(query);
  });
  afterEach(() => vi.useRealTimers());

  it("exibe a atividade mesmo sem credencial Google no servidor", async () => {
    render(<Agenda />);
    await waitFor(() => expect(screen.getAllByText(/Conferir publicação DJEN/).length).toBeGreaterThan(0));
    expect(mocks.from).toHaveBeenCalledWith("controladoria_itens");
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Agenda Google consolidada do escritório")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir" })).not.toBeInTheDocument();
  });
  it("mantém acesso à agenda Google em uma visualização separada", async () => {
    render(<Agenda />);
    await waitFor(() => expect(mocks.from).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Agenda Google" }));
    expect(screen.getByTitle("Agenda Google consolidada do escritório")).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
