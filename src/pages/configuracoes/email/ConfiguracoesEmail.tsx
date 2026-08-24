import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, EyeOff, Loader2, Mail, Save, Send, CheckCircle2, XCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { enviarEmail } from "@/lib/email";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import EmailTemplatesEditor from "./EmailTemplatesEditor";

interface ConfigEmail {
  remetente_nome: string;
  remetente_endereco: string;
  ativo: boolean;
}

interface EmailLogRow {
  id: string;
  destinatario: string;
  assunto: string;
  evento: string | null;
  status: string;
  erro: string | null;
  enviado_em: string;
}

export default function ConfiguracoesEmail() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [chaveResend, setChaveResend] = useState("");
  const [mostrarChave, setMostrarChave] = useState(false);
  const [remetenteNome, setRemetenteNome] = useState("");
  const [remetenteEndereco, setRemetenteEndereco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; msg: string } | null>(null);

  const { data: cfg, isLoading: loadingCfg } = useQuery<ConfigEmail>({
    queryKey: ["config-email"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes_sistema")
        .select("chave, valor")
        .eq("secao", "email");
      if (error) throw error;
      const map = Object.fromEntries((data ?? []).map((r: any) => [r.chave, r.valor]));
      return {
        remetente_nome: map.remetente_nome ?? "",
        remetente_endereco: map.remetente_endereco ?? "",
        ativo: map.ativo === "true",
      };
    },
  });

  useEffect(() => {
    if (cfg) {
      setRemetenteNome(cfg.remetente_nome);
      setRemetenteEndereco(cfg.remetente_endereco);
    }
  }, [cfg]);

  const { data: logs, isLoading: loadingLogs } = useQuery<EmailLogRow[]>({
    queryKey: ["email-log-recente"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_log")
        .select("*")
        .order("enviado_em", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as EmailLogRow[];
    },
    refetchInterval: 15_000,
  });

  async function handleSalvar() {
    if (!remetenteNome.trim() || !remetenteEndereco.trim()) {
      return toast.error("Preencha nome e endereço do remetente.");
    }
    setSalvando(true);
    const updates = [
      { secao: "email", chave: "remetente_nome", valor: remetenteNome.trim() },
      { secao: "email", chave: "remetente_endereco", valor: remetenteEndereco.trim() },
      { secao: "email", chave: "ativo", valor: "true" },
    ];
    let erro: string | null = null;
    for (const u of updates) {
      const { error } = await supabase
        .from("configuracoes_sistema")
        .update({ valor: u.valor })
        .eq("secao", u.secao)
        .eq("chave", u.chave);
      if (error) {
        erro = error.message;
        break;
      }
    }
    setSalvando(false);
    if (erro) return toast.error("Erro ao salvar: " + erro);
    toast.success("Configurações salvas. Envio de emails ativado.");
    qc.invalidateQueries({ queryKey: ["config-email"] });
  }

  async function handleTestar() {
    if (!user?.email) return toast.error("Não foi possível identificar seu email.");
    setTestando(true);
    setResultadoTeste(null);
    const conteudo = `
      <h2>Teste de configuração</h2>
      <p>Email configurado com sucesso! O sistema de notificações do LegisFlow está funcionando.</p>
      <div class="highlight">Você recebeu este email porque clicou em "Testar configuração" em <strong>Configurações → Email</strong>.</div>
    `;
    const r = await enviarEmail({
      para: user.email,
      assunto: "[LegisFlow] Teste de configuração de email",
      conteudo,
      evento: "teste_configuracao",
      override_api_key: chaveResend.trim() || undefined,
    });
    setTestando(false);
    if (r.ok) {
      setResultadoTeste({ ok: true, msg: `Email de teste enviado para ${user.email}. Verifique sua caixa de entrada.` });
      toast.success("Email de teste enviado!");
      qc.invalidateQueries({ queryKey: ["email-log-recente"] });
    } else {
      setResultadoTeste({ ok: false, msg: r.error ?? "Erro desconhecido" });
      toast.error("Falha no teste");
    }
  }

  if (loadingCfg) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display flex items-center gap-2">
          <Mail className="w-6 h-6" /> Email e Notificações
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o envio de notificações por email via Resend e edite os modelos
        </p>
      </div>

      <Tabs defaultValue="conexao">
        <TabsList>
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
          <TabsTrigger value="modelos">Modelos de email</TabsTrigger>
        </TabsList>

        <TabsContent value="modelos" className="mt-4">
          <EmailTemplatesEditor />
        </TabsContent>

        <TabsContent value="conexao" className="mt-4 space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>Provedor: Resend</CardTitle>
          <CardDescription>
            A chave de API é armazenada como secret seguro da Lovable Cloud — nunca é exibida após salvar
            e não aparece no código-fonte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="chave">Chave de API (Resend)</Label>
            <div className="relative">
              <Input
                id="chave"
                type={mostrarChave ? "text" : "password"}
                value={chaveResend}
                onChange={(e) => setChaveResend(e.target.value)}
                placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setMostrarChave((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={mostrarChave ? "Ocultar" : "Mostrar"}
              >
                {mostrarChave ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              A chave já está configurada no secret <code>RESEND_API_KEY</code> da Lovable Cloud.
              Use este campo apenas se quiser <strong>testar uma chave nova</strong> antes de atualizar o secret.
              Para trocar a chave em produção, peça ao Lovable para atualizá-la.
              Obtenha sua chave em{" "}
              <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline">
                resend.com/api-keys
              </a>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome do remetente</Label>
            <Input id="nome" value={remetenteNome} onChange={(e) => setRemetenteNome(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end">Email remetente</Label>
            <Input
              id="end"
              type="email"
              value={remetenteEndereco}
              onChange={(e) => setRemetenteEndereco(e.target.value)}
            />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                Para usar seu domínio próprio (ex.: <code>noreply@julianaaraujoadvocacia.com.br</code>),
                verifique-o primeiro no painel do Resend.
              </span>
            </p>
          </div>

          {resultadoTeste && (
            <Alert variant={resultadoTeste.ok ? "default" : "destructive"}>
              {resultadoTeste.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              <AlertDescription>{resultadoTeste.msg}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="outline" onClick={handleTestar} disabled={testando}>
              {testando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Testar configuração
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar configurações
            </Button>
          </div>

          <div className="border-t pt-4 flex items-center gap-2 text-sm">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                cfg?.ativo ? "bg-green-500" : "bg-muted-foreground/40"
              }`}
            />
            {cfg?.ativo
              ? "Email configurado e funcionando"
              : "Email ainda não ativado — clique em Salvar para ativar"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Últimos envios</CardTitle>
          <CardDescription>20 emails mais recentes processados pelo sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <Skeleton className="h-40" />
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum email enviado ainda. Use "Testar configuração" para enviar o primeiro.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-md border bg-card text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={log.status === "enviado" ? "secondary" : "destructive"}>
                        {log.status}
                      </Badge>
                      {log.evento && (
                        <span className="text-[11px] text-muted-foreground">{log.evento}</span>
                      )}
                    </div>
                    <p className="font-medium truncate mt-1">{log.assunto}</p>
                    <p className="text-xs text-muted-foreground truncate">{log.destinatario}</p>
                    {log.erro && <p className="text-xs text-destructive mt-1">{log.erro}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(log.enviado_em), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
