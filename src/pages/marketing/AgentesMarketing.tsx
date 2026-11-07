import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { operacaoMarketing } from "./operacao-api";
const papeis = [
  ["Nina", "Pautas, calendário, roteiros e relatórios com fonte e período."],
  ["Bela", "Arte, versões e referências do Estúdio Criativo JAS."],
  ["Bia", "Sugestões de classificação para revisão humana na triagem."],
  ["Theo", "Análise dos resultados e sugestões sujeitas a aprovação."],
  ["Alex", "Diagnóstico de falhas, desconexão e atraso da sincronização."],
];
interface Agente {
  id: string;
  nome: string;
  slug: string;
  ativo: boolean;
  executor: string | null;
  ferramentas: string[];
}
export default function AgentesMarketing() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["mkt-agentes", user?.id],
    queryFn: () => operacaoMarketing<Agente[]>("agentes"),
    retry: false,
  });
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-xl">Equipe de apoio ao Marketing</h2>
      <p className="text-sm text-muted-foreground">
        Uma missão registrada, uma entrega gerada e uma ação externa executada
        têm evidências distintas. As permissões e o orçamento existentes
        continuam sendo conferidos pelo motor.
      </p>
      {q.error && <p role="alert">{q.error.message}</p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {papeis.map(([nome, papel]) => {
          const a = q.data?.find(
            (a) => a.nome.toLowerCase().split(" ")[0] === nome.toLowerCase(),
          );
          return (
            <Card key={nome} className="p-4 space-y-2">
              <h3 className="font-semibold">{nome}</h3>
              <p className="text-sm">{papel}</p>
              <p className="text-sm">
                {q.isPending
                  ? "Conferindo disponibilidade…"
                  : a?.ativo && a.executor
                    ? `Executor configurado: ${a.executor}`
                    : "Fluxo manual disponível; executor não confirmado."}
              </p>
              {a && (
                <p className="text-xs">
                  {a.ferramentas.length} ferramentas concedidas. A configuração
                  não comprova uma execução bem-sucedida.
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link
                  to={
                    nome === "Bela"
                      ? "/escritorio/entregas"
                      : "/escritorio/missoes"
                  }
                >
                  {nome === "Bela"
                    ? "Abrir entregas e estúdio"
                    : "Abrir missões autorizadas"}
                </Link>
              </Button>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
