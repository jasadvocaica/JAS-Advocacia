import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, User } from "lucide-react";
import { FichaAtendimentoConteudo } from "./FichaAtendimentoConteudo";

export default function FichaAtendimentoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from("cliente_atendimentos")
        .select("cliente_id")
        .eq("id", id)
        .maybeSingle();
      setClienteId(data?.cliente_id ?? null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="container max-w-5xl mx-auto p-6 flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
      </div>
    );
  }
  if (!id || !clienteId) {
    return (
      <div className="container max-w-5xl mx-auto p-6">
        <p className="text-sm text-muted-foreground">Ficha não encontrada.</p>
        <Button variant="ghost" onClick={() => navigate(-1)} className="mt-2">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto p-4 sm:p-6">
      <PageHeader title="Ficha de atendimento" description="Visão completa estruturada">
        <Button asChild variant="outline" size="sm" className="gap-1">
          <Link to={`/clientes/${clienteId}`}>
            <User className="w-4 h-4" /> Ir para o cliente
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/atendimentos">
            <ArrowLeft className="w-4 h-4" /> Atendimentos
          </Link>
        </Button>
      </PageHeader>
      <FichaAtendimentoConteudo
        atendimentoId={id}
        clienteId={clienteId}
        showInternalHeader
      />
    </div>
  );
}
