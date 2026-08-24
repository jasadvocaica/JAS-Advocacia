/**
 * Lógica pura do Painel da Produção Jurídica — V1.
 *
 * Regras de escopo desta fase:
 *  - A Controladoria (`controladoria_itens` + máquina de estados canônica) é a
 *    ÚNICA fonte. Nada de workflow, kanban ou tabela paralela.
 *  - Somente itens atribuídos ao usuário logado (mesa de trabalho, não gestão).
 *  - Nenhum dado financeiro, de honorários ou de mensageria é lido aqui.
 *  - Nenhum nome, e-mail ou UUID fixo: responsáveis vêm sempre do dado/config.
 */

import { etapaAtualDe, type EtapaWorkflow } from "@/pages/controladoria/workflow";

export interface ItemProducao {
  id: string;
  titulo: string;
  descricao?: string | null;
  tipo?: string | null;
  status: string;
  prioridade: string | null;
  origem?: string | null;
  data_vencimento: string | null;
  criado_em: string | null;
  etapa_workflow: string | null;
  etapa_atualizada_em?: string | null;
  exige_revisao?: boolean | null;
  responsavel_id: string | null;
  executor_id: string | null;
  revisor_id: string | null;
  corretor_id: string | null;
  protocolador_id: string | null;
  criado_por?: string | null;
  cliente_id: string | null;
  processo_id: string | null;
  sla_entrada_em?: string | null;
  sla_pausado_em?: string | null;
  sla_pausa_motivo?: string | null;
  sla_minutos_pausados?: number | null;
  documentos_recebidos?: string | null;
  comentario_revisao?: string | null;
  anotacoes_revisao?: string | null;
  cliente_nome?: string | null;
  processo_cnj?: string | null;
}

export type Urgencia = "vencido" | "hoje" | "proximo" | "sem_prazo";

export const STATUS_ENCERRADOS = ["concluido", "cancelado"];

/** Item ainda operacional (não encerrado nem finalizado no fluxo). */
export function itemAtivo(i: ItemProducao): boolean {
  return !STATUS_ENCERRADOS.includes(i.status) && etapaAtualDe(i) !== "finalizado";
}

/** O item está atribuído ao usuário em qualquer papel do fluxo. */
export function ehMeu(i: ItemProducao, userId: string): boolean {
  if (!userId) return false;
  return [i.responsavel_id, i.executor_id, i.revisor_id, i.corretor_id, i.protocolador_id].includes(
    userId,
  );
}

/** Responsável pela etapa corrente, conforme a máquina de estados. */
export function responsavelDaEtapa(i: ItemProducao): string | null {
  switch (etapaAtualDe(i)) {
    case "execucao":
      return i.executor_id ?? i.responsavel_id;
    case "correcao":
      return i.corretor_id ?? i.responsavel_id;
    case "revisao":
      return i.revisor_id ?? i.responsavel_id;
    case "protocolo":
      return i.protocolador_id ?? i.responsavel_id;
    default:
      return i.responsavel_id;
  }
}

/** É a vez do usuário agir nesta etapa. */
export function minhaVez(i: ItemProducao, userId: string): boolean {
  return !!userId && responsavelDaEtapa(i) === userId;
}

function diaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Urgência pelo prazo já existente (`data_vencimento`) — sem cálculo paralelo. */
export function classificarUrgencia(i: ItemProducao, agora = new Date()): Urgencia {
  if (!i.data_vencimento) return "sem_prazo";
  const venc = i.data_vencimento.slice(0, 10);
  const hoje = diaISO(agora);
  if (venc < hoje) return "vencido";
  if (venc === hoje) return "hoje";
  return "proximo";
}

export function aguardandoDocumentos(i: ItemProducao): boolean {
  return !!i.sla_pausado_em;
}

const PESO_PRIORIDADE: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

/** Ordem canônica: vencido → prazo próximo → ajustes → prioridade → antiguidade. */
export function ordenar(itens: ItemProducao[], agora = new Date()): ItemProducao[] {
  const pesoUrg: Record<Urgencia, number> = { vencido: 0, hoje: 1, proximo: 2, sem_prazo: 3 };
  return [...itens].sort((a, b) => {
    const ua = pesoUrg[classificarUrgencia(a, agora)];
    const ub = pesoUrg[classificarUrgencia(b, agora)];
    if (ua !== ub) return ua - ub;
    const aj = (x: ItemProducao) => (etapaAtualDe(x) === "correcao" ? 0 : 1);
    if (aj(a) !== aj(b)) return aj(a) - aj(b);
    const pa = PESO_PRIORIDADE[a.prioridade ?? "media"] ?? 2;
    const pb = PESO_PRIORIDADE[b.prioridade ?? "media"] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.criado_em ?? "").localeCompare(b.criado_em ?? "");
  });
}

export interface FilasProducao {
  novos: ItemProducao[];
  emProducao: ItemProducao[];
  aguardandoDocumentos: ItemProducao[];
  ajustes: ItemProducao[];
  aguardandoProtocolo: ItemProducao[];
  minhas: ItemProducao[];
}

