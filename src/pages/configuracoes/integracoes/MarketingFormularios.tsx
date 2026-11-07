import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  operacaoMarketing,
  type Registro,
} from "@/pages/marketing/operacao-api";
interface FormularioDisponivel { id: string; nome: string; pagina_id: string | null; status: string | null; }
interface Descoberta { conta_id: string; formularios: FormularioDisponivel[]; cursor: string | null; hasMore: boolean; }
const inicial = {
  conta_id: "",
  pagina_id: "",
  formulario_id: "",
  escopos_conferidos: false,
  privacidade_conferida: false,
  termos_conferidos: false,
  ativo: false,
};
export default function MarketingFormularios() {
  const qc = useQueryClient();
  const [f, setF] = useState(inicial);
  const [cursores, setCursores] = useState<Record<string, string | null>>({});
  const [ocupado, setOcupado] = useState(false);
  const [descoberta, setDescoberta] = useState<Descoberta | null>(null);
  const [buscando, setBuscando] = useState(false);
  const contas = useQuery({
    queryKey: ["mkt-contas-formularios"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("zernio", { body: { acao: "painel", aba: "visao" } });
      if (error || data?.error) throw new Error("Não foi possível consultar as contas conectadas");
      return (data.contas ?? []) as { externo_id: string; nome: string; plataforma: string; ativa: boolean; selecionada: boolean; precisa_reconectar: boolean }[];
    }, retry: false,
  });
  async function descobrir(proxima = false) {
    const conta = f.conta_id;
    setBuscando(true);
    if (!proxima) setDescoberta(null);
    try {
      const { data, error } = await supabase.functions.invoke("zernio", { body: {
        acao: "descobrir_formularios", conta_id: conta,
        cursor: proxima && descoberta?.conta_id === conta ? descoberta.cursor : undefined,
      } });
      if (error || data?.error) throw new Error(data?.error ?? "Não foi possível consultar os formulários");
      setDescoberta(data as Descoberta);
    } catch (e) { setDescoberta(null); toast.error(e instanceof Error ? e.message : "Falha ao consultar formulários"); }
    finally { setBuscando(false); }
  }
  const q = useQuery({
    queryKey: ["mkt-formularios"],
    queryFn: () => operacaoMarketing<Registro[]>("formularios"),
    retry: false,
  });
  const salvar = useMutation({
    mutationFn: () => operacaoMarketing("formulario_salvar", f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-formularios"] });
      toast.success("Homologação registrada; somente testes");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  async function reconciliar(r: Registro) {
    const key = String(r.conta_id) + String(r.formulario_id);
    setOcupado(true);
    try {
      const { data, error } = await supabase.functions.invoke("zernio", {
        body: {
          acao: "reconciliar_leads",
          conta_id: r.conta_id,
          formulario_id: r.formulario_id,
          cursor: cursores[key] ?? undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      setCursores({ ...cursores, [key]: data.hasMore ? data.cursor : null });
      toast.success(
        `${data.processados} entradas conferidas. ${data.hasMore ? "Há próxima página; clique para continuar." : "Reconciliação concluída."}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reconciliar");
    } finally {
      setOcupado(false);
    }
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    salvar.mutate();
  };
  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold">
        Lead Ads · homologação por Página e formulário
      </h3>
      <p className="text-sm">
        Este cadastro autoriza somente formulários de teste. Confirme acesso
        real à Página e às permissões de leitura, termos Lead Ads e política de
        privacidade antes de habilitar o receptor. Segredos são configurados
        somente no servidor. Não cole chaves nesta tela.
      </p>
      {q.error && <p role="alert">{q.error.message}</p>}
      {contas.error && <p role="alert">{contas.error.message}</p>}
      <div className="space-y-2">
        <label className="block text-sm">Conta Meta para consultar
          <select className="border rounded p-2 w-full bg-background" value={f.conta_id} disabled={buscando} onChange={e => { setF({ ...inicial, conta_id: e.target.value }); setDescoberta(null); }}>
            <option value="">Selecione uma conta</option>
            {!contas.error && contas.data?.filter(c => c.ativa && c.selecionada && !c.precisa_reconectar && ["facebook", "metaads", "instagram"].includes(c.plataforma)).map(c => <option key={c.externo_id} value={c.externo_id}>{c.nome || c.externo_id} · {c.plataforma}</option>)}
          </select>
        </label>
        <Button variant="outline" disabled={!f.conta_id || buscando} onClick={() => descobrir()}>{buscando ? "Consultando…" : "Consultar formulários da Página"}</Button>
        {descoberta?.conta_id === f.conta_id && <div className="space-y-2">
          {!descoberta.formularios.length && <p>Nenhum formulário nesta página de resultados.</p>}
          {descoberta.formularios.map(r => <div key={r.id} className="border rounded p-3 text-sm">
            <p>{r.nome} · {r.status ?? "estado não informado"}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...inicial, conta_id: descoberta.conta_id, formulario_id: r.id, pagina_id: r.pagina_id ?? "" })}>Selecionar para homologação</Button>
            {!r.pagina_id && <p>O provedor não informou o ID da Página; confira esse campo abaixo.</p>}
          </div>)}
          {descoberta.hasMore && <Button variant="outline" disabled={buscando} onClick={() => descobrir(true)}>Próxima página de formulários</Button>}
        </div>}
      </div>
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            ["conta_id", "Conta conectada"],
            ["pagina_id", "Página"],
            ["formulario_id", "Formulário de teste"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                required
                className="border rounded p-2 w-full bg-background"
                value={String(f[key as keyof typeof f])}
                onChange={(e) => { setF({ ...f, [key]: e.target.value }); if (key === "conta_id") setDescoberta(null); }}
              />
            </label>
          ))}
        </div>
        {(
          [
            [
              "escopos_conferidos",
              "Conferi Página selecionada, escopos e acesso à leitura de leads.",
            ],
            [
              "privacidade_conferida",
              "Conferi política de privacidade e coleta mínima de contato.",
            ],
            ["termos_conferidos", "Conferi os termos Lead Ads aplicáveis."],
            ["ativo", "Autorizar este formulário para homologação."],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <input
              type="checkbox"
              checked={f[key]}
              onChange={(e) => setF({ ...f, [key]: e.target.checked })}
            />{" "}
            {label}
          </label>
        ))}
        <Button disabled={salvar.isPending}>Salvar conferência</Button>
      </form>
      {q.data?.map((r) => (
        <p
          className="text-sm break-words"
          key={String(r.conta_id) + String(r.formulario_id)}
        >
          Página {String(r.pagina_id)} · formulário {String(r.formulario_id)} ·{" "}
          {r.ativo ? "autorizado para teste" : "desativado"}{" "}
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado || !r.ativo}
            onClick={() => reconciliar(r)}
          >
            {cursores[String(r.conta_id) + String(r.formulario_id)]
              ? "Continuar próxima página"
              : "Reconciliar entradas"}
          </Button>
        </p>
      ))}
      <p className="text-sm text-muted-foreground">
        O receptor nasce desligado. A instalação e o teste assinado de ponta a
        ponta são etapas distintas deste cadastro.
      </p>
    </Card>
  );
}
