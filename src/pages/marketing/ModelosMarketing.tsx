import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Escolha } from "./ItemForm";
import { operar, tabela } from "./api";
import { CAMPOS, FORMATOS, type Tipo, type Item, type Contexto } from "./model";
import EditorMarketing from "./EditorMarketing";
export default function ModelosMarketing({
  ctx,
  onChanged,
  onOpen,
}: {
  ctx: Contexto;
  onChanged: () => void;
  onOpen: (i: Item) => void;
}) {
  const q = useQuery({
    queryKey: ["mkt-modelos"],
    queryFn: () => tabela("mkt_modelos"),
  });
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  async function acao(op: string, payload: any) {
    setBusy(true);
    try {
      const result = await operar(op, payload);
      toast.success("Operação concluída");
      qc.invalidateQueries({ queryKey: ["mkt-modelos"] });
      onChanged();
      if (op === "modelo_usar") onOpen(result);
      else setForm(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Use estruturas de texto sem repetir o preenchimento. Todo material
        criado a partir de um modelo começa como rascunho e exige sua própria
        revisão e aprovação.
      </p>
      <div className="flex flex-wrap gap-3">
        {ctx.permissoes.gestor && (
          <Button
            onClick={() =>
              setForm({
                nome: "",
                tipo: "roteiro",
                formato: "reels",
                dados: {},
                ativo: true,
              })
            }
          >
            Novo modelo
          </Button>
        )}
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={mostrar}
            onChange={(e) => setMostrar(e.target.checked)}
          />
          Incluir modelos arquivados
        </label>
      </div>
      {q.error && <p className="text-destructive">{q.error.message}</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {q.data
          ?.filter((m: any) => mostrar || m.ativo)
          .map((m: any) => (
            <Card key={m.id} className="p-4 space-y-3">
              <h3 className="font-semibold">{m.nome}</h3>
              <p className="text-xs text-muted-foreground">
                {m.tipo} ·{" "}
                {FORMATOS[m.formato as keyof typeof FORMATOS] ?? m.formato} ·
                versão {m.versao}
                {!m.ativo && " · arquivado"}
              </p>
              <div className="flex flex-wrap gap-2">
                {ctx.permissoes.criar && m.ativo && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => acao("modelo_usar", { modelo_id: m.id })}
                  >
                    Usar modelo
                  </Button>
                )}
                {ctx.permissoes.gestor && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setForm(m)}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        acao("modelo_salvar", { ...m, ativo: !m.ativo })
                      }
                    >
                      {m.ativo ? "Arquivar" : "Ativar"}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ))}
      </div>
      {form && ctx.permissoes.gestor && (
        <form
          className="border rounded-lg p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            acao("modelo_salvar", form);
          }}
        >
          <h3 className="font-semibold">
            {form.id ? "Editar" : "Criar"} modelo
          </h3>
          <div>
            <Label>Nome *</Label>
            <Input
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Escolha
              label="Tipo de material"
              value={form.tipo}
              opcoes={[
                {
                  id: "conteudo",
                  nome: "Post / carrossel / stories / institucional",
                },
                { id: "roteiro", nome: "Roteiro de vídeo" },
                { id: "artigo", nome: "Artigo jurídico" },
              ]}
              onChange={(tipo) => setForm({ ...form, tipo })}
            />
            <Escolha
              label="Formato"
              value={form.formato}
              opcoes={Object.entries(FORMATOS).map(([id, nome]) => ({
                id,
                nome,
              }))}
              onChange={(formato) => setForm({ ...form, formato })}
            />
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Estrutura e textos reutilizáveis
            </summary>
            <div className="space-y-4 mt-4">
              {CAMPOS[form.tipo as Tipo]
                .filter(
                  (c) =>
                    !c.chave.startsWith("link_") &&
                    c.chave !== "versao_arquivo",
                )
                .map((c) => (
                  <div key={c.chave}>
                    <Label>{c.rotulo}</Label>
                    {c.tipo === "editor" ? (
                      <EditorMarketing
                        value={form.dados[c.chave] ?? ""}
                        onChange={(v) =>
                          setForm({
                            ...form,
                            dados: { ...form.dados, [c.chave]: v },
                          })
                        }
                      />
                    ) : (
                      <Textarea
                        value={form.dados[c.chave] ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            dados: { ...form.dados, [c.chave]: e.target.value },
                          })
                        }
                      />
                    )}
                  </div>
                ))}
            </div>
          </details>
          <div className="flex gap-2">
            <Button disabled={busy}>Salvar modelo</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
