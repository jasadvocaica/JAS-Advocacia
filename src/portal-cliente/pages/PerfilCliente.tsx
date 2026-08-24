import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound } from "lucide-react";
import { formatCpfCnpj } from "@/lib/format";
import { usePortalCliente } from "../usePortalCliente";

export default function PerfilCliente() {
  const { clienteId } = usePortalCliente();
  const [c, setC] = useState<any>(null);
  useEffect(() => {
    supabase.from("clientes").select("nome, cpf_cnpj, email, whatsapp, cidade, estado").eq("id", clienteId).maybeSingle()
      .then(({ data }) => setC(data));
  }, [clienteId]);
  if (!c) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="font-display text-2xl">Meu perfil</h1>
      <Card className="p-6 space-y-3 text-sm">
        <div><p className="text-xs text-muted-foreground uppercase">Nome</p><p>{c.nome}</p></div>
        <div><p className="text-xs text-muted-foreground uppercase">CPF</p><p className="font-mono">{formatCpfCnpj(c.cpf_cnpj ?? "")}</p></div>
        <div><p className="text-xs text-muted-foreground uppercase">E-mail</p><p>{c.email || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground uppercase">WhatsApp</p><p>{c.whatsapp || "—"}</p></div>
        <div><p className="text-xs text-muted-foreground uppercase">Cidade</p><p>{[c.cidade, c.estado].filter(Boolean).join(" / ") || "—"}</p></div>
        <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">Para alterar seus dados cadastrais, entre em contato com o escritório.</p>
      </Card>
      <Button asChild variant="outline"><Link to="/portal-cliente/trocar-senha"><KeyRound className="w-4 h-4" /> Alterar minha senha</Link></Button>
    </div>
  );
}
