import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";
import type { CampoSistema, LinhaValidada } from "../csv-parser";

interface Props {
  campos: CampoSistema[];
  linhas: LinhaValidada[];
  ignorarErros: boolean;
  setIgnorarErros: (v: boolean) => void;
  onVoltar: () => void;
  onAvancar: () => void;
}

type Filtro = "todos" | "ok" | "aviso" | "erro";

export function StepValidacao({
  campos,
  linhas,
  ignorarErros,
  setIgnorarErros,
  onVoltar,
  onAvancar,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [expandida, setExpandida] = useState<number | null>(null);

  const stats = useMemo(() => {
    return linhas.reduce(
      (acc, l) => {
        acc.total++;
        acc[l.status]++;
        return acc;
      },
      { total: 0, ok: 0, aviso: 0, erro: 0 },
    );
  }, [linhas]);

  const filtradas = useMemo(
    () => (filtro === "todos" ? linhas : linhas.filter((l) => l.status === filtro)),
    [linhas, filtro],
  );

  const podeAvancar = stats.erro === 0 || ignorarErros;
  // linhas que efetivamente serão persistidas
  const aImportar = stats.ok + stats.aviso;
  const aDescartar = ignorarErros ? stats.erro : 0;
  const bloqueadas = ignorarErros ? 0 : stats.erro;
  const progresso = stats.total === 0 ? 0 : Math.round(((aImportar + aDescartar) / stats.total) * 100);

  const camposVisiveis = campos.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Painel fixo no topo: contadores + progresso reativo */}
      <div className="sticky top-0 z-20 -mx-6 px-6 pt-2 pb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-serif italic">Pré-visualização e Crítica</h2>
            <p className="text-xs text-muted-foreground">
              Revise inconsistências antes de confirmar a importação.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Pronto para importar
            </p>
            <p className="text-2xl font-serif tabular-nums text-foreground">
              {aImportar.toLocaleString("pt-BR")}
              <span className="text-sm text-muted-foreground">
                {" "}/ {stats.total.toLocaleString("pt-BR")}
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border mb-3">
          <Stat label="Total" valor={stats.total} />
          <Stat label="Válidas" valor={stats.ok} cor="text-success" />
          <Stat label="Avisos" valor={stats.aviso} cor="text-warning" />
          <Stat
            label={ignorarErros && stats.erro > 0 ? "Erros (descartar)" : "Erros"}
            valor={stats.erro}
            cor="text-destructive"
          />
        </div>

        {/* Barra de progresso segmentada */}
        <div className="space-y-1.5">
          <div className="flex h-2 w-full overflow-hidden bg-muted border border-border">
            {stats.total > 0 && (
              <>
                <div
                  className="bg-success transition-all duration-300"
                  style={{ width: `${(stats.ok / stats.total) * 100}%` }}
                  title={`Válidas: ${stats.ok}`}
                />
                <div
                  className="bg-warning transition-all duration-300"
                  style={{ width: `${(stats.aviso / stats.total) * 100}%` }}
                  title={`Avisos: ${stats.aviso}`}
                />
                {ignorarErros && (
                  <div
                    className="bg-muted-foreground/40 transition-all duration-300"
                    style={{ width: `${(stats.erro / stats.total) * 100}%` }}
                    title={`Erros descartados: ${stats.erro}`}
                  />
                )}
                {!ignorarErros && (
                  <div
                    className="bg-destructive transition-all duration-300"
                    style={{ width: `${(stats.erro / stats.total) * 100}%` }}
                    title={`Erros bloqueando: ${stats.erro}`}
                  />
                )}
              </>
            )}
          </div>
          <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>
              {progresso}% resolvido
              {bloqueadas > 0 && (
                <span className="text-destructive normal-case tracking-normal ml-2">
                  • {bloqueadas} erro(s) bloqueando avanço
                </span>
              )}
              {aDescartar > 0 && (
                <span className="text-muted-foreground normal-case tracking-normal ml-2">
                  • {aDescartar} serão descartadas
                </span>
              )}
            </span>
            <span className={podeAvancar ? "text-success" : "text-destructive"}>
              {podeAvancar ? "Pronto para avançar" : "Ajuste necessário"}
            </span>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar:</span>
        {(["todos", "ok", "aviso", "erro"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider border transition-colors ${
              filtro === f
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:bg-muted"
            }`}
          >
            {f === "todos" ? "Todos" : f === "ok" ? "Válidos" : f === "aviso" ? "Avisos" : "Erros"}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="border border-border overflow-hidden">
        <div
          className="grid bg-muted/50 text-[10px] font-bold uppercase tracking-widest p-3 gap-3"
          style={{ gridTemplateColumns: `40px 60px repeat(${camposVisiveis.length}, minmax(0, 1fr)) 24px` }}
        >
          <div>Status</div>
          <div>Linha</div>
          {camposVisiveis.map((c) => (
            <div key={c.chave} className="truncate">
              {c.rotulo}
            </div>
          ))}
          <div></div>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-border">
          {filtradas.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma linha neste filtro.
            </div>
          )}
          {filtradas.slice(0, 200).map((linha) => (
            <div key={linha.linha}>
              <button
                type="button"
                onClick={() => setExpandida(expandida === linha.linha ? null : linha.linha)}
                className={`w-full text-left grid items-center p-3 gap-3 hover:bg-muted/30 transition-colors ${
                  linha.status === "erro"
                    ? "bg-destructive/5"
                    : linha.status === "aviso"
                      ? "bg-amber-50/40 dark:bg-amber-950/10"
                      : "bg-background"
                }`}
                style={{
                  gridTemplateColumns: `40px 60px repeat(${camposVisiveis.length}, minmax(0, 1fr)) 24px`,
                }}
              >
                <StatusIcon status={linha.status} />
                <span className="text-xs tabular-nums text-muted-foreground">{linha.linha}</span>
                {camposVisiveis.map((c) => {
                  const temErroNoCampo = linha.problemas.some((p) => p.campo === c.chave);
                  return (
                    <span
                      key={c.chave}
                      className={`text-sm truncate ${
                        temErroNoCampo ? "text-destructive font-medium" : ""
                      }`}
                    >
                      {linha.valores[c.chave] || (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </span>
                  );
                })}
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    expandida === linha.linha ? "rotate-180" : ""
                  }`}
                />
              </button>
              {expandida === linha.linha && (
                <div className="bg-muted/40 px-12 py-4 text-xs space-y-1">
                  {linha.problemas.length === 0 ? (
                    <span className="text-success font-medium">
                      Sem inconsistências detectadas.
                    </span>
                  ) : (
                    linha.problemas.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <Badge
                          variant={p.tipo === "erro" ? "destructive" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {p.tipo}
                        </Badge>
                        <span>
                          <span className="font-medium">
                            {campos.find((c) => c.chave === p.campo)?.rotulo ?? p.campo}:
                          </span>{" "}
                          {p.mensagem}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
          {filtradas.length > 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground bg-muted/30">
              Exibindo 200 de {filtradas.length.toLocaleString("pt-BR")} linhas. Filtre para ver mais.
            </div>
          )}
        </div>
      </div>

      {/* Toggle ignorar erros */}
      {stats.erro > 0 && (
        <div className="flex items-center justify-between p-4 border border-border bg-muted/30">
          <div>
            <p className="text-sm font-medium">Ignorar linhas com erro e importar o restante</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.ok + stats.aviso} linha(s) serão importadas; {stats.erro} serão descartadas.
            </p>
          </div>
          <Switch checked={ignorarErros} onCheckedChange={setIgnorarErros} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onVoltar}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button
          onClick={onAvancar}
          disabled={!podeAvancar}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          Confirmar importação de {(stats.ok + stats.aviso).toLocaleString("pt-BR")} registro(s)
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div className="bg-background p-4">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className={`text-3xl font-serif tabular-nums ${cor ?? ""}`}>
        {valor.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

function StatusIcon({ status }: { status: "ok" | "aviso" | "erro" }) {
  if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (status === "aviso") return <AlertTriangle className="w-4 h-4 text-warning" />;
  return <XCircle className="w-4 h-4 text-destructive" />;
}
