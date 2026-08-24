import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProcessoForm from "./ProcessoForm";

// Mock auth
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// Mock Supabase client: lista de clientes/parceiros/status
vi.mock("@/integrations/supabase/client", () => {
  const tableHandlers: Record<string, any> = {
    clientes: [
      { id: "c1", nome: "Cliente Original" },
      { id: "c2", nome: "Cliente Trocado" },
    ],
    parceiros: [],
    processo_status: [
      { id: "s1", nome: "Em andamento", tipo_processo: "ambos" },
    ],
  };
  const builder = (table: string) => {
    const data = tableHandlers[table] ?? [];
    const result = { data, error: null };
    return {
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve(result),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "new" }, error: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
  };
  return { supabase: { from: builder } };
});

// Mock toast
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Mock Radix Select com <select> nativo para testabilidade
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const Ctx = (React as any).createContext(null);
  return {
    Select: ({ value, onValueChange, children }: any) =>
      React.createElement(
        Ctx.Provider,
        { value: { value, onValueChange } },
        React.createElement("div", { "data-testid": "select-wrapper" }, children),
      ),
    SelectTrigger: ({ children }: any) => React.createElement("div", null, children),
    SelectValue: ({ placeholder }: any) => React.createElement("span", null, placeholder),
    SelectContent: ({ children }: any) => {
      const ctx = (React as any).useContext(Ctx);
      return React.createElement(
        "select",
        {
          "data-testid": "native-select",
          value: ctx.value ?? "",
          onChange: (e: any) => ctx.onValueChange(e.target.value),
        },
        React.createElement("option", { value: "" }, "—"),
        children,
      );
    },
    SelectItem: ({ value, children }: any) =>
      React.createElement("option", { value }, children),
  };
});

const PREFILL = {
  cliente_id: "c1",
  tipo: "administrativo" as const,
  nb_inss: "1234567890",
  data_der: "2024-05-10",
  area_direito: "previdenciario",
  tipo_acao: "Auxílio por Incapacidade",
  observacoes_internas: "CID: M54.5\nDIB: 2024-01-15",
  status: "Em andamento",
};

function renderForm() {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/processos/novo", state: { prefill: PREFILL } }]}>
      <Routes>
        <Route path="/processos/novo" element={<ProcessoForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Helpers para localizar inputs sem htmlFor explícito
const getDerInput = () =>
  document.querySelector('input[type="date"]') as HTMLInputElement;
const getNbInput = () =>
  screen.getByPlaceholderText("Número do benefício") as HTMLInputElement;
const getTipoAcaoInput = () =>
  screen.getByPlaceholderText(/BPC\/LOAS/i) as HTMLInputElement;
const getObsTextarea = () =>
  screen.getByPlaceholderText(/Anotações privadas/i) as HTMLTextAreaElement;

describe("ProcessoForm — preservação de prefill ao trocar cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mantém todos os campos prefillados ao trocar o cliente", async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText("Cliente Trocado")).toBeInTheDocument();
    });

    expect(getNbInput().value).toBe("1234567890");
    expect(getDerInput().value).toBe("2024-05-10");
    expect(getTipoAcaoInput().value).toBe("Auxílio por Incapacidade");
    expect(getObsTextarea().value).toBe("CID: M54.5\nDIB: 2024-01-15");

    const nativeSelects = screen.getAllByTestId("native-select");
    const clienteSelect = nativeSelects[0] as HTMLSelectElement;
    expect(clienteSelect.value).toBe("c1");

    fireEvent.change(clienteSelect, { target: { value: "c2" } });

    await waitFor(() => {
      expect((screen.getAllByTestId("native-select")[0] as HTMLSelectElement).value).toBe("c2");
    });

    expect(getNbInput().value).toBe("1234567890");
    expect(getDerInput().value).toBe("2024-05-10");
    expect(getTipoAcaoInput().value).toBe("Auxílio por Incapacidade");
    expect(getObsTextarea().value).toBe("CID: M54.5\nDIB: 2024-01-15");
  });

  it("preserva edições manuais feitas após o prefill ao trocar o cliente", async () => {
    renderForm();

    await waitFor(() => {
      expect(screen.getByText("Cliente Trocado")).toBeInTheDocument();
    });

    fireEvent.change(getNbInput(), { target: { value: "9999999999" } });
    fireEvent.change(getObsTextarea(), { target: { value: "Observação editada manualmente" } });

    expect(getNbInput().value).toBe("9999999999");
    expect(getObsTextarea().value).toBe("Observação editada manualmente");

    const clienteSelect = screen.getAllByTestId("native-select")[0] as HTMLSelectElement;
    fireEvent.change(clienteSelect, { target: { value: "c2" } });

    await waitFor(() => {
      expect((screen.getAllByTestId("native-select")[0] as HTMLSelectElement).value).toBe("c2");
    });

    expect(getNbInput().value).toBe("9999999999");
    expect(getObsTextarea().value).toBe("Observação editada manualmente");
    expect(getDerInput().value).toBe("2024-05-10");
    expect(getTipoAcaoInput().value).toBe("Auxílio por Incapacidade");
  });
});
