import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppRole, PERFIS, UsuarioRow } from "./types";

interface Props {
  usuario: UsuarioRow | null;
  onOpenChange: (o: boolean) => void;
  onSalvo: () => void;
}

export function EditarUsuarioDialog({ usuario, onOpenChange, onSalvo }: Props) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [oab, setOab] = useState("");
  const [perfil, setPerfil] = useState<AppRole>("advogado");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (usuario) {
      setNome(usuario.nome ?? "");
      setTelefone(usuario.telefone ?? "");
      setOab(usuario.oab ?? "");
      setPerfil((usuario.roles[0] ?? "advogado") as AppRole);
    }
  }, [usuario]);

  if (!usuario) return null;

  const submit = async () => {
    setSalvando(true);
    // Atualiza profile
    const { error: pErr } = await supabase.from("profiles").update({
      nome, telefone: telefone || null, oab: oab || null,
    }).eq("id", usuario.id);
    if (pErr) {
      toast.error(pErr.message);
      setSalvando(false);
      return;
    }
    // Sincroniza papel: remove papéis antigos, insere novo (mantém singular)
    const papelAntigo = usuario.roles[0];
    if (papelAntigo !== perfil) {
      // Remove todos os papéis e adiciona o novo
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", usuario.id);
      if (delErr) {
        toast.error("Não foi possível alterar o papel: " + delErr.message);
        setSalvando(false);
        return;
      }
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: usuario.id, role: perfil });
      if (insErr) {
        toast.error("Erro ao definir novo papel: " + insErr.message);
        // tenta restaurar
        if (papelAntigo) await supabase.from("user_roles").insert({ user_id: usuario.id, role: papelAntigo });
        setSalvando(false);
        return;
      }
    }
    setSalvando(false);
    toast.success("Usuário atualizado");
    onSalvo();
    onOpenChange(false);
  };

  return (
    <Dialog open={!!usuario} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>OAB</Label>
              <Input value={oab} onChange={(e) => setOab(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={perfil} onValueChange={(v) => setPerfil(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Mudar o perfil <strong>não</strong> redefine as permissões. Use "Resetar para padrão do perfil" no modal de Permissões.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
