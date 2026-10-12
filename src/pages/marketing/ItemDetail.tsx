import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { operar, tabela } from "./api";
import {
  STATUS,
  TIPOS,
  CAMPOS,
  podePublicar,
  linkSeguro,
  type Item,
  type Contexto,
  type Tipo,
} from "./model";
export default function ItemDetail({
  item,
  ctx,
  itens,
  onClose,
  onEdit,
  onChanged,
  onConverted,
}: {
  item: Item;
  ctx: Contexto;
  itens: Item[];
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
  onConverted: (i: Item) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [texto, setTexto] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [link, setLink] = useState("");
  const [publicado, setPublicado] = useState("");
  const [metricas, setMetricas] = useState(item.dados.metricas ?? {});
  const [orcamento, setOrcamento] = useState("");
  const [gasto, setGasto] = useState("");
  const [roteiros, setRoteiros] = useState<string[]>(
    itens
      .filter((i) => i.tipo === "roteiro" && i.status === "aguardando_gravacao")
      .map((i) => i.id),
  );
  const hist = useQuery({
    queryKey: ["mkt-historico", item.id, item.versao, item.status],
    queryFn: async () => ({
      versoes: await tabela("mkt_versoes", "item_id", item.id),
      decisoes: await tabela("mkt_decisoes", "item_id", item.id),
      comentarios: await tabela("mkt_comentarios", "item_id", item.id),
    }),
  });
  const gravacao = useQuery({
    queryKey: ["mkt-gravacao", item.id],
    enabled: item.tipo === "gravacao",
    queryFn: () => tabela("mkt_gravacao_itens", "sessao_id", item.id),
  });
  const financeiro = useQuery({
    queryKey: ["mkt-financeiro", item.id],
    enabled: item.tipo === "campanha" && ctx.permissoes.financeiro,
    queryFn: () => tabela("mkt_campanha_financeiro", "campanha_id", item.id),
  });
  async function agir(op: string, p: any = {}) {
    setBusy(true);
    try {
      const result = await operar(op, {
        id: item.id,
        versao: item.versao,
        ...p,
      });
      toast.success("Operação registrada");
      onChanged();
      hist.refetch();
      if (op === "converter") onConverted(result);
      if (op === "gravacao") gravacao.refetch();
      if (op === "financeiro") financeiro.refetch();
      if (op === "comentario") setTexto("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  const editavel =
    ctx.permissoes.editar && !["publicado", "arquivado"].includes(item.status);
  const pendente = item.status === "aguardando_aprovacao";
  const filhos = itens.filter(
    (i) =>
      i.origem_id === item.id ||
      i.pauta_id === item.id ||
      i.planejamento_id === item.id,
  );
  const publicar = podePublicar(item);
  const metricasPermitidas =
    item.status === "publicado" || item.tipo === "campanha";
  const nome = (id: string | null) =>
    ctx.usuarios.find((u) => u.id === id)?.nome ?? "Não atribuído";
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.titulo}</DialogTitle>
          <DialogDescription>
            {TIPOS[item.tipo]} · versão {item.versao} ·{" "}
            {nome(item.responsavel_id)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Badge>{STATUS[item.status] ?? item.status}</Badge>
          <p className="whitespace-pre-wrap text-sm">{item.descricao}</p>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <p>
              Prazo:{" "}
              {item.prazo
                ? new Date(item.prazo).toLocaleString("pt-BR")
                : "Não definido"}
            </p>
            <p>
              Data prevista:{" "}
              {item.data_prevista
                ? new Date(item.data_prevista).toLocaleString("pt-BR")
                : "Não definida"}
            </p>
            <p>
              Serviço:{" "}
              {ctx.servicos.find((s) => s.id === item.servico_id)?.nome ??
                "Não vinculado"}
            </p>
            <p>
              Tese:{" "}
              {ctx.teses.find((s) => s.id === item.tese_id)?.nome ??
                "Não vinculada"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editavel &&
              item.tipo === "campanha" &&
              ["aprovado", "pausada"].includes(item.status) && (
                <Button
                  disabled={busy}
                  onClick={() => agir("status", { status: "ativa" })}
                >
                  Ativar campanha
                </Button>
              )}
            {editavel &&
              item.tipo === "campanha" &&
              item.status === "ativa" && (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => agir("status", { status: "pausada" })}
                >
                  Pausar campanha
                </Button>
              )}
            {editavel &&
              item.tipo === "campanha" &&
              ["ativa", "pausada"].includes(item.status) && (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => agir("status", { status: "encerrada" })}
                >
                  Encerrar campanha
                </Button>
              )}
            {editavel && (
              <Button disabled={busy} variant="outline" onClick={onEdit}>
                Editar / reagendar
              </Button>
            )}
            {editavel &&
              [
                "rascunho",
                "producao",
                "revisao",
                "ajustes",
                "edicao",
                "gravado",
              ].includes(item.status) &&
              ![
                "tarefa",
                "rotina",
                "concorrente",
                "pesquisa",
                "gravacao",
              ].includes(item.tipo) && (
                <Button disabled={busy} onClick={() => agir("submeter")}>
                  Enviar para aprovação
                </Button>
              )}
            {editavel && ["rascunho", "ajustes"].includes(item.status) && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => agir("status", { status: "producao" })}
              >
                Iniciar produção
              </Button>
            )}
            {editavel && item.status === "producao" && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => agir("status", { status: "revisao" })}
              >
                Revisão interna
              </Button>
            )}
            {editavel &&
              item.status === "aprovado" &&
              ["conteudo", "artigo", "roteiro"].includes(item.tipo) && (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => agir("status", { status: "pronto" })}
                >
                  Pronto para publicar
                </Button>
              )}
            {editavel && item.status === "aguardando_gravacao" && (
              <Button
                disabled={busy}
                onClick={() => agir("status", { status: "gravado" })}
              >
                Marcar gravado
              </Button>
            )}
            {editavel && item.status === "gravado" && (
              <Button
                disabled={busy}
                onClick={() => agir("status", { status: "edicao" })}
              >
                Enviar para edição
              </Button>
            )}
            {editavel &&
              ["tarefa", "pesquisa", "gravacao"].includes(item.tipo) &&
              item.status !== "concluido" && (
                <Button
                  disabled={busy}
                  onClick={() => agir("status", { status: "concluido" })}
                >
                  Concluir atividade
                </Button>
              )}
            {ctx.permissoes.criar && item.tipo === "pesquisa" && (
              <Button
                disabled={busy}
                onClick={() => agir("converter", { tipo_destino: "ideia" })}
              >
                Converter em ideia
              </Button>
            )}
            {ctx.permissoes.criar &&
              item.tipo === "ideia" &&
              item.status === "aprovado" && (
                <Button
                  disabled={busy}
                  onClick={() => agir("converter", { tipo_destino: "pauta" })}
                >
                  Converter em pauta
                </Button>
              )}
            {ctx.permissoes.criar &&
              item.tipo === "pauta" &&
              item.status === "aprovado" &&
              (["conteudo", "artigo", "roteiro"] as Tipo[]).map((tipo) => (
                <Button
                  key={tipo}
                  disabled={busy}
                  onClick={() => agir("converter", { tipo_destino: tipo })}
                >
                  Produzir {TIPOS[tipo].toLowerCase()}
                </Button>
              ))}
            {ctx.permissoes.criar &&
              item.tipo === "artigo" &&
              item.status === "publicado" && (
                <Button
                  disabled={busy}
                  onClick={() => agir("converter", { tipo_destino: "artigo" })}
                >
                  Criar revisão jurídica
                </Button>
              )}
            {ctx.permissoes.editar && item.status !== "arquivado" && (
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Arquivar este registro preservando seu histórico?",
                    )
                  )
                    agir("arquivar");
                }}
              >
                Arquivar
              </Button>
            )}
          </div>
          {pendente && ctx.permissoes.aprovar && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold">
                Decisão da direção — versão {item.versao}
              </h3>
              <p className="text-sm text-muted-foreground">
                Aprovação do roteiro não substitui a aprovação do vídeo final.
                Confira a versão do Drive antes de decidir.
              </p>
              <Textarea
                aria-label="Justificativa da decisão"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Justificativa obrigatória para rejeitar ou solicitar ajustes"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() =>
                    agir("decidir", { resultado: "aprovado", justificativa })
                  }
                >
                  {item.tipo === "planejamento"
                    ? "Aprovar planejamento e pautas submetidas"
                    : "Aprovar esta versão"}
                </Button>
                <Button
                  disabled={busy || !justificativa.trim()}
                  variant="outline"
                  onClick={() =>
                    agir("decidir", { resultado: "ajustes", justificativa })
                  }
                >
                  Solicitar ajustes
                </Button>
                <Button
                  disabled={busy || !justificativa.trim()}
                  variant="destructive"
                  onClick={() =>
                    agir("decidir", { resultado: "rejeitado", justificativa })
                  }
                >
                  Rejeitar
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {CAMPOS[item.tipo]
              .filter((c) => item.dados[c.chave])
              .map((c) => (
                <div key={c.chave}>
                  <p className="text-xs uppercase text-muted-foreground">
                    {c.rotulo}
                  </p>
                  {typeof item.dados[c.chave] === "string" &&
                  linkSeguro(item.dados[c.chave]) ? (
                    <a
                      className="text-primary underline break-all"
                      href={item.dados[c.chave]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir{" "}
                      {c.chave === "link_drive"
                        ? "no Google Drive"
                        : "referência"}{" "}
                      — {item.dados.versao_arquivo ?? "versão cadastrada"}
                    </a>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm break-words">
                      {c.tipo === "editor"
                        ? new DOMParser().parseFromString(
                            item.dados[c.chave],
                            "text/html",
                          ).body.textContent
                        : String(item.dados[c.chave])}
                    </p>
                  )}
                </div>
              ))}
          </div>
          {filhos.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Registros vinculados</h3>
              {filhos.map((f) => (
                <Button
                  key={f.id}
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => onConverted(f)}
                >
                  {TIPOS[f.tipo]}: {f.titulo} · {STATUS[f.status]}
                </Button>
              ))}
            </div>
          )}
          {item.tipo === "gravacao" && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold">Roteiros da sessão</h3>
              {gravacao.data?.map((g: any) => (
                <div
                  key={g.roteiro_id}
                  className="flex justify-between gap-2 text-sm"
                >
                  <span>
                    {g.ordem}.{" "}
                    {itens.find((i) => i.id === g.roteiro_id)?.titulo}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const r = itens.find((i) => i.id === g.roteiro_id);
                      if (r) onConverted(r);
                    }}
                  >
                    {STATUS[
                      itens.find((i) => i.id === g.roteiro_id)?.status ?? ""
                    ] ?? g.status}
                  </Button>
                </div>
              ))}
              {editavel && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Selecione roteiros aprovados. A ordem abaixo será a ordem da
                    gravação.
                  </p>
                  {itens
                    .filter(
                      (i) =>
                        i.tipo === "roteiro" &&
                        ["aguardando_gravacao", "gravado", "edicao"].includes(
                          i.status,
                        ),
                    )
                    .map((r) => (
                      <label
                        key={r.id}
                        className="flex gap-2 items-center text-sm"
                      >
                        <Checkbox
                          checked={roteiros.includes(r.id)}
                          onCheckedChange={(v) =>
                            setRoteiros(
                              v
                                ? [...roteiros, r.id]
                                : roteiros.filter((id) => id !== r.id),
                            )
                          }
                        />
                        {r.titulo}
                        {roteiros.includes(r.id) &&
                          ` (${roteiros.indexOf(r.id) + 1}º)`}
                      </label>
                    ))}
                  <Button
                    disabled={busy}
                    onClick={() => agir("gravacao", { roteiros })}
                  >
                    Salvar seleção e ordem
                  </Button>
                </>
              )}
            </div>
          )}
          {publicar && ctx.permissoes.editar && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold">Registrar publicação manual</h3>
              <Label>Link da publicação</Label>
              <Input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
              />
              <Label>Data e horário efetivos</Label>
              <Input
                type="datetime-local"
                value={publicado}
                onChange={(e) => setPublicado(e.target.value)}
              />
              <Button
                disabled={busy || !linkSeguro(link) || !publicado}
                onClick={() =>
                  agir("publicar", {
                    link_publicacao: link,
                    publicado_em: new Date(publicado).toISOString(),
                  })
                }
              >
                Registrar como publicado
              </Button>
            </div>
          )}
          {item.status === "publicado" &&
            linkSeguro(item.dados.link_publicacao ?? "") && (
              <a
                className="text-primary underline"
                href={item.dados.link_publicacao}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir publicação ·{" "}
                {new Date(item.dados.publicado_em).toLocaleString("pt-BR")}
              </a>
            )}
          {metricasPermitidas && ctx.permissoes.editar && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold">
                Resultados informados manualmente
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  "alcance",
                  "visualizacoes",
                  "interacoes",
                  "contatos",
                  "oportunidades",
                  "curtidas",
                  "comentarios",
                  "compartilhamentos",
                  "salvamentos",
                ].map((k) => (
                  <div key={k}>
                    <Label className="capitalize">{k}</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={metricas[k] ?? 0}
                      onChange={(e) =>
                        setMetricas({
                          ...metricas,
                          [k]: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => agir("metricas", { metricas })}
              >
                Salvar métricas
              </Button>
            </div>
          )}
          {item.tipo === "campanha" && ctx.permissoes.financeiro && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold">
                Orçamento e gasto — acesso financeiro autorizado
              </h3>
              <p className="text-sm">
                Previsto: {financeiro.data?.[0]?.orcamento ?? 0} · Realizado:{" "}
                {financeiro.data?.[0]?.gasto ?? 0}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Orçamento (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={orcamento}
                    onChange={(e) => setOrcamento(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Gasto efetivo (R$)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={gasto}
                    onChange={(e) => setGasto(e.target.value)}
                  />
                </div>
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  agir("financeiro", {
                    orcamento: Number(orcamento),
                    gasto: Number(gasto),
                  })
                }
              >
                Salvar valores
              </Button>
            </div>
          )}
          <div className="border-t pt-4 space-y-3">
            <h3 className="font-semibold">Comentários</h3>
            {hist.error && (
              <p className="text-destructive text-sm">
                Não foi possível carregar o histórico.
              </p>
            )}
            {hist.data?.comentarios.map((c: any) => (
              <div key={c.id} className="rounded-md bg-muted p-3 text-sm">
                <strong>{nome(c.usuario_id)}</strong> ·{" "}
                {new Date(c.criado_em).toLocaleString("pt-BR")}
                <p className="whitespace-pre-wrap">{c.texto}</p>
              </div>
            ))}
            {ctx.permissoes.editar && (
              <>
                <Textarea
                  aria-label="Novo comentário"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Comentário para a equipe"
                />
                <Button
                  disabled={busy || !texto.trim()}
                  variant="outline"
                  onClick={() => agir("comentario", { texto })}
                >
                  Comentar
                </Button>
              </>
            )}
          </div>
          <div className="border-t pt-4 space-y-2">
            <h3 className="font-semibold">Histórico de versões e decisões</h3>
            {hist.data?.versoes.map((v: any) => (
              <details key={v.id} className="border rounded-md p-3 text-sm">
                <summary className="cursor-pointer">
                  Versão {v.versao} ·{" "}
                  {v.etapa === "roteiro" ? "Roteiro" : "Material final"} ·{" "}
                  {new Date(v.criado_em).toLocaleString("pt-BR")}
                </summary>
                <p className="mt-2 whitespace-pre-wrap">
                  {v.snapshot.descricao}
                </p>
                {Object.entries(v.snapshot.dados ?? {})
                  .filter(([, valor]) => typeof valor === "string")
                  .map(([k, valor]) => (
                    <p key={k} className="mt-2 whitespace-pre-wrap break-words">
                      <strong>{k}: </strong>
                      {String(valor).replace(/<[^>]*>/g, " ")}
                    </p>
                  ))}
              </details>
            ))}
            {hist.data?.decisoes.map((d: any) => (
              <p key={d.id} className="text-sm">
                v{d.versao} · {d.etapa} · {STATUS[d.resultado]} ·{" "}
                {nome(d.usuario_id)} ·{" "}
                {new Date(d.criado_em).toLocaleString("pt-BR")} —{" "}
                {d.justificativa || "Aprovado sem ressalvas"}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              O histórico permanece disponível após arquivamento. A aprovação
              corresponde à versão registrada; confira se o arquivo externo
              permaneceu igual.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
