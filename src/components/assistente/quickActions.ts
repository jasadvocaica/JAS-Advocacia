export interface QuickAction {
  label: string;
  prompt: string;
  /** Módulos onde a ação faz sentido. Vazio = sempre. */
  modulos?: string[];
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "📋 Resumir este processo",
    prompt: "Faça um resumo executivo do processo aberto agora: partes, status, últimas movimentações e próximos passos.",
    modulos: ["processos"],
  },
  {
    label: "👤 Resumir este cliente",
    prompt: "Resuma o cliente aberto agora: dados de contato, processos vinculados, situação financeira e pendências.",
    modulos: ["clientes"],
  },
  {
    label: "⏰ Prazos urgentes",
    prompt: "Liste todos os prazos e tarefas urgentes dos próximos 7 dias por ordem de prioridade.",
  },
  {
    label: "💰 Financeiro do mês",
    prompt: "Resuma o financeiro do mês atual: parcelas em aberto, valor a receber e atrasos.",
  },
  {
    label: "📊 Status dos casos",
    prompt: "Quais processos precisam de atenção urgente agora?",
  },
  {
    label: "📝 Rascunhar petição",
    prompt: "Preciso redigir uma petição. Pergunte os dados necessários antes de redigir.",
  },
];

export function quickActionsParaModulo(modulo: string): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => !a.modulos || a.modulos.includes(modulo));
}
