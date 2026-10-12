import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { demanda, exportarPDF, tabela } from "./api";
import { Escolha } from "./ItemForm";
import { TIPOS, type Item, type Contexto, periodo } from "./model";
import { toast } from "sonner";
export function DemandaMarketing({ ctx }: { ctx: Contexto }) {
  const q = useQuery({ queryKey: ["mkt-demanda"], queryFn: demanda });
  const data = q.data;
  if (q.error) return <p className="text-destructive">{q.error.message}</p>;
  if (!data) return <p>Carregando indicadores agregados…</p>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Indicadores calculados sobre demandas reais de serviços, sem presumir
        contratos pela conversão de um lead.{" "}
        {data.limiar > 0
          ? "Grupos pequenos e combinações que permitam deduzir informações são ocultados. A evolução usa meses encerrados."
          : "Visão gerencial: contagens completas."}
      </p>
      {data.resumo && (
        <div className="grid sm:grid-cols-3 gap-3">
          {Object.entries(data.resumo).map(([k, v]) => (
            <Card key={k} className="p-4">
              <p className="text-sm capitalize text-muted-foreground">
                {k.replace(/_/g, " ")}
              </p>
              <p className="text-2xl font-display">{String(v ?? 0)}</p>
            </Card>
          ))}
        </div>
      )}
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Demanda por serviço e área</h3>
        {data.servicos.length === 0 ? (
          <p className="text-muted-foreground">
            Ainda não há dados suficientes para exibir este indicador.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {[
                      "Serviço",
                      "Área",
                      "Clientes únicos",
                      "Oportunidades",
                      "Contratações",
                      "Conversão",
                    ].map((h) => (
                      <th className="text-left p-2" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.servicos.map((s: any) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-2">{s.nome}</td>
                      <td>{s.area ?? "Sem área"}</td>
                      <td>{s.clientes}</td>
                      <td>{s.oportunidades}</td>
                      <td>{s.contratacoes}</td>
                      <td>{s.conversao ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-64 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.servicos}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar
                    dataKey="contratacoes"
                    name="Contratações"
                    fill="#bc943f"
                  />
                  <Bar
                    dataKey="oportunidades"
                    name="Oportunidades"
                    fill="#20344a"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
      {(data.areas ?? []).length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3">
            Clientes únicos por área jurídica
          </h3>
          {data.areas.map((a: any) => (
            <p key={a.nome} className="text-sm py-1">
              {a.nome}: {a.clientes} clientes únicos · {a.contratacoes}{" "}
              contratações
            </p>
          ))}
        </Card>
      )}
      {data.mensal.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold">Evolução mensal</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.mensal}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line
                  dataKey="contratacoes"
                  stroke="#bc943f"
                  name="Contratações"
                />
                <Line
                  dataKey="clientes"
                  stroke="#20344a"
                  name="Clientes únicos"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        {[
          ["teses", "Teses mais demandadas"],
          ["origens", "Origem dos atendimentos"],
          ["campanhas", "Campanhas com origem confirmada"],
        ].map(([k, label]) => (
          <Card key={k} className="p-4">
            <h3 className="font-semibold mb-2">{label}</h3>
            {data[k].length ? (
              data[k].map((v: any, i: number) => (
                <p key={i} className="text-sm py-2 border-b">
                  {v.nome ?? v.origem} — {v.demandas} demandas
                  {v.contratacoes !== undefined &&
                    ` · ${v.contratacoes} contratações`}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem dados suficientes.
              </p>
            )}
          </Card>
        ))}
      </div>
      {ctx.permissoes.exportar && (
        <Button
          variant="outline"
          onClick={() =>
            exportarPDF(
              "Demanda jurídica agregada",
              [
                "Serviço",
                "Área",
                "Clientes únicos",
                "Oportunidades",
                "Contratações",
                "Conversão",
              ],
              data.servicos.map((s: any) => [
                s.nome,
                s.area ?? "",
                s.clientes,
                s.oportunidades,
                s.contratacoes,
                `${s.conversao ?? 0}%`,
              ]),
            ).catch((e) => toast.error(e.message))
          }
        >
          Exportar PDF
        </Button>
      )}
    </div>
  );
}
export default function RelatoriosMarketing({
  itens,
  ctx,
}: {
  itens: Item[];
  ctx: Contexto;
}) {
  const decisoes = useQuery({
    queryKey: ["mkt-todas-decisoes"],
    queryFn: () => tabela("mkt_decisoes"),
  });
  const hoje = new Date();
  const [inicio, setInicio] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1).toLocaleDateString(
      "en-CA",
    ),
  );
  const [fim, setFim] = useState(hoje.toLocaleDateString("en-CA"));
  const [resp, setResp] = useState("");
  const [area, setArea] = useState("");
  const filtrados = itens.filter(
    (i) =>
      (!resp || i.responsavel_id === resp) && (!area || i.area_id === area),
  );
  const atuais = periodo(filtrados, inicio, fim);
  const duracao = Math.max(
    1,
    Math.round(
      (new Date(fim || hoje.toLocaleDateString("en-CA")).getTime() -
        new Date(inicio || hoje.toLocaleDateString("en-CA")).getTime()) /
        86400000,
    ) + 1,
  );
  const prevFim = new Date(
    new Date(inicio || hoje.toLocaleDateString("en-CA")).getTime() - 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const prevInicio = new Date(
    new Date(inicio || hoje.toLocaleDateString("en-CA")).getTime() -
      duracao * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const anteriores = periodo(filtrados, prevInicio, prevFim);
  const linhas = useMemo(
    () =>
      Object.entries(TIPOS)
        .filter(([t]) => !["rotina", "pesquisa", "concorrente"].includes(t))
        .map(([t, label]) => ({
          tipo: label,
          atual: atuais.filter((i) => i.tipo === t).length,
          anterior: anteriores.filter((i) => i.tipo === t).length,
        })),
    [atuais, anteriores],
  );
  const aprovados = (decisoes.data ?? []).filter(
    (d: any) =>
      d.resultado === "aprovado" &&
      d.etapa === "material" &&
      d.criado_em.slice(0, 10) >= inicio &&
      d.criado_em.slice(0, 10) <= fim &&
      filtrados.some((i) => i.id === d.item_id),
  );
  const publicados = filtrados.filter(
    (i) =>
      i.status === "publicado" &&
      String(i.dados.publicado_em ?? "").slice(0, 10) >= inicio &&
      String(i.dados.publicado_em ?? "").slice(0, 10) <= fim,
  );
  const concluidas = filtrados.filter(
    (i) =>
      i.status === "concluido" &&
      i.atualizado_em.slice(0, 10) >= inicio &&
      i.atualizado_em.slice(0, 10) <= fim,
  );
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setInicio(
              new Date(Date.now() - 6 * 86400000).toLocaleDateString("en-CA"),
            );
            setFim(hoje.toLocaleDateString("en-CA"));
          }}
        >
          Semanal
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setInicio(
              new Date(
                hoje.getFullYear(),
                hoje.getMonth(),
                1,
              ).toLocaleDateString("en-CA"),
            );
            setFim(hoje.toLocaleDateString("en-CA"));
          }}
        >
          Mensal
        </Button>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <div>
          <Label>Início</Label>
          <Input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div>
          <Label>Fim</Label>
          <Input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
        <Escolha
          label="Responsável"
          value={resp}
          opcoes={ctx.usuarios}
          onChange={setResp}
        />
        <Escolha
          label="Área jurídica"
          value={area}
          opcoes={ctx.areas}
          onChange={setArea}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Criações no período selecionado comparadas ao intervalo anterior de
        mesma duração ({prevInicio} a {prevFim}). Publicações e conclusões usam
        suas datas efetivas.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Publicações realizadas", publicados.length],
          ["Atividades concluídas", concluidas.length],
          [
            "Materiais aprovados no período",
            new Set(aprovados.map((d: any) => d.item_id)).size,
          ],
          [
            "Aprovações pendentes",
            filtrados.filter((i) => i.status === "aguardando_aprovacao").length,
          ],
          [
            "Gravações pendentes",
            filtrados.filter((i) => i.status === "aguardando_gravacao").length,
          ],
          [
            "Tarefas atrasadas",
            filtrados.filter(
              (i) =>
                i.tipo === "tarefa" &&
                i.prazo &&
                new Date(i.prazo) < hoje &&
                !["concluido", "arquivado"].includes(i.status),
            ).length,
          ],
          [
            "Alcance informado",
            publicados.reduce(
              (n, i) => n + Number(i.dados.metricas?.alcance ?? 0),
              0,
            ),
          ],
        ].map(([l, v]) => (
          <Card key={l} className="p-4">
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="text-2xl font-display">{v}</p>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Produtividade por atividade</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={linhas}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tipo" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="atual" name="Período atual" fill="#bc943f" />
              <Bar dataKey="anterior" name="Período anterior" fill="#20344a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-2">Atividade criada</th>
                <th>Atual</th>
                <th>Anterior</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr className="border-t" key={l.tipo}>
                  <td className="p-2">{l.tipo}</td>
                  <td className="text-center">{l.atual}</td>
                  <td className="text-center">{l.anterior}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="font-semibold mb-3">Publicações por plataforma</h3>
        {Object.entries(
          publicados.reduce<Record<string, number>>(
            (r, i) => ({
              ...r,
              [i.canal ?? "outro"]: (r[i.canal ?? "outro"] ?? 0) + 1,
            }),
            {},
          ),
        ).map(([canal, n]) => (
          <p key={canal} className="text-sm py-1">
            {canal}: {n}
          </p>
        ))}
        {publicados.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nenhuma publicação registrada no período.
          </p>
        )}
      </Card>
      {ctx.permissoes.exportar && (
        <Button
          variant="outline"
          onClick={() =>
            exportarPDF(
              `Produtividade ${inicio} a ${fim}`,
              ["Atividade", "Atual", "Anterior"],
              linhas.map((l) => [l.tipo, l.atual, l.anterior]),
            ).catch((e) => toast.error(e.message))
          }
        >
          Exportar PDF
        </Button>
      )}
    </div>
  );
}
