import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Send, Paperclip, X, Download, FileText, Plus, Trash2, Loader2, Bot,
} from "lucide-react";
import { toast } from "sonner";
import {
  notificacaoVazia, recalcularTotais, aplicarMora, MORA_MES,
  type NotificacaoData, type ModeloNotificacao, type Parcela,
} from "./types";
import { downloadBothPDFs, downloadNotificationPDF, downloadReceiptPDF } from "./pdfGenerator";

interface ChatMsg {
  role: "user" | "bot";
  content: string;
  fileName?: string;
}

export default function NotificacaoExtrajudicial() {
  const { user } = useAuth();
  const [aba, setAba] = useState<"nova" | "historico" | "modelos">("nova");
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "bot", content: "Olá! Descreva o caso de cobrança ou anexe um documento (.pdf, .png, .jpg). Vou extrair os dados automaticamente." },
  ]);
  const [inputVal, setInputVal] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [formData, setFormData] = useState<NotificacaoData | null>(null);
  const [modelos, setModelos] = useState<ModeloNotificacao[]>([]);
  const [historico, setHistorico] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [processos, setProcessos] = useState<{ id: string; numero_cnj: string | null; tipo_acao: string | null }[]>([]);
  const [clienteVinc, setClienteVinc] = useState<string>("");
  const [processoVinc, setProcessoVinc] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modelos editor
  const [novoModeloOpen, setNovoModeloOpen] = useState(false);
  const [modeloNome, setModeloNome] = useState("");
  const [modeloConteudo, setModeloConteudo] = useState("");

  useEffect(() => {
    carregarModelos();
    carregarClientes();
  }, []);

  useEffect(() => {
    if (aba === "historico") carregarHistorico();
  }, [aba]);

  useEffect(() => {
    if (clienteVinc) carregarProcessos(clienteVinc);
    else { setProcessos([]); setProcessoVinc(""); }
  }, [clienteVinc]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function carregarClientes() {
    const { data } = await supabase
      .from("clientes").select("id, nome").eq("ativo", true).order("nome").limit(500);
    if (data) setClientes(data);
  }

  async function carregarProcessos(cId: string) {
    const { data } = await supabase
      .from("processos").select("id, numero_cnj, tipo_acao")
      .eq("cliente_id", cId).order("criado_em", { ascending: false });
    if (data) setProcessos(data);
  }

  async function carregarModelos() {
    const { data } = await supabase
      .from("ferramentas_modelos_notificacao").select("*")
      .eq("ativo", true).order("criado_em", { ascending: false });
    if (data) setModelos(data as any);
  }

  async function carregarHistorico() {
    const { data } = await supabase
      .from("ferramentas_notificacoes").select("*")
      .order("criado_em", { ascending: false }).limit(100);
    if (data) setHistorico(data);
  }

  async function handleEnviar() {
    if (!inputVal.trim() && !attachment) return;
    setEnviando(true);
    const msgUser = inputVal;
    const anexo = attachment;
    setInputVal(""); setAttachment(null);
    setMessages((p) => [...p, { role: "user", content: msgUser || "Segue o documento.", fileName: anexo?.name }]);

    try {
      const modelosConfig = modelos.map((m) => `Modelo: ${m.nome}\n${m.conteudo}`).join("\n\n---\n\n");
      const { data, error } = await supabase.functions.invoke("ferramentas-notificacao-extrair", {
        body: { prompt: msgUser, fileData: anexo?.base64, fileMimeType: anexo?.mimeType, modelosConfig },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na extração");

      const parcelas: Parcela[] = (data.data.parcelas || []).map((p: any) => {
        const v = Number(p.valorOriginal) || 0;
        return { ...aplicarMora(v), descricao: p.descricao || "", vencimento: p.vencimento || "" };
      });
      const subtotal = parcelas.reduce((a, p) => a + p.total, 0);
      const novo: NotificacaoData = {
        ...notificacaoVazia(),
        ...data.data,
        parcelas,
        ...recalcularTotais(parcelas, 2, 20),
        cliente_id: clienteVinc || undefined,
        processo_id: processoVinc || undefined,
      };
      // garantir defaults
      novo.multa_percentual = 2;
      novo.honorarios_percentual = 20;
      const totais = recalcularTotais(parcelas, 2, 20);
      novo.multa_valor = totais.multa_valor;
      novo.honorarios_valor = totais.honorarios_valor;
      novo.total_geral = totais.total_geral;

      setFormData(novo);
      setMessages((p) => [...p, { role: "bot", content: "Dados extraídos! Revise no formulário e clique em Gerar PDFs." }]);
    } catch (e: any) {
      const msg = e?.message || "Erro ao consultar a IA.";
      setMessages((p) => [...p, { role: "bot", content: `Erro: ${msg}` }]);
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      const parts = result.split(",");
      if (parts.length === 2) {
        setAttachment({ name: file.name, base64: parts[1], mimeType: file.type });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleGerarPDFs() {
    if (!formData) return;
    if (!user) { toast.error("Sessão inválida"); return; }
    try {
      await supabase.from("ferramentas_notificacoes").insert({
        notificante_nome: formData.notificante_nome,
        notificado_nome: formData.notificado_nome,
        notificado_cpf: formData.notificado_cpf,
        referencia: formData.referencia,
        total_geral: formData.total_geral,
        dados_completos: formData as any,
        cliente_id: formData.cliente_id || null,
        processo_id: formData.processo_id || null,
        criado_por: user.id,
      });
      toast.success("Notificação salva no histórico");
    } catch {
      toast.warning("Não foi possível salvar no histórico, mas gerando PDFs...");
    }
    downloadBothPDFs(formData);
  }

  function novoCaso() {
    setFormData(null);
    setMessages([{ role: "bot", content: "Pronto para uma nova notificação!" }]);
    setClienteVinc(""); setProcessoVinc("");
    setAba("nova");
  }

  async function salvarModelo() {
    if (!modeloNome.trim() || !modeloConteudo.trim()) {
      toast.error("Preencha nome e conteúdo do modelo"); return;
    }
    if (!user) return;
    const { error } = await supabase.from("ferramentas_modelos_notificacao").insert({
      nome: modeloNome.trim(), conteudo: modeloConteudo.trim(), criado_por: user.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Modelo salvo");
    setModeloNome(""); setModeloConteudo(""); setNovoModeloOpen(false);
    carregarModelos();
  }

  async function excluirModelo(id: string) {
    if (!confirm("Excluir este modelo?")) return;
    const { error } = await supabase.from("ferramentas_modelos_notificacao").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); carregarModelos(); }
  }

  function abrirHistorico(item: any) {
    setFormData(item.dados_completos as NotificacaoData);
    setAba("nova");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerador de Notificações Extrajudiciais"
        description="Cobranças extrajudiciais com extração automática por IA e PDFs prontos para protocolo."
      >
        <Button variant="outline" onClick={novoCaso}>+ Novo caso</Button>
      </PageHeader>

      <Tabs value={aba} onValueChange={(v) => setAba(v as any)}>
        <TabsList>
          <TabsTrigger value="nova">Nova notificação</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="modelos">Modelos de texto</TabsTrigger>
        </TabsList>

        {/* ========== NOVA ========== */}
        <TabsContent value="nova" className="mt-4">
          <div className="grid lg:grid-cols-[420px_1fr] gap-4">
            {/* Chat */}
            <Card className="p-4 flex flex-col gap-3 h-[calc(100vh-260px)] min-h-[500px]">
              <div className="grid grid-cols-1 gap-2 pb-3 border-b">
                <div>
                  <Label className="text-xs text-muted-foreground">Cliente (opcional)</Label>
                  <Select value={clienteVinc || "none"} onValueChange={(v) => setClienteVinc(v === "none" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem vínculo</SelectItem>
                      {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {clienteVinc && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Processo (opcional)</Label>
                    <Select value={processoVinc || "none"} onValueChange={(v) => setProcessoVinc(v === "none" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem vínculo</SelectItem>
                        {processos.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.numero_cnj || "(sem CNJ)"}{p.tipo_acao ? ` — ${p.tipo_acao}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      msg.role === "bot" ? "bg-sidebar text-gold" : "bg-gold text-sidebar"
                    }`}>
                      {msg.role === "bot" ? <Bot className="w-3.5 h-3.5" /> : "EU"}
                    </div>
                    <div className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed ${
                      msg.role === "bot"
                        ? "bg-muted rounded-tl-none"
                        : "bg-sidebar text-sidebar-foreground rounded-tr-none"
                    }`}>
                      {msg.content}
                      {msg.fileName && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] opacity-60">
                          <Paperclip className="w-3 h-3" /> {msg.fileName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {enviando && (
                  <div className="flex gap-2">
                    <div className="w-7 h-7 rounded-full bg-sidebar text-gold flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                    <div className="bg-muted rounded-xl rounded-tl-none px-3 py-2 text-xs text-muted-foreground">
                      Analisando com IA...
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {attachment && (
                  <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="w-3 h-3 opacity-60" />
                      <span className="truncate">{attachment.name}</span>
                    </div>
                    <button onClick={() => setAttachment(null)}><X className="w-3 h-3" /></button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Textarea
                    rows={2}
                    placeholder="Descreva o caso ou anexe um documento..."
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnviar(); }
                    }}
                    className="resize-none text-sm"
                  />
                  <Button onClick={handleEnviar} disabled={enviando} size="icon">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleArquivo}
                />
              </div>
            </Card>

            {/* Formulário */}
            <Card className="p-6 overflow-y-auto h-[calc(100vh-260px)] min-h-[500px]">
              {!formData ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-muted-foreground">
                  <FileText className="w-12 h-12 opacity-40" />
                  <p className="text-sm">Os dados extraídos aparecerão aqui para revisão.</p>
                </div>
              ) : (
                <FormularioRevisao
                  data={formData}
                  setData={setFormData}
                  onGerar={handleGerarPDFs}
                />
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ========== HISTÓRICO ========== */}
        <TabsContent value="historico" className="mt-4">
          <Card className="p-4">
            {historico.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação gerada ainda.</p>
            ) : (
              <div className="divide-y">
                {historico.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{h.notificado_nome || "(sem nome)"}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.referencia || "Notificação extrajudicial"} · {new Date(h.criado_em).toLocaleDateString("pt-BR")} ·{" "}
                        {Number(h.total_geral || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadNotificationPDF(h.dados_completos)}>
                        <Download className="w-3 h-3 mr-1" /> Notificação
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => downloadReceiptPDF(h.dados_completos)}>
                        <Download className="w-3 h-3 mr-1" /> Recibo
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => abrirHistorico(h)}>Abrir</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ========== MODELOS ========== */}
        <TabsContent value="modelos" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setNovoModeloOpen((v) => !v)}>
              <Plus className="w-4 h-4 mr-1" /> {novoModeloOpen ? "Cancelar" : "Novo modelo"}
            </Button>
          </div>

          {novoModeloOpen && (
            <Card className="p-4 space-y-3">
              <div>
                <Label>Nome do modelo</Label>
                <Input value={modeloNome} onChange={(e) => setModeloNome(e.target.value)} placeholder="Ex: Cobrança de mensalidades escolares" />
              </div>
              <div>
                <Label>Conteúdo (texto-base que a IA usará como referência)</Label>
                <Textarea
                  rows={10}
                  value={modeloConteudo}
                  onChange={(e) => setModeloConteudo(e.target.value)}
                  placeholder="Cole aqui um modelo de notificação extrajudicial usado pelo escritório..."
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={salvarModelo}>Salvar modelo</Button>
              </div>
            </Card>
          )}

          {modelos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Nenhum modelo cadastrado. Adicione modelos para refinar o estilo da extração da IA.
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {modelos.map((m) => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{m.nome}</p>
                      <p className="text-xs text-muted-foreground">{new Date(m.criado_em).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => excluirModelo(m.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">{m.conteudo}</p>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============= FORMULÁRIO ============================================
function FormularioRevisao({
  data, setData, onGerar,
}: {
  data: NotificacaoData;
  setData: (d: NotificacaoData | ((p: NotificacaoData | null) => NotificacaoData)) => void;
  onGerar: () => void;
}) {
  const upd = (patch: Partial<NotificacaoData>) =>
    setData((prev: any) => ({ ...(prev || data), ...patch }));

  const updateParcela = (i: number, patch: Partial<Parcela>) => {
    const arr = [...data.parcelas];
    const novo = { ...arr[i], ...patch };
    if (patch.valorOriginal !== undefined) {
      const v = Number(patch.valorOriginal) || 0;
      novo.valorAtualizado = v;
      novo.juros = v * MORA_MES;
      novo.total = v + novo.juros;
    }
    arr[i] = novo;
    upd({ parcelas: arr, ...recalcularTotais(arr, data.multa_percentual, data.honorarios_percentual) });
  };

  const removerParcela = (i: number) => {
    const arr = data.parcelas.filter((_, j) => j !== i);
    upd({ parcelas: arr, ...recalcularTotais(arr, data.multa_percentual, data.honorarios_percentual) });
  };

  const adicionarParcela = () => {
    upd({ parcelas: [...data.parcelas, aplicarMora(0)] });
  };

  const setMulta = (n: number) => {
    upd({ multa_percentual: n, ...recalcularTotais(data.parcelas, n, data.honorarios_percentual) });
  };

  const setHon = (n: number) => {
    upd({ honorarios_percentual: n, ...recalcularTotais(data.parcelas, data.multa_percentual, n) });
  };

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const secoes: { titulo: string; campos: { key: keyof NotificacaoData; label: string }[] }[] = [
    { titulo: "Notificante (credor)", campos: [
      { key: "notificante_nome", label: "Nome / Razão Social" },
      { key: "notificante_cnpj", label: "CNPJ / CPF" },
      { key: "notificante_endereco", label: "Endereço" },
    ]},
    { titulo: "Notificado (devedor)", campos: [
      { key: "notificado_nome", label: "Nome completo" },
      { key: "notificado_cpf", label: "CPF" },
      { key: "notificado_rg", label: "RG" },
      { key: "notificado_endereco", label: "Endereço" },
    ]},
    { titulo: "Referência", campos: [{ key: "referencia", label: "Título" }] },
    { titulo: "Dados bancários", campos: [
      { key: "banco_nome", label: "Banco" },
      { key: "banco_codigo", label: "Código" },
      { key: "banco_agencia", label: "Agência" },
      { key: "banco_conta", label: "Conta" },
      { key: "banco_favorecido", label: "Favorecido" },
      { key: "banco_pix", label: "PIX" },
    ]},
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between sticky top-0 bg-card pb-3 z-10">
        <h2 className="text-lg font-display">Revisão</h2>
        <Button onClick={onGerar} className="bg-sidebar text-gold hover:bg-sidebar/90">
          <Download className="w-4 h-4 mr-2" /> Gerar PDFs
        </Button>
      </div>

      {secoes.map((s) => (
        <div key={s.titulo}>
          <p className="text-[10px] font-bold text-gold uppercase tracking-wider mb-2">{s.titulo}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {s.campos.map((c) => (
              <div key={String(c.key)}>
                <Label className="text-xs">{c.label}</Label>
                <Input
                  value={(data as any)[c.key] || ""}
                  onChange={(e) => upd({ [c.key]: e.target.value } as any)}
                  className="h-9 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <p className="text-[10px] font-bold text-gold uppercase tracking-wider mb-2">Texto da notificação</p>
        <Textarea
          rows={8}
          value={data.texto_notificacao}
          onChange={(e) => upd({ texto_notificacao: e.target.value })}
          className="text-xs leading-relaxed"
        />
      </div>

      <div>
        <p className="text-[10px] font-bold text-gold uppercase tracking-wider mb-2">Parcelas</p>
        <div className="space-y-2">
          {data.parcelas.map((p, i) => (
            <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-[10px] text-muted-foreground">Descrição</Label>
                <Input value={p.descricao} onChange={(e) => updateParcela(i, { descricao: e.target.value })} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Vencimento</Label>
                <Input value={p.vencimento} onChange={(e) => updateParcela(i, { vencimento: e.target.value })} placeholder="DD/MM/AAAA" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Valor original</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={p.valorOriginal || ""}
                  onChange={(e) => updateParcela(i, { valorOriginal: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removerParcela(i)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={adicionarParcela}>
            <Plus className="w-3 h-3 mr-1" /> Adicionar parcela
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Multa (%)</Label>
          <Input type="number" step="0.1" value={data.multa_percentual}
            onChange={(e) => setMulta(parseFloat(e.target.value) || 0)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Honorários (%)</Label>
          <Input type="number" step="0.1" value={data.honorarios_percentual}
            onChange={(e) => setHon(parseFloat(e.target.value) || 0)} className="h-9 text-sm" />
        </div>
      </div>

      <div className="bg-sidebar text-sidebar-foreground rounded-xl p-4 space-y-2">
        <p className="text-[10px] font-bold text-gold uppercase tracking-wider">Totais</p>
        <div className="flex justify-between text-xs"><span>Multa ({data.multa_percentual}%)</span><span>{fmt(data.multa_valor)}</span></div>
        <div className="flex justify-between text-xs"><span>Honorários ({data.honorarios_percentual}%)</span><span>{fmt(data.honorarios_valor)}</span></div>
        <div className="border-t border-white/20 pt-2 flex justify-between font-bold text-gold">
          <span>TOTAL GERAL</span><span>{fmt(data.total_geral)}</span>
        </div>
      </div>
    </div>
  );
}
