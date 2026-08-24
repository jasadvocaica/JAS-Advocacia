import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles, Headphones, Plus, ArrowRightCircle, Wand2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

interface Row {
  id: string;
  titulo: string | null;
  resumo: string | null;
  status: string | null;
  area: string | null;
  origem: string | null;
  ferramenta: string | null;
  criado_em: string;
  cliente_id: string;
  convertido_tipo: string | null;
  clientes?: { nome: string | null } | null;
}

const STATUS_OPTS = ["todos", "rascunho", "em_analise", "concluido", "convertido"];

export default function AtendimentosList() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const podeCriar = hasPermission("clientes", "criar");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string>("todos");
  const [area, setArea] = useState<string>("todas");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("cliente_atendimentos")
      .select(
        "id, titulo, resumo, status, area, origem, ferramenta, criado_em, cliente_id, convertido_tipo, clientes:cliente_id(nome)",
      )
      .order("criado_em", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setItems((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const areas = useMemo(
    () => Array.from(new Set(items.map((i) => i.area).filter(Boolean))) as string[],
    [items],
  );

  const filtrados = items.filter((i) => {
    if (status !== "todos" && (i.status ?? "") !== status) return false;
    if (area !== "todas" && (i.area ?? "") !== area) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      const hay = `${i.titulo ?? ""} ${i.resumo ?? ""} ${i.clientes?.nome ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="container max-w-6xl mx-auto p-4 sm:p-6">
      <PageHeader
        title="Atendimentos"
        description="Todas as fichas de atendimento do escritório"
      />

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Input
              placeholder="Buscar por título, cliente ou conteúdo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "todos" ? "Todos os status" : s.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {areas.length > 0 && (
            <div className="w-44">
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger>
                  <SelectValue placeholder="Área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as áreas</SelectItem>
                  {areas.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {podeCriar && (
            <Button asChild variant="gold" className="gap-1">
              <Link to="/clientes">
                <Plus className="w-4 h-4" /> Nova ficha (escolher cliente)
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-gold" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum atendimento encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((it) => {
            const Icon = it.origem === "sistema" ? Sparkles : Headphones;
            return (
              <Card
                key={it.id}
                className="hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => navigate(`/atendimentos/${it.id}`)}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-full bg-gold/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-medium text-sm truncate">
                        {it.titulo || "Sem título"}
                      </p>
                      {it.status && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {it.status.replace("_", " ")}
                        </Badge>
                      )}
                      {it.area && (
                        <Badge variant="secondary" className="text-[10px]">
                          {it.area}
                        </Badge>
                      )}
                      {it.convertido_tipo && (
                        <Badge variant="outline" className="text-[10px] bg-success/10 text-success">
                          convertido
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {it.clientes?.nome ?? "—"} · {formatDateTime(it.criado_em)}
                    </p>
                    {it.resumo && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {it.resumo}
                      </p>
                    )}
                  </div>
                  <ArrowRightCircle className="w-4 h-4 text-muted-foreground mt-1" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
