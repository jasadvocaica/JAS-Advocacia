import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { AgenteIA } from "../../hooks/useAgentesIA";
import { colunaDaMissao, progresso, textoAtividade, type Missao, type Painel } from "./motor";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import CentralMissoes from "./CentralMissoes";
import SalaGestora from "./SalaGestora";

const tarefa = (estado: Missao["tarefas"][number]["estado"], agente = "Rafael") => ({
  id: crypto.randomUUID(), titulo: "Ler prazos", estado, agente_id: agente, agente, profundidade: 0,
  tentativas: 1, resumo: null, erro: null, concluida_em: null,
});
const missao = (p: Partial<Missao>): Missao => ({
  id: crypto.randomUUID(), titulo: "Conferir prazos", objetivo: "Liste o que vence", estado: "aberta", origem: "central",
  prioridade: 3, criada_em: "2026-11-01T12:00:00Z", encerrada_em: null, aprovacoes_abertas: 0, tarefas: [], ...p,
});
const painel = (missoes: Missao[], motor_ligado = false): Painel => ({
  motor_ligado,
  orcamento: { teto_absoluto_usd: 20, orcamento_mensal_usd: 10, extras_mes_usd: 0, gasto_mes_usd: 1.5, gasto_dia_usd: 0.05,
    limite_dia_usd: 0.33, media_7d_usd: 0.2, dias_restantes: 30, tarefas_na_fila: 1 },
  missoes,
  atividades: [{ id: 1, acao: "tarefa.delegada", ator_tipo: "agente", ator: "Manu", criado_em: "2026-11-01T12:05:00Z" }],
});
const agentes = [
  { id: "a1", slug: "manu", nome: "Manu", ativo: true, executor: "analista_operacional" },
  { id: "a2", slug: "rafael", nome: "Rafael", ativo: true, executor: "analista_operacional" },
  { id: "a3", slug: "monitor-djen", nome: "Monitor DJEN", ativo: true, executor: null },
] as AgenteIA[];
const gatilhos = { djen_automatico: false, gestora_id: null, djen_max_dia: 20, na_fila: 0, criadas_hoje: 0 };

beforeEach(() => invoke.mockReset());

describe("regras do quadro de missões", () => {
  it("coloca cada missão na coluna do estado real", () => {
    expect(colunaDaMissao(missao({ tarefas: [tarefa("executando")] }))).toBe("execucao");
    expect(colunaDaMissao(missao({ tarefas: [tarefa("pendente")] }))).toBe("fila");
    expect(colunaDaMissao(missao({ tarefas: [tarefa("concluida")], aprovacoes_abertas: 1 }))).toBe("aprovacao");
    expect(colunaDaMissao(missao({ estado: "concluida" }))).toBe("concluida");
    expect(colunaDaMissao(missao({ estado: "falhou" }))).toBe("falhou");
  });
  it("calcula o progresso pelas tarefas encerradas", () => {
    expect(progresso(missao({ tarefas: [tarefa("concluida"), tarefa("executando")] }))).toBe(50);
    expect(progresso(missao({}))).toBe(0);
  });
  it("descreve a atividade sem inventar autor", () => {
    expect(textoAtividade({ id: 1, acao: "tarefa.delegada", ator_tipo: "agente", ator: "Manu", criado_em: "" })).toBe("Manu delegou uma tarefa");
    expect(textoAtividade({ id: 2, acao: "aprovacao.aprovada", ator_tipo: "usuario", ator: null, criado_em: "" })).toBe("Gestão aprovou um pedido");
  });
});

describe("Central de Missões", () => {
  it("mostra as missões nas colunas e avisa quando o motor está desligado", async () => {
    invoke.mockResolvedValue({ data: painel([missao({ titulo: "Prazos da semana", tarefas: [tarefa("executando")] })]), error: null });
    render(<CentralMissoes agentes={agentes} />);
    const coluna = await screen.findByLabelText("Em execução");
    expect(within(coluna).getByText("Prazos da semana")).toBeInTheDocument();
    expect(screen.getByText(/Motor desligado/)).toBeInTheDocument();
    expect(screen.getByText("Manu delegou uma tarefa")).toBeInTheDocument();
  });

  it("cria a missão para a Manu por padrão", async () => {
    invoke.mockResolvedValue({ data: painel([]), error: null });
    render(<CentralMissoes agentes={agentes} />);
    fireEvent.click(await screen.findByRole("button", { name: /Nova missão/ }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Relatório da semana" } });
    fireEvent.change(screen.getByLabelText("O que precisa ser feito"), { target: { value: "Resumir os prazos" } });
    invoke.mockResolvedValueOnce({ data: { ok: true, missao_id: "m1" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: /Criar missão/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("motor-missoes", {
        body: expect.objectContaining({ acao: "criar_missao", titulo: "Relatório da semana", agente_id: "a1" }),
      }),
    );
  });

  it("explica quando o motor ainda não está instalado", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "Function not found" } });
    render(<CentralMissoes agentes={agentes} />);
    expect(await screen.findByText(/precisa estar instalado/)).toBeInTheDocument();
  });
});

