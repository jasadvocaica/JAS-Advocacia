import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { PecaEditor } from "./editor/PecaEditor";
import {
  CATEGORIAS_LABEL, DocCategoria, DocModelo, DocPeca, DocPecaStatus, PROXIMO_STATUS,
  STATUS_COR, STATUS_LABEL,
} from "./types";
import {
  buscarContexto, extrairVariaveis, listarVariaveisPadrao, substituirVariaveis,
} from "@/lib/documentos-variaveis";
import { sanitizarHtmlDocumento } from "@/lib/documentos-html-sanitize";
import { exportarDocx, imprimirParaPDF } from "@/lib/documentos-export";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Save, FileDown, Printer, Wand2, History, ChevronRight,
} from "lucide-react";

interface ProcessoMin {
  id: string;
  numero_cnj: string | null;
  numero_cnj_limpo: string | null;
  cliente_id: string | null;
  area_direito: string | null;
  tipo_acao: string | null;
}
interface ClienteMin {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

export default function PecaForm() {
  const { id } = useParams<{ id?: string }>();
  const [search] = useSearchParams();
  const processoIdInicial = search.get("processo_id");
  const clienteIdInicial = search.get("cliente_id");
  const categoriaInicial = search.get("categoria") as DocCategoria | null;
  const autoAplicarModelo = search.get("auto") === "1";
  const navigate = useNavigate();
  const { user } = useAuth();
  const editando = !!id && id !== "novo";

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [pecaId, setPecaId] = useState<string | null>(editando ? id! : null);

  // Campos
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<DocCategoria>(categoriaInicial ?? "peticao_inicial");
  const [clienteId, setClienteId] = useState<string>(clienteIdInicial ?? "");
  const [processoId, setProcessoId] = useState<string>(processoIdInicial ?? "");
  const [conteudoHtml, setConteudoHtml] = useState("<p></p>");
  const [status, setStatus] = useState<DocPecaStatus>("rascunho");
  const [versaoAtual, setVersaoAtual] = useState(1);
  const [fonte, setFonte] = useState("Bookman Old Style");
  const [tamanhoFonte, setTamanhoFonte] = useState(12);
  const [espacamento, setEspacamento] = useState(1.5);

  // Aux
  const [clientes, setClientes] = useState<ClienteMin[]>([]);
  const [processos, setProcessos] = useState<ProcessoMin[]>([]);
  const [modelos, setModelos] = useState<DocModelo[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("");
  const [aplicandoModelo, setAplicandoModelo] = useState(false);
  const [autoAplicado, setAutoAplicado] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [variaveisPendentes, setVariaveisPendentes] = useState<string[]>([]);

  const ultimoSalvo = useRef<string>("");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carregar peça
  useEffect(() => {
    if (!editando) {
      setCarregando(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("doc_pecas")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error || !data) {
        toast({ title: "Peça não encontrada", variant: "destructive" });
        navigate("/documentos");
        return;
      }
      const p = data as DocPeca;
      setTitulo(p.titulo);
      setCategoria(p.categoria as DocCategoria);
      setProcessoId(p.processo_id);
      setClienteId(p.cliente_id);
      setConteudoHtml(p.conteudo_html || "<p></p>");
      setStatus(p.status as DocPecaStatus);
      setVersaoAtual(p.versao_atual);
      setFonte(p.fonte ?? "Bookman Old Style");
      setTamanhoFonte(p.tamanho_fonte ?? 12);
      setEspacamento(Number(p.espacamento_entre_linhas ?? 1.5));
      ultimoSalvo.current = p.conteudo_html;
      setCarregando(false);
    })();
  }, [editando, id, navigate]);

  // Carregar clientes, processos e modelos
  useEffect(() => {
    (async () => {
      const [cliRes, procRes, modRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nome, cpf_cnpj")
          .eq("ativo", true)
          .order("nome")
          .limit(2000),
        supabase
          .from("processos")
          .select("id, numero_cnj, numero_cnj_limpo, cliente_id, area_direito, tipo_acao")
          .order("criado_em", { ascending: false })
          .limit(2000),
        supabase.from("doc_modelos").select("*").eq("ativo", true).order("titulo"),
      ]);
      setClientes((cliRes.data ?? []) as ClienteMin[]);
      setProcessos((procRes.data ?? []) as ProcessoMin[]);
      setModelos((modRes.data ?? []) as DocModelo[]);
    })();
  }, []);

