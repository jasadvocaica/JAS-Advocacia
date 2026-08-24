import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Pencil, Loader2, MessageCircle, Plus, UserX, Briefcase, ListChecks,
  User, Lock, Folder, Wallet, Stethoscope, History, Headphones, KeyRound, Merge,
} from "lucide-react";
import { UnificarClienteDialog } from "./UnificarClienteDialog";
import { formatCpfCnpj, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  STATUS_OPTS, STATUS_CLASS, ORIGEM_OPTS, calcularIdade, iniciais, whatsappLink,
} from "./types";
import DadosPessoaisTab from "./tabs/DadosPessoaisTab";
import BeneficiosInssCard from "./tabs/BeneficiosInssCard";
import ProcessosTab from "./tabs/ProcessosTab";
import HistoricoTab from "./tabs/HistoricoTab";
import AtendimentosTab from "./tabs/AtendimentosTab";
import CredenciaisTab from "./tabs/CredenciaisTab";
import DocumentosTab from "./tabs/DocumentosTab";
import FinanceiroTab from "./tabs/FinanceiroTab";
import PlaceholderTab from "./tabs/PlaceholderTab";
import TarefasTab from "./tabs/tarefas/TarefasTab";
import NovaTarefaPanel from "./tabs/tarefas/NovaTarefaPanel";
import ResumoTarefasBanner from "./tabs/tarefas/ResumoTarefasBanner";
import PortalTab from "./tabs/PortalTab";

const findOrigem = (v: string | null) => ORIGEM_OPTS.find((o) => o.v === v)?.l ?? v ?? "—";

