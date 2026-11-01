import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AgentesIA from "./AgentesIA";
vi.mock("./hooks/useAgentesIA", () => ({
  chamarEscritorio: vi.fn(),
  LABEL_STATUS_EXECUCAO: {},
  useAgentesIA: () => ({
    agentes: [],
    execucoes: [],
    consultas: [],
    tokens: { limite: 50000, usados: 0, reservados: 0, disponiveis: 50000 },
    atualizadoEm: null,
    passos: [],
    mensagens: [],
    operacaoDjen: null,
    pendentesAprovacao: [],
    loading: false,
    error: null,
    recarregar: vi.fn(),
    disparar: vi.fn(),
    decidir: vi.fn(),
  }),
}));
const abrir = (url = "/escritorio/planta") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/escritorio/*" element={<AgentesIA />} />
      </Routes>
    </MemoryRouter>,
  );
describe("Áreas independentes do escritório", () => {
  it("abre a planta sem misturar chat e painéis de consumo", () => {
    abrir();
    expect(
      screen.getByRole("group", { name: /Planta isométrica/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(screen.queryByText("Consumo OpenAI hoje")).not.toBeInTheDocument();
  });
  it("navega para conversas sem manter o mapa na tela", () => {
    abrir();
    fireEvent.click(screen.getByRole("link", { name: "Conversas" }));
    expect(screen.getByRole("log")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /Planta isométrica/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Conversas" })).toBeInTheDocument();
  });
  it("abre operação diretamente por URL e mantém os diagnósticos nessa área", () => {
    abrir("/escritorio/operacao");
    expect(screen.getByText("Consumo OpenAI hoje")).toBeInTheDocument();
    expect(screen.queryByRole("log")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /Planta isométrica/ }),
    ).not.toBeInTheDocument();
  });
  it("oferece entregas sem pendências e retorno explícito ao JAS", () => {
    abrir("/escritorio/entregas");
    expect(screen.getByText("Entregas em dia")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar ao sistema JAS" }),
    ).toHaveAttribute("href", "/");
  });
  it("abre a contratação global mesmo fora da planta", () => {
    abrir("/escritorio/chat");
    fireEvent.click(screen.getByRole("button", { name: "Contratar agente" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome do agente")).toBeInTheDocument();
  });
});
