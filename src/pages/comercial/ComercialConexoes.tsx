import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Pencil, PlugZap, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useResponsavelComunicacao } from "@/hooks/useResponsavelComunicacao";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Responsavel = { user_id: string; nome: string; ativo: boolean; gestor: boolean };

type Conexao = {
  id: string;
  nome: string;
  provedor: string;
  numero_exibicao: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  status: string;
  ativo: boolean;
  ultima_sincronizacao_em: string | null;
  erro_ultima_sincronizacao: string | null;
};

const inicial = {
  id: "",
  nome: "WhatsApp principal",
  numero_exibicao: "",
  phone_number_id: "",
  business_account_id: "",
};

export default function ComercialConexoes() {
  const { isGestor, user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState(inicial);
  const { data: responsavelAtual } = useResponsavelComunicacao();

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["comercial-responsaveis-autorizados"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("comercial_responsaveis_autorizados");
      if (error) throw error;
      return (data ?? []) as Responsavel[];
    },
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conexoes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_conexoes")
        .select("id,nome,provedor,numero_exibicao,phone_number_id,business_account_id,status,ativo,ultima_sincronizacao_em,erro_ultima_sincronizacao")
        .order("ativo", { ascending: false })
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Conexao[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!isGestor) throw new Error("Somente gestores podem configurar canais.");
      if (!form.nome.trim()) throw new Error("Informe um nome para o canal.");

      const payload = {
        nome: form.nome.trim(),
        provedor: "meta_cloud",
        numero_exibicao: form.numero_exibicao.trim() || null,
        phone_number_id: form.phone_number_id.trim() || null,
        business_account_id: form.business_account_id.trim() || null,
        status: form.phone_number_id.trim() && form.business_account_id.trim() ? "configurando" : "desconectado",
        ativo: true,
        criado_por: user?.id || null,
        atualizado_em: new Date().toISOString(),
      };

      const existenteAtivo = items.find((item) => item.ativo && item.id !== form.id);
      if (existenteAtivo) {
        const { error } = await (supabase as any)
          .from("whatsapp_conexoes")
          .update({ ativo: false, atualizado_em: new Date().toISOString() })
          .eq("id", existenteAtivo.id);
        if (error) throw error;
      }

      if (form.id) {
        const alteracoes = {
          nome: payload.nome,
          provedor: payload.provedor,
          numero_exibicao: payload.numero_exibicao,
          phone_number_id: payload.phone_number_id,
          business_account_id: payload.business_account_id,
          status: payload.status,
          ativo: payload.ativo,
          atualizado_em: payload.atualizado_em,
        };
        const { error } = await (supabase as any)
          .from("whatsapp_conexoes")
          .update(alteracoes)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("whatsapp_conexoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conexoes"] }),
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conexao-ativa"] }),
      ]);
      setDialogAberto(false);
      setForm(inicial);
      toast.success("Canal salvo. Falta configurar os segredos e homologar a Meta.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível salvar o canal."),
  });

  const salvarResponsavel = useMutation({
    mutationFn: async (responsavelId: string) => {
      if (!isGestor) throw new Error("Somente gestores podem alterar a responsável comercial.");
      const { error } = await (supabase as any)
        .from("configuracoes_sistema")
        .update({
          valor: responsavelId === "sem_responsavel" ? null : responsavelId,
          atualizado_por: user?.id || null,
          atualizado_em: new Date().toISOString(),
        })
        .eq("secao", "comercial")
        .eq("chave", "responsavel_comunicacao_user_id");
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["comercial-responsavel-comunicacao"] }),
        queryClient.invalidateQueries({ queryKey: ["comercial-responsaveis-autorizados"] }),
      ]);
      toast.success("Responsável comercial atualizada.");
    },
    onError: (erro: Error) => toast.error(erro.message || "Não foi possível atualizar a responsável."),
  });

  const abrirNovo = () => {
    setForm(inicial);
    setDialogAberto(true);
  };

  const abrirEdicao = (conexao: Conexao) => {
    setForm({
      id: conexao.id,
      nome: conexao.nome,
      numero_exibicao: conexao.numero_exibicao || "",
      phone_number_id: conexao.phone_number_id || "",
      business_account_id: conexao.business_account_id || "",
    });
    setDialogAberto(true);
  };

  const submit = (evento: FormEvent) => {
    evento.preventDefault();
    salvar.mutate();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Sistema comercial</p>
          <h1 className="font-display text-3xl">Conexões e canais</h1>
          <p className="text-sm text-muted-foreground">Estado real das integrações do atendimento.</p>
        </div>
        {isGestor && <Button onClick={abrirNovo}>Cadastrar canal</Button>}
      </header>

      {isLoading ? (
        <p>Carregando…</p>
      ) : items.length === 0 ? (
        <Card className="p-8">
          <div className="flex gap-4">
            <PlugZap className="h-9 w-9 shrink-0 text-amber-600" />
            <div>
              <h2 className="font-display text-2xl">WhatsApp ainda não conectado</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                A estrutura do sistema está pronta. Para receber e enviar mensagens precisamos cadastrar
                o número da API oficial, configurar o webhook e guardar os segredos exclusivamente no servidor.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {isGestor && <Button onClick={abrirNovo}>Preparar canal oficial</Button>}
                <Button variant="outline" asChild>
                  <a href="https://web.whatsapp.com/" target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />Abrir WhatsApp Web
                  </a>
                </Button>
              </div>
              {!isGestor && (
                <p className="mt-3 text-xs text-muted-foreground">
                  A configuração do canal é restrita à gestão.
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((conexao) => (
            <Card key={conexao.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl">{conexao.nome}</h2>
                    {conexao.ativo && <Badge>Canal principal</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Meta Cloud API · {conexao.numero_exibicao || "número não informado"}
                  </p>
                </div>
                {conexao.status === "conectado"
                  ? <CheckCircle2 className="text-emerald-600" />
                  : <AlertTriangle className="text-amber-600" />}
              </div>

              <div className="mt-5 space-y-2 text-sm">
                <p>Status: <strong>{conexao.status}</strong></p>
                <p>Phone Number ID: <strong>{conexao.phone_number_id ? "configurado" : "pendente"}</strong></p>
                <p>Business Account ID: <strong>{conexao.business_account_id ? "configurado" : "pendente"}</strong></p>
                <p>
                  Última sincronização:{" "}
                  <strong>
                    {conexao.ultima_sincronizacao_em
                      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(conexao.ultima_sincronizacao_em))
                      : "ainda não realizada"}
                  </strong>
                </p>
              </div>

              {conexao.erro_ultima_sincronizacao && (
                <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {conexao.erro_ultima_sincronizacao}
                </p>
              )}

              {isGestor && (
                <Button variant="outline" className="mt-5 gap-2" onClick={() => abrirEdicao(conexao)}>
                  <Pencil className="h-4 w-4" />Editar dados públicos
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_360px] md:items-center">
          <div>
            <p className="font-medium">Responsável principal pelo Comercial</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Novos atendimentos recebidos pelo canal oficial entram na fila desta pessoa.
              A seleção pode ser alterada sem mudança no código.
            </p>
          </div>
          <Select
            value={responsavelAtual?.user_id || "sem_responsavel"}
            onValueChange={(valor) => salvarResponsavel.mutate(valor)}
            disabled={!isGestor || salvarResponsavel.isPending || responsaveis.length === 0}
          >
            <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
              {responsaveis.map((responsavel) => (
                <SelectItem key={responsavel.user_id} value={responsavel.user_id}>
                  {responsavel.nome}{responsavel.gestor ? " · Gestora" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">Credenciais protegidas</p>
            <p className="text-sm text-muted-foreground">
              Esta tela aceita apenas identificadores públicos. Tokens, segredo do aplicativo e token de
              verificação são configurados diretamente nos segredos das Edge Functions e nunca aparecem no navegador.
            </p>
          </div>
        </div>
      </Card>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar canal" : "Preparar canal oficial"}</DialogTitle>
              <DialogDescription>
                Informe somente os dados públicos fornecidos pela Meta. Não cole tokens ou segredos nesta tela.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-5">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Nome do canal *</span>
                <Input value={form.nome} onChange={(e) => setForm((atual) => ({ ...atual, nome: e.target.value }))} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Número exibido</span>
                <Input value={form.numero_exibicao} onChange={(e) => setForm((atual) => ({ ...atual, numero_exibicao: e.target.value }))} placeholder="+55 65 99999-9999" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Phone Number ID</span>
                <Input value={form.phone_number_id} onChange={(e) => setForm((atual) => ({ ...atual, phone_number_id: e.target.value }))} autoComplete="off" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">WhatsApp Business Account ID</span>
                <Input value={form.business_account_id} onChange={(e) => setForm((atual) => ({ ...atual, business_account_id: e.target.value }))} autoComplete="off" />
              </label>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                O canal permanecerá como “configurando” até que os segredos sejam cadastrados no Supabase,
                o webhook seja validado pela Meta e um teste real seja concluído.
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar preparação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
