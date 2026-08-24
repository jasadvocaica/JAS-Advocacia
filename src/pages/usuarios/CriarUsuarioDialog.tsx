import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { AppRole, PERFIS } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCriado: () => void;
}

export function CriarUsuarioDialog({ open, onOpenChange, onCriado }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<AppRole>("advogado");
  const [forcarTroca, setForcarTroca] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [senhaTemp, setSenhaTemp] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const reset = () => {
    setNome(""); setEmail(""); setPerfil("advogado");
    setForcarTroca(true); setSenhaTemp(null); setCopiado(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const submit = async () => {
    if (!nome.trim() || !email.trim()) {
      toast.error("Preencha nome e e-mail");
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.functions.invoke("admin-usuarios", {
      body: { action: "criar", nome, email, perfil, forcarTroca },
    });
    setSalvando(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Erro ao criar usuário");
      return;
    }
    toast.success("Usuário criado");
    setSenhaTemp(data.senha_temporaria);
    onCriado();
  };

  const copiar = async () => {
    if (!senhaTemp) return;
    await navigator.clipboard.writeText(senhaTemp);
    setCopiado(true);
    toast.success("Senha copiada");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>Cria conta no sistema com permissões padrão do perfil.</DialogDescription>
        </DialogHeader>

        {senhaTemp ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border-2 border-gold bg-gold/10 p-4">
              <p className="text-xs uppercase tracking-wider text-gold font-semibold mb-2">Senha temporária — copie agora</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-lg bg-background rounded px-3 py-2 border">{senhaTemp}</code>
                <Button onClick={copiar} variant="outline" size="icon">
                  {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Esta senha não será mostrada novamente. Repasse ao usuário pelo canal seguro.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Concluído</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-nome">Nome completo</Label>
                <Input id="u-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-email">E-mail</Label>
                <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                <p className="text-xs text-muted-foreground">As permissões padrão do perfil serão aplicadas e podem ser editadas depois.</p>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Forçar troca de senha no primeiro acesso</Label>
                  <p className="text-xs text-muted-foreground">Recomendado por segurança.</p>
                </div>
                <Switch checked={forcarTroca} onCheckedChange={setForcarTroca} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Criar usuário
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
