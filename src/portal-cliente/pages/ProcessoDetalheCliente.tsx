// Detalhe do processo do cliente — resumo do caso, atualizações curadas e mensagens
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { usePortalCliente } from "../usePortalCliente";
import { maskCnj } from "@/lib/mask-cnj";
import { GLOSSARIO, VIAS_PROCESSUAIS } from "../glossario";

export default function ProcessoDetalheCliente() {
  const { id } = useParams();
  const { clienteId } = usePortalCliente();
  const [proc, setProc] = useState<any>(null);
  const [ficha, setFicha] = useState<any>(null);
  const [fases, setFases] = useState<any[]>([]);
  const [diligencias, setDiligencias] = useState<any[]>([]);
  const [resumoCliente, setResumoCliente] = useState<string | null>(null);
  const [atualizacoesAndamento, setAtualizacoesAndamento] = useState<any[]>([]);
  const [atualizacoes, setAtualizacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [p, fs, lib, libs, atu, dl] = await Promise.all([
        supabase.from("processos").select("id, numero_cnj, tipo_acao, area_direito, status, fase_atual, fase_padrao_id, tribunal, tribunal_nome, vara, cliente_id")
          .eq("id", id).eq("cliente_id", clienteId).maybeSingle(),
        supabase.from("processo_fases_padrao").select("id, nome, cor, ordem").eq("ativo", true).order("ordem"),
        supabase.from("cliente_portal_processos")
          .select("resumo_cliente, visivel, tipo_beneficio, motivo_negativa, cid_codigo, cid_descricao, fase_atual_explicacao, proximas_etapas, via_processual")
          .eq("cliente_id", clienteId).eq("processo_id", id).maybeSingle(),
        supabase.from("cliente_portal_andamentos")
          .select("andamento_id, observacao_cliente, andamentos(id, data, processo_id)")
          .eq("cliente_id", clienteId)
          .eq("visivel", true),
        supabase.from("cliente_portal_atualizacoes").select("*").eq("processo_id", id).eq("publicado", true).order("publicado_em", { ascending: false }),
        supabase.from("checklist_diligencias").select("id, titulo, status, categoria").eq("processo_id", id).eq("visivel_cliente", true).order("ordem"),
      ]);
      setProc(p.data);
      setFases((fs.data as any[]) ?? []);
      setFicha(lib.data ?? null);
      setResumoCliente(((lib.data as any) ?? {}).resumo_cliente ?? null);
      const curados = ((libs.data as any[]) ?? [])
        .filter(l => l.observacao_cliente && l.observacao_cliente.trim().length > 0)
        .map(l => ({
          id: l.andamento_id,
          data: l.andamentos?.data,
          processo_id: l.andamentos?.processo_id,
          texto: l.observacao_cliente,
        }))
        .filter(a => a.processo_id === id)
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      setAtualizacoesAndamento(curados);
      setAtualizacoes((atu.data as any[]) ?? []);
      setDiligencias((dl.data as any[]) ?? []);
      setLoading(false);
    })();
  }, [id, clienteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!proc) return <p className="text-muted-foreground">Processo não disponível.</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" asChild><Link to="/portal-cliente/processos"><ArrowLeft className="w-4 h-4" /> Voltar</Link></Button>

      <Card className="p-6 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground tracking-wider">Seu processo</p>
            <h1 className="font-display text-2xl font-mono">{maskCnj(proc.numero_cnj)}</h1>
            <p className="text-[11px] text-muted-foreground mt-1">Por segurança, ocultamos parte do número. Para qualquer dúvida, fale conosco pela aba Mensagens.</p>
          </div>
          <Badge variant="outline" className="capitalize">{proc.status?.replace(/_/g, " ")}</Badge>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 text-sm pt-2 border-t border-border/40">
          <div><p className="text-xs text-muted-foreground">Tipo</p><p>{proc.tipo_acao || "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Fase atual</p><p>{proc.fase_atual || "—"}</p></div>
        </div>
      </Card>

      {/* Timeline visual de fases padronizadas */}
      {proc.fase_padrao_id && fases.length > 0 && (
        <Card className="p-6 space-y-4">
          <h2 className="font-display text-lg">Etapas do seu processo</h2>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {fases.map((f, i) => {
              const atualOrdem = fases.find(x => x.id === proc.fase_padrao_id)?.ordem ?? 0;
              const isAtual = f.id === proc.fase_padrao_id;
              const concluido = f.ordem < atualOrdem;
              return (
                <div key={f.id} className="flex items-center gap-1 shrink-0">
                  <div className="flex flex-col items-center gap-1 min-w-[80px]">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow"
                      style={{
                        backgroundColor: (isAtual || concluido) ? f.cor : "hsl(var(--muted))",
                        opacity: concluido ? 0.7 : 1,
                        outline: isAtual ? `3px solid ${f.cor}40` : "none",
                      }}
                    >
                      {concluido ? "✓" : f.ordem}
                    </div>
                    <p className={`text-[10px] text-center leading-tight ${isAtual ? "font-semibold" : "text-muted-foreground"}`}>{f.nome}</p>
                  </div>
                  {i < fases.length - 1 && <div className="h-0.5 w-6 bg-border" />}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Sobre o seu caso — ficha humanizada preenchida pelo escritório */}
      {ficha && (ficha.tipo_beneficio || ficha.motivo_negativa || ficha.cid_descricao || ficha.fase_atual_explicacao || ficha.via_processual || (Array.isArray(ficha.proximas_etapas) && ficha.proximas_etapas.length > 0)) && (
        <Card className="p-6 space-y-4">
          <h2 className="font-display text-lg">Sobre o seu caso</h2>

          {ficha.tipo_beneficio && (
            <div>
              <p className="text-xs text-muted-foreground">Tipo de pedido</p>
              <p className="font-medium">{ficha.tipo_beneficio}</p>
            </div>
          )}

          {ficha.via_processual && (() => {
            const v = VIAS_PROCESSUAIS.find(x => x.value === ficha.via_processual);
            if (!v) return null;
            return (
              <div className="border-l-2 border-gold pl-3">
                <p className="text-xs text-muted-foreground">Como seu processo está correndo</p>
                <p className="font-medium">{v.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{v.explicacao}</p>
              </div>
            );
          })()}

          {ficha.motivo_negativa && (
            <div>
              <p className="text-xs text-muted-foreground">Motivo da negativa anterior</p>
              <p className="text-sm whitespace-pre-wrap">{ficha.motivo_negativa}</p>
            </div>
          )}

          {(ficha.cid_codigo || ficha.cid_descricao) && (
            <div>
              <p className="text-xs text-muted-foreground">CID (condição de saúde)</p>
              <p className="text-sm">
                {ficha.cid_codigo && <span className="font-mono mr-2">{ficha.cid_codigo}</span>}
                {ficha.cid_descricao}
              </p>
            </div>
          )}

          {ficha.fase_atual_explicacao && (
            <div>
              <p className="text-xs text-muted-foreground">O que está acontecendo agora</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{ficha.fase_atual_explicacao}</p>
            </div>
          )}

          {Array.isArray(ficha.proximas_etapas) && ficha.proximas_etapas.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Próximas etapas</p>
              <ul className="space-y-1">
                {ficha.proximas_etapas.map((e: string) => (
                  <li key={e} className="text-sm flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gold shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="pt-2 border-t border-border/40">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">📖 Glossário — entenda os termos jurídicos</summary>
            <div className="mt-3 space-y-2">
              {GLOSSARIO.map(g => (
                <div key={g.termo} className="text-sm">
                  <span className="font-medium">{g.termo}:</span>{" "}
                  <span className="text-muted-foreground">{g.traducao}</span>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      {resumoCliente && (
        <Card className="p-6 space-y-2 border-gold/30 bg-gold/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold-dark" />
            <h2 className="font-display text-lg">Resumo do seu caso</h2>
          </div>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{resumoCliente}</p>
        </Card>
      )}

      {diligencias.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2 className="font-display text-lg">O que estamos cuidando</h2>
          <div className="space-y-2">
            {diligencias.map(d => {
              const ok = d.status === "concluido";
              return (
                <div key={d.id} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${ok ? "bg-emerald-500/20 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                    {ok ? "✓" : "•"}
                  </span>
                  <div>
                    <p className={ok ? "line-through text-muted-foreground" : ""}>{d.titulo}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{d.categoria}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {atualizacoes.length > 0 && (
        <Card className="p-6 space-y-3">
          <h2 className="font-display text-lg">Atualizações para você</h2>
          {atualizacoes.map(a => (
            <div key={a.id} className="border-l-2 border-gold pl-3 py-1">
              <p className="text-xs text-muted-foreground">{a.publicado_em && new Date(a.publicado_em).toLocaleDateString("pt-BR")}</p>
              <p className="font-medium">{a.titulo}</p>
              <p className="text-sm whitespace-pre-wrap">{a.texto_simples}</p>
              {a.proximos_passos && <p className="text-sm mt-2"><strong>Próximos passos:</strong> {a.proximos_passos}</p>}
            </div>
          ))}
        </Card>
      )}

      <Card className="p-6 space-y-3">
        <h2 className="font-display text-lg">Linha do tempo do seu processo</h2>
        <p className="text-xs text-muted-foreground">Mostramos aqui apenas as movimentações que o escritório explicou em linguagem simples.</p>
        {atualizacoesAndamento.length === 0
          ? <p className="text-sm text-muted-foreground">Sem novidades por enquanto. Em caso de dúvidas, fale com o escritório pela aba Mensagens.</p>
          : <div className="space-y-2">
              {atualizacoesAndamento.map(a => (
                <div key={a.id} className="text-sm border-b border-border/40 pb-2">
                  <p className="text-xs text-muted-foreground">{a.data && new Date(a.data).toLocaleDateString("pt-BR")}</p>
                  <p className="whitespace-pre-wrap">{a.texto}</p>
                </div>
              ))}
            </div>}
      </Card>
    </div>
  );
}