export default function ClienteDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [cliente, setCliente] = useState<any>(null);
  const [processos, setProcessos] = useState<any[]>([]);
  const [advogadoNome, setAdvogadoNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dados");
  const [novaTarefaAberto, setNovaTarefaAberto] = useState(false);
  const [tarefasReloadKey, setTarefasReloadKey] = useState(0);
  const [unificarAberto, setUnificarAberto] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error } = await supabase
      .from("clientes").select("*").eq("id", id).maybeSingle();
    if (error || !c) { toast.error("Cliente não encontrado"); navigate("/clientes"); return; }
    setCliente(c);

    const [pRes, advRes] = await Promise.all([
      supabase.from("processos")
        .select("id, numero_cnj, area_direito, status, tipo, tipo_acao")
        .eq("cliente_id", id),
      (c as any).advogado_responsavel_id
        ? supabase.from("profiles").select("nome").eq("id", (c as any).advogado_responsavel_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);
    setProcessos(pRes.data ?? []);
    setAdvogadoNome((advRes as any).data?.nome ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  async function inativar() {
    const novoStatus = cliente.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase
      .from("clientes")
      .update({ status: novoStatus, ativo: novoStatus === "ativo" })
      .eq("id", id!);
    if (error) toast.error(error.message);
    else { toast.success(novoStatus === "ativo" ? "Cliente reativado" : "Cliente inativado"); load(); }
  }

  if (loading || !cliente) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gold" /></div>;
  }

  const status = cliente.status ?? (cliente.ativo ? "ativo" : "inativo");
  const statusLabel = STATUS_OPTS.find((s) => s.v === status)?.l ?? status;
  const idade = calcularIdade(cliente.nascimento);
  const wpp = whatsappLink(cliente.whatsapp || cliente.telefones?.[0]);
  const podeEditar = hasPermission("clientes", "editar");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Button>
        {podeEditar && (
          <Button variant="outline" size="sm" onClick={() => setUnificarAberto(true)}>
            <Merge className="w-4 h-4" /> Unificar com outro
          </Button>
        )}
      </div>

      <UnificarClienteDialog
        clienteAtualId={cliente.id}
        open={unificarAberto}
        onOpenChange={setUnificarAberto}
        onUnificado={(idMantido) => {
          if (idMantido === cliente.id) load();
          else navigate(`/clientes/${idMantido}`);
        }}
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* COLUNA ESQUERDA — RESUMO */}
        <Card className="p-6 space-y-5 lg:sticky lg:top-6 self-start">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-navy flex items-center justify-center">
              <span className="font-display text-2xl text-gold">{iniciais(cliente.nome)}</span>
            </div>
            <div>
              <h1 className="font-display text-xl leading-tight">{cliente.nome}</h1>
              {cliente.nome_social && (
                <p className="text-xs text-muted-foreground italic">"{cliente.nome_social}"</p>
              )}
            </div>
            <Badge variant="outline" className={STATUS_CLASS[status]}>{statusLabel}</Badge>
          </div>

          <div className="space-y-2.5 text-sm">
            {cliente.cpf_cnpj && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">CPF</p>
                <p className="font-mono">{formatCpfCnpj(cliente.cpf_cnpj)}</p>
              </div>
            )}
            {idade != null && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Idade</p>
                <p>{idade} anos</p>
              </div>
            )}
            {advogadoNome && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Advogado responsável</p>
                <p>{advogadoNome}</p>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Origem</p>
              <p>{findOrigem(cliente.origem)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Cadastro</p>
              <p>{formatDate(cliente.criado_em)}</p>
            </div>
          </div>

          {wpp && (
            <Button variant="outline" className="w-full" asChild>
              <a href={wpp} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
              </a>
            </Button>
          )}

          <div className="space-y-2 pt-2 border-t border-border/50">
            {podeEditar && (
              <Button variant="gold" size="sm" className="w-full" asChild>
                <Link to={`/clientes/${id}/editar`}><Pencil className="w-4 h-4" /> Editar</Link>
              </Button>
            )}
            {hasPermission("processos", "criar") && (
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link to={`/processos/novo?cliente=${id}`}><Briefcase className="w-4 h-4" /> Novo processo</Link>
              </Button>
            )}
            {hasPermission("controladoria", "criar") && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setNovaTarefaAberto(true)}
              >
                <ListChecks className="w-4 h-4" /> Nova tarefa
              </Button>
            )}
            {podeEditar && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={inativar}>
                <UserX className="w-4 h-4" />
                {status === "ativo" ? "Inativar" : "Reativar"}
              </Button>
            )}
          </div>
        </Card>

        {/* COLUNA DIREITA — ABAS */}
        <div className="space-y-4">
          <ResumoTarefasBanner
            clienteId={cliente.id}
            podeCriar={hasPermission("controladoria", "criar")}
            onCriarTarefa={() => setNovaTarefaAberto(true)}
            onVerTarefas={() => setTab("tarefas")}
            reloadKey={tarefasReloadKey}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex flex-wrap gap-1 bg-muted/40 p-1">
              <TabsTrigger value="dados"><User className="w-3.5 h-3.5 mr-1.5" /> Dados</TabsTrigger>
              <TabsTrigger value="credenciais"><Lock className="w-3.5 h-3.5 mr-1.5" /> Credenciais</TabsTrigger>
              <TabsTrigger value="documentos"><Folder className="w-3.5 h-3.5 mr-1.5" /> Documentos</TabsTrigger>
              <TabsTrigger value="processos"><Briefcase className="w-3.5 h-3.5 mr-1.5" /> Processos ({processos.length})</TabsTrigger>
              <TabsTrigger value="tarefas"><ListChecks className="w-3.5 h-3.5 mr-1.5" /> Tarefas</TabsTrigger>
              <TabsTrigger value="financeiro"><Wallet className="w-3.5 h-3.5 mr-1.5" /> Financeiro</TabsTrigger>
              <TabsTrigger value="saude"><Stethoscope className="w-3.5 h-3.5 mr-1.5" /> Saúde</TabsTrigger>
              <TabsTrigger value="atendimentos"><Headphones className="w-3.5 h-3.5 mr-1.5" /> Atendimentos</TabsTrigger>
              <TabsTrigger value="historico"><History className="w-3.5 h-3.5 mr-1.5" /> Histórico</TabsTrigger>
              <TabsTrigger value="portal"><KeyRound className="w-3.5 h-3.5 mr-1.5" /> Portal</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4 mt-4">
              <DadosPessoaisTab cliente={cliente} advogadoNome={advogadoNome} />
              {cliente.tipo_pessoa === "fisica" && (
                <BeneficiosInssCard clienteId={cliente.id} />
              )}
            </TabsContent>

            <TabsContent value="credenciais" className="mt-4">
              <CredenciaisTab clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="documentos" className="mt-4">
              <DocumentosTab clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="processos" className="mt-4">
              <ProcessosTab processos={processos} clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="tarefas" className="mt-4">
              <TarefasTab
                clienteId={cliente.id}
                clienteNome={cliente.nome}
                onChanged={() => setTarefasReloadKey((k) => k + 1)}
              />
            </TabsContent>

            <TabsContent value="financeiro" className="mt-4">
              <FinanceiroTab clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="saude" className="mt-4">
              <PlaceholderTab
                titulo="Saúde / Perícia"
                descricao="CID principal e secundários, grau de incapacidade, médico assistente e histórico de perícias INSS — para processos previdenciários."
                fase="Fase 3"
                icon={Stethoscope}
              />
            </TabsContent>

            <TabsContent value="atendimentos" className="mt-4">
              <AtendimentosTab clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <HistoricoTab clienteId={cliente.id} />
            </TabsContent>

            <TabsContent value="portal" className="mt-4">
              <PortalTab clienteId={cliente.id} clienteNome={cliente.nome} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <NovaTarefaPanel
        open={novaTarefaAberto}
        onClose={() => setNovaTarefaAberto(false)}
        clienteId={cliente.id}
        clienteNome={cliente.nome}
        onCriada={() => { setTarefasReloadKey((k) => k + 1); setTab("tarefas"); }}
      />
    </div>
  );
}
