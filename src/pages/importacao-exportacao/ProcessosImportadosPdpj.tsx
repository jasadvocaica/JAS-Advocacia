import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, ExternalLink, Search, Scale, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ConsultarDatajudLoteDialog } from "./importar/ConsultarDatajudLoteDialog";

interface ProcessoImportado {
  id: string;
  numero_cnj: string;
  tribunal_sigla: string | null;
  vara: string | null;
  data_distribuicao: string | null;
  observacoes_internas: string | null;
  cliente_id: string;
  cliente_nome: string;
}

/**
 * Lista todos os processos cuja origem é a importação em lote do PDF do PDPJ
 * (filtramos pelo `origem` do cliente vinculado, que recebe o tag
 * `importacao_pdf_pdpj` na edge function `pdpj-importar-pdf`).
 *
 * Serve como conferência visual: cada linha mostra CNJ, partes, tribunal/vara
 * e data de distribuição. O nome do réu é extraído de `observacoes_internas`.
 */
export default function ProcessosImportadosPdpj() {
  const [processos, setProcessos] = useState<ProcessoImportado[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [openDatajud, setOpenDatajud] = useState(false);

  useEffect(() => {
    const carregar = async () => {
      setLoading(true);
      // Pega processos cujo cliente foi criado pela importação do PDF PDPJ.
      const { data, error } = await supabase
        .from("processos")
        .select(
          "id, numero_cnj, tribunal_sigla, vara, data_distribuicao, observacoes_internas, cliente_id, clientes!inner(nome, origem)",
        )
        .eq("clientes.origem", "importacao_pdf_pdpj")
        .order("data_distribuicao", { ascending: false });

      if (error) {
        toast({
          title: "Falha ao carregar processos importados",
          description: error.message,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const lista: ProcessoImportado[] = (data ?? []).map((p) => {
        const cli = p.clientes as unknown as { nome?: string } | null;
        return {
          id: p.id,
          numero_cnj: p.numero_cnj,
          tribunal_sigla: p.tribunal_sigla,
          vara: p.vara,
          data_distribuicao: p.data_distribuicao,
          observacoes_internas: p.observacoes_internas,
          cliente_id: p.cliente_id,
          cliente_nome: cli?.nome ?? "—",
        };
      });
      setProcessos(lista);
      setLoading(false);
    };
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return processos;
    const q = busca.toLowerCase();
    return processos.filter(
      (p) =>
        p.numero_cnj.toLowerCase().includes(q) ||
        p.cliente_nome.toLowerCase().includes(q) ||
        (p.tribunal_sigla ?? "").toLowerCase().includes(q) ||
        (p.vara ?? "").toLowerCase().includes(q) ||
        (p.observacoes_internas ?? "").toLowerCase().includes(q),
    );
  }, [processos, busca]);

  // Estatísticas rápidas para o cabeçalho
  const totalTribunais = useMemo(
    () => new Set(processos.map((p) => p.tribunal_sigla).filter(Boolean)).size,
    [processos],
  );
  const totalClientes = useMemo(
    () => new Set(processos.map((p) => p.cliente_id)).size,
    [processos],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Processos importados — PDF PDPJ"
        description="Conferência visual da última importação em lote a partir do relatório do Portal PDPJ."
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/importacao-exportacao">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/importacao-exportacao/pdpj/validacao">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Validar registros com problemas
          </Link>
        </Button>
        <Button
          size="sm"
          variant="gold"
          onClick={() => setOpenDatajud(true)}
          disabled={loading || processos.length === 0}
          title="Consultar todos no DataJud e gravar andamentos"
        >
          <Scale className="w-4 h-4 mr-2" />
          Atualizar andamentos via DataJud ({processos.length})
        </Button>
      </PageHeader>

      <ConsultarDatajudLoteDialog
        open={openDatajud}
        onOpenChange={setOpenDatajud}
        processoIds={processos.map((p) => p.id)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Processos</p>
            <p className="text-2xl font-semibold">{processos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Clientes únicos</p>
            <p className="text-2xl font-semibold">{totalClientes}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Tribunais</p>
            <p className="text-2xl font-semibold">{totalTribunais}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrar por CNJ, cliente, tribunal, vara ou réu…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

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
                  <TableHead className="w-20 text-right">Abrir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-10"
                    >
                      {processos.length === 0
                        ? "Nenhum processo importado do PDF PDPJ ainda."
                        : "Nenhum processo corresponde ao filtro."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((p, idx) => {
                    const reu = extrairReu(p.observacoes_internas);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground text-xs">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.numero_cnj}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate" title={p.cliente_nome}>
                          {p.cliente_nome}
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate" title={reu ?? ""}>
                          {reu ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {p.tribunal_sigla ? (
                            <Badge variant="secondary">{p.tribunal_sigla}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={p.vara ?? ""}>
                          {p.vara ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatarData(p.data_distribuicao)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="icon">
                            <Link to={`/processos/${p.id}`} title="Abrir processo">
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && filtrados.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Exibindo {filtrados.length} de {processos.length} processos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** A edge function grava o réu como `Importado do Portal PDPJ. Réu: NOME`. */
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
