import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

export default function PerfilParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const { user, updatePassword } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);

  const trocarSenha = async () => {
    if (senha.length < 8) { toast.error("Senha precisa ter ao menos 8 caracteres"); return; }
    if (senha !== confirma) { toast.error("Senhas não coincidem"); return; }
    setSalvando(true);
    const { error } = await updatePassword(senha);
    setSalvando(false);
    if (error) { toast.error(error); return; }
    toast.success("Senha atualizada");
    setSenha(""); setConfirma("");
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Meu perfil" description="Dados cadastrais e senha" />

      <Card className="p-5 space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Nome</Label>
          <p className="font-medium">{parceiro.nome}</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <p>{parceiro.email ?? user?.email}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">OAB</Label>
            <p>{parceiro.oab_completo ?? "—"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">WhatsApp</Label>
            <p>{parceiro.whatsapp ?? "—"}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cidade/UF</Label>
            <p>{[parceiro.cidade, parceiro.estado].filter(Boolean).join(" / ") || "—"}</p>
          </div>
        </div>
        {parceiro.especialidades && parceiro.especialidades.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Especialidades</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {parceiro.especialidades.map((e) => (
                <Badge key={e} variant="secondary" className="capitalize">{e}</Badge>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground border-t pt-3">
          Para alterar dados cadastrais, entre em contato com o escritório.
        </p>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          <h3 className="font-medium">Trocar senha</h3>
        </div>
        <div className="space-y-2">
          <div>
            <Label htmlFor="nova">Nova senha</Label>
            <Input id="nova" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="conf">Confirmar nova senha</Label>
            <Input id="conf" type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          </div>
        </div>
        <Button onClick={trocarSenha} disabled={salvando}>
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar nova senha"}
        </Button>
      </Card>
    </div>
  );
}
