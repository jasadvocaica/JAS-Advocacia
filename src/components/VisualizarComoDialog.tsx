// Diálogo do gestor para escolher um membro da equipe, parceiro ou cliente
// e abrir o portal/painel correspondente em modo visualização.
//
// UX:
//  - Por padrão exibe equipe (advogados + estagiários) + parceiros numa lista única.
//  - Clientes só aparecem quando há texto na busca (para não poluir a lista).
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Search, Loader2, Handshake, User, GraduationCap, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { usePreviewMode, PreviewTipo } from "@/contexts/PreviewModeContext";

type ItemTipo = "parceiro" | "advogado" | "estagiario" | "cliente";

interface Item {
  id: string;
  nome: string;
  subtitulo?: string | null;
  email?: string | null;
  tipo: ItemTipo;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

const TIPO_META: Record<ItemTipo, { label: string; Icon: typeof User; cls: string }> = {
  parceiro:   { label: "Parceiro",   Icon: Handshake,      cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  advogado:   { label: "Advogado",   Icon: User,           cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  estagiario: { label: "Estagiária", Icon: GraduationCap,  cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  cliente:    { label: "Cliente",    Icon: Users,          cls: "bg-purple-500/10 text-purple-700 dark:text-purple-300" },
};

export function VisualizarComoDialog({ open, onOpenChange }: Props) {
  const { iniciarPreview } = usePreviewMode();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [parceiros, setParceiros] = useState<Item[]>([]);
  const [equipe, setEquipe] = useState<Item[]>([]);
  const [clientes, setClientes] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusca("");
    setLoading(true);
    (async () => {
      const [pRes, cRes, eRes] = await Promise.all([
        supabase
          .from("parceiros")
          .select("id, nome, oab_completo")
          .eq("ativo", true)
          .order("nome")
          .limit(500),
        supabase
          .from("clientes")
          .select("id, nome, cpf_cnpj")
          .order("nome")
          .limit(1000),
        supabase
          .from("equipe_membros")
          .select("id, nome, cargo, user_id, status")
          .eq("status", "ativo")
          .in("cargo", ["advogado", "estagiario"])
          .order("nome")
          .limit(300),
      ]);

      setParceiros(
        (pRes.data ?? []).map((p: any) => ({
          id: p.id, nome: p.nome, subtitulo: p.oab_completo, tipo: "parceiro" as const,
        })),
      );
      setClientes(
        (cRes.data ?? []).map((c: any) => ({
          id: c.id, nome: c.nome, subtitulo: c.cpf_cnpj, tipo: "cliente" as const,
        })),
      );

      const equipeBase = (eRes.data ?? []) as any[];
      const userIds = equipeBase.map((e) => e.user_id).filter(Boolean);
      let emailPorUser = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);
        emailPorUser = new Map((profs ?? []).map((p: any) => [p.id, p.email]));
      }
      setEquipe(
        equipeBase
          .map((e) => {
            const email = e.user_id ? emailPorUser.get(e.user_id) ?? null : null;
            return {
              id: e.user_id ?? e.id,
              nome: e.nome,
              subtitulo: email,
              email,
              tipo: (e.cargo === "advogado" ? "advogado" : "estagiario") as ItemTipo,
            };
          })
          .filter((e) => !!e.id),
      );

      setLoading(false);
    })();
  }, [open]);

  const q = busca.trim().toLowerCase();
  const temBusca = q.length > 0;

  const filtra = (lista: Item[]) =>
    !temBusca
      ? lista
      : lista.filter(
          (i) => i.nome.toLowerCase().includes(q) || (i.subtitulo ?? "").toLowerCase().includes(q),
        );

  // Lista combinada: equipe + parceiros sempre; clientes apenas quando há busca.
  const itens = useMemo(() => {
    const base = [...filtra(equipe), ...filtra(parceiros)];
    if (temBusca) base.push(...filtra(clientes));
    return base;
  }, [equipe, parceiros, clientes, q]);

  const abrir = (item: Item) => {
    const tipoPreview: PreviewTipo =
      item.tipo === "parceiro" ? "parceiro" : item.tipo === "cliente" ? "cliente" : "estagiaria";
    iniciarPreview(tipoPreview, item.id, item.nome, item.email ?? undefined);
    onOpenChange(false);
    if (tipoPreview === "parceiro") navigate("/portal-parceiro");
    else if (tipoPreview === "cliente") navigate("/portal-cliente");
    else navigate("/painel-operacional");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-gold-dark" /> Visualizar como…
          </DialogTitle>
          <DialogDescription>
            Veja o portal/painel como um membro da equipe, parceiro ou cliente. Você apenas <strong>vê</strong> — nada é alterado.
            Clientes aparecem ao pesquisar pelo nome.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome (equipe, parceiro ou cliente)…"
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-80 rounded-md border">
          {loading ? (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : itens.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-sm text-muted-foreground px-6 text-center">
              {temBusca ? "Nada encontrado." : "Nenhum membro de equipe ou parceiro ativo."}
            </div>
          ) : (
            <ul className="divide-y">
              {itens.map((i) => {
                const meta = TIPO_META[i.tipo];
                const Icon = meta.Icon;
                return (
                  <li key={`${i.tipo}-${i.id}`}>
                    <button
                      onClick={() => abrir(i)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${meta.cls}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{i.nome}</p>
                          {i.subtitulo && (
                            <p className="text-xs text-muted-foreground truncate">{i.subtitulo}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wider">
                        {meta.label}
                      </Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
