import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Escolha } from "./ItemForm";
import { operar } from "./api";
import type { Contexto } from "./model";
import { toast } from "sonner";
export default function AcessosMarketing({
  ctx,
  onChanged,
}: {
  ctx: Contexto;
  onChanged: () => void;
}) {
  const [user, setUser] = useState("");
  const [p, setP] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  return (
    <div className="border rounded-lg p-5 space-y-4">
      <h3 className="font-semibold">Acesso da equipe ao marketing</h3>
      <p className="text-sm text-muted-foreground">
        Essas permissões não concedem acesso a clientes, processos ou ao
        financeiro do escritório. Aprovação e valores de campanhas são
        autorizações independentes.
      </p>
      <Escolha
        label="Colaborador interno"
        value={user}
        opcoes={ctx.usuarios}
        onChange={(v) => {
          setUser(v);
          setP({ ...(ctx.acessos.find((a) => a.user_id === v) ?? {}) });
        }}
      />
      {Object.entries({
        visualizar: "Visualizar departamento",
        criar: "Criar registros",
        editar: "Editar, submeter e registrar publicação manual",
        exportar: "Exportar relatórios",
        aprovar: "Decidir aprovação final",
        financeiro: "Consultar e editar orçamento de campanhas",
        gerenciar: "Consultar auditoria do departamento",
      }).map(([k, l]) => (
        <label key={k} className="flex gap-2 text-sm items-center">
          <Checkbox
            checked={!!p[k]}
            onCheckedChange={(v) => setP({ ...p, [k]: v === true })}
          />
          {l}
        </label>
      ))}
      <Button
        disabled={!user || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await operar("permissao", { user_id: user, ...p });
            toast.success("Permissões atualizadas");
            onChanged();
          } catch (e: any) {
            toast.error(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar permissões
      </Button>
    </div>
  );
}