describe("Sala da Gestora", () => {
  const pedido = {
    id: "p1", tipo: "acao", origem: "agente", agente: "Rafael", ferramenta: "criar_item_controladoria", modulo: "controladoria",
    resumo: "Criar na Controladoria: Conferir prazo", riscos: "Cria uma atividade visível.", escopo_hash: "h1",
    parametros: { titulo: "Conferir prazo", data_vencimento: "2026-11-10", prioridade: "alta" },
    valida_ate: "2026-11-08T12:00:00Z", criada_em: "2026-11-01T12:00:00Z",
  };
  const responder = (aprovacoes: unknown[]) =>
    invoke.mockImplementation((_f: string, opcoes?: { body?: { acao?: string } }) => {
      const acao = opcoes?.body?.acao;
      const data = acao === "painel" ? painel([]) : acao === "aprovacoes" ? { aprovacoes }
        : acao === "gatilhos" ? gatilhos
        : acao === "ajustar_gatilhos" ? { ...gatilhos, djen_automatico: true, gestora_id: "a1", djen_max_dia: 10 }
        : { ok: true };
      return Promise.resolve({ data, error: null });
    });

  it("aprova com o escopo exato que a pessoa viu", async () => {
    responder([pedido]);
    render(<SalaGestora agentes={agentes} execucoes={[]} mensagens={[]} />);
    expect(await screen.findByText("Criar na Controladoria: Conferir prazo")).toBeInTheDocument();
    expect(screen.getByText("10/11/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e executar" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("motor-missoes", { body: { acao: "decidir", id: "p1", aprovar: true, hash: "h1" } }),
    );
  });

  it("mostra as opções simuladas de orçamento sem passar do teto", async () => {
    responder([{
      ...pedido, id: "o1", tipo: "orcamento", resumo: "O dia chegou a 80% do limite com tarefas na fila.",
      parametros: { opcoes: [{ tipo: "mensal", valor_usd: 15, descricao: "Mensal para US$ 15,00", limite_dia_previsto_usd: 0.5, mes_fecharia_em_usd: 12 }] },
    }]);
    render(<SalaGestora agentes={agentes} execucoes={[]} mensagens={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: /Mensal para US\$ 15,00/ }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("motor-missoes", { body: { acao: "decidir_orcamento", id: "o1", opcao: 0 } }),
    );
    expect(screen.getByText(/Teto absoluto US\$ 20,00/)).toBeInTheDocument();
  });

  it("só liga o motor depois de confirmar", async () => {
    responder([]);
    render(<SalaGestora agentes={agentes} execucoes={[]} mensagens={[]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ligar" }));
    expect(invoke).not.toHaveBeenCalledWith("motor-missoes", { body: { acao: "ajustar", ligado: true } });
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Ligar" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("motor-missoes", { body: { acao: "ajustar", ligado: true } }));
  });

  it("liga as missões automáticas do DJEN para a Manu, com teto diário", async () => {
    responder([]);
    render(<SalaGestora agentes={agentes} execucoes={[]} mensagens={[]} />);
    const ligar = await screen.findByRole("button", { name: "Ligar missões automáticas do DJEN" });
    const gestora = screen.getByLabelText("Gestora") as HTMLSelectElement;
    expect(Array.from(gestora.options).map((o) => o.text)).toEqual(["Manu", "Rafael"]);
    expect(gestora.value).toBe("a1");
    fireEvent.change(screen.getByLabelText("Máximo por dia"), { target: { value: "10" } });
    fireEvent.click(ligar);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("motor-missoes", {
        body: { acao: "ajustar_gatilhos", djen_automatico: true, gestora_id: "a1", djen_max_dia: 10 },
      }),
    );
    expect(await screen.findByRole("button", { name: "Desligar missões automáticas do DJEN" })).toBeInTheDocument();
  });
});
