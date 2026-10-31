/**
 * Escritório virtual — transforma equipe, ponto do dia e itens da
 * Controladoria nas pessoas que aparecem no escritório isométrico.
 * Funções puras: sem Supabase, fáceis de testar.
 */

export type SalaEscritorio = "diretoria" | "operacional" | "comercial" | "diligencias" | "marketing" | "recepcao";
export type Presenca = "trabalhando" | "almoco" | "fora";

export interface MembroBase {
  id: string;
  nome: string;
  cargo: string;
  user_id: string;
}

export interface RegistroPontoDia {
  membro_id: string;
  entrada: string | null;
  saida_almoco: string | null;
  retorno_almoco: string | null;
  saida: string | null;
}

export interface ItemResumo {
  id: string;
  titulo: string;
  tipo: string;
  data_vencimento: string;
  responsavel_id: string | null;
}

export interface InfoPrazos {
  atrasados: number;
  hoje: number;
  semana: number;
  itens: { titulo: string; tipo: string; data: string; atrasado: boolean }[];
}

export interface PessoaEscritorio {
  id: string;
  user_id: string;
  email: string | null;
  nome: string;
  cargo: string;
  sala: SalaEscritorio;
  dona: boolean;
  presenca: Presenca;
  status: string;
  fala: string;
  info: InfoPrazos;
}

/** Sala fixa por nome (tem prioridade sobre o cargo). */
export const SALA_POR_NOME: Record<string, SalaEscritorio> = {
  valeska: "diligencias",
};

const CARGOS: Record<string, string> = {
  gestor: "Gestora",
  socio: "Sócia",
  advogado: "Advogado(a)",
  estagiario: "Estagiário(a)",
  administrativo: "Administrativo",
  outro: "Equipe",
};

const TIPOS: Record<string, string> = {
  prazo_fatal: "Prazo fatal",
  prazo_processual: "Prazo processual",
  audiencia: "Audiência",
  pericia: "Perícia",
  conciliacao: "Conciliação",
  diligencia: "Diligência",
  reuniao: "Reunião",
  tarefa: "Tarefa",
};

export function salaDoMembro(m: Pick<MembroBase, "nome" | "cargo">): SalaEscritorio {
  const nome = m.nome.toLowerCase();
  for (const [chave, sala] of Object.entries(SALA_POR_NOME)) if (nome.includes(chave)) return sala;
  if (m.cargo === "gestor" || m.cargo === "socio") return "diretoria";
  if (m.cargo === "administrativo") return "recepcao";
  return "operacional";
}

const hora = (t: string | null) => (t ?? "").slice(0, 5);

export function presencaDoPonto(reg: RegistroPontoDia | undefined): { presenca: Presenca; status: string } {
  if (!reg?.entrada) return { presenca: "fora", status: "Sem ponto hoje" };
  if (reg.saida) return { presenca: "fora", status: `Encerrou às ${hora(reg.saida)}` };
  if (reg.saida_almoco && !reg.retorno_almoco) return { presenca: "almoco", status: `Almoço desde ${hora(reg.saida_almoco)}` };
  return { presenca: "trabalhando", status: `Trabalhando · entrada ${hora(reg.entrada)}` };
}

/** Datas em "yyyy-MM-dd" (horário local). */
export function resumoItens(itens: ItemResumo[], hojeISO: string, limite = 6): InfoPrazos {
  const fim = new Date(`${hojeISO}T00:00:00`);
  fim.setDate(fim.getDate() + 7);
  const fimISO = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;
  const ordenados = [...itens].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  let atrasados = 0, hoje = 0, semana = 0;
  const lista: InfoPrazos["itens"] = [];
  for (const i of ordenados) {
    const d = i.data_vencimento.slice(0, 10);
    if (d > fimISO) continue;
    if (d < hojeISO) atrasados++;
    else if (d === hojeISO) hoje++;
    else semana++;
    if (lista.length < limite) {
      lista.push({
        titulo: i.titulo,
        tipo: TIPOS[i.tipo] ?? i.tipo.replace(/_/g, " "),
        data: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
        atrasado: d < hojeISO,
      });
    }
  }
  return { atrasados, hoje, semana, itens: lista };
}

export function falaDoResumo(i: InfoPrazos): string {
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  if (i.atrasados) return `${plural(i.atrasados, "prazo atrasado", "prazos atrasados")}!`;
  if (i.hoje) return `${plural(i.hoje, "item vence", "itens vencem")} hoje`;
  if (i.semana) return `${plural(i.semana, "item", "itens")} na semana`;
  return "Tudo em dia ✓";
}

export function montarEquipe(params: {
  membros: MembroBase[];
  ponto: RegistroPontoDia[];
  itens: ItemResumo[];
  emails: Record<string, string>;
  gestor: { id: string; nome: string } | null;
  hojeISO: string;
}): PessoaEscritorio[] {
  const { membros, ponto, itens, emails, gestor, hojeISO } = params;
  const pontoPorMembro = new Map(ponto.map((r) => [r.membro_id, r]));
  const itensPorUsuario = new Map<string, ItemResumo[]>();
  for (const i of itens) {
    if (!i.responsavel_id) continue;
    const l = itensPorUsuario.get(i.responsavel_id) ?? [];
    l.push(i);
    itensPorUsuario.set(i.responsavel_id, l);
  }

  const pessoas = membros.map<PessoaEscritorio>((m) => {
    const dona = !!gestor && m.user_id === gestor.id;
    const info = resumoItens(itensPorUsuario.get(m.user_id) ?? [], hojeISO);
    const p = dona ? { presenca: "trabalhando" as Presenca, status: "Na diretoria" } : presencaDoPonto(pontoPorMembro.get(m.id));
    return {
      id: m.id,
      user_id: m.user_id,
      email: emails[m.user_id] ?? null,
      nome: m.nome,
      cargo: CARGOS[m.cargo] ?? m.cargo,
      sala: dona ? "diretoria" : salaDoMembro(m),
      dona,
      ...p,
      fala: falaDoResumo(info),
      info,
    };
  });

  if (gestor && !pessoas.some((p) => p.dona)) {
    const info = resumoItens(itensPorUsuario.get(gestor.id) ?? [], hojeISO);
    pessoas.unshift({
      id: `gestora-${gestor.id}`,
      user_id: gestor.id,
      email: emails[gestor.id] ?? null,
      nome: gestor.nome,
      cargo: "Sócia-fundadora",
      sala: "diretoria",
      dona: true,
      presenca: "trabalhando",
      status: "Na diretoria",
      fala: falaDoResumo(info),
      info,
    });
  }
  return pessoas.sort((a, b) => Number(b.dona) - Number(a.dona) || a.nome.localeCompare(b.nome, "pt-BR"));
}
