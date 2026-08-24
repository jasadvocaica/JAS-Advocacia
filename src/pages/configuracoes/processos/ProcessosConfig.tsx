import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Workflow, Database, Layers, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

interface AreaItem { nome: string }
interface StatusItem { id: string; nome: string; cor: string; ativo: boolean }
interface TiposAcao { [area: string]: string[] }

/**
 * CONFIGURAÇÕES → Processos.
 * Resumo das áreas, status e tipos de ação cadastrados, com atalhos.
 */
export default function ProcessosConfig() {
  const { config, loading } = useConfiguracoes("processos");

  const areas = (config.areas_direito as string[] | undefined) ?? [];
  const statusList = (config.status_customizados as StatusItem[] | undefined) ?? [];
  const tiposAcao = (config.tipos_acao as TiposAcao | undefined) ?? {};
  const totalTipos = Object.values(tiposAcao).reduce((acc, lst) => acc + (lst?.length ?? 0), 0);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardResumo
          icon={<Layers className="w-5 h-5 text-gold" />}
          titulo="Áreas do Direito"
          descricao={`${areas.length} áreas cadastradas`}
        >
          <div className="flex flex-wrap gap-1.5 mt-3">
            {areas.slice(0, 8).map((a) => (
              <Badge key={a} variant="secondary" className="capitalize">{a}</Badge>
            ))}
            {areas.length > 8 && <Badge variant="outline">+{areas.length - 8}</Badge>}
          </div>
        </CardResumo>

        <CardResumo
          icon={<Tag className="w-5 h-5 text-gold" />}
          titulo="Status de processo"
          descricao={`${statusList.filter((s) => s.ativo).length} ativos · ${statusList.length} no total`}
        >
          <div className="flex flex-wrap gap-1.5 mt-3">
            {statusList.slice(0, 6).map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md border"
                style={{ borderColor: s.cor, color: s.cor }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: s.cor }} />
                {s.nome}
              </span>
            ))}
          </div>
        </CardResumo>

        <CardResumo
          icon={<Database className="w-5 h-5 text-gold" />}
          titulo="Tipos de ação"
          descricao={`${totalTipos} tipos em ${Object.keys(tiposAcao).length} áreas`}
        >
          <p className="text-xs text-muted-foreground mt-3">
            Edição em massa via CSV/JSON em breve. Por ora, a lista é mantida pelo gestor.
          </p>
        </CardResumo>

        <CardResumo
          icon={<Workflow className="w-5 h-5 text-gold" />}
          titulo="Fluxos de trabalho"
          descricao="Templates de etapas que automatizam tarefas e prazos"
        >
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link to="/fluxos">
              Gerenciar fluxos <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </CardResumo>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atalhos relacionados</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Atalho
            to="/configuracoes/datajud"
            titulo="Regras DataJud → Ação"
            descricao="Define o que fazer quando um andamento chega do tribunal"
          />
          <Atalho
            to="/fluxos"
            titulo="Templates de fluxo"
            descricao="Cadeias de etapas com prazos automáticos"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CardResumo({
  icon,
  titulo,
  descricao,
  children,
}: {
  icon: React.ReactNode;
  titulo: string;
  descricao: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function Atalho({ to, titulo, descricao }: { to: string; titulo: string; descricao: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md border p-3 hover:bg-muted transition-colors"
    >
      <div>
        <div className="font-medium text-sm">{titulo}</div>
        <div className="text-xs text-muted-foreground">{descricao}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground" />
    </Link>
  );
}
