import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MoreVertical, Plus, Search, Shield, KeyRound, UserCheck, UserX, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import { UsuarioRow, perfilLabel, perfilBadgeColor } from "./types";
import { CriarUsuarioDialog } from "./CriarUsuarioDialog";
import { EditarUsuarioDialog } from "./EditarUsuarioDialog";
import { PermissoesDialog } from "./PermissoesDialog";
import { RedefinirSenhaDialog } from "./RedefinirSenhaDialog";
import { GerarTokenAtivacaoDialog } from "./GerarTokenAtivacaoDialog";

export default function UsuariosList() {
  const { profile, isGestor, hasPermission } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [criarOpen, setCriarOpen] = useState(false);
  const [editarUser, setEditarUser] = useState<UsuarioRow | null>(null);
  const [permissoesUser, setPermissoesUser] = useState<UsuarioRow | null>(null);
  const [senhaUser, setSenhaUser] = useState<UsuarioRow | null>(null);
  const [tokenUser, setTokenUser] = useState<UsuarioRow | null>(null);
  const [confirmInativar, setConfirmInativar] = useState<UsuarioRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Permissão de ativar/inativar: gestor OU possui permissão "editar" no módulo equipe.
  const podeAtivar = isGestor || hasPermission("equipe", "editar");

  const carregar = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("tipo_portal", "interno")
      .order("nome");
    if (error) {
      toast.error("Erro ao carregar usuários");
      setLoading(false);
      return;
    }
    const ids = (profiles ?? []).map((p) => p.id);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

    const rolesMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      if (!rolesMap.has(r.user_id)) rolesMap.set(r.user_id, []);
      rolesMap.get(r.user_id)!.push(r.role);
    });

    const rows: UsuarioRow[] = (profiles ?? []).map((p: any) => ({
      ...p,
      roles: (rolesMap.get(p.id) ?? ["advogado"]) as any,
    }));
    setUsuarios(rows);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const aplicarToggle = async (u: UsuarioRow, novoStatus: boolean) => {
    if (!podeAtivar) {
      toast.error("Você não tem permissão para ativar/inativar usuários.");
      return;
    }
    // Não permite o usuário inativar a si mesmo (perde acesso imediatamente).
    if (!novoStatus && profile?.id === u.id) {
      toast.error("Você não pode inativar a sua própria conta.");
      return;
    }
    setTogglingId(u.id);
    // Atualização otimista
    setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, ativo: novoStatus } : x)));
    const { error } = await supabase.from("profiles").update({ ativo: novoStatus }).eq("id", u.id);
    if (error) {
      // Reverte em caso de erro (ex.: trigger do último gestor)
      setUsuarios((prev) => prev.map((x) => (x.id === u.id ? { ...x, ativo: !novoStatus } : x)));
      toast.error(error.message);
    } else {
      toast.success(novoStatus ? `${u.nome} foi ativado` : `${u.nome} foi inativado`);
    }
    setTogglingId(null);
  };

  const onSwitchChange = (u: UsuarioRow, novoStatus: boolean) => {
    if (!novoStatus) {
      // Inativar exige confirmação
      setConfirmInativar(u);
    } else {
      aplicarToggle(u, true);
    }
  };

  const filtrados = usuarios.filter((u) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuários"
        description="Gestão de equipe, papéis e permissões granulares"
      >
        <Button onClick={() => setCriarOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Novo usuário
        </Button>
      </PageHeader>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>
            ) : filtrados.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={u.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-muted text-xs font-semibold">
                        {u.nome?.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium leading-tight">{u.nome}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : u.roles.map((r) => (
                      <Badge key={r} variant="outline" className={perfilBadgeColor(r)}>
                        {perfilLabel(r)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={u.ativo}
                      disabled={!podeAtivar || togglingId === u.id || profile?.id === u.id}
                      onCheckedChange={(v) => onSwitchChange(u, v)}
                      aria-label={u.ativo ? `Inativar ${u.nome}` : `Ativar ${u.nome}`}
                    />
                    {u.ativo ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground">Inativo</Badge>
                    )}
                    {togglingId === u.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                    {!podeAtivar && (
                      <Lock className="w-3.5 h-3.5 text-muted-foreground" aria-label="Sem permissão" />
                    )}
                  </div>
                  {u.primeiro_acesso && (
                    <Badge variant="outline" className="mt-1 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">
                      Aguarda 1º acesso
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditarUser(u)}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar dados
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setPermissoesUser(u)}>
                        <Shield className="w-4 h-4 mr-2" /> Permissões
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSenhaUser(u)}>
                        <KeyRound className="w-4 h-4 mr-2" /> Redefinir senha
                      </DropdownMenuItem>
                      {podeAtivar && !u.ativo && (
                        <DropdownMenuItem onClick={() => setTokenUser(u)}>
                          <KeyRound className="w-4 h-4 mr-2" /> Gerar token de ativação
                        </DropdownMenuItem>
                      )}
                      {podeAtivar && profile?.id !== u.id && (
                        <>
                          <DropdownMenuSeparator />
                          {u.ativo ? (
                            <DropdownMenuItem onClick={() => setConfirmInativar(u)} className="text-destructive">
                              <UserX className="w-4 h-4 mr-2" /> Inativar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => aplicarToggle(u, true)}>
                              <UserCheck className="w-4 h-4 mr-2" /> Reativar
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CriarUsuarioDialog open={criarOpen} onOpenChange={setCriarOpen} onCriado={carregar} />
      <EditarUsuarioDialog usuario={editarUser} onOpenChange={(o) => !o && setEditarUser(null)} onSalvo={carregar} />
      <PermissoesDialog usuario={permissoesUser} onOpenChange={(o) => !o && setPermissoesUser(null)} />
      <RedefinirSenhaDialog usuario={senhaUser} onOpenChange={(o) => !o && setSenhaUser(null)} />
      <GerarTokenAtivacaoDialog usuario={tokenUser} onOpenChange={(o) => !o && setTokenUser(null)} />

      <AlertDialog open={!!confirmInativar} onOpenChange={(o) => !o && setConfirmInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar {confirmInativar?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O usuário perderá acesso ao sistema imediatamente e será redirecionado para a tela de conta inativa no próximo carregamento. Você pode reativar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmInativar) aplicarToggle(confirmInativar, false);
                setConfirmInativar(null);
              }}
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
