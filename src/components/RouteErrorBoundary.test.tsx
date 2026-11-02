import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetria", () => ({ registrarErro: vi.fn().mockResolvedValue(undefined) }));

import { RouteErrorBoundary, isFalhaAoBaixarArquivo } from "./RouteErrorBoundary";

function Quebra({ msg }: { msg: string }): never {
  throw new Error(msg);
}

describe("RouteErrorBoundary", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("reconhece falha ao baixar arquivo da página", () => {
    expect(isFalhaAoBaixarArquivo("Unable to preload CSS for /assets/AgentesIA-E80V8dIm.css")).toBe(true);
    expect(isFalhaAoBaixarArquivo("Failed to fetch dynamically imported module: https://x/assets/a.js")).toBe(true);
    expect(isFalhaAoBaixarArquivo("Cannot read properties of undefined")).toBe(false);
  });

  it("recarrega sozinho quando o CSS da página não baixou", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RouteErrorBoundary resetKey="/escritorio">
        <Quebra msg="Unable to preload CSS for /assets/AgentesIA-E80V8dIm.css" />
      </RouteErrorBoundary>,
    );
    expect(await screen.findByText(/Carregando a versão mais recente/)).toBeInTheDocument();
    expect(sessionStorage.getItem("chunk-auto-reload:/escritorio")).not.toBeNull();
  });

  it("mostra a tela de erro se já recarregou há menos de 1 minuto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sessionStorage.setItem("chunk-auto-reload:/escritorio", String(Date.now()));
    render(
      <RouteErrorBoundary resetKey="/escritorio">
        <Quebra msg="Unable to preload CSS for /assets/AgentesIA-E80V8dIm.css" />
      </RouteErrorBoundary>,
    );
    await waitFor(() => expect(screen.getByText("Algo deu errado nesta página")).toBeInTheDocument());
  });
});
