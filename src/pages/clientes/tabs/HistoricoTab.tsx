import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, MessageCircle, Phone, Mail, Users, Activity, Sparkles, ChevronDown, ChevronRight,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { particionarInteracoes, type InteracaoLike } from "./historico-utils";

interface Props { clienteId: string }

const CANAL_OPTS = [
  { v: "whatsapp", l: "WhatsApp", icon: MessageCircle },
  { v: "telefone", l: "Telefone", icon: Phone },
  { v: "presencial", l: "Presencial", icon: Users },
  { v: "email", l: "E-mail", icon: Mail },
  { v: "sistema", l: "Sistema (automático)", icon: Sparkles },
  { v: "outro", l: "Outro", icon: Activity },
];

interface Interacao extends InteracaoLike {
  id: string;
  tipo: string;
  descricao: string;
  data: string;
}

function ItemInteracao({ i }: { i: Interacao }) {
  const canal = CANAL_OPTS.find((c) => c.v === i.tipo);
  const Icon = canal?.icon ?? Activity;
  const isSistema = i.tipo === "sistema";
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-9 h-9 rounded-full bg-gold/10 flex items-center justify-center">
        <Icon className="w-4 h-4 text-gold" />
      </div>
      <div className="flex-1 min-w-0 pb-4 border-b border-border/50 last:border-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">{canal?.l ?? i.tipo}</Badge>
            {isSistema && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gold">
                <Sparkles className="w-3 h-3" />
                Sistema
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{formatDateTime(i.data)}</span>
        </div>
        <p className="text-sm whitespace-pre-wrap">{i.descricao}</p>
      </div>
    </div>
  );
}

export default function HistoricoTab({ clienteId }: Props) {
  const { user, hasPermission } = useAuth();
  const podeCriar = hasPermission("clientes", "criar");

  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState("whatsapp");
  const [descricao, setDescricao] = useState("");
  const [autoAberto, setAutoAberto] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("cliente_interacoes")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("data", { ascending: false });
    setInteracoes((data ?? []) as Interacao[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [clienteId]);

  const { automaticas, manuais } = useMemo(
    () => particionarInteracoes(interacoes),
    [interacoes],
  );

  async function add() {
    if (!descricao.trim()) return;
    const { error } = await supabase.from("cliente_interacoes").insert({
      cliente_id: clienteId, tipo, descricao, criado_por: user?.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Atendimento registrado");
      setDescricao("");
      load();
    }
  }

  return (
    <div className="space-y-4">
      {podeCriar && (
        <Card className="p-5 space-y-3">
          <h3 className="font-display text-lg">Registrar atendimento</h3>
          <div className="grid sm:grid-cols-[180px_1fr] gap-3">
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CANAL_OPTS.filter((c) => c.v !== "sistema").map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
            <Textarea
              rows={2}
              placeholder="Descreva o atendimento..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button variant="gold" size="sm" onClick={add} disabled={!descricao.trim()}>Registrar</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="p-6"><div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gold" /></div></Card>
      ) : (
        <>
          {/* Seção: Atendimentos automáticos (registros do tipo "sistema") */}
          <Card className="p-6">
            <Collapsible open={autoAberto} onOpenChange={setAutoAberto}>
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 group">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <h3 className="font-display text-lg">Atendimentos</h3>
                  <Badge variant="secondary" className="text-xs">{automaticas.length}</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">Resumos enviados ao cadastro pelas ferramentas</span>
                  {autoAberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4">
                {automaticas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum atendimento automático ainda. Resumos vindos do Analisador de Caso e da Análise de Publicações IA aparecerão aqui.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {automaticas.map((i) => <ItemInteracao key={i.id} i={i} />)}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Seção: Linha do tempo (registros manuais) */}
          <Card className="p-6">
            <h3 className="font-display text-lg mb-4">Linha do tempo</h3>
            {manuais.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro manual ainda.</p>
            ) : (
              <div className="space-y-4">
                {manuais.map((i) => <ItemInteracao key={i.id} i={i} />)}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
