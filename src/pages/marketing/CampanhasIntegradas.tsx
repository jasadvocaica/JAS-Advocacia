import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  lerResultados,
  operacaoMarketing,
  type Registro,
} from "./operacao-api";
import { filtrosIniciais } from "./resultados";
interface Rascunho {
  id: string;
  nome: string;
  dados: Registro;
  versao: number;
  estado: string;
  aprovacao_estado: string | null;
}
const inicial = {
  nome: "",
  conta_id: "",
  pagina_id: "",
  objetivo: "OUTCOME_LEADS",
  conjunto: "",
  publico: "",
  localizacao: "",
  posicionamentos: "",
  destino: "",
  orcamento: "",
  moeda: "BRL",
  inicio: "",
  fim: "",
  midia_url: "",
  texto: "",
  revisao_etica: false,
  revisao_privacidade: false,
};
const campos = {
  nome: "Nome da campanha",
  conta_id: "ID da conta conectada",
  pagina_id: "Página autorizada",
  objetivo: "Objetivo Meta",
  conjunto: "Conjunto",
  publico: "Público (sem dados do CRM)",
  localizacao: "Localização",
  posicionamentos: "Posicionamentos",
  destino: "Destino HTTPS",
  orcamento: "Orçamento total na moeda indicada",
  moeda: "Moeda",
  inicio: "Início",
  fim: "Fim",
  midia_url: "Mídia HTTPS",
  texto: "Texto informativo",
};
export default function CampanhasIntegradas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(inicial);
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const r = useQuery({
    queryKey: ["mkt-campanhas-integradas", user?.id],
    queryFn: () => operacaoMarketing<Rascunho[]>("campanhas"),
    retry: false,
  });
  const cache = useQuery({
    queryKey: ["mkt-campanhas-externas", user?.id],
    queryFn: () => lerResultados(filtrosIniciais()),
    retry: false,
  });
  const acao = useMutation({
    mutationFn: ({ tipo, payload }: { tipo: string; payload: Registro }) =>
      operacaoMarketing(tipo, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-campanhas-integradas"] });
      qc.invalidateQueries({ queryKey: ["mkt-campanhas"] });
      toast.success("Operação interna registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await acao.mutateAsync({
        tipo: "campanha_salvar",
        payload: { id: editando?.id, versao: editando?.versao, dados: form },
      });
      setEditando(null);
      setForm(inicial);
    } catch {
      /* erro já exibido */
    }
  }
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">
        Campanhas · preparação e aprovação
      </h2>
      <Card className="p-4 text-sm space-y-2">
        <p>
          Rascunhos são registros internos. O estado de entrega na Meta é
          independente.
        </p>
        <p>
          Criação, ativação e mudanças reais de anúncio permanecem bloqueadas. A
          aprovação abaixo executa uma simulação de criação pausada, sem gastos.
          A revisão de ética e privacidade é humana.
        </p>
        <Button asChild variant="outline">
          <Link to="/escritorio/gestora">
            Abrir Central de Aprovações na Sala da Gestora
          </Link>
        </Button>
      </Card>
      <section className="space-y-3">
        <h3 className="font-semibold">Campanhas existentes na Meta</h3>
        {cache.error && <p role="alert">{cache.error.message}</p>}
        {cache.data?.campanhas.map((c) => (
          <Card
            key={String(c.externo_id)}
            className="p-4 flex flex-wrap gap-3 justify-between"
          >
            <div>
              <p>{String(c.nome)}</p>
              <p className="text-sm">
                Entrega: {String(c.estado)} ·{" "}
                {String(c.moeda ?? "Moeda indisponível")}
              </p>
            </div>
            <Button
              variant="outline"
              disabled={acao.isPending}
              onClick={() =>
                acao.mutate({
                  tipo: "importar_campanha",
                  payload: {
                    conta_id: c.conta_externa_id,
                    externo_id: c.externo_id,
                  },
                })
              }
            >
              Vincular ao cadastro comercial
            </Button>
          </Card>
        ))}
      </section>
      <form className="border rounded-lg p-4 space-y-4" onSubmit={salvar}>
        <h3 className="font-semibold">
          {editando ? `Editar versão ${editando.versao}` : "Preparar rascunho"}
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(campos).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                required
                className="w-full rounded border bg-background p-2"
                type={
                  key === "inicio" || key === "fim"
                    ? "date"
                    : key === "orcamento"
                      ? "number"
                      : key === "destino" || key === "midia_url"
                        ? "url"
                        : "text"
                }
                min={key === "orcamento" ? "0.01" : undefined}
                step={key === "orcamento" ? "0.01" : undefined}
                value={String(form[key as keyof typeof form])}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={form.revisao_etica}
            onChange={(e) =>
              setForm({ ...form, revisao_etica: e.target.checked })
            }
          />{" "}
          Revisei caráter informativo, ausência de promessa/captação indevida e
          normas vigentes da OAB.
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={form.revisao_privacidade}
            onChange={(e) =>
              setForm({ ...form, revisao_privacidade: e.target.checked })
            }
          />{" "}
          Revisei privacidade, atributos pessoais, coleta mínima e atendimento
          reservado para documentos sensíveis.
        </label>
        <details className="text-sm break-words">
          <summary>Prévia do pedido</summary>
          <p>
            {form.nome} · {form.objetivo} · {form.moeda} {form.orcamento} ·{" "}
            {form.inicio} a {form.fim}
          </p>
          <p>{form.texto}</p>
          <p>Destino: {form.destino}</p>
          <p>
            Público: {form.publico} · {form.localizacao} ·{" "}
            {form.posicionamentos}
          </p>
          <p>
            Estado solicitado: campanha, conjunto e anúncio PAUSED. Ambiente:
            simulação.
          </p>
        </details>
        <div className="flex gap-2">
          <Button type="submit" disabled={acao.isPending}>
            Salvar rascunho
          </Button>
          {editando && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditando(null);
                setForm(inicial);
              }}
            >
              Cancelar edição
            </Button>
          )}
        </div>
      </form>
      {r.error && <p role="alert">{r.error.message}</p>}
      {r.data?.map((c) => (
        <Card key={c.id} className="p-4 space-y-2">
          <h3 className="font-semibold">
            {c.nome} · v{c.versao}
          </h3>
          <p className="text-sm">
            Interno: {c.estado} · Central:{" "}
            {c.aprovacao_estado ?? "Ainda não solicitada"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditando(c);
                setForm({ ...inicial, ...c.dados } as typeof inicial);
              }}
            >
              Editar (exige nova aprovação)
            </Button>
            <Button
              disabled={
                acao.isPending ||
                c.estado === "aguardando_aprovacao" ||
                c.estado === "simulada"
              }
              onClick={() =>
                acao.mutate({
                  tipo: "campanha_submeter",
                  payload: { id: c.id, versao: c.versao },
                })
              }
            >
              Solicitar aprovação da simulação
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
