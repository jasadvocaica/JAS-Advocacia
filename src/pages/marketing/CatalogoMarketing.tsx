import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Escolha } from "./ItemForm";
import { operar } from "./api";
import type { Contexto } from "./model";
import { toast } from "sonner";
export default function CatalogoMarketing({
  ctx,
  onChanged,
}: {
  ctx: Contexto;
  onChanged: () => void;
}) {
  const [tipo, setTipo] = useState("area");
  const [form, setForm] = useState<any>({
    nome: "",
    descricao: "",
    servicos: [],
  });
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState("");
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await operar(tipo, form);
      onChanged();
      setForm({ nome: "", descricao: "", servicos: [] });
      toast.success("Catálogo atualizado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  const registros =
    tipo === "area" ? ctx.areas : tipo === "servico" ? ctx.servicos : ctx.teses;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Catálogo compartilhado com o comercial e o jurídico. Cada serviço e tese
        tem um único cadastro. Novos serviços ficam em homologação no catálogo
        existente.
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          ["area", "Áreas jurídicas"],
          ["servico", "Serviços"],
          ["tese", "Teses jurídicas"],
        ].map(([t, l]) => (
          <Button
            key={t}
            variant={tipo === t ? "default" : "outline"}
            onClick={() => {
              setTipo(t);
              setForm({ nome: "", descricao: "", servicos: [] });
            }}
          >
            {l}
          </Button>
        ))}
      </div>
      <Input
        placeholder="Buscar no catálogo"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {registros
          .filter((r) => r.nome.toLowerCase().includes(busca.toLowerCase()))
          .map((r) => (
            <div key={r.id} className="border rounded-lg p-4">
              <h3 className="font-semibold">{r.nome}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {r.descricao}
              </p>
              {ctx.permissoes.gestor && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setForm({
                      ...r,
                      servico_id: r.servico_principal_id,
                      servicos: ctx.tese_servicos
                        .filter((t: any) => t.tese_id === r.id)
                        .map((t: any) => t.servico_id),
                    })
                  }
                >
                  Editar cadastro
                </Button>
              )}
            </div>
          ))}
      </div>
      {ctx.permissoes.gestor && (
        <form className="border rounded-lg p-5 space-y-4" onSubmit={salvar}>
          <h3 className="font-semibold">
            {form.id ? "Editar" : "Adicionar"}{" "}
            {tipo === "area" ? "área" : tipo === "servico" ? "serviço" : "tese"}
          </h3>
          <div>
            <Label>Nome *</Label>
            <Input
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={form.descricao ?? ""}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          {tipo !== "area" && (
            <Escolha
              label="Área jurídica"
              value={form.area_id}
              opcoes={ctx.areas}
              onChange={(area_id) => setForm({ ...form, area_id })}
            />
          )}{" "}
          {tipo === "tese" && (
            <>
              <Escolha
                label="Serviço principal"
                value={form.servico_id}
                opcoes={ctx.servicos}
                onChange={(servico_id) => setForm({ ...form, servico_id })}
              />
              <p className="text-sm font-medium">
                Outros serviços relacionados
              </p>
              {ctx.servicos.map((s) => (
                <label key={s.id} className="flex gap-2 text-sm items-center">
                  <Checkbox
                    checked={form.servicos?.includes(s.id)}
                    onCheckedChange={(v) =>
                      setForm({
                        ...form,
                        servicos: v
                          ? [...form.servicos, s.id]
                          : form.servicos.filter((id: string) => id !== s.id),
                      })
                    }
                  />
                  {s.nome}
                </label>
              ))}
            </>
          )}
          {tipo !== "servico" && (
            <label className="flex gap-2 text-sm items-center">
              <Checkbox
                checked={form.ativo !== false}
                onCheckedChange={(v) => setForm({ ...form, ativo: v === true })}
              />
              Cadastro ativo
            </label>
          )}
          <div className="flex gap-2">
            <Button disabled={busy}>Salvar cadastro</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm({ nome: "", descricao: "", servicos: [] })}
            >
              Limpar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
