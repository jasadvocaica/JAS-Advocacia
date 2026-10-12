import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { demanda } from "./api";
import type { Item } from "./model";
export default function OportunidadesMarketing({ itens }: { itens: Item[] }) {
  const q = useQuery({ queryKey: ["mkt-demanda"], queryFn: demanda });
  if (q.error) return <p className="text-destructive">{q.error.message}</p>;
  if (!q.data) return <p>Carregando oportunidades de conteúdo…</p>;
  const linhas = q.data.servicos
    .map((s: any) => ({
      ...s,
      conteudos: itens.filter(
        (i) =>
          i.servico_id === s.id &&
          ["conteudo", "roteiro", "artigo"].includes(i.tipo) &&
          ["aprovado", "pronto", "publicado"].includes(i.status),
      ).length,
    }))
    .sort(
      (a: any, b: any) =>
        b.demandas / (b.conteudos + 1) - a.demandas / (a.conteudos + 1),
    );
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Comparação dos indicadores comerciais autorizados com materiais
        aprovados ou publicados. Os sinais apoiam a avaliação humana da equipe;
        não são recomendações definitivas.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {linhas.map((s: any) => (
          <Card key={s.id} className="p-5 space-y-2">
            <h3 className="font-semibold">{s.nome}</h3>
            <p className="text-sm">
              {s.demandas} demandas · {s.contratacoes} contratações · conversão{" "}
              {s.conversao ?? 0}%
            </p>
            <p className="text-sm">
              {s.conteudos} materiais aprovados / publicados
            </p>
            <p className="text-sm text-primary">
              {s.demandas >= 5 && s.conteudos < 3
                ? "Demanda relevante com pouca divulgação registrada"
                : s.conteudos === 0
                  ? "Sem conteúdos aprovados vinculados"
                  : "Avaliar equilíbrio entre demanda e divulgação"}
            </p>
          </Card>
        ))}
      </div>
      {linhas.length === 0 && (
        <p className="text-muted-foreground">
          Os indicadores aparecerão quando houver dados agregados suficientes.
        </p>
      )}
    </div>
  );
}
