import type { AgenteIA } from "../hooks/useAgentesIA";
export const SALAS = [
  {
    id: "diretoria",
    nome: "Diretoria",
    detalhe: "Juliana Araújo · Direção do escritório",
    x: 0,
    y: 0,
    piso: "#d8ccae",
    link: "/dashboard-gestor",
    acao: "Abrir painel de gestão",
  },
  {
    id: "operacional",
    nome: "Operacional",
    detalhe: "DJEN, Controladoria e produção jurídica",
    x: 8,
    y: 0,
    piso: "#e8e5df",
    link: "/controladoria",
    acao: "Abrir Controladoria",
  },
  {
    id: "comercial",
    nome: "Comercial",
    detalhe: "Contratações e relacionamento comercial",
    x: 16,
    y: 0,
    piso: "#deded5",
    link: "/comercial/contratacoes",
    acao: "Abrir contratações",
  },
  {
    id: "reuniao",
    nome: "Sala de reuniões",
    detalhe: "Entregas dos agentes e decisões da diretoria",
    x: 0,
    y: 8,
    piso: "#e4ddcd",
    link: "/escritorio/entregas",
    acao: "Ver entregas para revisão",
  },
  {
    id: "diligencias",
    nome: "Diligências",
    detalhe: "Acompanhamento de diligências do escritório",
    x: 8,
    y: 8,
    piso: "#e4e7e6",
    link: "/diligencias",
    acao: "Abrir diligências",
  },
  {
    id: "marketing",
    nome: "Marketing",
    detalhe: "Planejamento e produção de conteúdo",
    x: 16,
    y: 8,
    piso: "#e5ded9",
    link: "/marketing",
    acao: "Abrir Marketing",
  },
] as const;
export type SalaId = (typeof SALAS)[number]["id"];
export function salaAgente(agente: AgenteIA): SalaId {
  if (SALAS.some((s) => s.id === agente.sala)) return agente.sala as SalaId;
  if (agente.area === "gestao") return "diretoria";
  if (
    agente.area === "marketing" ||
    agente.area === "comercial" ||
    agente.area === "diligencias"
  )
    return agente.area;
  return "operacional";
}
export function aparencia(id: string) {
  const seed = Array.from(id).reduce(
    (n, c) => (n * 31 + c.charCodeAt(0)) >>> 0,
    7,
  );
  return {
    pele: ["#e4b38d", "#b97a52", "#8b563e", "#f2cfb1"][seed % 4],
    cabelo: ["#342a28", "#20202b", "#6f4228", "#ad824d"][(seed >>> 3) % 4],
    roupa: ["#253651", "#49615c", "#7b5650", "#55516e"][(seed >>> 6) % 4],
    longo: seed % 2 === 0,
  };
}