/**
 * Filas da mesa de trabalho. Todas partem de `etapa_workflow` (fonte única) e
 * do vínculo real do usuário — nunca de nome ou papel presumido.
 */
export function filas(itens: ItemProducao[], userId: string, agora = new Date()): FilasProducao {
  const meus = itens.filter((i) => itemAtivo(i) && ehMeu(i, userId));
  const naEtapa = (e: EtapaWorkflow) => meus.filter((i) => etapaAtualDe(i) === e && minhaVez(i, userId));

  const producao = [...naEtapa("execucao")];
  const ajustes = naEtapa("correcao").filter((i) => !aguardandoDocumentos(i));
  const espera = [...naEtapa("execucao"), ...naEtapa("correcao")].filter(aguardandoDocumentos);

  return {
    novos: ordenar(naEtapa("criacao"), agora),
    emProducao: ordenar(producao.filter((i) => !aguardandoDocumentos(i)), agora),
    aguardandoDocumentos: ordenar(espera, agora),
    ajustes: ordenar(ajustes, agora),
    // Só entra na fila de protocolo quem é o protocolador do item.
    aguardandoProtocolo: ordenar(
      meus.filter((i) => etapaAtualDe(i) === "protocolo" && i.protocolador_id === userId),
      agora,
    ),
    minhas: ordenar(meus, agora),
  };
}

/** "Precisa de mim agora": vencidos, hoje, ajustes, novos, protocolos e o resto por prazo. */
export function precisaDeMimAgora(f: FilasProducao, agora = new Date()): ItemProducao[] {
  const candidatos = [
    ...f.ajustes,
    ...f.novos,
    ...f.aguardandoProtocolo,
    ...f.emProducao,
  ];
  const vistos = new Set<string>();
  const unicos = candidatos.filter((i) => (vistos.has(i.id) ? false : (vistos.add(i.id), true)));
  const criticos = unicos.filter((i) => {
    const u = classificarUrgencia(i, agora);
    return u === "vencido" || u === "hoje" || etapaAtualDe(i) === "correcao";
  });
  const resto = unicos.filter((i) => !criticos.includes(i));
  return [...ordenar(criticos, agora), ...ordenar(resto, agora)];
}

export interface ResumoProducao {
  novos: number;
  emProducao: number;
  aguardandoDocumentos: number;
  ajustes: number;
  aguardandoProtocolo: number;
  atrasados: number;
}

export function resumo(f: FilasProducao, agora = new Date()): ResumoProducao {
  return {
    novos: f.novos.length,
    emProducao: f.emProducao.length,
    aguardandoDocumentos: f.aguardandoDocumentos.length,
    ajustes: f.ajustes.length,
    aguardandoProtocolo: f.aguardandoProtocolo.length,
    atrasados: f.minhas.filter((i) => classificarUrgencia(i, agora) === "vencido").length,
  };
}

/** Agrupamento das tarefas do usuário: vencidas / hoje / próximas. */
export function minhasTarefas(f: FilasProducao, agora = new Date()) {
  return {
    vencidas: f.minhas.filter((i) => classificarUrgencia(i, agora) === "vencido"),
    hoje: f.minhas.filter((i) => classificarUrgencia(i, agora) === "hoje"),
    proximas: f.minhas.filter((i) => ["proximo", "sem_prazo"].includes(classificarUrgencia(i, agora))),
  };
}

export function horasDesde(iso: string | null | undefined, agora = new Date()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 36e5));
}

export function diasDesde(iso: string | null | undefined, agora = new Date()): number | null {
  const h = horasDesde(iso, agora);
  return h === null ? null : Math.floor(h / 24);
}

/**
 * SLA operacional de referência da produção: 7 dias úteis a partir da entrada.
 * O período aguardando documentos NÃO deve contar — os dados da pausa já são
 * preservados (`sla_pausado_em`, `sla_minutos_pausados`), mas o desconto ainda
 * não está homologado, então o indicador é devolvido como `preparado`.
 */
export const SLA_PRODUCAO_DIAS_UTEIS = 7;

export interface SlaReferencia {
  preparado: true;
  diasCorridos: number | null;
  minutosPausados: number;
  emPausa: boolean;
}

export function slaReferencia(i: ItemProducao, agora = new Date()): SlaReferencia {
  return {
    preparado: true,
    diasCorridos: diasDesde(i.sla_entrada_em ?? i.criado_em, agora),
    minutosPausados: i.sla_minutos_pausados ?? 0,
    emPausa: aguardandoDocumentos(i),
  };
}

/** Acesso ao painel: qualquer usuário interno com item atribuído ou gestor. */
export function podeVerPainelProducao(params: {
  userId?: string | null;
  isGestor?: boolean;
  temItens: boolean;
}): boolean {
  if (!params.userId) return false;
  return !!params.isGestor || params.temItens;
}

export interface RevisorConfigurado {
  configurado: boolean;
  user_id: string | null;
  nome: string | null;
  ativo: boolean;
}

/** Revisor só pode vir da configuração canônica; sem ela, nada é atribuído. */
export function revisorParaAtribuir(r?: RevisorConfigurado | null): string | null {
  if (!r?.configurado || !r.ativo || !r.user_id) return null;
  return r.user_id;
}
