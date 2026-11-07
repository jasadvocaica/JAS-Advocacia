import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { operacaoMarketing } from "./operacao-api";
interface Conversa {
  id: string;
  nome: string | null;
  mensagem: string | null;
  quando: string | null;
  lead_id: string | null;
  possiveis_duplicados: number;
}
export default function TriagemDirect({
  usuarios,
}: {
  usuarios: { id: string; nome: string }[];
}) {
  const { user } = useAuth();
  const [pagina, setPagina] = useState(0);
  const qc = useQueryClient();
  const [aberta, setAberta] = useState<Conversa | null>(null);
  const [nome, setNome] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [lead, setLead] = useState("");
  const [revisado, setRevisado] = useState(false);
  const q = useQuery({
    queryKey: ["mkt-triagem-direct", user?.id, pagina],
    queryFn: () =>
      operacaoMarketing<Conversa[]>("triagem", { offset: pagina * 50 }),
    retry: false,
  });
  const salvar = useMutation({
    mutationFn: () =>
      operacaoMarketing("triagem_confirmar", {
        conversa: aberta?.id,
        nome,
        responsavel_id: responsavel,
        lead_id: lead,
        revisado,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt-triagem-direct"] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      setAberta(null);
      toast.success("Conversa vinculada ao CRM");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="space-y-4">
      <h2 className="font-semibold text-xl">Direct · triagem humana</h2>
      <p className="text-sm">
        Conversas recebidas pelo cache Zernio. Confirme nome, possível
        duplicidade e responsável. A origem permanece a confirmar; nenhuma
        mensagem será enviada.
      </p>
      <Button asChild variant="outline">
        <Link to="/comercial/crm">
          CRM e registro rápido de origem do WhatsApp
        </Link>
      </Button>
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.data?.length === 0 && <p>Nenhuma conversa recebida.</p>}
      {q.data?.map((c) => (
        <Card key={c.id} className="p-4 space-y-2">
          <h3>{c.nome || "Participante sem nome"}</h3>
          <p className="break-words text-sm">{c.mensagem}</p>
          <p className="text-sm">
            {c.quando
              ? new Date(c.quando).toLocaleString("pt-BR", {
                  timeZone: "America/Cuiaba",
                })
              : "Data indisponível"}{" "}
            · {c.possiveis_duplicados} possíveis duplicados por nome (exige
            revisão).
          </p>
          {c.lead_id ? (
            <p>Já vinculada ao CRM.</p>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setAberta(c);
                setNome(c.nome ?? "");
                setResponsavel("");
                setLead("");
                setRevisado(false);
              }}
            >
              Revisar entrada
            </Button>
          )}
        </Card>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={pagina === 0 || q.isFetching}
          onClick={() => setPagina(pagina - 1)}
        >
          Anterior
        </Button>
        <span>Página {pagina + 1}</span>
        <Button
          variant="outline"
          disabled={q.isFetching || (q.data?.length ?? 0) < 50}
          onClick={() => setPagina(pagina + 1)}
        >
          Próxima
        </Button>
      </div>
      {aberta && (
        <form
          className="border rounded p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <h3>Revisar {aberta.nome}</h3>
          <label className="block">
            Nome confirmado
            <input
              className="border p-2 rounded w-full"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label className="block">
            Responsável
            <select
              className="border p-2 rounded w-full bg-background"
              required
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            >
              <option value="">Selecione</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            ID de lead existente (opcional; confira no CRM)
            <input
              className="border p-2 rounded w-full"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
            />
          </label>
          <label className="block">
            <input
              type="checkbox"
              required
              checked={revisado}
              onChange={(e) => setRevisado(e.target.checked)}
            />{" "}
            Revisei a conversa e os possíveis duplicados antes de
            criar/vincular.
          </label>
          <div className="flex gap-2">
            <Button disabled={salvar.isPending}>Confirmar vínculo</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAberta(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
