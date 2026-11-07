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
                onChange={(e) => setF({ ...f, [key]: e.target.value })}
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
