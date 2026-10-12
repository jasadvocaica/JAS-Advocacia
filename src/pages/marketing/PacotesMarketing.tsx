import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { operar, tabela } from "./api";
import { Escolha } from "./ItemForm";
import { STATUS, type Contexto, type Item } from "./model";
const formatos = {
  reels: "Reels",
  carrossel: "Carrossel",
  story: "Stories",
  blog_post: "Artigo jurídico",
  feed_foto: "Post estático",
};
export default function PacotesMarketing({
  ctx,
  itens,
  onChanged,
  onOpen,
}: {
  ctx: Contexto;
  itens: Item[];
  onChanged: () => void;
  onOpen: (i: Item) => void;
}) {
  const q = useQuery({
    queryKey: ["mkt-pacotes"],
    queryFn: () => tabela("mkt_pacotes"),
  });
  const qc = useQueryClient();
  const [pauta, setPauta] = useState("");
  const [nome, setNome] = useState("");
  const [materiais, setMateriais] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Uma pauta aprovada pode gerar vários formatos. Cada material recebe
        prazo, responsável e aprovação próprios; os dados da pauta são
        reaproveitados.
      </p>
      {ctx.permissoes.criar && ctx.permissoes.editar && (
        <form
          className="border rounded-lg p-5 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await operar("pacote", {
                chave,
                pauta_id: pauta,
                nome,
                materiais: Object.entries(materiais)
                  .filter(([, m]) => m.selecionado)
                  .map(([formato, m]) => ({
                    formato,
                    nome: formatos[formato as keyof typeof formatos],
                    responsavel_id: m.responsavel_id,
                    prazo: m.prazo ? new Date(m.prazo).toISOString() : null,
                  })),
              });
              toast.success("Pacote criado");
              setChave(crypto.randomUUID());
              setMateriais({});
              qc.invalidateQueries({ queryKey: ["mkt-pacotes"] });
              onChanged();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Escolha
            label="Pauta aprovada *"
            required
            value={pauta}
            onChange={setPauta}
            opcoes={itens
              .filter((i) => i.tipo === "pauta" && i.status === "aprovado")
              .map((i) => ({ id: i.id, nome: i.titulo }))}
          />
          <div>
            <Label>Nome do pacote</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Conteúdos da semana"
            />
          </div>
          {Object.entries(formatos).map(([k, l]) => (
            <div key={k} className="border rounded-md p-3 space-y-3">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={!!materiais[k]?.selecionado}
                  onCheckedChange={(v) =>
                    setMateriais({
                      ...materiais,
                      [k]: { ...materiais[k], selecionado: v === true },
                    })
                  }
                />
                {l}
              </label>
              {materiais[k]?.selecionado && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Escolha
                    label={`Responsável por ${l}`}
                    value={materiais[k]?.responsavel_id}
                    opcoes={ctx.usuarios}
                    onChange={(v) =>
                      setMateriais({
                        ...materiais,
                        [k]: { ...materiais[k], responsavel_id: v },
                      })
                    }
                  />
                  <div>
                    <Label>Prazo de {l}</Label>
                    <Input
                      type="datetime-local"
                      value={materiais[k]?.prazo ?? ""}
                      onChange={(e) =>
                        setMateriais({
                          ...materiais,
                          [k]: { ...materiais[k], prazo: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          <Button
            disabled={
              busy ||
              !pauta ||
              !Object.values(materiais).some((m) => m.selecionado)
            }
          >
            Gerar materiais do pacote
          </Button>
        </form>
      )}
      {q.error && <p className="text-destructive">{q.error.message}</p>}
      {q.data?.map((p: any) => (
        <Card key={p.id} className="p-5 space-y-3">
          <h3 className="font-semibold">{p.nome}</h3>
          <p className="text-xs text-muted-foreground">
            Pauta: {itens.find((i) => i.id === p.pauta_id)?.titulo}
          </p>
          {itens
            .filter((i) => i.pacote_id === p.id)
            .map((i) => (
              <Button
                key={i.id}
                className="w-full justify-start h-auto whitespace-normal text-left"
                variant="outline"
                onClick={() => onOpen(i)}
              >
                {i.titulo} · {STATUS[i.status]}
              </Button>
            ))}
        </Card>
      ))}
    </div>
  );
}
