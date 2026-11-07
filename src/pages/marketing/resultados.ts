export interface FiltrosResultados {
  de: string;
  ate: string;
  conta: string;
  campanha: string;
  canal: string;
  teste: boolean;
}
export interface LinhaAds {
  nivel: string;
  referencia: string;
  data: string;
  moeda: string;
  gasto: number | null;
  impressoes: number | null;
  cliques: number | null;
  conversoes: number | null;
}
export interface ResumoAds {
  moeda: string;
  gasto: number | null;
  impressoes: number | null;
  cliques: number | null;
  resultados: number | null;
}
export const chaveResultados = (
  usuario: string | undefined,
  f: FiltrosResultados,
) =>
  [
    "mkt-resultados",
    usuario,
    f.conta,
    f.de,
    f.ate,
    f.campanha,
    f.canal,
    f.teste,
  ] as const;
// NULL nunca é convertido em zero. Somente um nível da série pode compor os totais.
export function somarAds(linhas: LinhaAds[], conta = ""): ResumoAds[] {
  const grupos = new Map<string, LinhaAds[]>();
  for (const linha of linhas.filter(
    (l) => l.nivel === "conta" && (!conta || l.referencia === conta),
  )) {
    const moeda = linha.moeda || "Moeda não informada";
    grupos.set(moeda, [...(grupos.get(moeda) ?? []), linha]);
  }
  const soma = (
    ls: LinhaAds[],
    campo: "gasto" | "impressoes" | "cliques" | "conversoes",
  ) =>
    ls.some((l) => l[campo] == null)
      ? null
      : ls.reduce((n, l) => n + Number(l[campo]), 0);
  return [...grupos].map(([moeda, ls]) => ({
    moeda,
    gasto: soma(ls, "gasto"),
    impressoes: soma(ls, "impressoes"),
    cliques: soma(ls, "cliques"),
    resultados: soma(ls, "conversoes"),
  }));
}
export function indicadores(
  gasto: number | null,
  leads: number,
  contratos: number,
  compativel: boolean,
) {
  return {
    cpl: compativel && gasto != null && leads > 0 ? gasto / leads : null,
    cpa:
      compativel && gasto != null && contratos > 0 ? gasto / contratos : null,
    conversao: leads > 0 ? contratos / leads : null,
  };
}
export function situacaoFonte(
  c: {
    estado: string;
    ultima_sync_ok_em: string | null;
    addon_ads: boolean | null;
  },
  ativo: boolean,
  registros: number,
) {
  if (["revogada", "aguardando", "erro_autenticacao"].includes(c.estado))
    return "Conta desconectada";
  if (ativo) return "Sincronização em andamento";
  if (c.addon_ads === false) return "Sem permissão no provedor";
  if (!c.ultima_sync_ok_em) return "Dado indisponível";
  return registros ? "Dados em cache" : "Nenhum registro no período";
}
export const numero = (v: number | null | undefined) =>
  v == null
    ? "Indisponível"
    : v === 0
      ? "0 (confirmado)"
      : v.toLocaleString("pt-BR");
export const dinheiro = (v: number | null | undefined, moeda: string) =>
  v == null
    ? "Indisponível"
    : /^[A-Z]{3}$/.test(moeda)
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: moeda,
        }).format(v)
      : `${numero(v)} · moeda não informada`;

const hoje = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const filtrosIniciais = (): FiltrosResultados => ({
  de: `${hoje().slice(0, 7)}-01`,
  ate: hoje(),
  conta: "",
  campanha: "",
  canal: "",
  teste: false,
});
