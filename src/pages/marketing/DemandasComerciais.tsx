import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { contexto, tabela, operar, historicoDemanda } from "./api";
import { Escolha } from "./ItemForm";
export default function DemandasComerciais({
  clienteId,
  compact = false,
}: {
  clienteId?: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const c = useQuery({
    queryKey: ["mkt-contexto", user?.id],
    queryFn: contexto,
  });
  const q = useQuery({
    queryKey: ["comercial-demandas", user?.id, clienteId],
    queryFn: () =>
      tabela(
        "comercial_demandas",
        clienteId ? "cliente_id" : undefined,
        clienteId,
      ),
  });
  const ts = useQuery({
    queryKey: ["comercial-demanda-teses", user?.id],
    queryFn: () => tabela("comercial_demanda_teses"),
  });
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState("");
  const hist = useQuery({
    queryKey: ["mkt-demanda-historico", form?.id],
    enabled: !!form?.id,
    queryFn: () => historicoDemanda(form.id),
  });
  const ctx = c.data;
  if (c.error || q.error)
    return (
      <p className="text-destructive">
        Não foi possível carregar os serviços: {(c.error ?? q.error)?.message}
      </p>
    );
  if (!ctx || q.isLoading) return <p>Carregando serviços…</p>;
  if (!(ctx.permissoes.demandas || (ctx.permissoes.demandas || ctx.permissoes.comercial))) return <p>Sem autorização comercial.</p>;
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });
  const nome = (id: string, tipo: "clientes" | "leads" | "servicos") =>
    ctx[tipo].find((c) => c.id === id)?.nome ?? "Não informado";
  return (
    <div className="space-y-5">
      {!compact && (
        <PageHeader
          title="Serviços e oportunidades"
          description="Demandas independentes vinculadas aos cadastros existentes. Um cliente pode ter vários serviços e novas contratações do mesmo serviço."
        />
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar cliente ou serviço"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Button
          onClick={() =>
            setForm({
              cliente_id: clienteId ?? "",
              status: "oportunidade",
              aberto_em: new Date().toISOString().slice(0, 10),
              teses: [],
            })
          }
        >
          Nova demanda
        </Button>
      </div>
      <div className="space-y-3">
        {q.data
          ?.filter((d: any) =>
            `${nome(d.cliente_id, "clientes")} ${nome(d.lead_id, "leads")} ${nome(d.servico_id, "servicos")}`
              .toLowerCase()
              .includes(busca.toLowerCase()),
          )
          .map((d: any) => (
            <Card
              key={d.id}
              className="p-4 flex flex-wrap justify-between gap-2"
            >
              <div>
                <p className="font-semibold">
                  {nome(d.servico_id, "servicos")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {d.cliente_id
                    ? nome(d.cliente_id, "clientes")
                    : nome(d.lead_id, "leads")}{" "}
                  · {d.status} · abertura {d.aberto_em}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setForm({
                    ...d,
                    teses:
                      ts.data
                        ?.filter((t: any) => t.demanda_id === d.id)
                        .map((t: any) => t.tese_id) ?? [],
                  })
                }
              >
                Editar / histórico
              </Button>
            </Card>
          ))}
        {q.data?.length === 0 && (
          <p className="text-muted-foreground">
            Nenhuma demanda registrada. Cadastre a oportunidade ou contratação
            vinculada ao cliente existente.
          </p>
        )}
      </div>
      {form && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o && !busy) setForm(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {form.id ? "Atualizar" : "Nova"} demanda de serviço
              </DialogTitle>
              <DialogDescription>
                Uma oportunidade pode virar contratação. Demandas distintas têm
                registros próprios e preservam o histórico.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await operar("demanda", form);
                  qc.invalidateQueries({ queryKey: ["comercial-demandas"] });
                  qc.invalidateQueries({
                    queryKey: ["comercial-demanda-teses"],
                  });
                  setForm(null);
                  toast.success("Demanda registrada");
                } catch (e: any) {
                  toast.error(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Escolha
                label="Cliente existente"
                value={form.cliente_id}
                opcoes={ctx.clientes}
                onChange={(v) => set("cliente_id", v)}
              />
              <Escolha
                label="Lead existente (se ainda não é cliente)"
                value={form.lead_id}
                opcoes={ctx.leads}
                onChange={(v) => set("lead_id", v)}
              />
              <Escolha
                label="Serviço *"
                required
                value={form.servico_id}
                opcoes={ctx.servicos}
                onChange={(v) => set("servico_id", v)}
              />
              <Escolha
                label="Situação comercial"
                value={form.status}
                opcoes={Object.entries({
                  oportunidade: "Oportunidade",
                  negociacao: "Em negociação",
                  contratado: "Contratado",
                  perdido: "Perdido",
                  arquivado: "Arquivado",
                }).map(([id, nome]) => ({ id, nome }))}
                onChange={(v) => set("status", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data de abertura</Label>
                  <Input
                    type="date"
                    value={form.aberto_em ?? ""}
                    onChange={(e) => set("aberto_em", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Data da contratação</Label>
                  <Input
                    type="date"
                    required={form.status === "contratado"}
                    value={form.contratado_em ?? ""}
                    onChange={(e) => set("contratado_em", e.target.value)}
                  />
                </div>
              </div>
              <Escolha
                label="Responsável"
                value={form.responsavel_id}
                opcoes={ctx.usuarios}
                onChange={(v) => set("responsavel_id", v)}
              />
              <div>
                <Label>Origem do atendimento</Label>
                <Input
                  value={form.origem ?? ""}
                  onChange={(e) => set("origem", e.target.value)}
                />
              </div>
              <Escolha
                label="Campanha de origem confirmada"
                value={form.campanha_id}
                opcoes={ctx.campanhas ?? []}
                onChange={(v) => set("campanha_id", v)}
              />
              <Escolha
                label="Contrato existente do cliente"
                value={form.contrato_id}
                opcoes={ctx.contratos
                  .filter((h) => h.cliente_id === form.cliente_id)
                  .map((h) => ({
                    id: h.id,
                    nome: `Contrato ${h.id.slice(0, 8)} · ${h.status}`,
                  }))}
                onChange={(v) => set("contrato_id", v)}
              />
              <div>
                <Label>Referência ao caso (ID do processo existente)</Label>
                <Input
                  value={form.processo_id ?? ""}
                  onChange={(e) => set("processo_id", e.target.value)}
                />
              </div>
              <p className="text-sm font-medium">Teses relacionadas</p>
              {ctx.teses.map((t) => (
                <label key={t.id} className="flex gap-2 items-center text-sm">
                  <Checkbox
                    checked={form.teses.includes(t.id)}
                    onCheckedChange={(v) =>
                      set(
                        "teses",
                        v
                          ? [...form.teses, t.id]
                          : form.teses.filter((id: string) => id !== t.id),
                      )
                    }
                  />
                  {t.nome}
                </label>
              ))}
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={form.observacoes ?? ""}
                  onChange={(e) => set("observacoes", e.target.value)}
                />
              </div>
              <Button disabled={busy}>Salvar demanda</Button>
              {form.id && (
                <div className="border-t pt-4 space-y-2">
                  <h3 className="font-semibold">Histórico da demanda</h3>
                  {hist.error && (
                    <p className="text-destructive">{hist.error.message}</p>
                  )}
                  {hist.data?.map((h: any) => (
                    <p key={h.id} className="text-sm">
                      {new Date(h.quando).toLocaleString("pt-BR")} · {h.usuario}{" "}
                      · {h.situacao_anterior ?? "Nova demanda"} →{" "}
                      {h.situacao_atual}
                    </p>
                  ))}
                </div>
              )}
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
