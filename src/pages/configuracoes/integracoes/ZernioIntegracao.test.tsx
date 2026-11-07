import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn().mockResolvedValue({data:[],error:null}), functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ZernioIntegracao from "./ZernioIntegracao";

const conexao = (p: Record<string, unknown> = {}) => ({
  estado: "aguardando", tem_chave: false, chave_mascara: null, chave_salva_em: null, ultimo_teste_em: null, ultimo_erro: null,
  addon_analytics: null, addon_inbox: null, addon_ads: null, coleta_ativa: false, analises_ativas: false, sync_automatico: false,
  intervalo_minutos: 360, acoes_externas_com_aprovacao: false, retencao_dias: 365, retencao_mensagens_dias: 90,
  ultima_sync_em: null, ultima_sync_ok_em: null, ...p,
});
const visao = (c = conexao(), admin = true) => ({
  conexao: c, contas: [], totais: { publicacoes: 0, comentarios: 0, conversas: 0, campanhas: 0, gasto_anuncios: null }, job_ativo: null,
  pode_administrar: admin,
});
const tela = () => render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ZernioIntegracao /></MemoryRouter></QueryClientProvider>);

beforeEach(() => invoke.mockReset());

describe("Integração Zernio", () => {
  it("sem chave mostra 'Aguardando configuração da API' e não finge dados", async () => {
    invoke.mockResolvedValue({ data: visao(), error: null });
    tela();
    expect((await screen.findAllByText(/Aguardando configuração da API/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Sincronizar agora/ })).not.toBeInTheDocument();
  });

  it("salva a chave pela tela e limpa o campo (a chave não volta)", async () => {
    invoke.mockResolvedValue({ data: visao(), error: null });
    tela();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Configurações" }));
    fireEvent.click(screen.getByRole("tab", { name: "Configurações" }));
    const campo = await screen.findByLabelText("Chave de API");
    const chave = `sk_${"b2".repeat(32)}`;
    fireEvent.change(campo, { target: { value: chave } });
    invoke.mockResolvedValueOnce({ data: { ok: true, mascara: "sk_b2b2…b2b2", teste: { ok: true, contas: 2 } }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Salvar credencial/ }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("zernio", { body: { acao: "salvar_chave", chave } }));
    await waitFor(() => expect((screen.getByLabelText("Chave de API") as HTMLInputElement).value).toBe(""));
  });

  it("mostra a chave só mascarada e as travas de ações automáticas", async () => {
    invoke.mockResolvedValue({ data: visao(conexao({ estado: "conectado", tem_chave: true, chave_mascara: "sk_b2b2…b2b2" })), error: null });
    tela();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Configurações" }));
    fireEvent.click(screen.getByRole("tab", { name: "Configurações" }));
    expect(await screen.findByText(/sk_b2b2…b2b2/)).toBeInTheDocument();
    expect(screen.getAllByText("Desativado")).toHaveLength(3);
  });

  it("quem não administra vê os dados, mas não a credencial nem os botões", async () => {
    invoke.mockResolvedValue({ data: visao(conexao({ estado: "conectado", tem_chave: true, chave_mascara: "sk_b2b2…b2b2" }), false), error: null });
    tela();
    expect(await screen.findByText("Conectado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Testar conexão/ })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Configurações" }));
    fireEvent.click(screen.getByRole("tab", { name: "Configurações" }));
    expect(await screen.findByText("Somente leitura")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Chave de API|Substituir chave/)).not.toBeInTheDocument();
  });

  it("chave recusada aparece como erro de autenticação", async () => {
    invoke.mockResolvedValue({ data: visao(conexao({ estado: "erro_autenticacao", tem_chave: true, ultimo_erro: "Chave de API inválida, revogada ou expirada." })), error: null });
    tela();
    expect(await screen.findByText("Chave recusada pelo Zernio")).toBeInTheDocument();
    expect(screen.getByText(/inválida, revogada ou expirada/)).toBeInTheDocument();
  });
});
