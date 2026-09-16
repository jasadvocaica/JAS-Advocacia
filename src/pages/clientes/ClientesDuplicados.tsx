import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Merge, ShieldAlert, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatCpfCnpj, onlyDigits } from "@/lib/format";
import { normalizarNomeCliente } from "@/lib/validacoes-cadastro-cliente";

interface Dup {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  doc_norm?: string;
  whatsapp: string | null;
  email: string | null;
  criado_em: string;
  ativo: boolean;
  qtd: number;
}

export default function ClientesDuplicados() {
  const { user } = useAuth();
  const [isGestor, setIsGestor] = useState<boolean | null>(null);
  const [grupos, setGrupos] = useState<Record<string, Dup[]>>({});
  const [loading, setLoading] = useState(true);
  const [unificando, setUnificando] = useState<string | null>(null);
  const [confirma, setConfirma] = useState<{ a: Dup; b: Dup } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("is_gestor", { _user_id: user.id }).then(({ data }) => setIsGestor(Boolean(data)));
  }, [user]);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, cpf_cnpj, whatsapp, email, criado_em, ativo")
      .order("criado_em", { ascending: true });
    if (error) {
      toast.error("Erro ao listar possíveis duplicidades");
      setLoading(false);
      return;
    }

    const porDocumento: Record<string, Dup[]> = {};
    const porNome: Record<string, Dup[]> = {};

    ((data ?? []) as any[]).forEach((cliente) => {
      const item = cliente as Dup;
      const documento = onlyDigits(cliente.cpf_cnpj ?? "");
      const nome = normalizarNomeCliente(cliente.nome ?? "");

      if (documento) {
        porDocumento[documento] = porDocumento[documento] ?? [];
        porDocumento[documento].push({ ...item, doc_norm: documento });
      }
      if (nome) {
        porNome[nome] = porNome[nome] ?? [];
        porNome[nome].push(item);
      }
    });

    const map: Record<string, Dup[]> = {};
    Object.entries(porDocumento).forEach(([documento, lista]) => {
      if (lista.length > 1) map[`documento:${documento}`] = lista;
    });
    Object.entries(porNome).forEach(([nome, lista]) => {
      if (lista.length > 1) map[`nome:${nome}`] = lista;
    });

    setGrupos(map);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function unificar(a: Dup, b: Dup) {
    setUnificando(a.doc_norm ?? a.id);
    const { error } = await supabase.rpc("unificar_clientes", { _id_a: a.id, _id_b: b.id });
    setUnificando(null);
    setConfirma(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Clientes unificados com sucesso");
    carregar();
  }

  if (isGestor === false) {
    return (
      <div className="space-y-4">
        <PageHeader title="Duplicados" description="Acesso restrito" />
        <Card className="p-8 text-center space-y-2">
          <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
          <p>Apenas gestores podem unificar clientes.</p>
        </Card>
      </div>
    );
  }

  const totalGrupos = Object.keys(grupos).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes duplicados"
        description={loading ? "Carregando..." : `${totalGrupos} grupo${totalGrupos !== 1 ? "s" : ""} para conferência`}
      >
        <Button variant="outline" asChild>
          <Link to="/clientes"><ArrowLeft className="w-4 h-4" /> Voltar</Link>
        </Button>
      </PageHeader>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : totalGrupos === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Nenhum documento repetido ou homônimo exato encontrado.</Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grupos).map(([chave, lista]) => {
            const [criterio, valor] = chave.split(":", 2);
            const documentoDuplicado = criterio === "documento";
            return (
            <Card key={chave} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {documentoDuplicado ? "CPF/CNPJ repetido" : "Mesmo nome — possível homônimo"}
                  </p>
                  <p className={documentoDuplicado ? "font-mono font-semibold" : "font-semibold truncate"}>
                    {documentoDuplicado ? formatCpfCnpj(valor) : lista[0]?.nome}
                  </p>
                </div>
                <Badge variant="outline">{lista.length} cadastros</Badge>
              </div>
              <div className="grid gap-2">
                {lista.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.whatsapp || "—"} · {c.email || "—"} · criado em {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/clientes/${c.id}`}><ExternalLink className="w-3 h-3" /></Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {documentoDuplicado && lista.length === 2 && (
                <div className="flex justify-end">
                  <Button
                    variant="gold"
                    size="sm"
                    disabled={unificando === valor}
                    onClick={() => setConfirma({ a: lista[0], b: lista[1] })}
                  >
                    {unificando === valor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                    Unificar os 2
                  </Button>
                </div>
              )}
              {documentoDuplicado && lista.length > 2 && (
                <p className="text-xs text-muted-foreground">3+ cadastros com o mesmo documento: confira cada ficha antes de unificar de 2 em 2.</p>
              )}
              {!documentoDuplicado && (
                <p className="text-xs text-amber-700">
                  Nomes iguais não comprovam duplicidade. Abra as fichas e confira CPF, contato, processos e documentos; nenhuma unificação é executada automaticamente.
                </p>
              )}
            </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirma} onOpenChange={(o) => !o && setConfirma(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar unificação</AlertDialogTitle>
            <AlertDialogDescription>
              O sistema vai manter o cadastro <strong>mais completo</strong> e mover todos os processos, contratos,
              documentos e atendimentos do outro para ele. O duplicado será excluído. Esta ação é irreversível
              (mas fica registrada no histórico).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirma && unificar(confirma.a, confirma.b)}>
              Unificar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
