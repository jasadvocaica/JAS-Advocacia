import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import TelegramPainel from "./TelegramPainel";

const responder = (estado: Record<string, unknown>) =>
  invoke.mockImplementation((_f: string, o?: { body?: { acao?: string } }) =>
    Promise.resolve({ data: o?.body?.acao === "gerar_codigo" ? { codigo: "AB12CD34EF" } : estado, error: null }));

describe("Telegram na Sala da Gestora", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sem bot, explica como criar e onde guardar o token (sem pedir o token na tela)", async () => {
    responder({ configurado: false, bot: null, webhook: false, vinculos: [] });
    render(<TelegramPainel />);
    expect(await screen.findByText(/BotFather/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("gera o código de uso único para vincular", async () => {
    responder({ configurado: true, bot: "JasBot", webhook: true, vinculos: [] });
    render(<TelegramPainel />);
    fireEvent.click(await screen.findByRole("button", { name: "Gerar código de vínculo" }));
    expect(await screen.findByText("/vincular AB12CD34EF")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("telegram", { body: { acao: "gerar_codigo" } });
  });

  it("liga o bot e desvincula um Telegram", async () => {
    responder({ configurado: true, bot: "JasBot", webhook: false,
      vinculos: [{ chat_id: 111, nome: "Juliana", criado_em: "2026-11-02T12:00:00Z" }] });
    render(<TelegramPainel />);
    expect(await screen.findByRole("button", { name: "Gerar código de vínculo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ligar o bot" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("telegram", { body: { acao: "configurar_webhook" } }));
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("telegram", { body: { acao: "desvincular", chat_id: 111 } }));
  });
});
