import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import {
  Bot,
  CheckCheck,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BibliotecaJuridica, FonteLegalCard } from "./BibliotecaJuridica";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { DocComentario } from "../types";
import {
  CHECKLIST_REVISAO,
  ContextoProducao,
  textoDoHtml,
  urlFonteSegura,
} from "../workspace";

interface Props {
  pecaId: string | null;
  clienteId: string;
  processoId: string;
  titulo: string;
  html: string;
  contexto: ContextoProducao;
  onContexto: (contexto: ContextoProducao) => void;
  onAplicar: (texto: string, substituir: boolean) => Promise<boolean>;
  onComentarios: (quantidade: number) => void;
  readOnly: boolean;
  ocupado: boolean;
  selecao: string;
}

export function ApoioProducao(props: Props) {
  const { user, isGestor } = useAuth();
  const { contexto, onContexto, readOnly } = props;
  const [aba, setAba] = useState("contexto");
  const [acao, setAcao] = useState("minuta");
  const [instrucao, setInstrucao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [comentarios, setComentarios] = useState<DocComentario[]>([]);
  const [comentario, setComentario] = useState("");
  const [carregandoComentarios, setCarregandoComentarios] = useState(false);
  const [erroComentarios, setErroComentarios] = useState("");
  const [salvandoComentario, setSalvandoComentario] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [tarefas, setTarefas] = useState<
    { id: string; titulo: string; processo_id: string | null }[]
  >([]);
  const [erroTarefas, setErroTarefas] = useState(false);
  const provedor = "openai" as const;
  const [provedores, setProvedores] = useState<{
    openai: boolean;
    anthropic: boolean;
  } | null>(null);
  const provedorIndisponivel = provedores?.[provedor] === false;
  const pedido = useRef(0);
  const contextoAtual = useRef(contexto);
  contextoAtual.current = contexto;
  const assinaturaContexto = JSON.stringify({
    peca: props.pecaId,
    cliente: props.clienteId,
    processo: props.processoId,
    html: props.html,
    contexto: { ...contexto, ultima_ia: undefined },
  });
  const assinaturaAtual = useRef(assinaturaContexto);
  assinaturaAtual.current = assinaturaContexto;
  useEffect(
    () => () => {
      pedido.current += 1;
    },
    [],
  );

  useEffect(() => {
    let ativo = true;
    setTarefas([]);
    setErroTarefas(false);
    if (!props.clienteId) return;
    void supabase
      .from("controladoria_itens")
      .select("id, titulo, processo_id")
      .eq("cliente_id", props.clienteId)
      .order("data_vencimento", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!ativo) return;
        setErroTarefas(!!error);
        setTarefas(
          (data ?? []).filter(
            (t) => !t.processo_id || t.processo_id === props.processoId,
          ),
        );
      });
    return () => {
      ativo = false;
    };
  }, [props.clienteId, props.processoId]);

  const atualizar = (campo: keyof ContextoProducao, valor: unknown) =>
    onContexto({ ...contexto, [campo]: valor });

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "documentos-assistente",
          { method: "GET" },
        );
        const saude =
          data ??
          (error?.context instanceof Response
            ? await error.context.json().catch(() => null)
            : null);
        if (
          ativo &&
          typeof saude?.provedores?.openai === "boolean" &&
          typeof saude?.provedores?.anthropic === "boolean"
        )
          setProvedores(saude.provedores);
      } catch {
        /* A consulta normal apresenta o erro específico se a sonda falhar. */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function carregarComentarios() {
    if (!props.pecaId) {
      setComentarios([]);
      props.onComentarios(0);
      return;
    }
    setCarregandoComentarios(true);
    setErroComentarios("");
    const { data, error } = await supabase
      .from("doc_comentarios")
      .select("*")
      .eq("peca_id", props.pecaId)
      .order("criado_em", { ascending: false });
    setCarregandoComentarios(false);
    if (error) {
      setErroComentarios(
        "Não foi possível carregar os comentários. Tente novamente.",
      );
      props.onComentarios(-1);
      return;
    }
    const itens = (data ?? []) as DocComentario[];
    setComentarios(itens);
    props.onComentarios(itens.filter((c) => !c.resolvido).length);
  }
  useEffect(() => {
    void carregarComentarios();
  }, [props.pecaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function comentar() {
    if (!props.pecaId || !comentario.trim() || !user || salvandoComentario)
      return;
    setSalvandoComentario(true);
    const { error } = await supabase.from("doc_comentarios").insert({
      peca_id: props.pecaId,
      comentario: comentario.trim(),
      trecho_texto: props.selecao || null,
      autor_id: user.id,
    });
    setSalvandoComentario(false);
    if (error) {
      toast({
        title: "Não foi possível salvar o comentário",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setComentario("");
    await carregarComentarios();
  }

  async function resolver(c: DocComentario) {
    const { data, error } = await supabase
      .from("doc_comentarios")
      .update({
        resolvido: !c.resolvido,
        resolvido_em: c.resolvido ? null : new Date().toISOString(),
        resolvido_por: c.resolvido ? null : user?.id,
      })
      .eq("id", c.id)
      .select("id")
      .single();
    if (error || !data) {
      toast({
        title: "Não foi possível atualizar o comentário",
        variant: "destructive",
      });
      return;
    }
    await carregarComentarios();
  }

  async function gerar() {
    if (gerando || readOnly || !props.pecaId) return;
    const numero = ++pedido.current;
    const assinaturaPedido = assinaturaAtual.current;
    setGerando(true);
    setErro("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "documentos-assistente",
        {
          body: {
            peca_id: props.pecaId,
            cliente_id: props.clienteId,
            processo_id: props.processoId || null,
            acao,
            instrucao,
            titulo: props.titulo,
            conteudo: textoDoHtml(props.html),
            contexto,
            provedor,
          },
        },
      );
      if (error) {
        let mensagem =
          "Não foi possível consultar a IA. Verifique se o assistente foi publicado e tente novamente.";
        if (error.context instanceof Response) {
          const detalhe = await error.context.json().catch(() => null);
          if (detalhe?.error) mensagem = detalhe.error;
        }
        throw new Error(mensagem);
      }
      if (data?.error || typeof data?.texto !== "string" || !data.texto.trim())
        throw new Error(
          data?.error || "O assistente retornou uma resposta vazia.",
        );
      if (numero !== pedido.current) return;
      if (assinaturaPedido !== assinaturaAtual.current)
        throw new Error(
          "O documento ou o contexto mudou durante a consulta. Consulte novamente para usar as informações atuais.",
        );
      onContexto({
        ...contextoAtual.current,
        ultima_ia: {
          fontes_consultadas: Array.isArray(data.fontes_consultadas)
            ? data.fontes_consultadas
            : [],
          fontes_utilizadas: Array.isArray(data.fontes_utilizadas)
            ? data.fontes_utilizadas
            : [],
          avisos_pesquisa: Array.isArray(data.avisos_pesquisa)
            ? data.avisos_pesquisa
            : [],
          provedor,
          modelo: typeof data.modelo === "string" ? data.modelo : undefined,
          acao,
          texto: data.texto,
          pendencias: Array.isArray(data.pendencias)
            ? data.pendencias.filter((p: unknown) => typeof p === "string")
            : [],
          gerado_em: new Date().toISOString(),
        },
      });
    } catch (e) {
      if (numero === pedido.current)
        setErro(e instanceof Error ? e.message : "Falha ao consultar a IA.");
    } finally {
      if (numero === pedido.current) setGerando(false);
    }
  }

  return (
    <aside
      aria-label="Apoio à produção jurídica"
      className="rounded-xl border bg-card overflow-hidden"
    >
      <div className="p-4 border-b flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold">Apoio à produção</h2>
          <p className="text-xs text-muted-foreground">
            Contexto, assistência e revisão
          </p>
        </div>
      </div>
      <Tabs value={aba} onValueChange={setAba} className="p-3">
        <TabsList className="grid grid-cols-4 w-full [&>button]:text-xs [&>button]:px-1">
          <TabsTrigger value="contexto">Contexto</TabsTrigger>
          <TabsTrigger value="legislacao">Legislação</TabsTrigger>
          <TabsTrigger value="ia">Assistente IA</TabsTrigger>
          <TabsTrigger value="revisao">Revisão</TabsTrigger>
        </TabsList>
        <TabsContent value="contexto" className="space-y-4 p-1">
          <p className="text-xs text-muted-foreground">
            Este contexto fica salvo junto à peça. Anexe aqui o texto relevante;
            arquivos do processo não são lidos automaticamente.
          </p>
          <fieldset
            disabled={readOnly}
            className="space-y-4 disabled:opacity-70"
          >
            <div>
              <Label htmlFor="objetivo">Providência / objetivo</Label>
              <Textarea
                id="objetivo"
                value={contexto.objetivo}
                onChange={(e) => atualizar("objetivo", e.target.value)}
                placeholder="Ex.: Manifestar sobre o laudo e responder à determinação."
              />
            </div>
            <div>
              <Label htmlFor="tarefa-origem">Tarefa de origem (opcional)</Label>
              <Select
                value={contexto.tarefa_id || "__nenhuma__"}
                onValueChange={(v) =>
                  atualizar("tarefa_id", v === "__nenhuma__" ? "" : v)
                }
                disabled={readOnly || !props.clienteId}
              >
                <SelectTrigger id="tarefa-origem">
                  <SelectValue placeholder="Escolha a tarefa da Controladoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhuma__">
                    Sem tarefa vinculada
                  </SelectItem>
                  {contexto.tarefa_id &&
                    !tarefas.some((t) => t.id === contexto.tarefa_id) && (
                      <SelectItem value={contexto.tarefa_id}>
                        Tarefa de origem vinculada
                      </SelectItem>
                    )}
                  {tarefas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erroTarefas && (
                <p className="text-xs text-destructive">
                  Não foi possível carregar as tarefas. O vínculo existente foi
                  preservado.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="intimacao">Despacho ou intimação</Label>
              <Textarea
                id="intimacao"
                className="min-h-36"
                value={contexto.intimacao}
                onChange={(e) =>
                  onContexto({
                    ...contexto,
                    intimacao: e.target.value,
                    prazo_conferido: false,
                  })
                }
                placeholder="Cole o teor integral da determinação judicial."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="prazo-interno">Prazo interno</Label>
                <Input
                  id="prazo-interno"
                  type="date"
                  value={contexto.prazo_interno}
                  onChange={(e) => atualizar("prazo_interno", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="prazo-processual">Prazo processual</Label>
                <Input
                  id="prazo-processual"
                  type="date"
                  value={contexto.prazo_processual}
                  onChange={(e) =>
                    onContexto({
                      ...contexto,
                      prazo_processual: e.target.value,
                      prazo_conferido: false,
                    })
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Datas informadas para esta produção. Não calculam prazos nem
              alteram a agenda.
            </p>
            <div>
              <Label htmlFor="documentos-contexto">
                Fatos e documentos de apoio
              </Label>
              <Textarea
                id="documentos-contexto"
                className="min-h-36"
                value={contexto.documentos}
                onChange={(e) => atualizar("documentos", e.target.value)}
                placeholder="Identifique os documentos e transcreva os trechos necessários, indicando a origem."
              />
            </div>
            <div>
              <Label htmlFor="orientacoes">Orientações do advogado</Label>
              <Textarea
                id="orientacoes"
                value={contexto.orientacoes}
                onChange={(e) => atualizar("orientacoes", e.target.value)}
                placeholder="Estratégia, limites e pontos a desenvolver."
              />
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <Label>Fontes para consulta</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    atualizar("fontes", [
                      ...contexto.fontes,
                      {
                        id: crypto.randomUUID(),
                        titulo: "",
                        url: "",
                        trecho: "",
                      },
                    ])
                  }
                >
                  <Plus className="h-4 w-4 mr-1" /> Fonte
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pesquise artigos na aba Legislação. Fontes acrescentadas
                manualmente precisam de conferência; links não são abertos
                automaticamente.
              </p>
              {contexto.fontes.map((f) => (
                <div key={f.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex gap-1">
                    <Input
                      readOnly={f.origem === "biblioteca"}
                      aria-label="Identificação da fonte"
                      placeholder="Lei, artigo ou documento"
                      value={f.titulo}
                      onChange={(e) =>
                        atualizar(
                          "fontes",
                          contexto.fontes.map((x) =>
                            x.id === f.id
                              ? { ...x, titulo: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover fonte"
                      onClick={() =>
                        atualizar(
                          "fontes",
                          contexto.fontes.filter((x) => x.id !== f.id),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    readOnly={f.origem === "biblioteca"}
                    aria-label="URL da fonte"
                    placeholder="https://fonte-oficial..."
                    value={f.url}
                    onChange={(e) =>
                      atualizar(
                        "fontes",
                        contexto.fontes.map((x) =>
                          x.id === f.id ? { ...x, url: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {f.url && !urlFonteSegura(f.url) && (
                    <p className="text-xs text-destructive">
                      Informe um endereço http ou https válido.
                    </p>
                  )}
                  <Textarea
                    readOnly={f.origem === "biblioteca"}
                    aria-label="Trecho da fonte"
                    value={f.trecho}
                    placeholder="Transcrição consultada, versão e data de consulta"
                    onChange={(e) =>
                      atualizar(
                        "fontes",
                        contexto.fontes.map((x) =>
                          x.id === f.id ? { ...x, trecho: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {urlFonteSegura(f.url) && (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary inline-flex gap-1 items-center"
                    >
                      Conferir fonte <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </fieldset>
        </TabsContent>
        <TabsContent value="legislacao">
          <BibliotecaJuridica
            gestor={isGestor}
            readOnly={readOnly}
            consultaInicial={contexto.pesquisa_legislacao}
            normaInicial={contexto.norma_pesquisa}
            selecionados={contexto.fontes.map((f) => f.dispositivo_id ?? "")}
            onPesquisar={(q, norma) => {
              if (!readOnly)
                onContexto({
                  ...contexto,
                  pesquisa_legislacao: q,
                  norma_pesquisa: norma,
                });
            }}
            onAdicionar={(f) => {
              if (!contexto.fontes.some((s) => s.dispositivo_id === f.id))
                onContexto({
                  ...contexto,
                  fontes: [
                    ...contexto.fontes,
                    {
                      id: `biblioteca:${f.id}`,
                      titulo: `${f.titulo} — ${f.artigo}`,
                      url: f.fonte_oficial,
                      trecho: f.trecho,
                      origem: "biblioteca",
                      dispositivo_id: f.id,
                      versao_sha: f.versao_sha,
                      commit: f.commit,
                    },
                  ],
                });
            }}
          />
        </TabsContent>
        <TabsContent value="ia" className="space-y-4 p-1">
          <div className="space-y-2">
            <p className="text-sm font-medium">GPT · OpenAI</p>
            <p className="text-xs text-muted-foreground">
              A produção jurídica utiliza o GPT com os dados e as fontes
              informados nesta peça.
            </p>
            {provedorIndisponivel && (
              <div
                role="status"
                className="rounded-md bg-amber-500/10 p-3 text-xs"
              >
                Este provedor aguarda configuração da chave de API pela gestão.
                O editor e a revisão continuam disponíveis.
                {isGestor && (
                  <a
                    className="block mt-2 underline"
                    href="https://supabase.com/dashboard/project/mzwnljgujheumdslkloc/functions/secrets"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Configurar chave no servidor
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-muted p-3 text-xs leading-relaxed">
            O assistente usa a minuta atual e o contexto informado. A resposta é
            uma sugestão para conferência do advogado. Antes de redigir, ele
            pesquisa os dispositivos do acervo importado.
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[
              ["minuta", "Redigir"],
              ["estrutura", "Estruturar"],
              ["revisao", "Revisar"],
            ].map(([v, label]) => (
              <Button
                key={v}
                variant={acao === v ? "secondary" : "outline"}
                size="sm"
                onClick={() => setAcao(v)}
                disabled={gerando}
              >
                {label}
              </Button>
            ))}
          </div>
          <Label htmlFor="pedido-ia">O que você precisa?</Label>
          <Textarea
            id="pedido-ia"
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="Ex.: Prepare uma manifestação com base no despacho e nos documentos do contexto."
            disabled={readOnly || gerando}
          />
          {!props.pecaId && (
            <p className="text-xs text-amber-700">
              Salve a peça para consultar o assistente.
            </p>
          )}
          <Button
            className="w-full"
            onClick={gerar}
            disabled={
              gerando ||
              readOnly ||
              !props.pecaId ||
              props.ocupado ||
              provedorIndisponivel
            }
          >
            {gerando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {gerando ? "Preparando sugestão…" : "Consultar assistente"}
          </Button>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          {contexto.ultima_ia && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex justify-between items-center">
                <Badge variant="outline">
                  {contexto.ultima_ia.provedor === "anthropic"
                    ? "Claude"
                    : contexto.ultima_ia.provedor === "openai"
                      ? "GPT"
                      : "IA"}{" "}
                  • {contexto.ultima_ia.acao}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(contexto.ultima_ia.gerado_em).toLocaleString(
                    "pt-BR",
                  )}
                </span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none break-words max-h-[55vh] overflow-auto">
                <ReactMarkdown>{contexto.ultima_ia.texto}</ReactMarkdown>
              </div>
              {contexto.ultima_ia.pendencias.length > 0 && (
                <div className="rounded-md bg-amber-500/10 p-3 text-sm">
                  <strong>Pontos a conferir</strong>
                  <ul className="list-disc pl-4 mt-2">
                    {contexto.ultima_ia.pendencias.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Aplicar a sugestão preserva a minuta atual no histórico.
              </p>
              {(contexto.ultima_ia.avisos_pesquisa?.length ?? 0) > 0 && (
                <details className="text-xs rounded-lg bg-muted p-3">
                  <summary className="cursor-pointer font-medium">
                    Conferência das fontes
                  </summary>
                  <ul className="list-disc pl-4 mt-2 space-y-1">
                    {contexto.ultima_ia.avisos_pesquisa?.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}
              {(contexto.ultima_ia.fontes_consultadas?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    Legislação consultada nesta sugestão
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cada trecho mantém a fonte e a versão recuperada. O destaque
                    indica as fontes que a IA declarou utilizar.
                  </p>
                  {contexto.ultima_ia.fontes_consultadas?.map((f) => (
                    <FonteLegalCard
                      key={f.id}
                      fonte={f}
                      usada={contexto.ultima_ia?.fontes_utilizadas?.some(
                        (u) => u.id === f.id,
                      )}
                    />
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {[false, true].map((substituir) => (
                  <Button
                    key={String(substituir)}
                    size="sm"
                    variant={substituir ? "outline" : "default"}
                    disabled={readOnly || props.ocupado || aplicando || gerando}
                    onClick={async () => {
                      setAplicando(true);
                      try {
                        await props.onAplicar(
                          contexto.ultima_ia!.texto,
                          substituir,
                        );
                      } finally {
                        setAplicando(false);
                      }
                    }}
                  >
                    {substituir ? "Substituir minuta" : "Adicionar ao final"}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent value="revisao" className="space-y-4 p-1">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Conferência antes da aprovação
            </h3>
            {CHECKLIST_REVISAO.map((item) => (
              <label
                key={item.id}
                className="flex gap-2 items-start text-sm cursor-pointer"
              >
                <Checkbox
                  disabled={readOnly}
                  checked={contexto.checklist.includes(item.id)}
                  onCheckedChange={(checked) =>
                    atualizar(
                      "checklist",
                      checked
                        ? [...contexto.checklist, item.id]
                        : contexto.checklist.filter((x) => x !== item.id),
                    )
                  }
                />
                {item.label}
              </label>
            ))}
            <label className="flex gap-2 items-start text-sm">
              <Checkbox
                disabled={readOnly}
                checked={contexto.prazo_conferido}
                onCheckedChange={(v) =>
                  atualizar("prazo_conferido", v === true)
                }
              />
              Prazo conferido pelo responsável, com base na intimação e no
              calendário aplicável
            </label>
          </div>
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold text-sm">Comentários de revisão</h3>
            {props.selecao && (
              <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground line-clamp-4">
                Trecho selecionado: {props.selecao}
              </blockquote>
            )}
            <Textarea
              aria-label="Novo comentário de revisão"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Registre o ajuste necessário…"
              disabled={!props.pecaId || readOnly}
            />
            <Button
              size="sm"
              onClick={comentar}
              disabled={
                !props.pecaId ||
                !comentario.trim() ||
                readOnly ||
                salvandoComentario
              }
            >
              <MessageSquarePlus className="h-4 w-4 mr-2" />
              {salvandoComentario ? "Salvando…" : "Registrar comentário"}
            </Button>
            {!props.pecaId && (
              <p className="text-xs text-muted-foreground">
                Salve a peça para registrar comentários.
              </p>
            )}
            {carregandoComentarios && (
              <p className="text-xs text-muted-foreground">
                Carregando comentários…
              </p>
            )}
            {erroComentarios && (
              <div role="alert" className="text-xs text-destructive">
                {erroComentarios}
                <Button variant="link" size="sm" onClick={carregarComentarios}>
                  Tentar novamente
                </Button>
              </div>
            )}
            {!carregandoComentarios &&
              !erroComentarios &&
              !comentarios.length && (
                <p className="text-xs text-muted-foreground">
                  Nenhum comentário registrado.
                </p>
              )}
            {comentarios.map((c) => (
              <div
                key={c.id}
                className={`rounded-lg border p-3 space-y-2 ${c.resolvido ? "opacity-60" : ""}`}
              >
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{c.autor_id === user?.id ? "Você" : "Equipe"}</span>
                  <span>{new Date(c.criado_em).toLocaleString("pt-BR")}</span>
                </div>
                {c.trecho_texto && (
                  <blockquote className="text-xs border-l-2 pl-2 whitespace-pre-wrap">
                    {c.trecho_texto}
                  </blockquote>
                )}
                <p className="text-sm whitespace-pre-wrap">{c.comentario}</p>
                {c.resolvido && <Badge variant="secondary">Resolvido</Badge>}
                {!readOnly && (c.autor_id === user?.id || isGestor) && (
                  <Button size="sm" variant="ghost" onClick={() => resolver(c)}>
                    <CheckCheck className="h-4 w-4 mr-1" />
                    {c.resolvido ? "Reabrir" : "Resolver"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {props.processoId && (
        <div className="border-t p-3">
          <Button asChild variant="link" size="sm">
            <Link to={`/processos/${props.processoId}`}>
              Abrir processo <ExternalLink className="h-3 w-3 ml-2" />
            </Link>
          </Button>
        </div>
      )}
    </aside>
  );
}
