import { useEffect, useMemo, useRef, useState, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Loader2, Paperclip, X, Pencil, Trash2, Download,
  FileText, Image as ImageIcon, AtSign, Link as LinkIcon, Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface Anexo {
  url: string;
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
}

interface Comentario {
  id: string;
  item_id: string | null;
  texto: string;
  user_id: string;
  criado_em: string;
  arquivos: Anexo[];
  autor_nome?: string;
  autor_avatar?: string | null;
  item_titulo?: string | null;
}

interface MembroEquipe {
  id: string;
  nome: string;
  email?: string | null;
  avatar_url: string | null;
}

interface Props {
  itemId: string;
  processoId?: string | null;
  clienteId?: string | null;
  itemTitulo?: string | null;
  className?: string;
  variant?: "panel" | "fullscreen";
}

const isImage = (mime: string) => mime?.startsWith("image/");

function removeAcentos(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function ItemChat({ itemId, processoId, clienteId, itemTitulo, className, variant = "panel" }: Props) {
  const { user, roles, isGestor: authIsGestor } = useAuth();
  const isGestor = authIsGestor || roles.includes("gestor");

  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [anexosPendentes, setAnexosPendentes] = useState<Anexo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const relevantItemIdsRef = useRef<Set<string>>(new Set([itemId]));

  // Carregar membros da equipe ativos para menções
  useEffect(() => {
    supabase.from("profiles")
      .select("id, nome, email, avatar_url")
      .eq("ativo", true)
      .order("nome")
      .then(({ data, error }) => {
        if (!error && data) {
          setEquipe(data as MembroEquipe[]);
        }
      });
  }, []);

  async function carregarComentarios() {
    try {
      const itemTitulos: Record<string, string> = { [itemId]: itemTitulo ?? "Item atual" };
      const itemIds = [itemId];

      if (processoId || clienteId) {
        let query = supabase
          .from("controladoria_itens")
          .select("id, titulo")
          .neq("id", itemId)
          .limit(30);

        query = processoId
          ? query.eq("processo_id", processoId)
          : query.eq("cliente_id", clienteId!);

        const { data: relacionados } = await query;
        (relacionados ?? []).forEach((it: any) => {
          itemIds.push(it.id);
          itemTitulos[it.id] = it.titulo;
        });
      }

      relevantItemIdsRef.current = new Set(itemIds);

      const { data: cs, error: errCs } = await supabase
        .from("controladoria_comentarios")
        .select("id, item_id, texto, user_id, criado_em, arquivos")
        .in("item_id", itemIds)
        .order("criado_em", { ascending: true });

      if (errCs) {
        toast.error("Não foi possível carregar comentários: " + errCs.message);
        return;
      }

      const userIds = Array.from(new Set((cs ?? []).map((c: any) => c.user_id)));
      let perfis: Record<string, MembroEquipe> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome, avatar_url, email")
          .in("id", userIds);
        perfis = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      }

      setComentarios((cs ?? []).map((c: any) => ({
        ...c,
        arquivos: Array.isArray(c.arquivos) ? c.arquivos : [],
        autor_nome: perfis[c.user_id]?.nome ?? "Usuário",
        autor_avatar: perfis[c.user_id]?.avatar_url ?? null,
        item_titulo: c.item_id ? itemTitulos[c.item_id] ?? null : null,
      })));
    } catch (e: any) {
      toast.error(e?.message || "Erro inesperado ao carregar comentários");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    setCarregando(true);
    carregarComentarios();

    // Inscrição Realtime filtrando apenas comentários das atividades relevantes
    const channelId = `ctr-chat-${itemId}-${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "controladoria_comentarios" },
        (payload) => {
          const changedItemId = (payload.new as any)?.item_id ?? (payload.old as any)?.item_id;
          if (!changedItemId || relevantItemIdsRef.current.has(changedItemId)) {
            carregarComentarios();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, processoId, clienteId]);

  // Scroll suave para a mensagem mais recente ao carregar ou receber novos comentários
  useEffect(() => {
    if (!carregando && scrollRef.current) {
      const el = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [comentarios.length, carregando]);

  // Upload com tratamento de erro claro e URL assinada
  async function uploadAnexos(files: FileList) {
    if (!user) return;
    setUploading(true);
    const novos: Anexo[] = [];
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`"${file.name}" excede o limite de 20MB`);
          continue;
        }
        const cleanName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${user.id}/${itemId}/${Date.now()}-${cleanName}`;
        const { error } = await supabase.storage.from("chat-anexos").upload(path, file);
        if (error) {
          toast.error(`Erro ao enviar "${file.name}": ${error.message}`);
          continue;
        }
        // Gera URL assinada com expiração longa para visualização imediata
        const { data: signed } = await supabase.storage.from("chat-anexos").createSignedUrl(path, 60 * 60 * 24 * 7);
        novos.push({
          url: signed?.signedUrl ?? "",
          path,
          nome: file.name,
          mime: file.type,
          tamanho: file.size,
        });
      }
      if (novos.length > 0) {
        setAnexosPendentes((prev) => [...prev, ...novos]);
        toast.success(`${novos.length} anexo(s) pronto(s) para envio`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro no upload dos anexos");
    } finally {
      setUploading(false);
    }
  }

  async function removerAnexoPendente(idx: number) {
    const anexo = anexosPendentes[idx];
    if (anexo?.path) {
      await supabase.storage.from("chat-anexos").remove([anexo.path]).catch(() => {});
    }
    setAnexosPendentes((prev) => prev.filter((_, i) => i !== idx));
  }

  // Extração de menções com suporte a acentos, nomes compostos e deduplicação
  function extrairMencoes(txt: string): string[] {
    const ids = new Set<string>();
    const txtNorm = removeAcentos(txt);

    for (const membro of equipe) {
      if (membro.id === user?.id) continue; // Nunca notifica o próprio autor
      const nomeCompletoNorm = removeAcentos(membro.nome);
      const primeiroNomeNorm = removeAcentos(membro.nome.split(" ")[0]);
      const semEspacosNorm = removeAcentos(membro.nome.replace(/\s+/g, "_"));

      // Verifica menção no padrão @NomeCompleto, @Nome_Sobrenome ou @PrimeiroNome
      if (
        txtNorm.includes(`@${nomeCompletoNorm}`) ||
        txtNorm.includes(`@${semEspacosNorm}`) ||
        txtNorm.includes(`@${primeiroNomeNorm}`)
      ) {
        ids.add(membro.id);
      }
    }
    return Array.from(ids);
  }

  async function enviar() {
    if (enviando || (!texto.trim() && anexosPendentes.length === 0) || !user) return;

    setEnviando(true);
    try {
      const textoFinal = texto.trim() || (anexosPendentes.length > 0 ? "(anexo)" : "");
      if (!textoFinal) return;

      const { error } = await supabase.from("controladoria_comentarios").insert({
        item_id: itemId,
        processo_id: processoId ?? null,
        user_id: user.id,
        texto: textoFinal,
        arquivos: anexosPendentes as any,
      });

      if (error) {
        toast.error("Erro ao publicar comentário: " + error.message);
        return;
      }

      // Limpa formulário apenas após sucesso confirmado
      setTexto("");
      setAnexosPendentes([]);

      const mencionados = extrairMencoes(textoFinal);
      if (itemId && mencionados.length > 0) {
        supabase.rpc("notificar_mencoes_controladoria", {
          _item_id: itemId,
          _user_ids: mencionados,
        }).then(({ error: e }) => {
          if (e) console.warn("Falha ao notificar menções:", e.message);
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro inesperado ao enviar mensagem");
    } finally {
      setEnviando(false);
    }
  }

  async function salvarEdicao(id: string) {
    if (!editTexto.trim() || salvandoEdicao) return;
    setSalvandoEdicao(true);
    try {
      const { error } = await supabase
        .from("controladoria_comentarios")
        .update({ texto: editTexto.trim() })
        .eq("id", id);

      if (error) {
        toast.error("Erro ao salvar alteração: " + error.message);
        return;
      }

      toast.success("Comentário atualizado");
      setEditandoId(null);
      setEditTexto("");
      carregarComentarios();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao editar comentário");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function excluirComentario(c: Comentario) {
    try {
      if (c.arquivos?.length > 0) {
        const paths = c.arquivos.map((a) => a.path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from("chat-anexos").remove(paths).catch(() => {});
        }
      }
      const { error } = await supabase.from("controladoria_comentarios").delete().eq("id", c.id);
      if (error) {
        toast.error("Erro ao excluir: " + error.message);
        return;
      }
      toast.success("Comentário excluído");
      carregarComentarios();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao excluir comentário");
    }
  }

  // Detecta '@' com suporte a acentos para abrir popover de menções
  function onTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTexto(val);
    const cursorPos = e.target.selectionStart;
    const upToCursor = val.slice(0, cursorPos);
    const match = upToCursor.match(/(?:^|\s)@([\p{L}\p{M}0-9_\-]*)$/u);
    if (match) {
      setMentionQuery(match[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }

  function inserirMencao(membro: MembroEquipe) {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    // Insere o nome completo ou primeiro nome se for único para evitar ambiguidade
    const mencaoNome = membro.nome;
    const before = texto.slice(0, pos).replace(/@[\p{L}\p{M}0-9_\-]*$/u, `@${mencaoNome} `);
    const after = texto.slice(pos);
    const novoTexto = before + after;
    setTexto(novoTexto);
    setMentionOpen(false);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(before.length, before.length);
    }, 0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      enviar();
    }
  }

  // Agrupa mensagens consecutivas do mesmo autor (≤ 5min)
  type Grupo = {
    autor_id: string;
    autor_nome: string;
    autor_avatar: string | null;
    item_id: string | null;
    item_titulo?: string | null;
    mensagens: Comentario[];
  };

  const grupos = useMemo<Grupo[]>(() => {
    const out: Grupo[] = [];
    for (const c of comentarios) {
      const last = out[out.length - 1];
      const sameAuthor = last && last.autor_id === c.user_id;
      const sameItem = last && last.item_id === c.item_id;
      const tDiff = last
        ? new Date(c.criado_em).getTime() - new Date(last.mensagens[last.mensagens.length - 1].criado_em).getTime()
        : Infinity;
      if (sameAuthor && sameItem && tDiff < 5 * 60 * 1000) {
        last.mensagens.push(c);
      } else {
        out.push({
          autor_id: c.user_id,
          autor_nome: c.autor_nome ?? "Usuário",
          autor_avatar: c.autor_avatar ?? null,
          item_id: c.item_id,
          item_titulo: c.item_titulo,
          mensagens: [c],
        });
      }
    }
    return out;
  }, [comentarios]);

  // Lista de membros filtrados com suporte a busca tolerante a acentos
  const membrosFiltrados = useMemo(() => {
    const qNorm = removeAcentos(mentionQuery.trim());
    if (!qNorm) return equipe.slice(0, 8);
    return equipe.filter((m) =>
      removeAcentos(m.nome).includes(qNorm) || (m.email && removeAcentos(m.email).includes(qNorm))
    ).slice(0, 8);
  }, [equipe, mentionQuery]);

  const initials = (nome: string) =>
    (nome || "U").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      {/* Lista de comentários com suporte a comentários de contexto e rolagem suave */}
      <ScrollArea ref={scrollRef} className="flex-1 min-h-0">
        <div className={cn("space-y-5 py-4", variant === "fullscreen" ? "px-8 max-w-4xl mx-auto" : "px-1")}>
          {carregando ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-xs">Carregando conversa...</p>
            </div>
          ) : grupos.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="text-sm font-semibold text-foreground mb-1.5">Nenhum comentário ainda</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Adicione anotações, documentos ou marque seus colegas com <span className="text-primary font-medium">@nome</span> para manter a equipe sincronizada.
              </p>
            </div>
          ) : (
            grupos.map((g, gi) => (
              <div key={gi} className="flex gap-3">
                <Avatar className="h-9 w-9 shrink-0 mt-0.5 border">
                  {g.autor_avatar && <AvatarImage src={g.autor_avatar} alt={g.autor_nome} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials(g.autor_nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm font-semibold text-foreground">{g.autor_nome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(g.mensagens[0].criado_em)}
                    </p>
                  </div>

                  {/* Identificação visual destacada de comentários de histórico relacionado */}
                  {g.item_id && g.item_id !== itemId && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] h-4 bg-muted/60 text-muted-foreground font-normal border-dashed">
                        <LinkIcon className="w-2.5 h-2.5 mr-1 text-primary/70" />
                        Atividade relacionada · {g.item_titulo || "Processo"}
                      </Badge>
                    </div>
                  )}

                  <div className="space-y-1.5 mt-1">
                    {g.mensagens.map((c) => (
                      <MensagemBolha
                        key={c.id}
                        c={c}
                        ehAutor={c.user_id === user?.id}
                        podeEditarExcluir={c.user_id === user?.id || isGestor}
                        editando={editandoId === c.id}
                        editTexto={editTexto}
                        setEditTexto={setEditTexto}
                        salvandoEdicao={salvandoEdicao}
                        onIniciarEdicao={() => { setEditandoId(c.id); setEditTexto(c.texto); }}
                        onCancelarEdicao={() => { setEditandoId(null); setEditTexto(""); }}
                        onSalvarEdicao={() => salvarEdicao(c.id)}
                        onExcluir={() => excluirComentario(c)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Composer de Comentários */}
      <div className={cn("border-t bg-background px-4 py-3 space-y-2", variant === "fullscreen" && "px-8")}>
        {anexosPendentes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {anexosPendentes.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-muted/50 border rounded-md pl-2 pr-1 py-1 text-xs max-w-[220px]">
                {isImage(a.mime) ? <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0" /> : <FileText className="w-3.5 h-3.5 text-primary shrink-0" />}
                <span className="truncate flex-1">{a.nome}</span>
                <button
                  type="button"
                  onClick={() => removerAnexoPendente(i)}
                  className="text-muted-foreground hover:text-destructive p-0.5 transition-colors"
                  title="Remover anexo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
          <PopoverTrigger asChild>
            <div className="relative rounded-md border border-input bg-card focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-colors">
              <Textarea
                ref={textareaRef}
                value={texto}
                onChange={onTextareaChange}
                onKeyDown={onKeyDown}
                placeholder="Digite um comentário ou use @ para mencionar colegas..."
                rows={variant === "fullscreen" ? 3 : 2}
                disabled={enviando}
                className="resize-none border-0 focus-visible:ring-0 shadow-none bg-transparent text-sm"
              />
              <div className="flex items-center justify-between px-2 py-1.5 border-t border-border/60">
                <div className="flex items-center gap-0.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        uploadAnexos(e.target.files);
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const ta = textareaRef.current;
                      if (!ta) return;
                      const pos = ta.selectionStart;
                      setTexto(texto.slice(0, pos) + "@" + texto.slice(pos));
                      setMentionQuery("");
                      setMentionOpen(true);
                      setTimeout(() => {
                        ta.focus();
                        ta.setSelectionRange(pos + 1, pos + 1);
                      }, 0);
                    }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                    title="Mencionar colega (@)"
                  >
                    <AtSign className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || enviando}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    title="Anexar arquivo"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Paperclip className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={enviar}
                  disabled={enviando || uploading || (!texto.trim() && anexosPendentes.length === 0)}
                  className="h-7 px-3 text-xs font-semibold uppercase tracking-wider border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {enviando && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Comentar
                </Button>
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-72 p-1 max-h-60 overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 py-1.5 flex items-center gap-1.5 border-b mb-1">
              <AtSign className="w-3 h-3" /> Integrantes da equipe
            </div>
            {membrosFiltrados.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">Nenhum membro encontrado</p>
            ) : (
              membrosFiltrados.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => inserirMencao(m)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left text-sm transition-colors"
                >
                  <Avatar className="h-6 w-6 shrink-0 border">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                      {initials(m.nome)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{m.nome}</p>
                    {m.email && <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>}
                  </div>
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

// ===== Sub-componente de Anexo de Imagem com Renovação Automática de URL Assinada =====
function ImagemAnexoItem({ anexo }: { anexo: Anexo }) {
  const [src, setSrc] = useState(anexo.url);
  const [tentouRenovar, setTentouRenovar] = useState(false);

  async function handleErro() {
    if (anexo.path && !tentouRenovar) {
      setTentouRenovar(true);
      try {
        const { data } = await supabase.storage.from("chat-anexos").createSignedUrl(anexo.path, 3600);
        if (data?.signedUrl) {
          setSrc(data.signedUrl);
        }
      } catch {
        // ignora
      }
    }
  }

  async function abrir() {
    if (anexo.path) {
      try {
        const { data } = await supabase.storage.from("chat-anexos").createSignedUrl(anexo.path, 3600);
        if (data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
          return;
        }
      } catch {
        // fallback
      }
    }
    if (anexo.url) {
      window.open(anexo.url, "_blank");
    }
  }

  return (
    <button
      type="button"
      onClick={abrir}
      className="block text-left group overflow-hidden rounded-md border bg-muted/20 hover:border-primary transition-all"
    >
      <img
        src={src}
        alt={anexo.nome}
        onError={handleErro}
        className="max-h-40 max-w-xs object-cover rounded group-hover:opacity-90 transition-opacity"
        loading="lazy"
      />
    </button>
  );
}

// ===== Sub-componente: bolha de mensagem =====
function MensagemBolha({
  c,
  ehAutor,
  podeEditarExcluir,
  editando,
  editTexto,
  setEditTexto,
  salvandoEdicao,
  onIniciarEdicao,
  onCancelarEdicao,
  onSalvarEdicao,
  onExcluir,
}: {
  c: Comentario;
  ehAutor: boolean;
  podeEditarExcluir: boolean;
  editando: boolean;
  editTexto: string;
  setEditTexto: (v: string) => void;
  salvandoEdicao: boolean;
  onIniciarEdicao: () => void;
  onCancelarEdicao: () => void;
  onSalvarEdicao: () => void;
  onExcluir: () => void;
}) {
  async function abrirAnexoGenerico(anexo: Anexo) {
    if (anexo.path) {
      try {
        const { data } = await supabase.storage.from("chat-anexos").createSignedUrl(anexo.path, 3600);
        if (data?.signedUrl) {
          window.open(data.signedUrl, "_blank");
          return;
        }
      } catch {
        // fallback
      }
    }
    if (anexo.url) {
      window.open(anexo.url, "_blank");
    } else {
      toast.error("Arquivo não encontrado");
    }
  }

  return (
    <div className="group relative bg-muted/40 rounded-lg px-3 py-2 border border-border/40">
      {editando ? (
        <div className="space-y-2">
          <Textarea
            value={editTexto}
            onChange={(e) => setEditTexto(e.target.value)}
            rows={2}
            className="text-sm bg-background"
            disabled={salvandoEdicao}
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={onCancelarEdicao} disabled={salvandoEdicao}>
              Cancelar
            </Button>
            <Button size="sm" onClick={onSalvarEdicao} disabled={salvandoEdicao || !editTexto.trim()}>
              {salvandoEdicao && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="prose prose-sm max-w-none text-sm text-foreground/90 dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-a:text-primary break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
              }}
            >
              {c.texto.replace(/(^|\s)(@[\p{L}\p{M}0-9_\-]+(?:\s[\p{L}\p{M}0-9_\-]+)?)/gu, "$1**$2**")}
            </ReactMarkdown>
          </div>

          {c.arquivos?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {c.arquivos.map((a, i) =>
                isImage(a.mime) ? (
                  <ImagemAnexoItem key={i} anexo={a} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => abrirAnexoGenerico(a)}
                    className="inline-flex items-center gap-1.5 bg-background border rounded-md px-2.5 py-1.5 text-xs hover:border-primary text-foreground transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate max-w-[180px] font-medium">{a.nome}</span>
                    <Download className="w-3.5 h-3.5 text-muted-foreground ml-1" />
                  </button>
                ),
              )}
            </div>
          )}

          {podeEditarExcluir && (
            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 bg-background/80 backdrop-blur-sm rounded p-0.5 border shadow-xs">
              <button
                type="button"
                onClick={onIniciarEdicao}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Editar comentário"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                    title="Excluir comentário"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir comentário?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação removerá a mensagem e seus anexos permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={onExcluir} className="bg-destructive hover:bg-destructive/90">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </>
      )}
    </div>
  );
}
