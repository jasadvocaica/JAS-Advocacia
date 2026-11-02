import { createPortal } from "react-dom";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { ApoioProducao } from "./editor/ApoioProducao";
import {
  normalizarContexto,
  textoDoHtml,
  textoParaHtml,
  pendenciasDocumento,
  bloqueiosRevisao,
} from "./workspace";
import type { ContextoProducao } from "./workspace";
import { cn } from "@/lib/utils";
import { PecaEditor } from "./editor/PecaEditor";
import {
  CATEGORIAS_LABEL,
  DocCategoria,
  DocModelo,
  DocPeca,
  DocPecaStatus,
  PROXIMO_STATUS,
  STATUS_COR,
  STATUS_LABEL,
  DocPecaVersao,
} from "./types";
import {
  buscarContexto,
  extrairVariaveis,
  listarVariaveisPadrao,
  substituirVariaveis,
} from "@/lib/documentos-variaveis";
import { sanitizarHtmlDocumento } from "@/lib/documentos-html-sanitize";
import { exportarDocx, imprimirParaPDF } from "@/lib/documentos-export";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Save,
  FileDown,
  Printer,
  Wand2,
  History,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  Check,
  AlertCircle,
  Loader2,
  RotateCcw,
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
  const categoriaParam = search.get("categoria");
  const categoriaInicial =
    categoriaParam &&
    Object.prototype.hasOwnProperty.call(CATEGORIAS_LABEL, categoriaParam)
      ? (categoriaParam as DocCategoria)
      : null;
  const autoAplicarModelo = search.get("auto") === "1";
  const tarefaIdInicial = search.get("tarefa_id");
  const navigate = useNavigate();
  const { user, hasPermission, isGestor, roles } = useAuth();
  const editando = !!id && id !== "novo";

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [pecaId, setPecaId] = useState<string | null>(editando ? id! : null);

  // Campos
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<DocCategoria>(
    categoriaInicial ?? "peticao_inicial",
  );
  const [clienteId, setClienteId] = useState<string>(clienteIdInicial ?? "");
  const [processoId, setProcessoId] = useState<string>(processoIdInicial ?? "");
  const [conteudoHtml, setConteudoHtml] = useState("<p></p>");
  const [status, setStatus] = useState<DocPecaStatus>("rascunho");
  const [versaoAtual, setVersaoAtual] = useState(1);
  const [fonte, setFonte] = useState("Bookman Old Style");
  const [tamanhoFonte, setTamanhoFonte] = useState(12);
  const [espacamento, setEspacamento] = useState(1.5);

  const [contexto, setContexto] = useState<ContextoProducao>(() =>
    normalizarContexto({ tarefa_id: search.get("tarefa_id") ?? "" }),
  );
  const [telaCheia, setTelaCheia] = useState(false);
  const [apoioAberto, setApoioAberto] = useState(true);
  const [dadosAbertos, setDadosAbertos] = useState(!editando);
  const [comentariosAbertos, setComentariosAbertos] = useState(-1);
  const [selecao, setSelecao] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [salvoFingerprint, setSalvoFingerprint] = useState("");
  const [previewVersao, setPreviewVersao] = useState<DocPecaVersao | null>(
    null,
  );
  const [erroHistorico, setErroHistorico] = useState("");
  const [dataProtocolo, setDataProtocolo] = useState("");
  const [protocoloAberto, setProtocoloAberto] = useState(false);
  const versaoServidor = useRef<string | null>(null);
  const gravandoRef = useRef(false);
  const alteracaoRef = useRef(false);
  const podeAprovar = isGestor || roles.includes("advogado");
  const podeEditar = hasPermission("documentos", pecaId ? "editar" : "criar");
  const readOnly =
    !podeEditar || status === "finalizado" || status === "protocolado";
  const dados = {
    titulo: titulo.trim(),
    categoria,
    cliente_id: clienteId,
    processo_id: processoId || null,
    conteudo_html: conteudoHtml,
    status,
    fonte,
    tamanho_fonte: tamanhoFonte,
    espacamento_entre_linhas: espacamento,
    contexto_producao: contexto,
  };
  const fingerprint = JSON.stringify(dados);
  const sujo = fingerprint !== salvoFingerprint;
  alteracaoRef.current = sujo;
  const pendencias = pendenciasDocumento(conteudoHtml);
  const palavras = textoDoHtml(conteudoHtml)
    .split(/\s+/)
    .filter(Boolean).length;

  // Aux
  const [clientes, setClientes] = useState<ClienteMin[]>([]);
  const [processos, setProcessos] = useState<ProcessoMin[]>([]);
  const [modelos, setModelos] = useState<DocModelo[]>([]);
  const [modeloSelecionado, setModeloSelecionado] = useState<string>("");
  const [aplicandoModelo, setAplicandoModelo] = useState(false);
  const [autoAplicado, setAutoAplicado] = useState(false);
  const [historico, setHistorico] = useState<DocPecaVersao[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [variaveisPendentes, setVariaveisPendentes] = useState<string[]>([]);

  const ultimoSalvo = useRef<string>("");

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
      setContexto(normalizarContexto(p.contexto_producao));
      versaoServidor.current = p.atualizado_em;
      setSalvoEm(p.atualizado_em);
      setSalvoFingerprint(
        JSON.stringify({
          titulo: p.titulo.trim(),
          categoria: p.categoria,
          cliente_id: p.cliente_id,
          processo_id: p.processo_id || null,
          conteudo_html: p.conteudo_html || "<p></p>",
          status: p.status,
          fonte: p.fonte ?? "Bookman Old Style",
          tamanho_fonte: p.tamanho_fonte ?? 12,
          espacamento_entre_linhas: Number(p.espacamento_entre_linhas ?? 1.5),
          contexto_producao: normalizarContexto(p.contexto_producao),
        }),
      );
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
          .select(
            "id, numero_cnj, numero_cnj_limpo, cliente_id, area_direito, tipo_acao",
          )
          .order("criado_em", { ascending: false })
          .limit(2000),
        supabase
          .from("doc_modelos")
          .select("*")
          .eq("ativo", true)
          .order("titulo"),
      ]);
      if (cliRes.error || procRes.error || modRes.error)
        toast({
          title: "Alguns dados de apoio não puderam ser carregados",
          description: "Recarregue a página antes de produzir a peça.",
          variant: "destructive",
        });
      setClientes((cliRes.data ?? []) as ClienteMin[]);
      setProcessos((procRes.data ?? []) as ProcessoMin[]);
      setModelos((modRes.data ?? []) as DocModelo[]);
    })();
  }, []);

  useEffect(() => {
    if (editando || !tarefaIdInicial) return;
    let ativo = true;
    void (async () => {
      const { data: tarefa, error } = await supabase
        .from("controladoria_itens")
        .select(
          "id, titulo, descricao, orientacoes, cliente_id, processo_id, data_vencimento, tipo",
        )
        .eq("id", tarefaIdInicial)
        .maybeSingle();
      if (!ativo) return;
      if (
        error ||
        !tarefa ||
        (clienteIdInicial && tarefa.cliente_id !== clienteIdInicial) ||
        (processoIdInicial && tarefa.processo_id !== processoIdInicial)
      ) {
        toast({
          title: "Não foi possível carregar a tarefa de origem",
          description: "Confira os vínculos antes de salvar.",
          variant: "destructive",
        });
        return;
      }
      if (tarefa.cliente_id) setClienteId(tarefa.cliente_id);
      setProcessoId(tarefa.processo_id ?? "");
      setTitulo((atual) => atual || `Manifestação — ${tarefa.titulo}`);
      const data = /^\d{4}-\d{2}-\d{2}$/.test(tarefa.data_vencimento ?? "")
        ? tarefa.data_vencimento
        : tarefa.data_vencimento
          ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Cuiaba",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(tarefa.data_vencimento))
          : "";
      setContexto((atual) => ({
        ...atual,
        tarefa_id: tarefa.id,
        objetivo: atual.objetivo || tarefa.titulo,
        documentos: atual.documentos || tarefa.descricao || "",
        orientacoes: atual.orientacoes || tarefa.orientacoes || "",
        ...(["prazo_processual", "prazo_fatal"].includes(tarefa.tipo)
          ? { prazo_processual: atual.prazo_processual || data }
          : { prazo_interno: atual.prazo_interno || data }),
        prazo_conferido: false,
      }));
    })();
    return () => {
      ativo = false;
    };
  }, [editando, tarefaIdInicial, clienteIdInicial, processoIdInicial]);

  // Quando muda o cliente, limpa o processo se ele não pertencer ao cliente
  useEffect(() => {
    if (!clienteId) return;
    if (processoId) {
      const p = processos.find((x) => x.id === processoId);
      if (p && p.cliente_id !== clienteId) {
        setProcessoId("");
      }
    }
  }, [clienteId, processos, processoId]);

  // Quando seleciona processo, define cliente automaticamente (caso não esteja definido)
  useEffect(() => {
    if (!processoId) return;
    const p = processos.find((x) => x.id === processoId);
    if (p?.cliente_id && !clienteId) setClienteId(p.cliente_id);
    if (p && !titulo && !editando) {
      setTitulo(
        `${CATEGORIAS_LABEL[categoria]} — ${p.tipo_acao ?? p.numero_cnj ?? ""}`.trim(),
      );
    }
  }, [processoId, processos, clienteId, titulo, editando, categoria]);

  const processosDoCliente = useMemo(
    () =>
      clienteId ? processos.filter((p) => p.cliente_id === clienteId) : [],
    [processos, clienteId],
  );

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
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
        description:
          "Cadastre modelos em Documentos → Modelos para gerar automaticamente.",
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

  // Metadados e contexto também participam do salvamento automático.
  useEffect(() => {
    if (
      !pecaId ||
      carregando ||
      !sujo ||
      readOnly ||
      erroSalvar ||
      !titulo.trim() ||
      !clienteId
    )
      return;
    const timer = setTimeout(() => {
      void salvarRascunho(true);
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, pecaId, carregando, readOnly, erroSalvar]);

  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      if (alteracaoRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const conferirNavegacao = (e: MouseEvent) => {
      if (
        !alteracaoRef.current ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      )
        return;
      const link =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const destino = new URL(link.href, window.location.href);
      if (
        destino.pathname === window.location.pathname &&
        destino.search === window.location.search
      )
        return;
      if (
        !window.confirm("Há alterações não salvas nesta peça. Sair sem salvar?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", avisar);
    document.addEventListener("click", conferirNavegacao, true);
    return () => {
      window.removeEventListener("beforeunload", avisar);
      document.removeEventListener("click", conferirNavegacao, true);
    };
  }, []);

  useEffect(() => {
    if (!telaCheia) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sair = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]'))
        setTelaCheia(false);
    };
    document.addEventListener("keydown", sair);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", sair);
    };
  }, [telaCheia]);

  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) void salvarRascunho();
      }
    };
    document.addEventListener("keydown", atalho);
    return () => document.removeEventListener("keydown", atalho);
  });

  const validar = (): boolean => {
    if (!titulo.trim() || !clienteId) {
      toast({
        title: !titulo.trim()
          ? "Informe o título da peça"
          : "Selecione um cliente",
        variant: "destructive",
      });
      setDadosAbertos(true);
      return false;
    }
    return true;
  };

  const salvarDocumento = async (
    opcoes: {
      novaVersao?: boolean;
      nome?: string;
      html?: string;
      contexto?: ContextoProducao;
      novoStatus?: DocPecaStatus;
      protocolo?: string;
      silencioso?: boolean;
    } = {},
  ): Promise<boolean> => {
    if (gravandoRef.current || !podeEditar || !validar()) return false;
    if (readOnly && !opcoes.novoStatus) return false;
    gravandoRef.current = true;
    setSalvando(true);
    setErroSalvar("");
    const payload = {
      ...dados,
      conteudo_html: opcoes.html ?? conteudoHtml,
      contexto_producao: opcoes.contexto ?? contexto,
      status: opcoes.novoStatus ?? status,
      ...(opcoes.protocolo ? { protocolado_em: opcoes.protocolo } : {}),
    };
    try {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (
            nome: string,
            args: Record<string, unknown>,
          ) => Promise<{
            data: DocPeca | null;
            error: { message: string } | null;
          }>;
        }
      ).rpc("salvar_documento_workspace", {
        p_id: pecaId,
        p_dados: payload,
        p_atualizado_em: versaoServidor.current,
        p_nova_versao: opcoes.novaVersao ?? false,
        p_nome_versao: opcoes.nome ?? null,
      });
      if (error || !data)
        throw new Error(
          error?.message || "O servidor não confirmou o salvamento.",
        );
      const p = data as DocPeca;
      versaoServidor.current = p.atualizado_em;
      setPecaId(p.id);
      setVersaoAtual(p.versao_atual);
      setSalvoEm(p.atualizado_em);
      // Não substitui texto digitado enquanto a requisição estava em andamento.
      if (opcoes.html !== undefined) setConteudoHtml(p.conteudo_html);
      if (opcoes.contexto) setContexto(normalizarContexto(p.contexto_producao));
      setStatus(p.status);
      const { protocolado_em: _protocolo, ...persistidos } = payload;
      setSalvoFingerprint(JSON.stringify({ ...persistidos, status: p.status }));
      ultimoSalvo.current = p.conteudo_html;
      if (!pecaId) navigate(`/documentos/pecas/${p.id}`, { replace: true });
      if (!opcoes.silencioso)
        toast({
          title: opcoes.novaVersao
            ? "Nova versão salva com histórico preservado"
            : "Peça salva",
        });
      return true;
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha ao salvar.";
      setErroSalvar(mensagem);
      toast({
        title: "A peça não foi salva",
        description: mensagem,
        variant: "destructive",
      });
      return false;
    } finally {
      gravandoRef.current = false;
      setSalvando(false);
    }
  };
  const salvarRascunho = (silencioso = false) =>
    salvarDocumento({ silencioso });
  const salvarComoNovaVersao = () =>
    salvarDocumento({ novaVersao: true, nome: "Versão manual" });

  const aplicarSugestao = async (
    texto: string,
    substituir: boolean,
  ): Promise<boolean> => {
    if (readOnly || gravandoRef.current) return false;
    if (
      substituir &&
      !window.confirm(
        "Substituir a minuta pela sugestão? O texto atual será preservado no histórico.",
      )
    )
      return false;
    if (!(await salvarRascunho(true))) return false;
    const html = textoParaHtml(texto);
    return salvarDocumento({
      novaVersao: true,
      nome: substituir ? "Sugestão IA aplicada" : "Sugestão IA adicionada",
      html: substituir ? html : conteudoHtml + html,
      contexto: { ...contexto, checklist: [] },
      novoStatus: "rascunho",
    });
  };

  const aplicarModeloPorId = async (
    modeloId: string,
    opcoes: { confirmar?: boolean } = { confirmar: true },
  ) => {
    if (!modeloId || !clienteId) {
      toast({
        title: "Selecione um cliente e um modelo antes",
        variant: "destructive",
      });
      return;
    }
    if (
      opcoes.confirmar !== false &&
      conteudoHtml &&
      conteudoHtml.replace(/<[^>]*>/g, "").trim().length > 0
    ) {
      const ok = window.confirm(
        "Aplicar o modelo vai substituir o conteúdo atual. Continuar?",
      );
      if (!ok) return;
    }
    setAplicandoModelo(true);
    try {
      const modelo = modelos.find((m) => m.id === modeloId);
      if (!modelo) {
        toast({ title: "Modelo não encontrado", variant: "destructive" });
        return;
      }

      const ctx = await buscarContexto(
        processoId || null,
        clienteId,
        user?.id ?? null,
      );
      const htmlBruto = await substituirVariaveis(modelo.conteudo_html, ctx, {
        destacarPendentes: true,
      });
      const html = sanitizarHtmlDocumento(htmlBruto);
      if (pecaId) {
        if (!(await salvarRascunho(true))) return;
        const ok = await salvarDocumento({
          novaVersao: true,
          nome: "Aplicação de modelo",
          html,
          contexto: { ...contexto, checklist: [] },
          novoStatus: "rascunho",
        });
        if (!ok) return;
      } else {
        setConteudoHtml(html);
      }
      setCategoria(modelo.categoria as DocCategoria);
      if (!titulo) setTitulo(modelo.titulo);
      supabase
        .from("doc_modelos")
        .update({ uso_count: (modelo.uso_count ?? 0) + 1 })
        .eq("id", modelo.id)
        .then(({ error }) => {
          if (error)
            console.warn("[aplicarModelo] erro ao incrementar uso", error);
        });
      toast({
        title: "Modelo aplicado",
        description: "Variáveis substituídas. Confira o conteúdo.",
      });
    } catch (e: unknown) {
      console.error("[aplicarModelo] falhou", e);
      toast({
        title: "Erro ao aplicar modelo",
        description:
          e instanceof Error
            ? e.message
            : "Erro desconhecido ao aplicar o modelo.",
        variant: "destructive",
      });
    } finally {
      setAplicandoModelo(false);
    }
  };

  const aplicarModelo = () => aplicarModeloPorId(modeloSelecionado);

  const avancarStatus = async (protocolo?: string) => {
    if (!pecaId || gravandoRef.current) return;
    const proximo = PROXIMO_STATUS[status];
    if (!proximo) return;
    const bloqueios = bloqueiosRevisao({
      html: conteudoHtml,
      contexto,
      comentariosAbertos,
      proximo,
    });
    if (
      ["revisado", "finalizado", "protocolado"].includes(proximo) &&
      comentariosAbertos < 0
    )
      bloqueios.push("Aguarde a conferência dos comentários de revisão.");
    if (
      ["revisado", "finalizado", "protocolado"].includes(proximo) &&
      !podeAprovar
    )
      bloqueios.push("A aprovação exige advogado ou gestão.");
    if (bloqueios.length) {
      toast({
        title: "Há pendências para esta etapa",
        description: bloqueios.join(" "),
        variant: "destructive",
      });
      return;
    }
    if (proximo === "protocolado" && !protocolo) {
      setProtocoloAberto(true);
      return;
    }
    if (
      await salvarDocumento({
        novoStatus: proximo,
        novaVersao: true,
        nome: STATUS_LABEL[proximo],
        protocolo,
      })
    )
      setProtocoloAberto(false);
  };

  const carregarHistorico = async () => {
    if (!pecaId) return;
    setErroHistorico("");
    const { data, error } = await supabase
      .from("doc_pecas_versoes")
      .select("*")
      .eq("peca_id", pecaId)
      .order("numero_versao", { ascending: false });
    if (error) {
      setErroHistorico("Não foi possível carregar o histórico.");
      return;
    }
    setHistorico((data ?? []) as DocPecaVersao[]);
  };

  const restaurarVersao = async (versao: DocPecaVersao) => {
    if (!(await salvarRascunho(true))) return;
    if (
      await salvarDocumento({
        novaVersao: true,
        nome: `Restauração da versão ${versao.numero_versao}`,
        html: versao.conteudo_html,
        contexto: {
          ...normalizarContexto(versao.contexto_producao),
          checklist: [],
        },
        novoStatus: "rascunho",
      })
    ) {
      setHistoricoAberto(false);
      setPreviewVersao(null);
    }
  };

  const variaveisDisponiveis = useMemo(() => listarVariaveisPadrao(), []);

  const baixarDocx = async () => {
    try {
      await exportarDocx({
        titulo: titulo || "documento",
        htmlConteudo: conteudoHtml,
        fonte,
        tamanhoFonte,
        espacamento,
        margemSuperior: 1701,
        margemInferior: 1134,
        margemEsquerda: 1701,
        margemDireita: 1134,
      });
    } catch (e) {
      toast({
        title: "Não foi possível exportar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const baixarPdf = async () => {
    try {
      await imprimirParaPDF({
        titulo: titulo || "documento",
        htmlConteudo: conteudoHtml,
        fonte,
        tamanhoFonte,
        espacamento,
        margemSuperior: 1701,
        margemInferior: 1134,
        margemEsquerda: 1701,
        margemDireita: 1134,
      });
    } catch (e) {
      toast({
        title: "Não foi possível exportar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  if (carregando)
    return (
      <div className="p-12 text-center text-muted-foreground">
        Carregando...
      </div>
    );

  const proximoStatus = PROXIMO_STATUS[status];

  const workspace = (
    <div
      className={cn(
        "documento-workspace space-y-4",
        telaCheia &&
          "fixed inset-0 z-40 bg-background overflow-y-auto p-3 sm:p-5",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
        <div
          className="flex items-center gap-2 text-sm"
          role="status"
          aria-live="polite"
        >
          {salvando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : erroSalvar ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : !sujo ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          )}
          <span>
            {salvando
              ? "Salvando…"
              : erroSalvar
                ? "Falha no salvamento"
                : sujo
                  ? "Alterações não salvas"
                  : "Todas as alterações salvas"}
          </span>
          {salvoEm && (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {new Date(salvoEm).toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={dadosAbertos}
            onClick={() => setDadosAbertos(!dadosAbertos)}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Dados da peça
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={apoioAberto}
            onClick={() => setApoioAberto(!apoioAberto)}
          >
            {apoioAberto ? (
              <PanelRightClose className="h-4 w-4 mr-2" />
            ) : (
              <PanelRightOpen className="h-4 w-4 mr-2" />
            )}
            Apoio
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTelaCheia(!telaCheia)}
          >
            {telaCheia ? (
              <Minimize2 className="h-4 w-4 mr-2" />
            ) : (
              <Maximize2 className="h-4 w-4 mr-2" />
            )}
            {telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          </Button>
        </div>
      </div>
      {erroSalvar && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          {erroSalvar}
          <p className="mt-1 text-muted-foreground">
            O texto permanece no editor. Você pode exportar em Word antes de
            recarregar.
          </p>
        </div>
      )}

      <PageHeader
        title={editando ? titulo || "Editar peça" : "Nova peça"}
        description={`${clienteSelecionado?.nome ?? "Selecione um cliente"} · ${STATUS_LABEL[status]}`}
      >
        <Button
          variant="outline"
          onClick={() => {
            if (
              !sujo ||
              window.confirm("Há alterações não salvas. Sair sem salvar?")
            )
              navigate("/documentos");
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        {pecaId && (
          <Dialog
            open={historicoAberto}
            onOpenChange={(o) => {
              setHistoricoAberto(o);
              if (o) {
                setPreviewVersao(null);
                carregarHistorico();
              }
            }}
          >
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
                <DialogDescription>
                  Visualize antes de restaurar. A restauração cria uma nova
                  versão e preserva a minuta atual.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[400px] overflow-auto space-y-2">
                {erroHistorico && (
                  <p role="alert" className="text-destructive text-sm">
                    {erroHistorico}
                  </p>
                )}
                {historico.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma versão histórica.
                  </p>
                ) : (
                  historico.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between border rounded-md p-3"
                    >
                      <div>
                        <div className="font-medium text-sm">
                          Versão {v.numero_versao}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(v.salvo_em).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPreviewVersao(v)}
                      >
                        Visualizar
                      </Button>
                    </div>
                  ))
                )}
              </div>
              {previewVersao && (
                <div className="border-t pt-3 space-y-3">
                  <p className="text-sm font-medium">
                    Versão {previewVersao.numero_versao} —{" "}
                    {previewVersao.nome_versao}
                  </p>
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-sm bg-muted p-3 rounded-lg font-sans">
                    {textoDoHtml(previewVersao.conteudo_html)}
                  </pre>
                  <Button
                    disabled={readOnly || salvando}
                    onClick={() => restaurarVersao(previewVersao)}
                  >
                    Restaurar como nova versão
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
        <Button variant="outline" onClick={baixarPdf}>
          <Printer className="w-4 h-4 mr-2" /> PDF
        </Button>
        <Button variant="outline" onClick={baixarDocx}>
          <FileDown className="w-4 h-4 mr-2" /> DOCX
        </Button>
        <Button
          variant="outline"
          onClick={salvarComoNovaVersao}
          disabled={salvando || readOnly || !pecaId || aplicandoModelo}
        >
          Nova versão
        </Button>
        <Button
          onClick={() => salvarRascunho()}
          disabled={salvando || readOnly || aplicandoModelo}
        >
          <Save className="w-4 h-4 mr-2" />{" "}
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </PageHeader>

      <Dialog open={protocoloAberto} onOpenChange={setProtocoloAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar protocolo realizado</DialogTitle>
            <DialogDescription>
              Esta ação apenas registra um protocolo já realizado. Não envia a
              peça ao tribunal.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="data-protocolo">Data efetiva do protocolo</Label>
          <Input
            id="data-protocolo"
            type="date"
            value={dataProtocolo}
            onChange={(e) => setDataProtocolo(e.target.value)}
          />
          <DialogFooter>
            <Button
              disabled={!dataProtocolo || salvando}
              onClick={() => avancarStatus(dataProtocolo)}
            >
              Confirmar registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_COR[status]} variant="outline">
          {STATUS_LABEL[status]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {palavras} palavras · {pendencias.length} campos pendentes
        </span>
        {proximoStatus &&
          pecaId &&
          podeEditar &&
          (status === "rascunho" || podeAprovar) && (
            <Button
              size="sm"
              variant="outline"
              disabled={salvando}
              onClick={() => avancarStatus()}
            >
              <ChevronRight className="h-4 w-4 mr-1" />
              {STATUS_LABEL[proximoStatus]}
            </Button>
          )}
        {pecaId &&
          podeEditar &&
          status !== "rascunho" &&
          status !== "protocolado" &&
          (status !== "finalizado" || podeAprovar) && (
            <Button
              size="sm"
              variant="ghost"
              disabled={salvando}
              onClick={() =>
                salvarDocumento({
                  novoStatus: "rascunho",
                  novaVersao: true,
                  nome: "Reabertura para edição",
                  contexto: { ...contexto, checklist: [] },
                })
              }
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Devolver para ajustes
            </Button>
          )}
      </div>
      {readOnly && (
        <p className="text-sm text-muted-foreground">
          {status === "protocolado"
            ? "Documento protocolado: edição bloqueada para preservar o registro."
            : status === "finalizado"
              ? "Documento finalizado. Reabra para ajustes antes de editar."
              : "Você tem acesso de leitura a este documento."}
        </p>
      )}
      {dadosAbertos && (
        <fieldset disabled={readOnly || salvando || aplicandoModelo}>
          <Card className="p-5 grid gap-4 grid-cols-1 md:grid-cols-12">
            <div className="md:col-span-6">
              <Label>Título *</Label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Petição inicial — aposentadoria especial"
              />
            </div>
            <div className="md:col-span-3">
              <Label>Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as DocCategoria)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIAS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-10">
                <Badge className={STATUS_COR[status]} variant="outline">
                  {STATUS_LABEL[status]}
                </Badge>
              </div>
            </div>

            <div className="md:col-span-6">
              <Label>Cliente *</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      clientes.length ? "Selecione um cliente" : "Carregando..."
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                      {c.cpf_cnpj ? ` — ${c.cpf_cnpj}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-6">
              <Label>Processo (opcional)</Label>
              <Select
                value={processoId || "__nenhum__"}
                onValueChange={(v) =>
                  setProcessoId(v === "__nenhum__" ? "" : v)
                }
                disabled={!clienteId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !clienteId
                        ? "Selecione um cliente primeiro"
                        : processosDoCliente.length
                          ? "Selecione um processo (opcional)"
                          : "Cliente sem processos cadastrados"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">
                    — Sem processo vinculado —
                  </SelectItem>
                  {processosDoCliente.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.numero_cnj || p.numero_cnj_limpo || "(sem CNJ)"}{" "}
                      {p.tipo_acao ? `— ${p.tipo_acao}` : ""}
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

            <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-3">
              <div>
                <Label htmlFor="fonte-padrao">Fonte padrão</Label>
                <Select value={fonte} onValueChange={setFonte}>
                  <SelectTrigger id="fonte-padrao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Bookman Old Style",
                      "Times New Roman",
                      "Arial",
                      "Calibri",
                      "Georgia",
                    ].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tamanho-padrao">Tamanho padrão</Label>
                <Select
                  value={String(tamanhoFonte)}
                  onValueChange={(v) => setTamanhoFonte(Number(v))}
                >
                  <SelectTrigger id="tamanho-padrao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 11, 12, 13, 14, 16].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} pt
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="espacamento-padrao">Espaçamento</Label>
                <Select
                  value={String(espacamento)}
                  onValueChange={(v) => setEspacamento(Number(v))}
                >
                  <SelectTrigger id="espacamento-padrao">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 1.5, 2].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="md:col-span-12 flex flex-col md:flex-row gap-2 items-end pt-2 border-t">
              <div className="flex-1">
                <Label>Aplicar modelo</Label>
                <Select
                  value={modeloSelecionado}
                  onValueChange={setModeloSelecionado}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        modelos.length
                          ? "Escolha um modelo"
                          : "Nenhum modelo cadastrado"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.titulo}{" "}
                        <span className="text-muted-foreground">
                          — {CATEGORIAS_LABEL[m.categoria as DocCategoria]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={aplicarModelo}
                disabled={!modeloSelecionado || aplicandoModelo}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                {aplicandoModelo
                  ? "Aplicando..."
                  : "Aplicar e substituir variáveis"}
              </Button>
            </div>

            {variaveisPendentes.length > 0 && (
              <div className="md:col-span-12 text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-md px-3 py-2">
                <strong>Variáveis pendentes:</strong>{" "}
                {variaveisPendentes.join(", ")}
                {variaveisPendentes.some(
                  (v) => !variaveisDisponiveis.includes(v),
                ) && (
                  <div className="mt-1 text-muted-foreground">
                    Variáveis não reconhecidas serão mantidas como texto na
                    exportação.
                  </div>
                )}
              </div>
            )}
          </Card>
        </fieldset>
      )}

      <div
        className={cn(
          "grid gap-4 items-start",
          apoioAberto && "xl:grid-cols-[minmax(0,1fr)_minmax(320px,390px)]",
        )}
      >
        <div className="min-w-0">
          <PecaEditor
            value={conteudoHtml}
            readOnly={readOnly || salvando || aplicandoModelo}
            onSelectionChange={setSelecao}
            onChange={(html) => {
              setConteudoHtml(html);
              setContexto((c) => ({ ...c, checklist: [] }));
            }}
            fonte={fonte}
            tamanhoFonte={tamanhoFonte}
            espacamento={espacamento}
            placeholder="Escolha um modelo para começar ou escreva do zero. Use {{variaveis}} para campos dinâmicos."
          />
        </div>
        <div
          className={cn(
            "min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] overflow-y-auto",
            !apoioAberto && "hidden",
          )}
        >
          <ApoioProducao
            pecaId={pecaId}
            clienteId={clienteId}
            processoId={processoId}
            titulo={titulo}
            html={conteudoHtml}
            contexto={contexto}
            onContexto={(novo) => {
              const materiais = (c: ContextoProducao) => [
                c.objetivo,
                c.intimacao,
                c.documentos,
                c.orientacoes,
                c.tarefa_id,
                c.prazo_interno,
                c.prazo_processual,
                c.fontes,
                c.pesquisa_legislacao,
                c.norma_pesquisa,
              ];
              setContexto(
                JSON.stringify(materiais(novo)) ===
                  JSON.stringify(materiais(contexto))
                  ? novo
                  : { ...novo, checklist: [] },
              );
            }}
            onAplicar={aplicarSugestao}
            onComentarios={setComentariosAbertos}
            selecao={selecao}
            readOnly={readOnly || salvando || aplicandoModelo}
            ocupado={salvando || aplicandoModelo}
          />
        </div>
      </div>
    </div>
  );
  return telaCheia ? createPortal(workspace, document.body) : workspace;
}