  // Quando muda o cliente, limpa o processo se ele não pertencer ao cliente
  useEffect(() => {
    if (!clienteId) return;
    if (processoId) {
      const p = processos.find((x) => x.id === processoId);
      if (p && p.cliente_id !== clienteId) {
        setProcessoId("");
      }
    }
  }, [clienteId, processos]);

  // Quando seleciona processo, define cliente automaticamente (caso não esteja definido)
  useEffect(() => {
    if (!processoId) return;
    const p = processos.find((x) => x.id === processoId);
    if (p?.cliente_id && !clienteId) setClienteId(p.cliente_id);
    if (p && !titulo && !editando) {
      setTitulo(`${CATEGORIAS_LABEL[categoria]} — ${p.tipo_acao ?? p.numero_cnj ?? ""}`.trim());
    }
  }, [processoId, processos]);

  const processosDoCliente = useMemo(
    () => (clienteId ? processos.filter((p) => p.cliente_id === clienteId) : []),
    [processos, clienteId]
  );

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId]
  );

  // Atualiza variáveis pendentes
  useEffect(() => {
    setVariaveisPendentes(extrairVariaveis(conteudoHtml));
  }, [conteudoHtml]);

  // Auto-aplicar modelo quando vier de "Gerar procuração/contrato" no cliente.
  // Pré-condições: parâmetros ?categoria=...&auto=1, modelos carregados,
  // cliente selecionado e ainda não aplicado nesta sessão.
  useEffect(() => {
    if (!autoAplicarModelo || autoAplicado) return;
    if (!categoriaInicial || !clienteId || modelos.length === 0) return;
    const candidato = modelos.find((m) => m.categoria === categoriaInicial);
    if (!candidato) {
      toast({
        title: `Nenhum modelo de ${CATEGORIAS_LABEL[categoriaInicial]} cadastrado`,
        description: "Cadastre modelos em Documentos → Modelos para gerar automaticamente.",
        variant: "destructive",
      });
      setAutoAplicado(true);
      return;
    }
    setModeloSelecionado(candidato.id);
    setAutoAplicado(true);
    // Aplica no próximo tick — `aplicarModelo` lê `modeloSelecionado` do estado.
    setTimeout(() => {
      // Chama um aplicador inline para usar o ID que acabamos de escolher
      aplicarModeloPorId(candidato.id, { confirmar: false });
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAplicarModelo, autoAplicado, categoriaInicial, clienteId, modelos]);

  // Autosave (3s após parar de digitar)
  useEffect(() => {
    if (!editando || !pecaId) return;
    if (conteudoHtml === ultimoSalvo.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      salvarRascunho(true);
    }, 3000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteudoHtml, pecaId]);

  const validar = (): boolean => {
    if (!titulo.trim()) {
      toast({ title: "Informe o título da peça", variant: "destructive" });
      return false;
    }
    if (!clienteId) {
      toast({ title: "Selecione um cliente", variant: "destructive" });
      return false;
    }
    return true;
  };

  const salvarRascunho = async (silencioso = false) => {
    if (!validar()) return;
    setSalvando(true);
    const payload = {
      titulo: titulo.trim(),
      categoria,
      processo_id: processoId || null,
      cliente_id: clienteId,
      conteudo_html: conteudoHtml,
      status,
      fonte,
      tamanho_fonte: tamanhoFonte,
      espacamento_entre_linhas: espacamento,
    };

    if (pecaId) {
      const { error } = await supabase.from("doc_pecas").update(payload).eq("id", pecaId);
      setSalvando(false);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        return;
      }
      ultimoSalvo.current = conteudoHtml;
      if (!silencioso) toast({ title: "Peça salva" });
    } else {
      const { data, error } = await supabase
        .from("doc_pecas")
        .insert({ ...payload, elaborado_por: user?.id })
        .select("id, versao_atual")
        .maybeSingle();
      setSalvando(false);
      if (error || !data) {
        toast({ title: "Erro ao criar peça", description: error?.message, variant: "destructive" });
        return;
      }
      setPecaId(data.id);
      setVersaoAtual(data.versao_atual);
      ultimoSalvo.current = conteudoHtml;
      navigate(`/documentos/pecas/${data.id}`, { replace: true });
      if (!silencioso) toast({ title: "Peça criada" });
    }
  };

  const salvarComoNovaVersao = async () => {
    if (!pecaId) {
      await salvarRascunho();
      return;
    }
    if (!validar()) return;
    setSalvando(true);
    const proximaVersao = versaoAtual + 1;
    const { error: errVer } = await supabase.from("doc_pecas_versoes").insert({
      peca_id: pecaId,
      numero_versao: proximaVersao,
      conteudo_html: conteudoHtml,
      salvo_por: user?.id,
    });
    if (errVer) {
      setSalvando(false);
      toast({ title: "Erro ao salvar versão", description: errVer.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("doc_pecas")
      .update({
        titulo: titulo.trim(),
        conteudo_html: conteudoHtml,
        versao_atual: proximaVersao,
      })
      .eq("id", pecaId);
    setSalvando(false);
    if (error) {
      toast({ title: "Erro ao atualizar peça", description: error.message, variant: "destructive" });
      return;
    }
    setVersaoAtual(proximaVersao);
    ultimoSalvo.current = conteudoHtml;
    toast({ title: `Versão ${proximaVersao} salva` });
  };

  const aplicarModeloPorId = async (modeloId: string, opcoes: { confirmar?: boolean } = { confirmar: true }) => {
    if (!modeloId || !clienteId) {
      toast({ title: "Selecione um cliente e um modelo antes", variant: "destructive" });
      return;
    }
    if (
      opcoes.confirmar !== false &&
      conteudoHtml &&
      conteudoHtml.replace(/<[^>]*>/g, "").trim().length > 0
    ) {
      const ok = window.confirm("Aplicar o modelo vai substituir o conteúdo atual. Continuar?");
      if (!ok) return;
    }
    setAplicandoModelo(true);
    try {
      const modelo = modelos.find((m) => m.id === modeloId);
      if (!modelo) {
        toast({ title: "Modelo não encontrado", variant: "destructive" });
        return;
      }
      console.log("[aplicarModelo] iniciando", { modeloId: modelo.id, clienteId, processoId, tamanho: modelo.conteudo_html?.length });
      const ctx = await buscarContexto(processoId || null, clienteId, user?.id ?? null);
      console.log("[aplicarModelo] contexto carregado", { temCliente: !!ctx.cliente, temProcesso: !!ctx.processo });
      const htmlBruto = await substituirVariaveis(modelo.conteudo_html, ctx, { destacarPendentes: true });
      console.log("[aplicarModelo] variáveis substituídas", { tamanho: htmlBruto.length });
      const html = sanitizarHtmlDocumento(htmlBruto);
      console.log("[aplicarModelo] sanitizado", { tamanho: html.length, preview: html.slice(0, 200) });
      setConteudoHtml(html);
      setCategoria(modelo.categoria as DocCategoria);
      if (!titulo) setTitulo(modelo.titulo);
      supabase
        .from("doc_modelos")
        .update({ uso_count: (modelo.uso_count ?? 0) + 1 })
        .eq("id", modelo.id)
        .then(({ error }) => { if (error) console.warn("[aplicarModelo] erro ao incrementar uso", error); });
      toast({ title: "Modelo aplicado", description: "Variáveis substituídas. Confira o conteúdo." });
    } catch (e: any) {
      console.error("[aplicarModelo] falhou", e);
      toast({
        title: "Erro ao aplicar modelo",
        description: e?.message ?? "Erro desconhecido. Veja o console.",
        variant: "destructive",
      });
    } finally {
      setAplicandoModelo(false);
    }
  };

  const aplicarModelo = () => aplicarModeloPorId(modeloSelecionado);

  const avancarStatus = async () => {
    if (!pecaId) return;
    const proximo = PROXIMO_STATUS[status];
    if (!proximo) return;
    const updates: any = { status: proximo };
    if (proximo === "finalizado") {
      updates.finalizado_por = user?.id;
      updates.finalizado_em = new Date().toISOString();
    }
    if (proximo === "protocolado") {
      updates.protocolado_em = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("doc_pecas").update(updates).eq("id", pecaId);
    if (error) {
      toast({ title: "Erro ao mudar status", description: error.message, variant: "destructive" });
      return;
    }
    setStatus(proximo);
    toast({ title: `Status atualizado: ${STATUS_LABEL[proximo]}` });
  };

  const carregarHistorico = async () => {
    if (!pecaId) return;
    const { data } = await supabase
      .from("doc_pecas_versoes")
      .select("*")
      .eq("peca_id", pecaId)
      .order("numero_versao", { ascending: false });
    setHistorico(data ?? []);
  };

  const restaurarVersao = async (htmlVersao: string) => {
    setConteudoHtml(htmlVersao);
    setHistoricoAberto(false);
    toast({ title: "Versão carregada — salve como nova versão para confirmar" });
  };

  const variaveisDisponiveis = useMemo(() => listarVariaveisPadrao(), []);

  const baixarDocx = async () => {
    await exportarDocx({
      titulo: titulo || "documento",
      htmlConteudo: conteudoHtml,
      fonte,
      tamanhoFonte,
      espacamento,
    });
  };

  const baixarPdf = async () => {
    await imprimirParaPDF({
      titulo: titulo || "documento",
      htmlConteudo: conteudoHtml,
      fonte,
      tamanhoFonte,
      espacamento,
    });
  };

  if (carregando) return <div className="p-12 text-center text-muted-foreground">Carregando...</div>;

  const proximoStatus = PROXIMO_STATUS[status];

  return (
    <div className="space-y-6">
      <PageHeader title={editando ? titulo || "Editar peça" : "Nova peça"}>
        <Button variant="outline" onClick={() => navigate("/documentos")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        {pecaId && (
          <Dialog open={historicoAberto} onOpenChange={(o) => { setHistoricoAberto(o); if (o) carregarHistorico(); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <History className="w-4 h-4 mr-2" /> v{versaoAtual}
              </Button>
            </DialogTrigger>
            <DialogContent
              className="max-w-2xl"
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle>Histórico de versões</DialogTitle>
                <DialogDescription>Restaure uma versão anterior para visualizar; salve como nova versão para confirmar.</DialogDescription>
              </DialogHeader>
              <div className="max-h-[400px] overflow-auto space-y-2">
                {historico.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma versão histórica.</p>
                ) : historico.map((v) => (
                  <div key={v.id} className="flex items-center justify-between border rounded-md p-3">
                    <div>
                      <div className="font-medium text-sm">Versão {v.numero_versao}</div>
                      <div className="text-xs text-muted-foreground">{new Date(v.salvo_em).toLocaleString("pt-BR")}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => restaurarVersao(v.conteudo_html)}>Carregar</Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
        <Button variant="outline" onClick={baixarPdf}>
          <Printer className="w-4 h-4 mr-2" /> PDF
        </Button>
        <Button variant="outline" onClick={baixarDocx}>
          <FileDown className="w-4 h-4 mr-2" /> DOCX
        </Button>
        <Button variant="outline" onClick={salvarComoNovaVersao} disabled={salvando || !pecaId}>
          Nova versão
        </Button>
        <Button onClick={() => salvarRascunho()} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" /> {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </PageHeader>

      <Card className="p-5 grid gap-4 grid-cols-1 md:grid-cols-12">
        <div className="md:col-span-6">
          <Label>Título *</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Petição inicial — aposentadoria especial" />
        </div>
        <div className="md:col-span-3">
          <Label>Categoria</Label>
          <Select value={categoria} onValueChange={(v) => setCategoria(v as DocCategoria)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIAS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Label>Status</Label>
          <div className="flex items-center gap-2 h-10">
            <Badge className={STATUS_COR[status]} variant="outline">{STATUS_LABEL[status]}</Badge>
            {proximoStatus && pecaId && (
              <Button size="sm" variant="ghost" onClick={avancarStatus}>
                <ChevronRight className="w-4 h-4 mr-1" /> {STATUS_LABEL[proximoStatus]}
              </Button>
            )}
          </div>
        </div>

        <div className="md:col-span-6">
          <Label>Cliente *</Label>
          <Select value={clienteId} onValueChange={setClienteId}>
            <SelectTrigger>
              <SelectValue placeholder={clientes.length ? "Selecione um cliente" : "Carregando..."} />
            </SelectTrigger>
            <SelectContent className="max-h-[320px]">
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}{c.cpf_cnpj ? ` — ${c.cpf_cnpj}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-6">
          <Label>Processo (opcional)</Label>
          <Select
            value={processoId || "__nenhum__"}
            onValueChange={(v) => setProcessoId(v === "__nenhum__" ? "" : v)}
            disabled={!clienteId}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !clienteId
                  ? "Selecione um cliente primeiro"
                  : processosDoCliente.length
                    ? "Selecione um processo (opcional)"
                    : "Cliente sem processos cadastrados"
              } />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__nenhum__">— Sem processo vinculado —</SelectItem>
              {processosDoCliente.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.numero_cnj || p.numero_cnj_limpo || "(sem CNJ)"} {p.tipo_acao ? `— ${p.tipo_acao}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clienteSelecionado && processosDoCliente.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Nenhum processo cadastrado para este cliente.
            </p>
          )}
        </div>

        <div className="md:col-span-12 flex flex-col md:flex-row gap-2 items-end pt-2 border-t">
          <div className="flex-1">
            <Label>Aplicar modelo</Label>
            <Select value={modeloSelecionado} onValueChange={setModeloSelecionado}>
              <SelectTrigger>
                <SelectValue placeholder={modelos.length ? "Escolha um modelo" : "Nenhum modelo cadastrado"} />
              </SelectTrigger>
              <SelectContent>
                {modelos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.titulo} <span className="text-muted-foreground">— {CATEGORIAS_LABEL[m.categoria as DocCategoria]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={aplicarModelo} disabled={!modeloSelecionado || aplicandoModelo}>
            <Wand2 className="w-4 h-4 mr-2" />
            {aplicandoModelo ? "Aplicando..." : "Aplicar e substituir variáveis"}
          </Button>
        </div>

        {variaveisPendentes.length > 0 && (
          <div className="md:col-span-12 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md px-3 py-2">
            <strong>Variáveis pendentes:</strong> {variaveisPendentes.join(", ")}
            {variaveisPendentes.some((v) => !variaveisDisponiveis.includes(v)) && (
              <div className="mt-1 text-muted-foreground">
                Variáveis não reconhecidas serão mantidas como texto na exportação.
              </div>
            )}
          </div>
        )}
      </Card>

      <PecaEditor
        value={conteudoHtml}
        onChange={setConteudoHtml}
        fonte={fonte}
        tamanhoFonte={tamanhoFonte}
        espacamento={espacamento}
        placeholder="Escolha um modelo para começar ou escreva do zero. Use {{variaveis}} para campos dinâmicos."
      />
    </div>
  );
}
