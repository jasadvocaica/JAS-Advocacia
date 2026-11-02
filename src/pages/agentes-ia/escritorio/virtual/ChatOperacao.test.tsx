import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgenteIA } from "../../hooks/useAgentesIA";

const chamarEscritorio = vi.fn();
vi.mock("../../hooks/useAgentesIA", () => ({ chamarEscritorio: (...a: unknown[]) => chamarEscritorio(...a) }));

import ChatOperacao from "./ChatOperacao";

const agente = (p: Partial<AgenteIA>): AgenteIA => ({
  id: "a", slug: "a", nome: "A", descricao: null, area: "gestao", webhook_url: null,
  exige_aprovacao: true, ativo: true, ordem: 1, executor: "analista_operacional", ...p,
});
const manu = agente({ id: "manu", nome: "Manu" });
const djen = agente({ id: "djen", nome: "Monitor DJEN", executor: "monitor_djen" });

function montar(agentes: AgenteIA[], recarregar = vi.fn()) {
  render(
    <MemoryRouter>
      <ChatOperacao agentes={agentes} execucoes={[]} mensagens={[]} fechar={() => {}} recarregar={recarregar} />
    </MemoryRouter>,
  );
  return recarregar;
}

describe("ChatOperacao · conversar com os agentes", () => {
  beforeEach(() => {
    chamarEscritorio.mockReset();
  });

  it("lista só os agentes que conversam e envia a mensagem pelo servidor", async () => {
    let responder!: (v: unknown) => void;
    chamarEscritorio.mockImplementation(() => new Promise((r) => { responder = r; }));
    const recarregar = montar([djen, manu]);
    const select = screen.getByRole("combobox");
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(["Manu"]);
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "Manu, como estão os prazos?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    expect(await screen.findByText("Manu está respondendo…")).toBeInTheDocument();
    responder({ ok: true });
    await waitFor(() => expect(recarregar).toHaveBeenCalled());
    expect(chamarEscritorio).toHaveBeenCalledWith({ acao: "conversar", agente_id: "manu", texto: "Manu, como estão os prazos?" });
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("");
  });

  it("Enter envia e mostra o erro do servidor sem perder o texto", async () => {
    chamarEscritorio.mockImplementation(async () => { throw new Error("Limite de uso atingido"); });
    montar([manu]);
    const campo = screen.getByLabelText("Mensagem");
    fireEvent.change(campo, { target: { value: "Oi" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(await screen.findByRole("alert")).toHaveTextContent("Limite de uso atingido");
    expect((campo as HTMLTextAreaElement).value).toBe("Oi");
  });

  it("sem agente que converse, orienta a criar um", () => {
    montar([djen]);
    expect(screen.queryByLabelText("Mensagem")).not.toBeInTheDocument();
    expect(screen.getByText(/crie um agente/i)).toBeInTheDocument();
  });
});
