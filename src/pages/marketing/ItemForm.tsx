import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import EditorMarketing from "./EditorMarketing";
import {
  CAMPOS,
  CANAIS,
  FORMATOS,
  CHECKLIST,
  TIPOS,
  type Contexto,
  type Item,
  type Tipo,
  type Opcao,
} from "./model";
import { operar } from "./api";
export function Escolha({
  label,
  value,
  onChange,
  opcoes,
  required = false,
}: {
  label: string;
  value?: string | null;
  onChange: (v: string) => void;
  opcoes: Opcao[];
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select
        aria-label={label}
        required={required}
        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Selecione</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
const opts = (obj: Record<string, string>) =>
  Object.entries(obj).map(([id, nome]) => ({ id, nome }));
function localData(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export default function ItemForm({
  item,
  tipo,
  ctx,
  itens,
  onClose,
  onSaved,
}: {
  item?: Item;
  tipo: Tipo;
  ctx: Contexto;
  itens: Item[];
  onClose: () => void;
  onSaved: (i: Item) => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<any>(
    item
      ? {
          ...item,
          prazo: localData(item.prazo),
          data_prevista: localData(item.data_prevista),
        }
      : {
          tipo,
          titulo: "",
          responsavel_id: user?.id,
          descricao: "",
          prioridade: "normal",
          dados:
            tipo === "rotina"
              ? { frequencia: "semanal" }
              : tipo === "campanha"
                ? { objetivo_campanha: "leads" }
                : {},
        },
  );
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const extra = (k: string, v: any) =>
    setForm((f: any) => ({ ...f, dados: { ...f.dados, [k]: v } }));
  const comuns = !["tarefa", "rotina", "gravacao", "concorrente"].includes(
    tipo,
  );
  const catalogo = comuns || tipo === "concorrente";
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        tipo,
        prazo: form.prazo ? new Date(form.prazo).toISOString() : null,
        data_prevista: form.data_prevista
          ? new Date(form.data_prevista).toISOString()
          : null,
      };
      const result = await operar("salvar", payload);
      toast.success("Registro salvo");
      onSaved(result);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar" : "Novo registro"} — {TIPOS[tipo]}
          </DialogTitle>
          <DialogDescription>
            Organize a atividade, os responsáveis e os materiais. A aprovação é
            registrada separadamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-5">
          <div className="space-y-1">
            <Label>Título / nome *</Label>
            <Input
              required
              maxLength={250}
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Escolha
              label="Responsável"
              value={form.responsavel_id}
              onChange={(v) => set("responsavel_id", v)}
              opcoes={
                !["tarefa", "rotina"].includes(tipo) || ctx.permissoes.gerenciar
                  ? ctx.usuarios
                  : ctx.usuarios.filter(
                      (u) =>
                        u.id === form.responsavel_id ||
                        u.id === form.criado_por,
                    )
              }
            />
            <Escolha
              label="Prioridade"
              value={form.prioridade}
              onChange={(v) => set("prioridade", v)}
              opcoes={opts({
                baixa: "Baixa",
                normal: "Normal",
                alta: "Alta",
                urgente: "Urgente",
              })}
            />
            <div>
              <Label>Prazo</Label>
              <Input
                type="datetime-local"
                value={form.prazo ?? ""}
                onChange={(e) => set("prazo", e.target.value)}
              />
            </div>
            <div>
              <Label>
                {tipo === "rotina"
                  ? "Início da recorrência"
                  : tipo === "gravacao"
                    ? "Data e horário da gravação"
                    : "Data e horário previstos"}
              </Label>
              <Input
                type="datetime-local"
                required={tipo === "rotina"}
                value={form.data_prevista ?? ""}
                onChange={(e) => set("data_prevista", e.target.value)}
              />
            </div>
          </div>
          <details className="border rounded-lg p-4">
            <summary className="cursor-pointer font-medium text-sm">
              Detalhes avançados, vínculos e materiais
            </summary>
            <div className="space-y-4 pt-4">
              {catalogo && (
                <div className="grid sm:grid-cols-3 gap-4">
                  <Escolha
                    label="Área jurídica"
                    value={form.area_id}
                    onChange={(v) => set("area_id", v)}
                    opcoes={ctx.areas}
                  />
                  <Escolha
                    label="Serviço relacionado"
                    value={form.servico_id}
                    onChange={(v) => set("servico_id", v)}
                    opcoes={ctx.servicos}
                  />
                  <Escolha
                    label="Tese relacionada"
                    value={form.tese_id}
                    onChange={(v) => set("tese_id", v)}
                    opcoes={ctx.teses}
                  />
                </div>
              )}
              {comuns && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Escolha
                    label="Canal / plataforma"
                    value={form.canal}
                    onChange={(v) => set("canal", v)}
                    opcoes={opts(
                      tipo === "campanha"
                        ? {
                            meta_ads: "Meta Ads",
                            google_ads: "Google Ads",
                            tiktok_ads: "TikTok Ads",
                            outro_pago: "Outro / orgânico",
                          }
                        : CANAIS,
                    )}
                  />
                  <Escolha
                    label="Formato"
                    value={form.formato}
                    onChange={(v) => set("formato", v)}
                    opcoes={opts(FORMATOS)}
                  />
                  {tipo !== "campanha" && (
                    <Escolha
                      label="Campanha vinculada"
                      value={form.campanha_id}
                      onChange={(v) => set("campanha_id", v)}
                      opcoes={itens
                        .filter((i) => i.tipo === "campanha")
                        .map((i) => ({ id: i.id, nome: i.titulo }))}
                    />
                  )}
                  {tipo === "pauta" && (
                    <Escolha
                      label="Planejamento editorial"
                      value={form.planejamento_id}
                      onChange={(v) => set("planejamento_id", v)}
                      opcoes={itens
                        .filter((i) => i.tipo === "planejamento")
                        .map((i) => ({ id: i.id, nome: i.titulo }))}
                    />
                  )}
                  {["conteudo", "roteiro", "artigo", "material"].includes(
                    tipo,
                  ) && (
                    <Escolha
                      label="Pauta aprovada"
                      value={form.pauta_id}
                      onChange={(v) => set("pauta_id", v)}
                      opcoes={itens
                        .filter(
                          (i) => i.tipo === "pauta" && i.status === "aprovado",
                        )
                        .map((i) => ({ id: i.id, nome: i.titulo }))}
                    />
                  )}
                </div>
              )}
              {tipo === "pesquisa" && (
                <Escolha
                  label="Concorrente analisado (opcional)"
                  value={form.origem_id}
                  onChange={(v) => set("origem_id", v)}
                  opcoes={itens
                    .filter((i) => i.tipo === "concorrente")
                    .map((i) => ({ id: i.id, nome: i.titulo }))}
                />
              )}
              <div className="space-y-4 border-t pt-4">
                {CAMPOS[tipo].map((c) => (
                  <div key={c.chave} className="space-y-1">
                    <Label>{c.rotulo}</Label>
                    {c.tipo === "editor" ? (
                      <EditorMarketing
                        value={form.dados[c.chave] ?? ""}
                        onChange={(v) => extra(c.chave, v)}
                      />
                    ) : c.tipo === "select" ? (
                      <Escolha
                        label={c.rotulo}
                        value={form.dados[c.chave]}
                        opcoes={opts(c.opcoes!)}
                        onChange={(v) => extra(c.chave, v)}
                      />
                    ) : c.tipo === "longo" ? (
                      <Textarea
                        rows={3}
                        value={form.dados[c.chave] ?? ""}
                        onChange={(e) => extra(c.chave, e.target.value)}
                      />
                    ) : (
                      <Input
                        type={
                          c.tipo === "data"
                            ? "date"
                            : c.tipo === "numero"
                              ? "number"
                              : c.chave.startsWith("link_") ||
                                  [
                                    "site",
                                    "instagram",
                                    "facebook",
                                    "tiktok",
                                    "youtube",
                                  ].includes(c.chave)
                                ? "url"
                                : "text"
                        }
                        aria-label={c.rotulo}
                        min={c.tipo === "numero" ? 0 : undefined}
                        value={form.dados[c.chave] ?? ""}
                        onChange={(e) => extra(c.chave, e.target.value)}
                        placeholder={
                          c.chave === "link_drive"
                            ? "https://drive.google.com/..."
                            : undefined
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              {["conteudo", "roteiro", "artigo"].includes(tipo) && (
                <div className="border rounded-md p-4 space-y-3">
                  <h3 className="font-semibold">
                    Revisão humana da publicidade jurídica
                  </h3>
                  {Object.entries(CHECKLIST).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!form.dados.checklist?.[k]}
                        onCheckedChange={(v) =>
                          extra("checklist", {
                            ...form.dados.checklist,
                            [k]: v === true,
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Este checklist não garante conformidade jurídica. A
                    aprovação da direção é obrigatória e será registrada na
                    central.
                  </p>
                </div>
              )}
              {["material", "conteudo", "roteiro", "pesquisa"].includes(
                tipo,
              ) && (
                <p className="text-sm text-muted-foreground">
                  Envie os arquivos diretamente ao Google Drive e cadastre o
                  link e a versão. Alterações posteriores no arquivo podem
                  invalidar sua correspondência com a versão aprovada. O sistema
                  não altera o compartilhamento do Drive.
                </p>
              )}
            </div>
          </details>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
