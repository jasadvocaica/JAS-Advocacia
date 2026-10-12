import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, RefreshCw, ChevronDown } from "lucide-react";
import { contexto, carregarItens, tabela } from "./api";
import {
  MENUS,
  SECOES,
  STATUS,
  TIPOS,
  ordenarRotina,
  CANAIS,
  FORMATOS,
  type Item,
  type Tipo,
} from "./model";
import ItemForm, { Escolha } from "./ItemForm";
import ItemDetail from "./ItemDetail";
import CalendarioMarketing from "./CalendarioMarketing";
import RelatoriosMarketing, { DemandaMarketing } from "./RelatoriosMarketing";
import CatalogoMarketing from "./CatalogoMarketing";
import PacotesMarketing from "./PacotesMarketing";
import ModelosMarketing from "./ModelosMarketing";
import OportunidadesMarketing from "./OportunidadesMarketing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AcessosMarketing from "./AcessosMarketing";
const tiposSecao: Record<string, Tipo[]> = {
  tarefas: ["tarefa", "rotina"],
  equipe: ["tarefa", "rotina"],
  posts: ["conteudo"],
  gravacoes: ["gravacao", "roteiro"],
  ideias: ["ideia"],
  calendario: ["pauta", "planejamento", "conteudo", "roteiro", "artigo"],
  producao: ["conteudo", "artigo", "roteiro"],
  roteiros: ["roteiro"],
  artigos: ["artigo"],
  campanhas: ["campanha"],
  biblioteca: ["material"],
};
export default function Marketing() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const secao = params.get("secao") ?? "visao";
  const ctxQ = useQuery({
    queryKey: ["mkt-contexto", user?.id],
    queryFn: contexto,
  });
  const itensQ = useQuery({
    queryKey: ["mkt-itens", user?.id],
    queryFn: carregarItens,
  });
  const ctx = ctxQ.data;
  const itens = itensQ.data ?? [];
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [area, setArea] = useState("");
  const [canal, setCanal] = useState("");
  const [formato, setFormato] = useState("");
  const [minhas, setMinhas] = useState(true);
  const [arquivados, setArquivados] = useState(false);
  const [kanban, setKanban] = useState(true);
  const [selecionado, setSelecionado] = useState<string>();
  const [editar, setEditar] = useState(false);
  const [novo, setNovo] = useState<Tipo>();
  const [abaGravacao, setAbaGravacao] = useState(false);
  const decisoes = useQuery({
    queryKey: ["mkt-todas-decisoes"],
    enabled: secao === "historico",
    queryFn: () => tabela("mkt_decisoes"),
  });
  const audit = useQuery({
    queryKey: ["mkt-auditoria"],
    enabled: secao === "auditoria" && !!ctx?.permissoes.gerenciar,
    queryFn: () => tabela("mkt_auditoria"),
  });
  useEffect(() => {
    const id = params.get("item");
    if (id) setSelecionado(id);
  }, [params]);
  function recarregar() {
    qc.invalidateQueries({ queryKey: ["mkt-itens"] });
    qc.invalidateQueries({ queryKey: ["mkt-contexto"] });
    qc.invalidateQueries({ queryKey: ["mkt-demanda"] });
    qc.invalidateQueries({ queryKey: ["mkt-auditoria"] });
  }
  const item = itens.find((i) => i.id === selecionado);
  const ativos = itens.filter((i) => !i.arquivado_em);
  const tipos = tiposSecao[secao] ?? [];
  const filtrados = ordenarRotina(
    itens.filter(
      (i) =>
        (arquivados || !i.arquivado_em) &&
        (secao === "busca"
          ? true
          : secao === "ajustes"
            ? i.status === "ajustes"
            : secao === "publicacoes"
              ? i.status === "publicado"
              : secao === "aprovacoes"
                ? i.status === "aguardando_aprovacao"
                : tipos.includes(i.tipo)) &&
        (!busca ||
          `${i.titulo} ${i.descricao}`
            .toLowerCase()
            .includes(busca.toLowerCase())) &&
        (!status || i.status === status) &&
        (!responsavel || i.responsavel_id === responsavel) &&
        (!area || i.area_id === area) &&
        (!canal || i.canal === canal) &&
        (!formato || i.formato === formato) &&
        (secao !== "tarefas" || !minhas || i.responsavel_id === user?.id) &&
        (secao !== "gravacoes" ||
          i.tipo === "gravacao" ||
          i.status === "aguardando_gravacao"),
    ),
  );
  if (ctxQ.error || itensQ.error)
    return (
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Não foi possível abrir o marketing</h2>
        <p className="text-destructive">
          {(ctxQ.error ?? itensQ.error)?.message}
        </p>
        <Button onClick={recarregar}>Tentar novamente</Button>
      </Card>
    );
  if (!ctx || itensQ.isLoading)
    return <p>Carregando departamento de marketing…</p>;
  const abrir = (i: Item) => {
    setSelecionado(i.id);
    setEditar(false);
  };
  const unidade = ctx.permissoes.aprovar
    ? "Supervisione aprovações, prazos e resultados."
    : "Organize sua rotina, planeje e produza os materiais do escritório.";
  const nomes = Object.fromEntries(ctx.usuarios.map((u) => [u.id, u.nome]));
  const kpis = [
    [
      "Tarefas pendentes",
      ativos.filter((i) => i.tipo === "tarefa" && i.status !== "concluido")
        .length,
    ],
    [
      "Tarefas vencidas",
      ativos.filter(
        (i) =>
          i.tipo === "tarefa" &&
          i.prazo &&
          new Date(i.prazo) < new Date() &&
          i.status !== "concluido",
      ).length,
    ],
    [
      "Ideias em análise",
      ativos.filter(
        (i) =>
          i.tipo === "ideia" &&
          ["rascunho", "aguardando_aprovacao"].includes(i.status),
      ).length,
    ],
    [
      "Pautas aprovadas",
      ativos.filter((i) => i.tipo === "pauta" && i.status === "aprovado")
        .length,
    ],
    [
      "Em produção",
      ativos.filter(
        (i) =>
          ["conteudo", "artigo", "roteiro"].includes(i.tipo) &&
          i.status === "producao",
      ).length,
    ],
    [
      "Ajustes solicitados",
      ativos.filter((i) => i.status === "ajustes").length,
    ],
    [
      "Aguardando aprovação",
      ativos.filter((i) => i.status === "aguardando_aprovacao").length,
    ],
    [
      "Aguardando gravação",
      ativos.filter((i) => i.status === "aguardando_gravacao").length,
    ],
    [
      "Publicações previstas",
      ativos.filter(
        (i) =>
          ["conteudo", "artigo", "roteiro"].includes(i.tipo) &&
          i.data_prevista &&
          !["publicado", "rejeitado", "arquivado"].includes(i.status),
      ).length,
    ],
    [
      "Publicados no mês",
      ativos.filter(
        (i) =>
          i.status === "publicado" &&
          String(i.dados.publicado_em ?? "").slice(0, 7) ===
            new Date().toISOString().slice(0, 7),
      ).length,
    ],
  ];
  const Cartao = ({ i }: { i: Item }) => (
    <button
      className="w-full text-left rounded-lg border bg-card p-4 hover:border-primary transition-colors space-y-2"
      onClick={() => abrir(i)}
    >
      <p className="font-semibold break-words">{i.titulo}</p>
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline">{TIPOS[i.tipo]}</Badge>
        <Badge variant={i.status === "ajustes" ? "destructive" : "secondary"}>
          {STATUS[i.status]}
        </Badge>
        {i.prioridade !== "normal" && (
          <Badge variant="outline">{i.prioridade}</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {nomes[i.responsavel_id ?? ""] ?? "Não atribuído"}
        {i.prazo && ` · prazo ${new Date(i.prazo).toLocaleDateString("pt-BR")}`}
        {i.canal && ` · ${i.canal}`}
      </p>
      {i.tipo === "artigo" && i.dados.revisar_em && (
        <p className="text-xs text-muted-foreground">
          Revisão jurídica: {i.dados.revisar_em}
        </p>
      )}
    </button>
  );
  return (
    <div className="space-y-5">
      <PageHeader title={`Marketing · ${MENUS.find((menu) => menu.itens.some(([id]) => id === secao))?.nome ?? "Configurações"}`} description={unidade}>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!ctx.permissoes.criar}>
                <Plus className="w-4 h-4" />
                Novo
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(
                [
                  "ideia",
                  "pauta",
                  "conteudo",
                  "roteiro",
                  "artigo",
                  "tarefa",
                  "campanha",
                ] as Tipo[]
              ).map((t) => (
                <DropdownMenuItem key={t} onClick={() => setNovo(t)}>
                  {TIPOS[t]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={recarregar}>
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </Button>
          {ctx.permissoes.gestor && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Settings className="w-4 h-4" />
                  Configurações
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setParams({ secao: "acessos" })}
                >
                  Permissões da equipe
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setParams({ secao: "catalogo" })}
                >
                  Catálogo jurídico compartilhado
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setParams({ secao: "auditoria" })}
                >
                  Auditoria
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </PageHeader>
      <div className="w-full min-w-0 space-y-5">
        <nav aria-label="Funcionalidades do marketing" className="flex flex-wrap gap-2">
          {(MENUS.find((menu) => menu.itens.some(([id]) => id === secao))?.itens ?? [])
            .filter(([id]) => id !== "equipe" || ctx.permissoes.gerenciar || ctx.permissoes.gestor)
            .map(([id, label]) => (
              <Button key={id} size="sm" variant={secao === id ? "default" : "outline"}
                aria-current={secao === id ? "page" : undefined}
                className="h-auto whitespace-normal text-left"
                onClick={() => { setParams({secao: id}); setStatus(""); setAbaGravacao(false); }}>
                {label}
              </Button>
            ))}
        </nav>
        <section className="space-y-5 min-w-0">
          <div className="flex gap-2">
            <Input
              aria-label="Busca global do marketing"
              placeholder="Buscar em todo o marketing…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setParams({ secao: "busca" });
                setStatus("");
                setArea("");
                setResponsavel("");
              }}
            />
          </div>
          {secao === "visao" ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {kpis.map(([l, v]) => (
                  <Card key={l} className="p-4">
                    <p className="text-xs text-muted-foreground">{l}</p>
                    <p className="text-3xl font-display mt-2">{v}</p>
                  </Card>
                ))}
              </div>
              {ctx.permissoes.criar && (
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      "ideia",
                      "pauta",
                      "roteiro",
                      "artigo",
                      "tarefa",
                      "campanha",
                    ] as Tipo[]
                  ).map((tipo) => (
                    <Button
                      key={tipo}
                      variant="outline"
                      onClick={() => setNovo(tipo)}
                    >
                      <Plus className="w-4 h-4" />
                      {TIPOS[tipo]}
                    </Button>
                  ))}
                </div>
              )}
              <h2 className="font-display text-xl">
                {ctx.permissoes.aprovar
                  ? "Aprovações e atividades prioritárias"
                  : "Minha rotina"}
              </h2>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {ordenarRotina(
                  ativos.filter(
                    (i) =>
                      ![
                        "publicado",
                        "concluido",
                        "rejeitado",
                        "convertida",
                        "encerrada",
                      ].includes(i.status) &&
                      (ctx.permissoes.aprovar || i.responsavel_id === user?.id),
                  ),
                )
                  .slice(0, 12)
                  .map((i) => (
                    <Cartao key={i.id} i={i} />
                  ))}
              </div>
              {ativos.length === 0 && (
                <Card className="p-6">
                  <p className="font-semibold">
                    Seu departamento está pronto para começar
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Cadastre uma tarefa, uma pesquisa ou uma ideia. Os
                    indicadores são preenchidos pelas atividades reais da
                    equipe.
                  </p>
                </Card>
              )}
            </>
          ) : secao === "demanda" ? (
            <DemandaMarketing ctx={ctx} />
          ) : secao === "relatorios" || secao === "resumo" ? (
            <RelatoriosMarketing itens={itens} ctx={ctx} />
          ) : secao === "pacotes" ? (
            <PacotesMarketing
              ctx={ctx}
              itens={itens}
              onChanged={recarregar}
              onOpen={abrir}
            />
          ) : secao === "modelos" ? (
            <ModelosMarketing ctx={ctx} onChanged={recarregar} onOpen={abrir} />
          ) : secao === "oportunidades" ? (
            <OportunidadesMarketing itens={itens} />
          ) : secao === "historico" ? (
            <div className="space-y-3">
              {decisoes.error && (
                <p className="text-destructive">{decisoes.error.message}</p>
              )}
              {decisoes.data
                ?.sort((a: any, b: any) =>
                  b.criado_em.localeCompare(a.criado_em),
                )
                .map((d: any) => (
                  <button
                    key={d.id}
                    className="w-full text-left border rounded-lg p-4 text-sm"
                    onClick={() => {
                      const i = itens.find((i) => i.id === d.item_id);
                      if (i) abrir(i);
                    }}
                  >
                    <p className="font-semibold">
                      {itens.find((i) => i.id === d.item_id)?.titulo} · versão{" "}
                      {d.versao}
                    </p>
                    <p>
                      {STATUS[d.resultado]} · {nomes[d.usuario_id]} ·{" "}
                      {new Date(d.criado_em).toLocaleString("pt-BR")}
                    </p>
                    <p>{d.justificativa}</p>
                  </button>
                ))}
              {decisoes.data?.length === 0 && (
                <p className="text-muted-foreground">
                  Nenhuma decisão registrada.
                </p>
              )}
            </div>
          ) : secao === "catalogo" ? (
            <CatalogoMarketing ctx={ctx} onChanged={recarregar} />
          ) : secao === "acessos" ? (
            ctx.permissoes.gestor ? (
              <AcessosMarketing ctx={ctx} onChanged={recarregar} />
            ) : (
              <p>Área restrita à direção.</p>
            )
          ) : secao === "auditoria" ? (
            <div className="space-y-2">
              {audit.error && (
                <p className="text-destructive">{audit.error.message}</p>
              )}
              {audit.data
                ?.sort((a: any, b: any) => b.id - a.id)
                .slice(0, 200)
                .map((a: any) => (
                  <details key={a.id} className="border p-3 rounded-md text-sm">
                    <summary>
                      {new Date(a.criado_em).toLocaleString("pt-BR")} ·{" "}
                      {nomes[a.usuario_id]} · {a.entidade} · {a.acao}
                    </summary>
                    <pre className="overflow-x-auto text-xs mt-2">
                      {JSON.stringify(
                        { antes: a.antes, depois: a.depois },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                ))}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <h2 className="font-display text-xl flex-1">
                  {SECOES.find(([id]) => id === secao)?.[1] ?? "Marketing"}
                </h2>
                {ctx.permissoes.criar &&
                  tipos
                    .filter(
                      (t) =>
                        secao !== "calendario" ||
                        ["pauta", "planejamento"].includes(t),
                    )
                    .map((tipo) => (
                      <Button
                        key={tipo}
                        variant="outline"
                        onClick={() => setNovo(tipo)}
                      >
                        <Plus className="w-4 h-4" />
                        {TIPOS[tipo]}
                      </Button>
                    ))}
                {["producao", "ideias", "tarefas"].includes(secao) && (
                  <Button variant="outline" onClick={() => setKanban(!kanban)}>
                    {kanban ? "Visualizar lista" : "Visualizar Kanban"}
                  </Button>
                )}
                {secao === "gravacoes" && false && (
                  <Button
                    variant={abaGravacao ? "default" : "outline"}
                    onClick={() => setAbaGravacao(!abaGravacao)}
                  >
                    Aguardando gravação
                  </Button>
                )}
              </div>
              <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Input
                  placeholder="Buscar título ou descrição"
                  aria-label="Buscar registros"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
                <Escolha
                  label="Status"
                  value={status}
                  opcoes={Object.entries(STATUS).map(([id, nome]) => ({
                    id,
                    nome,
                  }))}
                  onChange={setStatus}
                />
                <Escolha
                  label="Responsável"
                  value={responsavel}
                  opcoes={ctx.usuarios}
                  onChange={setResponsavel}
                />
                <Escolha
                  label="Área"
                  value={area}
                  opcoes={ctx.areas}
                  onChange={setArea}
                />
                <Escolha
                  label="Canal"
                  value={canal}
                  opcoes={Object.entries(CANAIS).map(([id, nome]) => ({
                    id,
                    nome,
                  }))}
                  onChange={setCanal}
                />
                <Escolha
                  label="Formato"
                  value={formato}
                  opcoes={Object.entries(FORMATOS).map(([id, nome]) => ({
                    id,
                    nome,
                  }))}
                  onChange={setFormato}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {secao === "tarefas" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={minhas}
                      onChange={(e) => setMinhas(e.target.checked)}
                    />{" "}
                    Somente minhas tarefas
                  </label>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={arquivados}
                    onChange={(e) => setArquivados(e.target.checked)}
                  />{" "}
                  Incluir arquivados
                </label>
                <span>{filtrados.length} registros</span>
              </div>
              {secao === "equipe" &&
                !ctx.permissoes.gerenciar &&
                !ctx.permissoes.gestor && (
                  <p className="text-destructive">
                    Supervisão da equipe exige autorização.
                  </p>
                )}
              {secao === "aprovacoes" && !ctx.permissoes.aprovar && (
                <p className="text-sm text-muted-foreground">
                  Acompanhe o andamento das submissões. As decisões são
                  exclusivas da direção ou de aprovadores autorizados.
                </p>
              )}
              {secao === "calendario" ? (
                <>
                  <CalendarioMarketing
                    itens={filtrados.filter((i) => i.tipo !== "planejamento")}
                    onOpen={abrir}
                  />
                  <h3 className="font-semibold mt-4">Planejamentos</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {filtrados
                      .filter((i) => i.tipo === "planejamento")
                      .map((i) => (
                        <Cartao key={i.id} i={i} />
                      ))}
                  </div>
                </>
              ) : kanban &&
                ["producao", "ideias", "tarefas"].includes(secao) ? (
                <div className="flex gap-3 overflow-x-auto pb-3">
                  {Object.keys(STATUS)
                    .filter(
                      (s) =>
                        filtrados.some((i) => i.status === s) ||
                        [
                          "rascunho",
                          "producao",
                          "aguardando_aprovacao",
                          "ajustes",
                          "aprovado",
                        ].includes(s),
                    )
                    .map((s) => (
                      <div
                        key={s}
                        className="w-72 min-w-72 bg-muted/40 rounded-lg p-3 space-y-3"
                      >
                        <h3 className="font-semibold text-sm">
                          {STATUS[s]}{" "}
                          <span className="text-muted-foreground">
                            ({filtrados.filter((i) => i.status === s).length})
                          </span>
                        </h3>
                        {filtrados
                          .filter((i) => i.status === s)
                          .map((i) => (
                            <Cartao key={i.id} i={i} />
                          ))}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filtrados.map((i) => (
                    <Cartao key={i.id} i={i} />
                  ))}
                </div>
              )}
              {filtrados.length === 0 && (
                <p className="text-muted-foreground text-sm py-6">
                  Nenhum registro corresponde aos filtros.
                </p>
              )}
            </>
          )}
        </section>
      </div>
      {(ctx.permissoes.demandas || ctx.permissoes.comercial) && (
        <Link
          to="/comercial/demandas"
          className="inline-block text-sm underline text-primary"
        >
          Abrir vínculos comerciais de serviços
        </Link>
      )}
      {(novo || (editar && item)) && (
        <ItemForm
          key={item?.id ?? novo}
          item={editar ? item : undefined}
          tipo={novo ?? item!.tipo}
          ctx={ctx}
          itens={itens}
          onClose={() => {
            setNovo(undefined);
            setEditar(false);
          }}
          onSaved={(i) => {
            setNovo(undefined);
            setEditar(false);
            setSelecionado(i.id);
            recarregar();
          }}
        />
      )}
      {item && !editar && !novo && (
        <ItemDetail
          key={`${item.id}:${item.versao}`}
          item={item}
          ctx={ctx}
          itens={itens}
          onClose={() => {
            setSelecionado(undefined);
            if (params.has("item")) {
              params.delete("item");
              setParams(params);
            }
          }}
          onEdit={() => setEditar(true)}
          onChanged={recarregar}
          onConverted={(i) => {
            setSelecionado(i.id);
            setEditar(false);
          }}
        />
      )}
    </div>
  );
}
