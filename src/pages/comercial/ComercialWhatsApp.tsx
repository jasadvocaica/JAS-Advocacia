import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, MessageCircle, Paperclip, Send, MoreVertical, UserRound, PlugZap, Inbox, ExternalLink, Plus, Check, CheckCheck, Clock3, CircleAlert, MessageSquarePlus, Pencil, Trash2, X, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useResponsavelComunicacao } from "@/hooks/useResponsavelComunicacao";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Conversa = {
  id: string;
  lead_id: string | null;
  cliente_id: string | null;
  nome_contato: string | null;
  telefone: string;
  status: string;
  ultima_mensagem_em: string | null;
  ultima_mensagem_resumo: string | null;
  nao_lidas: number;
  responsavel_id: string | null;
};
type Mensagem = { id: string; direcao: string; tipo: string; conteudo: string | null; ocorrida_em: string; status: string };
type Conexao = { id: string; nome: string; numero_exibicao: string | null; status: string; ativo: boolean };
type Lead = { id: string; nome: string; email: string | null; area_direito: string | null; status: string; canal: string | null; valor_contrato: number | null };
type Contato = { id: string; nome: string; telefone: string; email: string | null; origem: "lead" | "cliente" };
type Responsavel = { user_id: string; nome: string; ativo: boolean; gestor: boolean };
type TemplateWhatsApp = { id: string; nome: string; idioma: string; categoria: string | null };
type FollowupConversa = {
  id: string;
  responsavel_id: string | null;
  descricao: string;
  agendado_para: string;
  status: "pendente" | "concluido" | "cancelado";
  concluido_em: string | null;
};
type NotaConversa = {
  id: string;
  conteudo: string;
  criado_por: string;
  criado_em: string;
};
type HistoricoConversa = {
  id: string;
  evento: "criada" | "status_alterado" | "responsavel_alterado";
  status_anterior: string | null;
  status_novo: string | null;
  responsavel_anterior_id: string | null;
  responsavel_novo_id: string | null;
  ocorrido_em: string;
};

