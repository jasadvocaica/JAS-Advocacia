import { useEffect, useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Users, Loader2, Search, UserPlus, Briefcase, MessageCircle } from "lucide-react";
import { formatCpfCnpj } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

interface ClienteRow {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  whatsapp: string | null;
  cidade: string | null;
  estado: string | null;
  status: string | null;
  parceiro_indicacao: string | null;
  autoriza_parceiro_ver_whatsapp: boolean | null;
  total_processos: number;
}

export default function ClientesParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // RLS já restringe: clientes indicados pelo parceiro OU vinculados a
      // processos onde ele atua. Aqui é só listar.
      const { data: clientes } = await supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj, whatsapp, cidade, estado, status, parceiro_indicacao, autoriza_parceiro_ver_whatsapp")
        .order("nome");

      const ids = (clientes ?? []).map((c) => c.id);
      let countMap = new Map<string, number>();
      if (ids.length) {
        const { data: pp } = await supabase
          .from("processo_parceiros")
          .select("cliente_id")
          .eq("parceiro_id", parceiro.id)
          .eq("ativo", true)
          .in("cliente_id", ids);
        ((pp as any[]) ?? []).forEach((r) => {
          if (!r.cliente_id) return;
          countMap.set(r.cliente_id, (countMap.get(r.cliente_id) ?? 0) + 1);
        });
      }

      setRows(
        ((clientes as any[]) ?? []).map((c) => ({
          ...c,
          total_processos: countMap.get(c.id) ?? 0,
        })),
      );
      setLoading(false);
    })();
  }, [parceiro.id]);

  const filtrados = useMemo(() => {
    if (!busca.trim()) return rows;
    const q = busca.toLowerCase();
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        r.cpf_cnpj?.includes(q.replace(/\D/g, "")) ||
        r.whatsapp?.includes(q.replace(/\D/g, "")),
    );
  }, [rows, busca]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meus clientes"
        description="Clientes que você indicou ou que estão vinculados aos seus processos."
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Nome, CPF/CNPJ ou WhatsApp..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button asChild variant="gold">
          <Link to="../indicacoes" state={{ abrir: "cliente" }}>
            <UserPlus className="w-4 h-4 mr-1.5" /> Indicar novo cliente
          </Link>
        </Button>
      </div>

      {loading ? (
        <Card className="p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="p-12 text-center space-y-2">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Você ainda não tem clientes vinculados."
              : "Nenhum cliente encontrado para esta busca."}
          </p>
          {rows.length === 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to="../indicacoes" state={{ abrir: "cliente" }}>
                <UserPlus className="w-4 h-4 mr-1.5" /> Indicar primeiro cliente
              </Link>
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-12 gap-2 p-3 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <div className="col-span-4">Cliente</div>
            <div className="col-span-3">Documento / Contato</div>
            <div className="col-span-2">Localização</div>
            <div className="col-span-1 text-center">Processos</div>
            <div className="col-span-2">Origem</div>
          </div>
          <div className="divide-y">
            {filtrados.map((c) => {
              const indicadoPorMim = c.parceiro_indicacao === parceiro.id;
              const podeVerWa = !!c.autoriza_parceiro_ver_whatsapp;
              return (
                <Link
                  key={c.id}
                  to={c.id}
                  className="grid grid-cols-12 gap-2 p-3 items-center text-sm hover:bg-muted/40 transition-colors"
                >
                  <div className="col-span-12 sm:col-span-4 min-w-0">
                    <p className="font-medium truncate">{c.nome}</p>
                    <Badge variant="outline" className="text-[10px] mt-0.5">
                      {c.status ?? "—"}
                    </Badge>
                  </div>
                  <div className="col-span-12 sm:col-span-3 text-xs text-muted-foreground space-y-0.5 min-w-0">
                    <p className="truncate">{c.cpf_cnpj ? formatCpfCnpj(c.cpf_cnpj) : "—"}</p>
                    <p className="truncate flex items-center gap-1">
                      {podeVerWa && c.whatsapp ? (
                        <>
                          <MessageCircle className="w-3 h-3" />
                          {c.whatsapp}
                        </>
                      ) : (
                        <span className="italic">Contato protegido</span>
                      )}
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-2 text-xs truncate">
                    {[c.cidade, c.estado].filter(Boolean).join(" - ") || "—"}
                  </div>
                  <div className="col-span-3 sm:col-span-1 text-center">
                    <Badge variant="secondary" className="gap-1">
                      <Briefcase className="w-3 h-3" /> {c.total_processos}
                    </Badge>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Badge
                      variant="outline"
                      className={
                        indicadoPorMim
                          ? "text-[10px] bg-gold/10 text-gold border-gold/30"
                          : "text-[10px]"
                      }
                    >
                      {indicadoPorMim ? "Indicado por mim" : "Vínculo via processo"}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
