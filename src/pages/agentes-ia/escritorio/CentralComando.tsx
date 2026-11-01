import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Play,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { OfficeStatus } from "./design/OfficeUI";
import { CLARA_EXEMPLO } from "../../../../supabase/functions/_shared/clara";
interface Tarefa {
  id: string;
  estado: string;
  arquivo: string;
  hash: string;
  criado_em: string;
  atualizado_em: string;
  candidato: Record<string, string> | null;
  evidencias: Record<string, string> | null;
  pendencias: string[];
  numero_cnj: string | null;
  cliente_id: string | null;
  tentativas: number;
  tokens_entrada: number;
  tokens_saida: number;
  custo_estimado_usd: number;
  erro: string | null;
  eventos: { id: number; estado: string; motivo: string; criado_em: string }[];
}
const ESTADOS: Record<string, string> = {
  queued: "Na fila",
  running: "Clara trabalhando",
  awaiting_input: "Precisa de informação",
  awaiting_approval: "Aguardando sua aprovação",
  completed: "Concluída na homologação",
  failed: "Falhou",
  cancelled: "Cancelada",
};
async function chamar(acao: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("clara-comando", {
    body: { acao, ...args },
  });
  if (error) {
    let msg = error.message;
    try {
      const b = await (
        error as { context?: { json: () => Promise<{ error?: string }> } }
      ).context?.json();
      msg = b?.error ?? msg;
    } catch {
      /* sem payload */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export default function CentralComando() {
  const [habilitado, setHabilitado] = useState<boolean | null>(null),
    [texto, setTexto] = useState(""),
    [arquivo, setArquivo] = useState("texto-colado.txt"),
    [comando, setComando] = useState("Cadastre esta cliente usando o TXT."),
    [ficticios, setFicticios] = useState(false),
    [tarefa, setTarefa] = useState<Tarefa | null>(null),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    void chamar("status")
      .then(async (d) => {
        if (!ativo) return;
        setHabilitado(d.habilitado === true);
        const ultimo = localStorage.getItem("jas_clara_m1_tarefa");
        if (ultimo) {
          try {
            const salvo = await chamar("consultar", { tarefa_id: ultimo });
            if (ativo) setTarefa(salvo.tarefa);
          } catch {
            localStorage.removeItem("jas_clara_m1_tarefa");
          }
        }
      })
      .catch(() => {
        if (ativo) setHabilitado(false);
      });
    return () => {
      ativo = false;
    };
  }, []);
  useEffect(() => {
    if (tarefa?.id) localStorage.setItem("jas_clara_m1_tarefa", tarefa.id);
  }, [tarefa?.id]);
  const consultar = useCallback(async (id: string) => {
    const d = await chamar("consultar", { tarefa_id: id });
    setTarefa(d.tarefa);
    return d.tarefa as Tarefa;
  }, []);
  useEffect(() => {
    if (!tarefa || !["queued", "running"].includes(tarefa.estado)) return;
    const id = tarefa.id;
    const timer = setInterval(
      () => void consultar(id).catch((e) => setErro(e.message)),
      3000,
    );
    return () => clearInterval(timer);
  }, [tarefa?.id, tarefa?.estado, consultar]);
  async function executar() {
    setOcupado(true);
    setErro(null);
    let id = tarefa?.id;
    try {
      const d = await chamar("receber", {
        ambiente: "homologacao",
        dados_ficticios: ficticios,
        texto,
        comando,
        arquivo,
      });
      setTarefa(d.tarefa);
      id = d.tarefa.id;
      if (["queued", "failed"].includes(d.tarefa.estado)) {
        const ex = await chamar("executar", { tarefa_id: id });
        setTarefa(ex.tarefa);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no comando");
      if (id) await consultar(id).catch(() => {});
    } finally {
      setOcupado(false);
    }
  }
  async function decidir(acao: "aprovar" | "cancelar" | "recuperar") {
    if (!tarefa) return;
    setOcupado(true);
    setErro(null);
    try {
      const d = await chamar(acao, { tarefa_id: tarefa.id });
      if (d.tarefa) setTarefa(d.tarefa);
      else await consultar(tarefa.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao registrar decisão");
    } finally {
      setOcupado(false);
    }
  }
  async function anexar(file: File | undefined) {
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".txt") || file.size > 30000)
        throw new Error("Use TXT UTF-8 de até 30 KB.");
      const conteudo = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (conteudo.length > 12000)
        throw new Error("Limite de 12.000 caracteres.");
      setTexto(conteudo);
      setArquivo(file.name);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Arquivo inválido");
    }
  }
  return (
    <section className="op-command-grid" aria-label="Central de Comando">
      <div className="op-panel space-y-5">
        <div className="op-composer-heading">
          <div>
            <h2>O que vamos organizar hoje?</h2>
            <p>Envie sua demanda e acompanhe cada etapa da execução.</p>
          </div>
          <OfficeStatus tone="warning">Homologação</OfficeStatus>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          A Clara prepara o cadastro de uma cliente fictícia por TXT. Você
          confere os dados e aprova antes da gravação no ambiente isolado.
        </p>
        {habilitado === false && (
          <div
            className="rounded-lg border bg-muted/40 p-3 text-xs"
            role="status"
          >
            A homologação da Clara ainda não está habilitada neste servidor.
            Nenhum cadastro em produção será alterado.
          </div>
        )}
        <label className="block text-sm font-medium">
          Seu comando
          <Textarea
            value={comando}
            onChange={(e) => setComando(e.target.value)}
            maxLength={1000}
            rows={2}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
            <Upload size={14} />
            Anexar TXT
            <input
              aria-label="Anexar arquivo TXT"
              type="file"
              accept=".txt,text/plain"
              className="sr-only"
              onChange={(e) => void anexar(e.target.files?.[0])}
            />
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTexto(CLARA_EXEMPLO);
              setArquivo("clara-m1-ficticio.txt");
              setFicticios(true);
            }}
          >
            Usar exemplo fictício
          </Button>
          <span className="text-[10px] text-muted-foreground">{arquivo}</span>
        </div>
        <label className="block text-sm font-medium">
          Conteúdo do TXT
          <Textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setArquivo("texto-colado.txt");
            }}
            maxLength={12000}
            rows={5}
            placeholder="Cole os dados fictícios da cliente ou anexe um TXT."
          />
        </label>
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={ficticios}
            onChange={(e) => setFicticios(e.target.checked)}
            className="mt-0.5"
          />
          Declaro que estes dados são fictícios. A aprovação criará somente um
          cadastro isolado de homologação.
        </label>
        <Button
          disabled={
            ocupado || habilitado !== true || !ficticios || !texto.trim()
          }
          onClick={() => void executar()}
        >
          <Play size={14} className="mr-2" />
          {ocupado ? "Processando…" : "Enviar comando"}
        </Button>
        <div
          className="op-command-capabilities"
          aria-label="Capacidades disponíveis"
        >
          <span>Disponível: cadastro por TXT</span>
          <span>PDF e planilhas: não habilitados</span>
          <span>Limite global: 50 mil tokens/dia</span>
        </div>
        {erro && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {erro}
          </p>
        )}
        {tarefa?.candidato && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileText size={16} />
              Prévia dos dados extraídos
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Arquivo da tarefa: {tarefa.arquivo}
            </p>
            <dl className="space-y-2">
              {Object.entries(tarefa.candidato).map(([campo, valor]) => (
                <div key={campo} className="rounded-md bg-muted/40 p-3">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {campo}
                  </dt>
                  <dd className="break-words text-sm">{valor}</dd>
                  <dd className="mt-1 whitespace-pre-wrap text-[10px] text-muted-foreground">
                    Evidência: {tarefa.evidencias?.[campo]}
                  </dd>
                </div>
              ))}
            </dl>
            {tarefa.pendencias?.length > 0 && (
              <div className="op-warning-box rounded-lg border p-3 text-xs">
                <strong className="flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Pendências que bloqueiam o cadastro
                </strong>
                <ul className="mt-2 list-disc pl-4">
                  {tarefa.pendencias.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {tarefa.numero_cnj && (
              <p className="text-xs text-muted-foreground">
                Número de processo identificado no TXT: {tarefa.numero_cnj}. A
                consulta pela Pia ainda não foi executada.
              </p>
            )}
            {tarefa.estado === "awaiting_approval" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={ocupado}
                  onClick={() => void decidir("aprovar")}
                >
                  <CheckCircle2 size={14} className="mr-2" />
                  Aprovar cadastro fictício
                </Button>
                <Button
                  disabled={ocupado}
                  variant="outline"
                  onClick={() => void decidir("cancelar")}
                >
                  Rejeitar e cancelar
                </Button>
              </div>
            )}
          </div>
        )}
        {tarefa?.cliente_id && (
          <div className="op-success-box rounded-lg border p-4 text-xs">
            <strong>Cadastro confirmado na homologação.</strong>
            <p className="mt-1 break-all">ID: {tarefa.cliente_id}</p>
            <p>
              Repetir o mesmo TXT reutiliza a tarefa, sem criar outra cliente.
            </p>
          </div>
        )}
      </div>
      <aside className="op-panel space-y-5">
        <div className="op-agent-identity">
          <div className="op-agent-avatar">CL</div>
          <div>
            <strong>Clara</strong>
            <span>Assistente de cadastro · TXT</span>
          </div>
        </div>
        <h3 className="text-sm font-semibold">Plano e execução</h3>
        {!tarefa ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Envie um comando e acompanhe aqui a seleção da Clara, a extração, a
            revisão e a confirmação do cadastro.
          </p>
        ) : (
          <>
            <p className="rounded-md bg-muted px-3 py-2 text-xs font-medium">
              {ESTADOS[tarefa.estado] ?? tarefa.estado}
            </p>
            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer">
                Identificação da execução
              </summary>
              <p className="mt-2 break-all">
                Tarefa: {tarefa.id}
                <br />
                Hash SHA-256: {tarefa.hash}
              </p>
            </details>
            <ol className="space-y-3">
              {tarefa.eventos.map((e) => (
                <li key={e.id} className="border-l-2 border-primary/20 pl-3">
                  <strong className="block text-[11px]">
                    {ESTADOS[e.estado] ?? e.estado}
                  </strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.motivo}
                  </p>
                  <time className="text-[9px] text-muted-foreground">
                    {new Date(e.criado_em).toLocaleTimeString("pt-BR", {
                      timeZone: "America/Cuiaba",
                    })}
                  </time>
                </li>
              ))}
            </ol>
            <p className="border-t pt-3 text-xs">
              Tokens confirmados: {tarefa.tokens_entrada + tarefa.tokens_saida}{" "}
              · Tentativas: {tarefa.tentativas}/3
              <br />
              Custo estimado: US$ {Number(tarefa.custo_estimado_usd).toFixed(6)}
            </p>
            {tarefa.erro && (
              <p className="text-xs text-destructive">{tarefa.erro}</p>
            )}
            {tarefa.estado === "running" &&
              Date.now() - new Date(tarefa.atualizado_em).getTime() >
                600000 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => void decidir("recuperar")}
                >
                  Conferir execução interrompida
                </Button>
              )}
          </>
        )}
        <p className="border-t pt-3 text-[10px] leading-relaxed text-muted-foreground">
          A IA extrai; o código valida evidências e CPF. Aprovar não envia
          mensagens, cria processos ou altera dados financeiros. O uso respeita
          os limites de OpenAI do escritório.
        </p>
      </aside>
    </section>
  );
}
