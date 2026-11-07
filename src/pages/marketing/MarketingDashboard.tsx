import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Instagram,
  Megaphone,
  RefreshCw,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ErroMarketing, lerResultados } from "./operacao-api";
import {
  chaveResultados,
  dinheiro,
  filtrosIniciais,
  somarAds,
  type FiltrosResultados,
} from "./resultados";
import {
  ordenarRotina,
  STATUS,
  TIPOS,
  type Contexto,
  type Item,
} from "./model";
import {
  periodoDashboard,
  resumoEditorial,
  serieGastos,
} from "./dashboard-model";
import "./marketing-dashboard.css";

const qtd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR");
const dataCurta = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const statusMeta = (s: unknown) =>
  ({
    active: "Ativa",
    paused: "Pausada",
    pending_review: "Em revisão",
    rejected: "Rejeitada",
    completed: "Encerrada",
    cancelled: "Cancelada",
  })[String(s).toLowerCase()] ?? String(s ?? "Indisponível");
const numeroMetrica = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

export default function MarketingDashboard({
  itens,
  ctx,
  onAbrir,
  onNavegar,
}: {
  itens: Item[];
  ctx: Contexto;
  onAbrir: (i: Item) => void;
  onNavegar: (secao: string, filtros?: FiltrosResultados) => void;
}) {
  const { user } = useAuth();
  const [f, setF] = useState(filtrosIniciais);
  const [periodo, setPeriodo] = useState("mes");
  const [moedaEscolhida, setMoeda] = useState("");
  const q = useQuery({
    queryKey: chaveResultados(user?.id, f),
    queryFn: () => lerResultados(f),
    enabled: !!user,
    retry: false,
    staleTime: 60000,
  });
  const negado = q.error instanceof ErroMarketing && q.error.codigo === "42501";
  const dados = negado ? undefined : q.data;
  const totais = somarAds(dados?.diario ?? [], f.conta);
  const moeda = totais.some((t) => t.moeda === moedaEscolhida)
    ? moedaEscolhida
    : (totais.find((t) => t.moeda === "BRL")?.moeda ?? totais[0]?.moeda ?? "");
  const ads = totais.find((t) => t.moeda === moeda);
  const serie = serieGastos(dados?.diario ?? [], moeda, f.de, f.ate);
  const crm = dados?.crm;
  const editorial = resumoEditorial(itens);
  const prioridades = ordenarRotina(
    editorial.abertos.filter(
      (i) => ctx.permissoes.aprovar || i.responsavel_id === user?.id,
    ),
  ).slice(0, 4);
  const nomes = Object.fromEntries(ctx.usuarios.map((u) => [u.id, u.nome]));
  const ultimo = dados?.conexao.ultima_sync_ok_em;
  const atrasado =
    !!dados &&
    (!ultimo ||
      Date.now() - Date.parse(ultimo) >
        dados.conexao.intervalo_minutos * 120000);
  const desconectado =
    !!dados &&
    (["aguardando", "revogada", "erro_autenticacao"].includes(
      dados.conexao.estado,
    ) ||
      dados.contas.some(
        (c) => c.precisa_reconectar && (!f.conta || c.externo_id === f.conta),
      ));
  const adsSemPermissao = dados?.conexao.addon_ads === false;
  const estado =
    q.error || dados?.conexao.estado === "erro"
      ? "Falha na atualização"
      : desconectado
        ? "Reconexão necessária"
        : adsSemPermissao
          ? "Ads sem permissão no provedor"
          : dados?.job_ativo
            ? "Sincronizando"
            : dados?.parcial
              ? "Dados parciais"
              : atrasado
                ? "Atualização pendente"
                : dados
                  ? "Dados sincronizados"
                  : "Carregando dados";
  const completo = () => onNavegar("resultados", f);
  const contas = dados?.contas ?? [];
  const funil = [
    { nome: "Leads registrados", valor: crm?.leads, cor: "blue" },
    { nome: "Qualificados", valor: crm?.qualificados, cor: "gold" },
    { nome: "Contratos confirmados", valor: crm?.contratos, cor: "green" },
  ];
  const conversao =
    crm && crm.leads > 0
      ? `${((100 * crm.contratos) / crm.leads).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
      : "—";

  return (
    <div className="mkt-dashboard">
      <div className="mkt-dash-intro">
        <div>
          <span className="mkt-eyebrow">ACOMPANHAMENTO DO ESCRITÓRIO</span>
          <h2>Resultados e prioridades</h2>
          <p>Do primeiro contato à contratação, com a operação em dia.</p>
        </div>
        <div className="mkt-dash-filters">
          <label>
            <CalendarDays size={15} />
            <span className="sr-only">Período do dashboard</span>
            <select
              aria-label="Período do dashboard"
              value={periodo}
              onChange={(e) => {
                setPeriodo(e.target.value);
                setF({
                  ...f,
                  ...periodoDashboard(e.target.value, filtrosIniciais().ate),
                });
              }}
            >
              <option value="mes">Este mês</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Conta do dashboard</span>
            <select
              aria-label="Conta do dashboard"
              value={f.conta}
              onChange={(e) => setF({ ...f, conta: e.target.value })}
            >
              <option value="">Todas as contas</option>
              {f.conta && !contas.some((c) => c.externo_id === f.conta) && (
                <option value={f.conta}>Conta selecionada</option>
              )}
              {contas.map((c) => (
                <option key={c.externo_id} value={c.externo_id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            className="mkt-icon-button"
            aria-label="Atualizar indicadores do dashboard"
            disabled={q.isFetching}
            onClick={() => q.refetch()}
          >
            <RefreshCw
              size={16}
              className={q.isFetching ? "animate-spin" : ""}
            />
          </button>
        </div>
      </div>
      <div className="mkt-source-line" aria-live="polite">
        <span
          className={`mkt-source-dot ${q.error || desconectado || atrasado || dados?.parcial || adsSemPermissao ? "is-warning" : ""}`}
        />
        <span>{estado}</span>
        <span className="mkt-source-separator">·</span>
        <span>
          {dataCurta(f.de)} a {dataCurta(f.ate)}
        </span>
        {ultimo && (
          <span className="mkt-sync-time">
            Atualizado{" "}
            {new Date(ultimo).toLocaleString("pt-BR", {
              timeZone: "America/Cuiaba",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      {q.error && (
        <div className="mkt-dash-notice" role="alert">
          {q.error.message}
          {dados ? " · Mantida a última leitura válida destes filtros." : ""}
        </div>
      )}
      {desconectado && (
        <div className="mkt-dash-notice">
          Confira a conexão em{" "}
          <Link to="/configuracoes/integracoes/zernio">
            Integrações → Zernio
          </Link>
          .
        </div>
      )}
      <section className="mkt-kpi-grid" aria-label="Resumo do marketing">
        <article className="mkt-kpi mkt-kpi-featured">
          <div className="mkt-kpi-label">
            <span>Investimento em anúncios</span>
            <CircleDollarSign size={19} />
          </div>
          <strong>{q.isPending ? "…" : dinheiro(ads?.gasto, moeda)}</strong>
          <div className="mkt-kpi-bottom">
            <span>
              {q.isPending
                ? "Consultando dados"
                : moeda || "Sem série disponível"}{" "}
              · {dataCurta(f.de)} a {dataCurta(f.ate)}
            </span>
            {totais.length > 1 && (
              <select
                aria-label="Moeda dos anúncios"
                value={moeda}
                onChange={(e) => setMoeda(e.target.value)}
              >
                {totais.map((t) => (
                  <option key={t.moeda} value={t.moeda}>
                    {t.moeda}
                  </option>
                ))}
              </select>
            )}
          </div>
        </article>
        <article className="mkt-kpi">
          <div className="mkt-kpi-label">
            <span>Leads no CRM</span>
            <span className="mkt-kpi-icon blue">
              <Users size={18} />
            </span>
          </div>
          <strong>{q.isPending ? "…" : qtd(crm?.leads)}</strong>
          <div className="mkt-kpi-bottom">
            <span>
              {dados && !crm
                ? "Sem acesso ao CRM"
                : "Contatos únicos no período"}
            </span>
            <button aria-label="Ver indicadores de leads" onClick={completo}>
              <ArrowUpRight size={17} />
            </button>
          </div>
        </article>
        <article className="mkt-kpi">
          <div className="mkt-kpi-label">
            <span>Contratos confirmados</span>
            <span className="mkt-kpi-icon green">
              <FileCheck2 size={18} />
            </span>
          </div>
          <strong>{q.isPending ? "…" : qtd(crm?.contratos)}</strong>
          <div className="mkt-kpi-bottom">
            <span>
              {dados && !crm
                ? "Sem acesso ao CRM"
                : "Formalizados com evidência"}
            </span>
            <button
              aria-label="Ver indicadores de contratos"
              onClick={completo}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
        </article>
        <article className="mkt-kpi">
          <div className="mkt-kpi-label">
            <span>Aguardando aprovação</span>
            <span className="mkt-kpi-icon gold">
              <ClipboardCheck size={18} />
            </span>
          </div>
          <strong>{editorial.aprovacoes}</strong>
          <div className="mkt-kpi-bottom">
            <span>
              {editorial.ajustes
                ? `${editorial.ajustes} com ajustes solicitados`
                : "Peças para revisão da equipe"}
            </span>
            <button
              aria-label="Abrir aprovações do marketing"
              onClick={() => onNavegar("aprovacoes")}
            >
              <ArrowUpRight size={17} />
            </button>
          </div>
        </article>
      </section>
      <div className="mkt-analysis-grid">
        <section
          className="mkt-panel mkt-spend-panel"
          aria-label="Investimento ao longo do período"
        >
          <div className="mkt-panel-heading">
            <div>
              <h3>Investimento ao longo do período</h3>
              <p>Gasto diário em {moeda || "moeda não informada"}</p>
            </div>
            <button className="mkt-text-link" onClick={completo}>
              Ver resultados <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="mkt-spend-stats">
            <div>
              <span>Impressões</span>
              <strong>{qtd(ads?.impressoes)}</strong>
            </div>
            <div>
              <span>Cliques</span>
              <strong>{qtd(ads?.cliques)}</strong>
            </div>
            <div>
              <span>Resultados da Meta</span>
              <strong>{qtd(ads?.resultados)}</strong>
            </div>
          </div>
          {q.isPending ? (
            <div className="mkt-chart-empty" role="status">
              Carregando o período…
            </div>
          ) : serie.some((s) => s.gasto !== null) ? (
            <div
              className="mkt-spend-chart"
              role="img"
              aria-label={`Gasto diário em ${moeda}. Dias sem informação ficam em branco.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  accessibilityLayer
                  data={serie}
                  margin={{ top: 8, right: 10, bottom: 0, left: -22 }}
                >
                  <defs>
                    <linearGradient
                      id="mkt-spend-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop
                        offset="100%"
                        stopColor="#3b82f6"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="rotulo"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <Tooltip
                    formatter={(v) => [
                      dinheiro(numeroMetrica(v), moeda),
                      "Gasto",
                    ]}
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="linear"
                    dataKey="gasto"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#mkt-spend-fill)"
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--card))" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mkt-chart-empty">
              <Megaphone size={25} />
              <strong>Nenhum gasto disponível neste período</strong>
              <span>
                Os valores aparecem quando a série é recebida do Zernio.
              </span>
            </div>
          )}
          {dados && (
            <table className="sr-only">
              <caption>Gasto diário em {moeda}</caption>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th>Gasto</th>
                </tr>
              </thead>
              <tbody>
                {serie.map((d) => (
                  <tr key={d.data}>
                    <td>{d.rotulo}</td>
                    <td>
                      {d.gasto == null ? "Sem dados" : dinheiro(d.gasto, moeda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mkt-panel-footnote">
            Série de conta, por moeda. Dias sem dados não são considerados zero.
          </div>
        </section>
        <section
          className="mkt-panel mkt-funnel-panel"
          aria-label="Funil comercial do período"
        >
          <div className="mkt-panel-heading">
            <div>
              <h3>Funil comercial</h3>
              <p>Mesma coorte de aquisição</p>
            </div>
            <Users size={18} />
          </div>
          {crm ? (
            <>
              <div className="mkt-funnel">
                {funil.map((e, i) => (
                  <div className={`mkt-funnel-step ${e.cor}`} key={e.nome}>
                    <div>
                      <span>
                        <small>0{i + 1}</small>
                        {e.nome}
                      </span>
                      <strong>{qtd(e.valor)}</strong>
                    </div>
                    <div className="mkt-funnel-track">
                      <div
                        style={{
                          width:
                            crm.leads > 0
                              ? `${Math.min(100, (100 * Number(e.valor)) / crm.leads)}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mkt-conversion">
                <div>
                  <span>Conversão em contrato</span>
                  <small>Contratos ÷ leads da coorte</small>
                </div>
                <strong>{conversao}</strong>
              </div>
              <p className="mkt-funnel-caption">
                {crm.sem_atribuicao}{" "}
                {crm.sem_atribuicao === 1
                  ? "lead sem campanha atribuída"
                  : "leads sem campanha atribuída"}
                . Custos por lead e contrato dependem de atribuição compatível.
              </p>
            </>
          ) : (
            <div className="mkt-chart-empty">
              <Users size={24} />
              <strong>
                {q.isPending
                  ? "Consultando o CRM…"
                  : dados
                    ? "Indicadores restritos"
                    : "Dados ainda indisponíveis"}
              </strong>
              <span>
                {dados
                  ? "O acesso comercial é conferido separadamente."
                  : "Aguardando uma leitura válida para estes filtros."}
              </span>
            </div>
          )}
        </section>
      </div>
      <div className="mkt-operation-grid">
        <section className="mkt-panel" aria-label="Prioridades da equipe">
          <div className="mkt-panel-heading">
            <div>
              <h3>O que precisa de atenção</h3>
              <p>
                {editorial.vencidos
                  ? `${editorial.vencidos} ${editorial.vencidos === 1 ? "item vencido" : "itens vencidos"} na operação`
                  : "Próximos passos da equipe"}
              </p>
            </div>
            {editorial.vencidos > 0 && (
              <span className="mkt-pill warning">
                <Clock3 size={12} />
                {editorial.vencidos} em atraso
              </span>
            )}
          </div>
          <div className="mkt-priorities">
            {prioridades.length ? (
              prioridades.map((i) => (
                <button
                  key={i.id}
                  onClick={() => onAbrir(i)}
                  className="mkt-priority"
                >
                  <span
                    className={`mkt-priority-mark ${i.status === "aguardando_aprovacao" ? "gold" : i.prazo && Date.parse(i.prazo) < Date.now() ? "red" : "blue"}`}
                  >
                    <ClipboardCheck size={17} />
                  </span>
                  <span className="mkt-priority-copy">
                    <strong>{i.titulo}</strong>
                    <small>
                      {nomes[i.responsavel_id ?? ""] ?? "Sem responsável"} ·{" "}
                      {TIPOS[i.tipo]}
                    </small>
                  </span>
                  <span className="mkt-priority-status">
                    {STATUS[i.status] ?? i.status}
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))
            ) : (
              <div className="mkt-priorities-empty">
                <CheckCheck size={22} />
                <div>
                  <strong>Nenhuma pendência nesta fila</strong>
                  <p>As próximas atividades aparecerão aqui.</p>
                </div>
              </div>
            )}
          </div>
          <button
            className="mkt-panel-action"
            onClick={() => onNavegar("tarefas")}
          >
            Abrir atividades <ArrowRight size={15} />
          </button>
        </section>
        <section
          className="mkt-panel mkt-editorial-panel"
          aria-label="Fluxo editorial"
        >
          <div className="mkt-panel-heading">
            <div>
              <h3>Fluxo editorial</h3>
              <p>Distribuição das peças em andamento</p>
            </div>
            <CalendarDays size={18} />
          </div>
          <div className="mkt-editorial-stages">
            {[
              {
                label: "Planejamento",
                value: editorial.planejamento,
                secao: "ideias",
                icon: CalendarDays,
              },
              {
                label: "Produção",
                value: editorial.producao,
                secao: "producao",
                icon: FileCheck2,
              },
              {
                label: "Aprovação",
                value: editorial.aprovacoes,
                secao: "aprovacoes",
                icon: ClipboardCheck,
              },
            ].map(({ label, value, secao, icon: Icon }) => (
              <button key={label} onClick={() => onNavegar(secao)}>
                <Icon size={18} />
                <strong>{value}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <button
            className="mkt-panel-action"
            onClick={() => onNavegar("calendario")}
          >
            Abrir calendário editorial <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="mkt-panel" aria-label="Campanhas em acompanhamento">
        <div className="mkt-panel-heading">
          <div>
            <h3>Campanhas em acompanhamento</h3>
            <p>Entrega e gasto no retrato sincronizado de cada campanha</p>
          </div>
          <button
            className="mkt-text-link"
            onClick={() => onNavegar("campanhas_meta")}
          >
            Gerenciar campanhas <ArrowUpRight size={15} />
          </button>
        </div>
        {dados?.campanhas.length ? (
          <div className="mkt-campaigns-scroll">
            <p className="mkt-table-hint">
              Deslize a tabela para consultar todos os valores.
            </p>
            <table className="mkt-campaigns">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Entrega</th>
                  <th>Gasto no retrato</th>
                  <th>Cliques</th>
                  <th>
                    <span className="sr-only">Detalhes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {dados.campanhas.slice(0, 5).map((c) => {
                  const m = c.metricas as Record<string, unknown> | null;
                  return (
                    <tr key={String(c.externo_id)}>
                      <td>
                        <div className="mkt-campaign-name">
                          <span className="mkt-campaign-icon">
                            <Megaphone size={16} />
                          </span>
                          <div>
                            <strong>
                              {String(c.nome ?? "Campanha sem nome")}
                            </strong>
                            <small>
                              {c.periodo_de && c.periodo_ate
                                ? `${dataCurta(String(c.periodo_de))} a ${dataCurta(String(c.periodo_ate))}`
                                : "Período não informado"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`mkt-pill ${String(c.estado).toLowerCase() === "active" ? "success" : ""}`}
                        >
                          {statusMeta(c.estado)}
                        </span>
                      </td>
                      <td>
                        {dinheiro(
                          numeroMetrica(m?.spend),
                          String(c.moeda ?? ""),
                        )}
                      </td>
                      <td>{qtd(numeroMetrica(m?.clicks))}</td>
                      <td>
                        <button
                          className="mkt-icon-button"
                          aria-label={`Ver ${String(c.nome ?? "campanha")}`}
                          onClick={() =>
                            onNavegar("resultados", {
                              ...f,
                              campanha: String(c.externo_id),
                            })
                          }
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mkt-campaigns-empty">
            <Megaphone size={22} />
            <p>
              {q.isPending
                ? "Consultando campanhas…"
                : "Nenhuma campanha disponível para esta conta."}
            </p>
            <button
              className="mkt-text-link"
              onClick={() => onNavegar("campanhas_meta")}
            >
              Abrir campanhas <ArrowRight size={14} />
            </button>
          </div>
        )}
      </section>
      <div className="mkt-dash-footer">
        <span>
          <Instagram size={14} /> Orgânico:{" "}
          {dados ? qtd(dados.publicacoes.length) : "—"} publicações no período
        </span>
        <button onClick={completo}>
          Análise completa <ArrowRight size={14} />
        </button>
        <span>Fontes: Zernio e CRM do JAS · America/Cuiaba</span>
      </div>
    </div>
  );
}
