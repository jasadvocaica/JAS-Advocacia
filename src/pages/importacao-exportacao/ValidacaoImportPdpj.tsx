import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ExternalLink,
  AlertTriangle,
  UserX,
  Pencil,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Linha {
  id: string;
  numero_cnj: string;
  tribunal_sigla: string | null;
  vara: string | null;
  data_distribuicao: string | null;
  observacoes_internas: string | null;
  cliente_id: string;
  cliente_nome: string;
  reu: string | null;
  problemas: string[];
}

const PARTE_NAO_IDENT_REGEX = /parte\s+n[ãa]o\s+identificada/i;

/**
 * Tela de validação manual da importação do PDPJ.
 * Lista somente registros com problemas para o usuário revisar e corrigir.
 */
export default function ValidacaoImportPdpj() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("processos")
        .select(
          "id, numero_cnj, tribunal_sigla, vara, data_distribuicao, observacoes_internas, cliente_id, clientes!inner(nome, origem)",
        )
        .eq("clientes.origem", "importacao_pdf_pdpj")
        .order("data_distribuicao", { ascending: false });

      if (error) {
        toast({
          title: "Falha ao carregar processos",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const todos: Linha[] = (data ?? []).map((p) => {
        const cli = p.clientes as unknown as { nome?: string } | null;
        const cliente_nome = cli?.nome ?? "";
        const reu = extrairReu(p.observacoes_internas);
        const problemas: string[] = [];

        if (!cliente_nome.trim() || PARTE_NAO_IDENT_REGEX.test(cliente_nome)) {
          problemas.push("Autor não identificado");
        }
        if (!p.numero_cnj?.trim()) problemas.push("CNJ ausente");
        if (!p.tribunal_sigla?.trim()) problemas.push("Tribunal ausente");
        if (!p.vara?.trim()) problemas.push("Vara ausente");
        if (!p.data_distribuicao) problemas.push("Distribuição ausente");
        if (!reu) problemas.push("Réu ausente");

        return {
          id: p.id,
          numero_cnj: p.numero_cnj,
          tribunal_sigla: p.tribunal_sigla,
          vara: p.vara,
          data_distribuicao: p.data_distribuicao,
          observacoes_internas: p.observacoes_internas,
          cliente_id: p.cliente_id,
          cliente_nome: cliente_nome || "—",
          reu,
          problemas,
        };
      });

      // Apenas os que precisam de revisão.
      setLinhas(todos.filter((l) => l.problemas.length > 0));
      setLoading(false);
    };
    carregar();
  }, []);

  const stats = useMemo(() => {
    const autorNI = linhas.filter((l) =>
      l.problemas.includes("Autor não identificado"),
    ).length;
    const camposAusentes = linhas.filter((l) =>
      l.problemas.some((p) => p !== "Autor não identificado"),
    ).length;
    return { total: linhas.length, autorNI, camposAusentes };
  }, [linhas]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validação manual — Importação PDPJ"
        description="Registros importados que precisam de conferência: autor não identificado ou campos ausentes."
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/importacao-exportacao/pdpj">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar à conferência
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gold/10 text-gold flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total a revisar</p>
              <p className="text-2xl font-semibold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-destructive/10 text-destructive flex items-center justify-center">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Autor não identificado</p>
              <p className="text-2xl font-semibold">{stats.autorNI}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-muted text-muted-foreground flex items-center justify-center">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Com campos ausentes</p>
              <p className="text-2xl font-semibold">{stats.camposAusentes}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>CNJ</TableHead>
                  <TableHead>Autor (cliente)</TableHead>
                  <TableHead>Réu</TableHead>
                  <TableHead>Tribunal</TableHead>
                  <TableHead>Vara</TableHead>
                  <TableHead>Distribuição</TableHead>
                  <TableHead>Problemas</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : linhas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground py-10"
                    >
                      Nenhum registro com problemas. Importação validada ✓
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((l, idx) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {l.numero_cnj || (
                          <span className="text-destructive">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`max-w-[220px] truncate ${
                          l.problemas.includes("Autor não identificado")
                            ? "text-destructive font-medium"
                            : ""
                        }`}
                        title={l.cliente_nome}
                      >
                        {l.cliente_nome}
                      </TableCell>
                      <TableCell
                        className="max-w-[220px] truncate"
                        title={l.reu ?? ""}
                      >
                        {l.reu ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {l.tribunal_sigla ? (
                          <Badge variant="secondary">{l.tribunal_sigla}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-[180px] truncate"
                        title={l.vara ?? ""}
                      >
                        {l.vara ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatarData(l.data_distribuicao)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {l.problemas.map((p) => (
                            <Badge
                              key={p}
                              variant={
                                p === "Autor não identificado"
                                  ? "destructive"
                                  : "outline"
                              }
                              className="text-[10px]"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            title="Editar cliente"
                          >
                            <Link to={`/clientes/${l.cliente_id}/editar`}>
                              <UserX className="w-4 h-4" />
                            </Link>
                          </Button>
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            title="Editar processo"
                          >
                            <Link to={`/processos/${l.id}/editar`}>
                              <Pencil className="w-4 h-4" />
                            </Link>
                          </Button>
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            title="Abrir processo"
                          >
                            <Link to={`/processos/${l.id}`}>
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && linhas.length > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              {linhas.length} registro(s) precisam de revisão manual.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function extrairReu(obs: string | null): string | null {
  if (!obs) return null;
  const m = obs.match(/Réu:\s*(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