const hora = (data: string | null) => data ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(data)) : "";
const iniciais = (nome?: string | null) => (nome || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const linkWhatsApp = (telefone?: string | null) => {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return "https://web.whatsapp.com/";
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://web.whatsapp.com/send?phone=${numero}`;
};

export default function ComercialWhatsApp() {
  const queryClient = useQueryClient();
  const { user, isGestor } = useAuth();
  const { data: responsavelPadrao } = useResponsavelComunicacao();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "minhas" | "fila" | "nao_lidas" | "encerradas">("todas");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const [buscaContato, setBuscaContato] = useState("");
  const [texto, setTexto] = useState("");
  const [templateSelecionado, setTemplateSelecionado] = useState("");
  const [contatoSelecionado, setContatoSelecionado] = useState<Contato | null>(null);
  const [novaNota, setNovaNota] = useState("");
  const [notaEmEdicao, setNotaEmEdicao] = useState<string | null>(null);
  const [textoNotaEmEdicao, setTextoNotaEmEdicao] = useState("");
  const [descricaoFollowup, setDescricaoFollowup] = useState("");
  const [dataFollowup, setDataFollowup] = useState("");

  const { data: conexao } = useQuery({
    queryKey: ["whatsapp-conexao-ativa"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_conexoes").select("id,nome,numero_exibicao,status,ativo").eq("ativo", true).maybeSingle();
      if (error) throw error;
      return data as Conexao | null;
    },
  });
  const { data: templates = [] } = useQuery({
    queryKey: ["whatsapp-templates-aprovados", conexao?.id],
    enabled: !!conexao?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_templates")
        .select("id,nome,idioma,categoria")
        .eq("conexao_id", conexao!.id)
        .eq("presente_meta", true)
        .eq("status", "APPROVED")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TemplateWhatsApp[];
    },
  });
  const { data: responsaveis = [] } = useQuery({
    queryKey: ["comercial-responsaveis-autorizados"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("comercial_responsaveis_autorizados");
      if (error) throw error;
      return (data ?? []) as Responsavel[];
    },
  });
  const { data: contatos = [], isLoading: carregandoContatos } = useQuery({
    queryKey: ["whatsapp-contatos-reais"],
    enabled: novaConversaAberta,
    queryFn: async () => {
      const [leadsResult, clientesResult] = await Promise.all([
        (supabase as any)
          .from("mkt_leads")
          .select("id,nome,whatsapp,email")
          .not("whatsapp", "is", null)
          .order("nome")
          .limit(250),
        (supabase as any)
          .from("clientes")
          .select("id,nome,whatsapp,telefones,email")
          .eq("ativo", true)
          .order("nome")
          .limit(250),
      ]);

      if (leadsResult.error) throw leadsResult.error;

      const leads: Contato[] = (leadsResult.data ?? [])
        .filter((item: any) => item.whatsapp)
        .map((item: any) => ({
          id: item.id,
          nome: item.nome,
          telefone: item.whatsapp,
          email: item.email,
          origem: "lead" as const,
        }));

      const clientes: Contato[] = clientesResult.error
        ? []
        : (clientesResult.data ?? [])
            .map((item: any) => ({
              id: item.id,
              nome: item.nome,
              telefone: item.whatsapp || item.telefones?.[0] || "",
              email: item.email,
              origem: "cliente" as const,
            }))
            .filter((item: Contato) => item.telefone);

      const unicos = new Map<string, Contato>();
      [...leads, ...clientes].forEach((item) => {
        const chave = item.telefone.replace(/\D/g, "");
        if (chave && !unicos.has(chave)) unicos.set(chave, item);
      });
      return Array.from(unicos.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  });
  const { data: conversas = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_conversas")
        .select("id,lead_id,cliente_id,nome_contato,telefone,status,responsavel_id,ultima_mensagem_em,ultima_mensagem_resumo,nao_lidas")
        .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });
  useEffect(() => { if (!selecionada && conversas[0]) setSelecionada(conversas[0].id); }, [conversas, selecionada]);
  const conversa = conversas.find((item) => item.id === selecionada) ?? null;

  useEffect(() => {
    const channel = supabase
      .channel(`comercial-whatsapp-${selecionada || "geral"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversas" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
          queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] });
          if (selecionada) {
            queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa-historico", selecionada] });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_mensagens",
          ...(selecionada ? { filter: `conversa_id=eq.${selecionada}` } : {}),
        },
        () => {
          if (selecionada) queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens", selecionada] });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conexoes" },
        () => queryClient.invalidateQueries({ queryKey: ["whatsapp-conexao-ativa"] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, selecionada]);

  useEffect(() => {
    if (!conversa || conversa.nao_lidas <= 0) return;
    void (supabase as any)
      .from("whatsapp_conversas")
      .update({ nao_lidas: 0, atualizado_em: new Date().toISOString() })
      .eq("id", conversa.id);
  }, [conversa?.id, conversa?.nao_lidas]);

  const { data: mensagens = [] } = useQuery({
    queryKey: ["whatsapp-mensagens", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("whatsapp_mensagens").select("id,direcao,tipo,conteudo,ocorrida_em,status")
        .eq("conversa_id", selecionada).order("ocorrida_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
  });
  const { data: historico = [] } = useQuery({
    queryKey: ["whatsapp-conversa-historico", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_conversa_historico")
        .select("id,evento,status_anterior,status_novo,responsavel_anterior_id,responsavel_novo_id,ocorrido_em")
        .eq("conversa_id", selecionada)
        .order("ocorrido_em", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as HistoricoConversa[];
    },
  });
  const { data: notas = [] } = useQuery({
    queryKey: ["whatsapp-conversa-notas", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_conversa_notas")
        .select("id,conteudo,criado_por,criado_em")
        .eq("conversa_id", selecionada)
        .order("criado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as NotaConversa[];
    },
  });
  const { data: followups = [] } = useQuery({
    queryKey: ["whatsapp-conversa-followups", selecionada],
    enabled: !!selecionada,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_conversa_followups")
        .select("id,responsavel_id,descricao,agendado_para,status,concluido_em")
        .eq("conversa_id", selecionada)
        .neq("status", "cancelado")
        .order("agendado_para", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as FollowupConversa[];
    },
  });
  const criarFollowup = useMutation({
    mutationFn: async () => {
      if (!selecionada || !descricaoFollowup.trim() || !dataFollowup) {
        throw new Error("Informe a ação e a data do próximo contato.");
      }
      const agendadoPara = new Date(dataFollowup);
      if (Number.isNaN(agendadoPara.getTime())) throw new Error("Data inválida.");
      const { error } = await (supabase as any)
        .from("whatsapp_conversa_followups")
        .insert({
          conversa_id: selecionada,
          responsavel_id: conversa?.responsavel_id || user?.id || null,
          descricao: descricaoFollowup.trim(),
          agendado_para: agendadoPara.toISOString(),
          criado_por: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: async () => {
      setDescricaoFollowup("");
      setDataFollowup("");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa-followups", selecionada] });
      toast.success("Próximo contato agendado.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível agendar o contato."),
  });
  const atualizarFollowup = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "concluido" | "cancelado" }) => {
      const { error } = await (supabase as any)
        .from("whatsapp_conversa_followups")
        .update({
          status,
          concluido_em: status === "concluido" ? new Date().toISOString() : null,
          concluido_por: status === "concluido" ? user?.id : null,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa-followups", selecionada] });
      toast.success("Próximo contato atualizado.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível atualizar o contato."),
  });
  const adicionarNota = useMutation({
    mutationFn: async () => {
      if (!selecionada || !novaNota.trim()) throw new Error("Escreva a nota interna.");
      const { error } = await (supabase as any)
        .from("whatsapp_conversa_notas")
        .insert({
          conversa_id: selecionada,
          conteudo: novaNota.trim(),
          criado_por: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: async () => {
      setNovaNota("");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa-notas", selecionada] });
      toast.success("Nota interna registrada.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível registrar a nota."),
  });
  const editarNota = useMutation({
    mutationFn: async () => {
      if (!notaEmEdicao || !textoNotaEmEdicao.trim()) throw new Error("A nota não pode ficar vazia.");
      const { error } = await (supabase as any)
        .from("whatsapp_conversa_notas")
        .update({ conteudo: textoNotaEmEdicao.trim(), atualizado_em: new Date().toISOString() })
        .eq("id", notaEmEdicao);
      if (error) throw error;
    },
    onSuccess: async () => {
      setNotaEmEdicao(null);
      setTextoNotaEmEdicao("");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa-notas", selecionada] });
      toast.success("Nota interna atualizada.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível atualizar a nota."),
  });
  const excluirNota = useMutation({
    mutationFn: async (notaId: string) => {
      const { error } = await (supabase as any)
        .from("whatsapp_conversa_notas")
        .delete()
        .eq("id", notaId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversa-notas", selecionada] });
      toast.success("Nota interna removida.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível remover a nota."),
  });
  const enviarMensagem = useMutation({
    mutationFn: async () => {
      if (!selecionada || !texto.trim()) throw new Error("Digite uma mensagem.");
      const { data, error } = await supabase.functions.invoke("whatsapp-enviar", {
        body: { conversa_id: selecionada, texto: texto.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      setTexto("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens", selecionada] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
      ]);
      toast.success("Mensagem enviada.");
    },
    onError: (erro: Error) => {
      toast.error(erro.message || "Não foi possível enviar a mensagem.");
    },
  });
  const enviarTemplate = useMutation({
    mutationFn: async () => {
      if (!selecionada || !templateSelecionado) throw new Error("Selecione um template aprovado.");
      const { data, error } = await supabase.functions.invoke("whatsapp-enviar", {
        body: { conversa_id: selecionada, template_id: templateSelecionado },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      setTemplateSelecionado("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens", selecionada] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
      ]);
      toast.success("Template enviado.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível enviar o template."),
  });
  const iniciarConversa = useMutation({
    mutationFn: async () => {
      if (!conexao || conexao.status !== "conectado") throw new Error("O canal oficial não está conectado.");
      if (!contatoSelecionado || !templateSelecionado) {
        throw new Error("Selecione um contato real e um template aprovado.");
      }
      const telefone = contatoSelecionado.telefone.replace(/\D/g, "");
      if (!telefone) throw new Error("O contato não possui telefone válido.");

      const localizar = () => (supabase as any)
        .from("whatsapp_conversas")
        .select("id")
        .eq("conexao_id", conexao.id)
        .eq("telefone", telefone)
        .neq("status", "encerrada")
        .maybeSingle();

      let { data: conversaExistente, error: erroBusca } = await localizar();
      if (erroBusca) throw erroBusca;

      if (!conversaExistente) {
        const { data: criada, error: erroCriacao } = await (supabase as any)
          .from("whatsapp_conversas")
          .insert({
            conexao_id: conexao.id,
            lead_id: contatoSelecionado.origem === "lead" ? contatoSelecionado.id : null,
            cliente_id: contatoSelecionado.origem === "cliente" ? contatoSelecionado.id : null,
            telefone,
            nome_contato: contatoSelecionado.nome,
            status: "aberta",
            responsavel_id: responsavelPadrao?.user_id || user?.id || null,
          })
          .select("id")
          .single();

        if (erroCriacao) {
          const repetida = await localizar();
          if (repetida.error || !repetida.data) throw erroCriacao;
          conversaExistente = repetida.data;
        } else {
          conversaExistente = criada;
        }
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-enviar", {
        body: { conversa_id: conversaExistente.id, template_id: templateSelecionado },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return conversaExistente.id as string;
    },
    onSuccess: async (conversaId) => {
      setSelecionada(conversaId);
      setContatoSelecionado(null);
      setTemplateSelecionado("");
      setNovaConversaAberta(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-mensagens", conversaId] }),
      ]);
      toast.success("Conversa iniciada com template aprovado.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível iniciar a conversa."),
  });
  const alterarStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!selecionada) throw new Error("Selecione uma conversa.");
      const { error } = await (supabase as any)
        .from("whatsapp_conversas")
        .update({
          status,
          nao_lidas: status === "encerrada" ? 0 : conversa?.nao_lidas || 0,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", selecionada);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] }),
        queryClient.invalidateQueries({ queryKey: ["comercial-visao-geral"] }),
      ]);
      toast.success("Situação do atendimento atualizada.");
    },
    onError: () => toast.error("Não foi possível atualizar o atendimento."),
  });
  const atribuirResponsavel = useMutation({
    mutationFn: async (responsavelId: string) => {
      if (!selecionada) throw new Error("Selecione uma conversa.");
      const { error } = await (supabase as any)
        .from("whatsapp_conversas")
        .update({
          responsavel_id: responsavelId === "sem_responsavel" ? null : responsavelId,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", selecionada);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversas"] });
      toast.success("Responsável pelo atendimento atualizado.");
    },
    onError: () => toast.error("Não foi possível atribuir o atendimento."),
  });
  const ultimaEntradaEm = useMemo(() => {
    const entradas = mensagens.filter((mensagem) => mensagem.direcao === "entrada");
    if (entradas.length === 0) return null;
    return entradas.reduce((maisRecente, mensagem) =>
      new Date(mensagem.ocorrida_em).getTime() > new Date(maisRecente).getTime()
        ? mensagem.ocorrida_em
        : maisRecente,
    entradas[0].ocorrida_em);
  }, [mensagens]);
  const janelaAtiva = !!ultimaEntradaEm &&
    Date.now() - new Date(ultimaEntradaEm).getTime() <= 24 * 60 * 60 * 1000;
  const envioDisponivel = conexao?.status === "conectado" && janelaAtiva;

  const { data: lead } = useQuery({
    queryKey: ["whatsapp-lead", conversa?.lead_id],
    enabled: !!conversa?.lead_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("mkt_leads").select("id,nome,email,area_direito,status,canal,valor_contrato").eq("id", conversa!.lead_id).single();
      if (error) throw error;
      return data as Lead;
    },
  });

  const filtradas = useMemo(() => conversas.filter((item) => {
    const bateBusca = [item.nome_contato, item.telefone, item.ultima_mensagem_resumo].some((v) => (v || "").toLowerCase().includes(busca.toLowerCase()));
    const bateFiltro = filtro === "todas" ||
      (filtro === "minhas" && item.responsavel_id === user?.id) ||
      (filtro === "fila" && ["aberta", "aguardando_escritorio"].includes(item.status)) ||
      (filtro === "nao_lidas" && item.nao_lidas > 0) ||
      (filtro === "encerradas" && item.status === "encerrada");
    return bateBusca && bateFiltro;
  }), [conversas, busca, filtro, user?.id]);

  const contatosFiltrados = useMemo(() => {
    const termo = buscaContato.trim().toLowerCase();
    if (!termo) return contatos;
    return contatos.filter((item) =>
      [item.nome, item.telefone, item.email].some((valor) => (valor || "").toLowerCase().includes(termo)),
    );
  }, [buscaContato, contatos]);

  const nomeResponsavel = (id: string | null) =>
    responsaveis.find((item) => item.user_id === id)?.nome || (id ? "Usuário não disponível" : "Sem responsável");
  const descricaoHistorico = (item: HistoricoConversa) => {
    if (item.evento === "criada") return "Conversa aberta no sistema";
    if (item.evento === "status_alterado") {
      return `Situação: ${item.status_anterior || "—"} → ${item.status_novo || "—"}`;
    }
    return `Responsável: ${nomeResponsavel(item.responsavel_anterior_id)} → ${nomeResponsavel(item.responsavel_novo_id)}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Comercial</p><h1 className="font-display text-3xl">Conversas</h1><p className="text-sm text-muted-foreground">Atendimento centralizado, vinculado aos cadastros reais do escritório.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={conexao?.status === "conectado" ? "default" : "outline"} className="w-fit gap-2 py-2 px-3">
            <span className={cn("h-2 w-2 rounded-full", conexao?.status === "conectado" ? "bg-emerald-300" : "bg-amber-500")} />
            {conexao?.status === "conectado" ? `${conexao.nome} conectado` : "WhatsApp aguardando conexão"}
          </Badge>
          {conversa && (
            <Button variant="outline" className="gap-2" asChild>
              <a href={linkWhatsApp(conversa.telefone)} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Conversar no WhatsApp
              </a>
            </Button>
          )}
          <Button className="gap-2" onClick={() => setNovaConversaAberta(true)}>
            <Plus className="h-4 w-4" />
            Nova conversa
          </Button>
        </div>
      </header>

      <Card className="grid min-h-[680px] overflow-hidden border-border/80 lg:grid-cols-[330px_minmax(420px,1fr)_310px]">
        <aside className="border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b p-4">
            <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa ou contato" className="pl-9" /></div>
            <div className="flex gap-1">
              {([["todas","Todas"],["minhas","Minhas"],["fila","Fila"],["nao_lidas","Não lidas"],["encerradas","Fechadas"]] as const).map(([valor, rotulo]) => <Button key={valor} size="sm" variant={filtro === valor ? "secondary" : "ghost"} onClick={() => setFiltro(valor)}>{rotulo}</Button>)}
            </div>
          </div>
          <div className="max-h-[590px] overflow-y-auto">
            {isLoading ? <p className="p-5 text-sm text-muted-foreground">Carregando conversas…</p> : filtradas.length === 0 ? (
              <div className="p-8 text-center"><Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" /><p className="font-medium">Nenhuma conversa</p><p className="mt-1 text-xs text-muted-foreground">{conexao ? "Nenhum atendimento corresponde ao filtro." : "Conecte o canal oficial para sincronizar atendimentos."}</p></div>
            ) : filtradas.map((item) => (
              <button key={item.id} onClick={() => setSelecionada(item.id)} className={cn("flex w-full gap-3 border-b p-4 text-left transition-colors hover:bg-muted/60", selecionada === item.id && "bg-primary/5")}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{iniciais(item.nome_contato)}</div>
                <div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="truncate font-medium">{item.nome_contato || item.telefone}</p><span className="text-[11px] text-muted-foreground">{hora(item.ultima_mensagem_em)}</span></div><p className="truncate text-sm text-muted-foreground">{item.ultima_mensagem_resumo || "Sem mensagem registrada"}</p></div>
                {item.nao_lidas > 0 && <Badge className="h-5 min-w-5 px-1.5">{item.nao_lidas}</Badge>}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-[560px] flex-col bg-muted/15">
          {conversa ? <>
            <div className="flex items-center gap-3 border-b bg-background p-4"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">{iniciais(conversa.nome_contato)}</div><div className="min-w-0 flex-1"><p className="truncate font-medium">{conversa.nome_contato || conversa.telefone}</p><p className="text-xs text-muted-foreground">{conversa.telefone}</p></div><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {mensagens.length === 0 ? <div className="flex h-full items-center justify-center"><div className="text-center"><MessageCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground/35" /><p className="font-medium">Histórico vazio</p><p className="text-sm text-muted-foreground">As mensagens oficiais aparecerão aqui após a sincronização.</p></div></div> : mensagens.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.direcao === "saida" ? "justify-end" : "justify-start")}><div className={cn("max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm", msg.direcao === "saida" ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm border bg-background")}><p className="whitespace-pre-wrap">{msg.conteudo || `[${msg.tipo}]`}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
                  <span>{hora(msg.ocorrida_em)}</span>
                  {msg.direcao === "saida" && <StatusMensagem status={msg.status} />}
                </div></div></div>
              ))}
            </div>
            <div className="border-t bg-background p-3">
              {conexao?.status === "conectado" && !janelaAtiva && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-950">
                    A janela de 24 horas está encerrada. Retome o contato somente com um template aprovado pela Meta.
                  </p>
                  {templates.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Select value={templateSelecionado} onValueChange={setTemplateSelecionado}>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Selecionar template aprovado" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.nome} · {template.idioma}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => enviarTemplate.mutate()}
                        disabled={!templateSelecionado || enviarTemplate.isPending}
                        className="shrink-0 gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {enviarTemplate.isPending ? "Enviando…" : "Enviar template"}
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-amber-950">
                      Nenhum template aprovado está sincronizado para este canal.
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="icon" disabled title="Anexos serão liberados após a homologação do canal">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  value={texto}
                  onChange={(evento) => setTexto(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
                      evento.preventDefault();
                      if (!enviarMensagem.isPending && texto.trim()) enviarMensagem.mutate();
                    }
                  }}
                  disabled={!envioDisponivel || enviarMensagem.isPending}
                  rows={2}
                  maxLength={4096}
                  placeholder={!conexao || conexao.status !== "conectado" ? "Envio bloqueado até conectar o provedor oficial" : janelaAtiva ? "Digite uma mensagem… (Ctrl + Enter para enviar)" : "Janela de 24 horas encerrada — use template aprovado"}
                  className="min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Button
                  disabled={!envioDisponivel || !texto.trim() || enviarMensagem.isPending}
                  className="gap-2"
                  onClick={() => enviarMensagem.mutate()}
                >
                  <Send className="h-4 w-4" />
                  {enviarMensagem.isPending ? "Enviando…" : "Enviar"}
                </Button>
              </div>
            </div>
          </> : <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary/25" /><h2 className="font-display text-2xl">Central de atendimento</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">Selecione uma conversa. A interface está pronta para operar no estilo WhatsApp Web sem inventar dados.</p></div></div>}
        </section>

        <aside className="border-t bg-background p-5 lg:border-l lg:border-t-0">
          <h2 className="font-display text-xl">Contexto comercial</h2>
          {conversa ? <div className="mt-5 space-y-5">
            <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-semibold">{iniciais(conversa.nome_contato)}</div><div><p className="font-semibold">{conversa.nome_contato || conversa.telefone}</p><p className="text-sm text-muted-foreground">{lead ? "Lead cadastrado" : conversa.cliente_id ? "Cliente cadastrado" : "Contato vinculado"}</p></div></div>
            <Info label="Telefone" value={conversa.telefone} /><Info label="E-mail" value={lead?.email || "Não informado"} /><Info label="Área de interesse" value={lead?.area_direito || "Não informada"} /><Info label="Origem" value={lead?.canal || "Não informada"} /><Info label="Etapa no CRM" value={lead?.status || "Sem lead vinculado"} />
            {lead?.valor_contrato != null && <Info label="Valor esperado" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.valor_contrato)} />}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Situação do atendimento</p>
              <Select
                value={conversa.status}
                onValueChange={(status) => alterarStatus.mutate(status)}
                disabled={alterarStatus.isPending}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberta">Aberta</SelectItem>
                  <SelectItem value="aguardando_escritorio">Aguardando escritório</SelectItem>
                  <SelectItem value="aguardando_cliente">Aguardando cliente</SelectItem>
                  <SelectItem value="encerrada">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Responsável pelo atendimento</p>
              <Select
                value={conversa.responsavel_id || "sem_responsavel"}
                onValueChange={(responsavelId) => atribuirResponsavel.mutate(responsavelId)}
                disabled={atribuirResponsavel.isPending || responsaveis.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                  {responsaveis.map((responsavel) => (
                    <SelectItem key={responsavel.user_id} value={responsavel.user_id}>
                      {responsavel.nome}{responsavel.gestor ? " · Gestora" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {responsaveis.length === 0 && (
                <p className="text-xs text-amber-700">Nenhum usuário possui autorização comercial.</p>
              )}
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximos contatos</p>
              </div>
              <Input
                value={descricaoFollowup}
                onChange={(evento) => setDescricaoFollowup(evento.target.value)}
                maxLength={500}
                placeholder="Ex.: retornar sobre documentos"
                className="mt-3"
              />
              <Input
                type="datetime-local"
                value={dataFollowup}
                onChange={(evento) => setDataFollowup(evento.target.value)}
                className="mt-2"
              />
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => criarFollowup.mutate()}
                disabled={!descricaoFollowup.trim() || !dataFollowup || criarFollowup.isPending}
              >
                {criarFollowup.isPending ? "Agendando…" : "Agendar retorno"}
              </Button>
              {followups.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Nenhum retorno agendado.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {followups.map((followup) => (
                    <div key={followup.id} className={cn("rounded-md border p-3", followup.status === "concluido" && "bg-muted/50 opacity-70")}>
                      <p className={cn("text-xs font-medium", followup.status === "concluido" && "line-through")}>{followup.descricao}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(followup.agendado_para))}
                        {" · "}{nomeResponsavel(followup.responsavel_id)}
                      </p>
                      {followup.status === "pendente" && (
                        <div className="mt-2 flex gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={() => atualizarFollowup.mutate({ id: followup.id, status: "concluido" })}>
                            Concluir
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => atualizarFollowup.mutate({ id: followup.id, status: "cancelado" })}>
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center gap-2">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notas internas</p>
              </div>
              <textarea
                value={novaNota}
                onChange={(evento) => setNovaNota(evento.target.value)}
                rows={3}
                maxLength={4000}
                placeholder="Registrar informação somente para a equipe…"
                className="mt-3 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none"
              />
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => adicionarNota.mutate()}
                disabled={!novaNota.trim() || adicionarNota.isPending}
              >
                {adicionarNota.isPending ? "Registrando…" : "Adicionar nota"}
              </Button>
              {notas.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">Nenhuma nota interna.</p>
              ) : (
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {notas.map((nota) => {
                    const podeGerenciar = nota.criado_por === user?.id || isGestor;
                    const editando = notaEmEdicao === nota.id;
                    return (
                      <div key={nota.id} className="rounded-md bg-amber-50 p-3 text-amber-950">
                        {editando ? (
                          <>
                            <textarea
                              value={textoNotaEmEdicao}
                              onChange={(evento) => setTextoNotaEmEdicao(evento.target.value)}
                              rows={3}
                              maxLength={4000}
                              className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none"
                            />
                            <div className="mt-2 flex gap-1">
                              <Button size="sm" className="h-7 text-xs" onClick={() => editarNota.mutate()} disabled={!textoNotaEmEdicao.trim() || editarNota.isPending}>
                                Salvar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setNotaEmEdicao(null); setTextoNotaEmEdicao(""); }}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-start gap-2">
                              <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs">{nota.conteudo}</p>
                              {podeGerenciar && (
                                <div className="flex shrink-0">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    title="Editar nota"
                                    onClick={() => { setNotaEmEdicao(nota.id); setTextoNotaEmEdicao(nota.conteudo); }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-destructive hover:text-destructive"
                                    title="Excluir nota"
                                    onClick={() => {
                                      if (window.confirm("Excluir esta nota interna?")) excluirNota.mutate(nota.id);
                                    }}
                                    disabled={excluirNota.isPending}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            <p className="mt-1 text-[10px] opacity-70">
                              {nota.criado_por === user?.id ? "Você" : nomeResponsavel(nota.criado_por)} ·{" "}
                              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(nota.criado_em))}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico operacional</p>
              {historico.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {historico.map((item) => (
                    <div key={item.id} className="border-l-2 border-primary/30 pl-3">
                      <p className="text-xs font-medium">{descricaoHistorico(item)}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.ocorrido_em))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div> : <p className="mt-4 text-sm text-muted-foreground">O cadastro vinculado aparecerá aqui.</p>}
          {!conexao && <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"><PlugZap className="mb-2 h-5 w-5" /><p className="font-medium">Canal não configurado</p><p className="mt-1 text-xs">Nenhuma mensagem será enviada até a conexão oficial.</p></div>}
        </aside>
      </Card>

      <Dialog open={novaConversaAberta} onOpenChange={setNovaConversaAberta}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Iniciar conversa</DialogTitle>
            <DialogDescription>
              Escolha um lead ou cliente já cadastrado. Com o canal conectado, a conversa começa por um template aprovado; o WhatsApp Web continua disponível como alternativa externa.
            </DialogDescription>
          </DialogHeader>

          {contatoSelecionado && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">{contatoSelecionado.nome}</p>
              <p className="text-xs text-muted-foreground">{contatoSelecionado.telefone}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Select value={templateSelecionado} onValueChange={setTemplateSelecionado}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Template aprovado para iniciar" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.nome} · {template.idioma}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => iniciarConversa.mutate()}
                  disabled={!templateSelecionado || iniciarConversa.isPending || conexao?.status !== "conectado"}
                  className="shrink-0 gap-2"
                >
                  <Send className="h-4 w-4" />
                  {iniciarConversa.isPending ? "Iniciando…" : "Iniciar no sistema"}
                </Button>
              </div>
              {conexao?.status !== "conectado" && (
                <p className="mt-2 text-xs text-amber-700">Conecte o canal oficial para iniciar dentro do sistema.</p>
              )}
              {templates.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">Nenhum template aprovado foi sincronizado.</p>
              )}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={buscaContato}
              onChange={(evento) => setBuscaContato(evento.target.value)}
              placeholder="Buscar por nome, telefone ou e-mail"
              className="pl-9"
            />
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {carregandoContatos ? (
              <p className="p-5 text-center text-sm text-muted-foreground">Carregando contatos…</p>
            ) : contatosFiltrados.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <UserRound className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-3 font-medium">Nenhum contato com WhatsApp encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cadastre o número no CRM ou no cadastro do cliente.
                </p>
              </div>
            ) : (
              contatosFiltrados.map((contato) => (
                <div
                  key={`${contato.origem}-${contato.id}`}
                  className={cn("flex items-center gap-3 rounded-lg border p-3", contatoSelecionado?.id === contato.id && contatoSelecionado.origem === contato.origem && "border-primary bg-primary/5")}
                >
                  <button type="button" onClick={() => setContatoSelecionado(contato)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {iniciais(contato.nome)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{contato.nome}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {contato.telefone}{contato.email ? ` · ${contato.email}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{contato.origem === "lead" ? "Lead" : "Cliente"}</Badge>
                  </button>
                  <Button variant="ghost" size="icon" asChild title="Abrir no WhatsApp Web">
                    <a href={linkWhatsApp(contato.telefone)} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusMensagem({ status }: { status: string }) {
  const normalizado = status.toLowerCase();
  if (normalizado === "lida") {
    return <span className="inline-flex items-center gap-0.5 text-sky-600" title="Lida"><CheckCheck className="h-3.5 w-3.5" /><span className="sr-only">Lida</span></span>;
  }
  if (normalizado === "entregue") {
    return <span className="inline-flex items-center gap-0.5" title="Entregue"><CheckCheck className="h-3.5 w-3.5" /><span className="sr-only">Entregue</span></span>;
  }
  if (normalizado === "enviada") {
    return <span className="inline-flex items-center gap-0.5" title="Enviada"><Check className="h-3.5 w-3.5" /><span className="sr-only">Enviada</span></span>;
  }
  if (normalizado === "falha") {
    return <span className="inline-flex items-center gap-0.5 text-destructive" title="Falha no envio"><CircleAlert className="h-3.5 w-3.5" /><span className="sr-only">Falha no envio</span></span>;
  }
  return <span className="inline-flex items-center gap-0.5" title="Aguardando envio"><Clock3 className="h-3.5 w-3.5" /><span className="sr-only">Aguardando envio</span></span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="border-b pb-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}
