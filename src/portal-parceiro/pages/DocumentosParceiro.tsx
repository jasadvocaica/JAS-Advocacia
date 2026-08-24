import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, FileText, Eye, Search, X, ShieldCheck, Files } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/format";
import type { PortalParceiroContext } from "../PortalParceiroLayout";
import { registrarAcaoParceiro } from "../auditLog";

type Doc = {
  id: string;
  nome: string;
  categoria: string | null;
  criado_em: string;
  mime_type: string | null;
  url: string;
  processo_id: string | null;
  compartilhar_com_parceiro?: boolean | null;
  processos?: { numero_cnj: string | null; nb_inss: string | null } | null;
};

const SEM_CATEGORIA = "__sem_categoria__";

export default function DocumentosParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");
  const [processo, setProcesso] = useState<string>("todos");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // RLS já filtra por compartilhar_com_parceiro = true, mas trazemos o campo
      // para exibir o selo "Compartilhado" e o contador no painel.
      const { data } = await supabase
        .from("documentos")
        .select("id, nome, categoria, criado_em, mime_type, url, processo_id, compartilhar_com_parceiro, processos:processo_id(numero_cnj, nb_inss)")
        .order("criado_em", { ascending: false })
        .limit(200);

      setDocs((data as Doc[]) ?? []);
      setLoading(false);
    })();
  }, [parceiro.id]);

  // Listas únicas para os selects de filtro
  const categorias = useMemo(() => {
    const set = new Set<string>();
    docs.forEach((d) => set.add(d.categoria ?? SEM_CATEGORIA));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [docs]);

  const processos = useMemo(() => {
    const map = new Map<string, string>();
    docs.forEach((d) => {
      if (!d.processo_id) return;
      const label = d.processos?.numero_cnj || d.processos?.nb_inss || d.processo_id.slice(0, 8);
      map.set(d.processo_id, label);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [docs]);

  // Aplica filtros em memória
  const docsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return docs.filter((d) => {
      if (categoria !== "todas") {
        const cat = d.categoria ?? SEM_CATEGORIA;
        if (cat !== categoria) return false;
      }
      if (processo !== "todos") {
        if ((d.processo_id ?? "") !== processo) return false;
      }
      if (q.length > 0) {
        const hay = `${d.nome} ${d.categoria ?? ""} ${d.processos?.numero_cnj ?? ""} ${d.processos?.nb_inss ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs, busca, categoria, processo]);

  // Contadores (sempre sobre o conjunto total carregado)
  const totalGeral = docs.length;
  const totalCompartilhados = docs.filter((d) => d.compartilhar_com_parceiro !== false).length;
  const contagemPorCategoria = useMemo(() => {
    const m = new Map<string, number>();
    docs.forEach((d) => {
      const k = d.categoria ?? SEM_CATEGORIA;
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [docs]);

  const filtrosAtivos = busca.trim().length > 0 || categoria !== "todas" || processo !== "todos";
  const limparFiltros = () => { setBusca(""); setCategoria("todas"); setProcesso("todos"); };

  const registrarAcesso = async (
    documentoId: string,
    documentoNome: string,
    acao: "visualizou" | "baixou" = "visualizou",
  ) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("parceiro_documento_acesso_log").insert({
      parceiro_id: parceiro.id,
      documento_id: documentoId,
      user_id: u.user.id,
      acao,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 255) : null,
    });
    await registrarAcaoParceiro({
      parceiroId: parceiro.id,
      acao: acao === "baixou" ? "baixou_documento" : "visualizou_documento",
      recursoTipo: "documento",
      recursoId: documentoId,
      descricao: documentoNome,
    });
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <PageHeader title="Documentos" description="Apenas arquivos liberados pelo escritório para você" />

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Indicador icon={Files} label="Total disponível" valor={totalGeral} />
        <Indicador
          icon={ShieldCheck}
          label="Compartilhados com você"
          valor={totalCompartilhados}
          accent
        />
        <Indicador icon={FileText} label="Categorias" valor={contagemPorCategoria.size} />
      </div>

      {/* Filtros */}
      <Card className="p-3 flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, categoria ou processo…"
            className="pl-9"
          />
        </div>
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as categorias ({totalGeral})</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c} value={c}>
                {c === SEM_CATEGORIA ? "Sem categoria" : c} ({contagemPorCategoria.get(c) ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={processo} onValueChange={setProcesso}>
          <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Processo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os processos</SelectItem>
            {processos.map(([id, label]) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtrosAtivos && (
          <Button variant="ghost" size="sm" onClick={limparFiltros} className="shrink-0">
            <X className="w-4 h-4 mr-1" /> Limpar
          </Button>
        )}
      </Card>

      <Card className="p-3 bg-muted/40 border-dashed text-xs text-muted-foreground flex items-start gap-2">
        <Eye className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Toda visualização e download é registrada para auditoria. Documentos internos (minutas, teses,
          estratégia) não aparecem aqui — somente peças marcadas como compartilháveis pelo escritório.
        </p>
      </Card>

      {/* Resultado */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Exibindo <strong className="text-foreground">{docsFiltrados.length}</strong> de {totalGeral} documento(s)
        </span>
        {filtrosAtivos && <span>Filtros ativos</span>}
      </div>

      {docsFiltrados.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {filtrosAtivos ? "Nenhum documento corresponde aos filtros." : "Nenhum documento liberado."}
          </p>
          {filtrosAtivos && (
            <Button variant="outline" size="sm" className="mt-3" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
        </Card>
      ) : (
        <Card className="divide-y">
          {docsFiltrados.map((d) => (
            <div key={d.id} className="p-3 flex items-center gap-3">
              <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {d.processo_id && (
                    <Link to={`../processos/${d.processo_id}`} className="hover:underline">
                      {d.processos?.numero_cnj ?? d.processos?.nb_inss ?? "Processo"}
                    </Link>
                  )}
                  {d.processo_id && " · "}{formatDate(d.criado_em)}
                </p>
              </div>
              {d.categoria && <Badge variant="outline" className="text-[10px]">{d.categoria}</Badge>}
              {d.compartilhar_com_parceiro !== false && (
                <Badge className="text-[10px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Compartilhado
                </Badge>
              )}
              {d.url && (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => registrarAcesso(d.id, d.nome, "visualizou")}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Abrir
                </a>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function Indicador({
  icon: Icon, label, valor, accent,
}: { icon: any; label: string; valor: number; accent?: boolean }) {
  return (
    <Card className={`p-3 ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className={`font-display text-2xl mt-0.5 ${accent ? "text-primary" : ""}`}>{valor}</p>
    </Card>
  );
}
