// Aba "Portal" na ficha do cliente.
// - Mostra status do acesso (ativado ou não)
// - Botão "Ativar portal" / "Resetar senha" → chama edge function ativar-portal-cliente
// - Toggle "Mostrar financeiro" no portal
// - Lista processos do cliente com switch de visibilidade (cliente_portal_processos)
// - Lista contratos com switch (quando mostrar_financeiro está ligado)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, KeyRound, RefreshCw, Copy, ShieldCheck, ShieldOff, ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";

interface Props {
  clienteId: string;
  clienteNome: string;
}

interface Vinculo {
  id: string;
  email: string;
  ativo: boolean;
  primeiro_acesso: boolean;
  mostrar_financeiro: boolean;
  ultimo_acesso: string | null;
  user_id: string | null;
}

interface ProcessoLib {
  id: string;
  numero_cnj: string | null;
  tipo_acao: string | null;
  visivel: boolean;
  liberacao_id: string | null;
  resumo_cliente: string | null;
}

interface ContratoLib {
  id: string;
  tipo: string;
  status: string;
  valor_fixo: number | null;
  visivel: boolean;
  liberacao_id: string | null;
}

export default function PortalTab({ clienteId, clienteNome }: Props) {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [processos, setProcessos] = useState<ProcessoLib[]>([]);
  const [contratos, setContratos] = useState<ContratoLib[]>([]);
  const [credenciaisGeradas, setCredenciaisGeradas] = useState<{ cpf: string; senha: string } | null>(null);

  const carregar = async () => {
    setLoading(true);
    const [vinRes, procsRes, libsRes, contRes, libsFinRes] = await Promise.all([
      supabase.from("cliente_usuarios").select("*").eq("cliente_id", clienteId).maybeSingle(),
      supabase.from("processos").select("id, numero_cnj, tipo_acao").eq("cliente_id", clienteId),
      supabase.from("cliente_portal_processos").select("id, processo_id, visivel, resumo_cliente").eq("cliente_id", clienteId),
      supabase.from("honorarios_contratos").select("id, tipo, status, valor_fixo").eq("cliente_id", clienteId),
      supabase.from("cliente_portal_financeiro").select("id, contrato_id, visivel").eq("cliente_id", clienteId),
    ]);

    setVinculo((vinRes.data as any) ?? null);

    const libsMap = new Map((libsRes.data as any[] ?? []).map(l => [l.processo_id, l]));
    setProcessos((procsRes.data as any[] ?? []).map(p => {
      const lib = libsMap.get(p.id);
      return {
        id: p.id,
        numero_cnj: p.numero_cnj,
        tipo_acao: p.tipo_acao,
        visivel: lib ? lib.visivel : true,
        liberacao_id: lib?.id ?? null,
        resumo_cliente: lib?.resumo_cliente ?? null,
      };
    }));

    const finMap = new Map((libsFinRes.data as any[] ?? []).map(l => [l.contrato_id, l]));
    setContratos((contRes.data as any[] ?? []).map(c => {
      const lib = finMap.get(c.id);
      return {
        id: c.id,
        tipo: c.tipo,
        status: c.status,
        valor_fixo: c.valor_fixo,
        visivel: lib ? lib.visivel : true,
        liberacao_id: lib?.id ?? null,
      };
    }));

    setLoading(false);
  };

  useEffect(() => { carregar(); }, [clienteId]);

  const ativar = async (resetar = false) => {
    setSalvando(true);
    setCredenciaisGeradas(null);
    const { data, error } = await supabase.functions.invoke("ativar-portal-cliente", {
      body: {
        cliente_ids: [clienteId],
        mostrar_financeiro: vinculo?.mostrar_financeiro ?? false,
        resetar_senha: resetar,
      },
    });
    setSalvando(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    const r = data?.resultados?.[0];
    if (!r) { toast.error("Resposta inválida"); return; }
    if (r.status === "erro") { toast.error(r.mensagem || "Falha ao ativar"); return; }
    if (r.senha) {
      setCredenciaisGeradas({ cpf: r.cpf, senha: r.senha });
    }
    toast.success(
      r.status === "ativado" ? "Portal ativado!"
      : r.status === "senha_resetada" ? "Senha resetada!"
      : "Portal já estava ativo"
    );
    await carregar();
  };

  const toggleFinanceiro = async (v: boolean) => {
    if (!vinculo) return;
    const { error } = await supabase
      .from("cliente_usuarios")
      .update({ mostrar_financeiro: v })
      .eq("id", vinculo.id);
    if (error) { toast.error(error.message); return; }
    setVinculo({ ...vinculo, mostrar_financeiro: v });
    toast.success(v ? "Financeiro liberado" : "Financeiro ocultado");
  };

  const toggleAtivo = async (v: boolean) => {
    if (!vinculo) return;
    const { error } = await supabase
      .from("cliente_usuarios")
      .update({ ativo: v })
      .eq("id", vinculo.id);
    if (error) { toast.error(error.message); return; }
    setVinculo({ ...vinculo, ativo: v });
    toast.success(v ? "Acesso reativado" : "Acesso suspenso");
  };

  const toggleProcesso = async (proc: ProcessoLib, novoVisivel: boolean) => {
    if (proc.liberacao_id) {
      const { error } = await supabase.from("cliente_portal_processos")
        .update({ visivel: novoVisivel }).eq("id", proc.liberacao_id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("cliente_portal_processos")
        .insert({ cliente_id: clienteId, processo_id: proc.id, visivel: novoVisivel })
        .select("id").single();
      if (error) { toast.error(error.message); return; }
      proc.liberacao_id = data.id;
    }
    setProcessos(processos.map(p => p.id === proc.id ? { ...p, visivel: novoVisivel } : p));
  };

  const salvarResumo = async (proc: ProcessoLib, texto: string) => {
    if (proc.liberacao_id) {
      const { error } = await supabase.from("cliente_portal_processos")
        .update({ resumo_cliente: texto || null }).eq("id", proc.liberacao_id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("cliente_portal_processos")
        .insert({ cliente_id: clienteId, processo_id: proc.id, visivel: true, resumo_cliente: texto || null })
        .select("id").single();
      if (error) { toast.error(error.message); return; }
      proc.liberacao_id = data.id;
    }
    setProcessos(processos.map(p => p.id === proc.id ? { ...p, resumo_cliente: texto || null, liberacao_id: proc.liberacao_id } : p));
    toast.success("Resumo salvo");
  };



  const toggleContrato = async (c: ContratoLib, novoVisivel: boolean) => {
    if (c.liberacao_id) {
      const { error } = await supabase.from("cliente_portal_financeiro")
        .update({ visivel: novoVisivel }).eq("id", c.liberacao_id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("cliente_portal_financeiro")
        .insert({ cliente_id: clienteId, contrato_id: c.id, visivel: novoVisivel })
        .select("id").single();
      if (error) { toast.error(error.message); return; }
      c.liberacao_id = data.id;
    }
    setContratos(contratos.map(x => x.id === c.id ? { ...x, visivel: novoVisivel } : x));
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Copiado");
  };

  if (loading) return <Card className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></Card>;

  return (
    <div className="space-y-4">
      {/* STATUS / ATIVAÇÃO */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg">Acesso ao Portal</h3>
              {vinculo
                ? <Badge variant={vinculo.ativo ? "default" : "secondary"}>{vinculo.ativo ? "Ativo" : "Suspenso"}</Badge>
                : <Badge variant="outline">Não ativado</Badge>}
            </div>
            {vinculo && (
              <p className="text-sm text-muted-foreground mt-1">
                Login: <span className="font-mono">{vinculo.email}</span>
                {vinculo.ultimo_acesso && <> · Último acesso {new Date(vinculo.ultimo_acesso).toLocaleString("pt-BR")}</>}
                {vinculo.primeiro_acesso && <> · <Badge variant="outline" className="ml-1">Aguardando primeiro login</Badge></>}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!vinculo
              ? <Button onClick={() => ativar(false)} disabled={salvando} variant="gold">
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Ativar portal
                </Button>
              : <>
                  <Button onClick={() => ativar(true)} disabled={salvando} variant="outline" size="sm">
                    {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Resetar senha
                  </Button>
                  <Button onClick={() => toggleAtivo(!vinculo.ativo)} variant="ghost" size="sm">
                    {vinculo.ativo ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    {vinculo.ativo ? "Suspender" : "Reativar"}
                  </Button>
                </>}
          </div>
        </div>

        {credenciaisGeradas && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
            <p className="text-sm font-medium">Credenciais geradas — copie e envie ao cliente:</p>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">CPF:</span>
                <span className="font-mono">{credenciaisGeradas.cpf}</span>
                <Button size="sm" variant="ghost" onClick={() => copiar(credenciaisGeradas.cpf)}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Senha:</span>
                <span className="font-mono">{credenciaisGeradas.senha}</span>
                <Button size="sm" variant="ghost" onClick={() => copiar(credenciaisGeradas.senha)}><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">No primeiro acesso o cliente será solicitado a alterar a senha.</p>
          </div>
        )}

        {vinculo && (
          <div className="flex items-center gap-3 pt-2 border-t border-border/40">
            <Switch checked={vinculo.mostrar_financeiro} onCheckedChange={toggleFinanceiro} />
            <Label className="cursor-pointer">Mostrar área financeira ao cliente (contratos, parcelas e pagamentos)</Label>
          </div>
        )}

        <AutorizaWhatsappParceiro clienteId={clienteId} />
      </Card>

      {/* PROCESSOS */}
      <Card className="p-6 space-y-3">
        <div>
          <h3 className="font-display text-lg">Processos visíveis no portal</h3>
          <p className="text-xs text-muted-foreground">Por padrão todos ficam visíveis. Desative para ocultar.</p>
        </div>
        {processos.length === 0
          ? <p className="text-sm text-muted-foreground">Nenhum processo cadastrado.</p>
          : <div className="divide-y divide-border/40">
              {processos.map(p => (
                <ProcessoLinhaPortal
                  key={p.id}
                  proc={p}
                  onToggle={(v) => toggleProcesso(p, v)}
                  onSalvarResumo={(texto) => salvarResumo(p, texto)}
                />
              ))}
            </div>}
      </Card>

      {/* CONTRATOS (só se financeiro ligado) */}
      {vinculo?.mostrar_financeiro && (
        <Card className="p-6 space-y-3">
          <div>
            <h3 className="font-display text-lg">Contratos financeiros visíveis</h3>
            <p className="text-xs text-muted-foreground">Liberação individual por contrato.</p>
          </div>
          {contratos.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhum contrato cadastrado.</p>
            : <div className="divide-y divide-border/40">
                {contratos.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 gap-3">
                    <div className="text-sm">
                      <p className="capitalize">{c.tipo} · <Badge variant="outline" className="text-xs">{c.status}</Badge></p>
                      <p className="text-xs text-muted-foreground">
                        {c.valor_fixo ? `R$ ${c.valor_fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                      </p>
                    </div>
                    <Switch checked={c.visivel} onCheckedChange={(v) => toggleContrato(c, v)} />
                  </div>
                ))}
              </div>}
        </Card>
      )}

      {/* ANDAMENTOS POR PROCESSO */}
      <AndamentosLiberacao clienteId={clienteId} processos={processos} />
    </div>
  );
}

// ----------- Linha de processo com editor inline de resumo -----------
function ProcessoLinhaPortal({
  proc, onToggle, onSalvarResumo,
}: {
  proc: ProcessoLib;
  onToggle: (v: boolean) => void;
  onSalvarResumo: (texto: string) => void | Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(proc.resumo_cliente ?? "");
  const dirty = (proc.resumo_cliente ?? "") !== texto;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setAberto(a => !a)}
          className="flex items-center gap-2 text-left text-sm flex-1 min-w-0"
        >
          {aberto ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <div className="min-w-0">
            <p className="font-mono truncate">{proc.numero_cnj || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {proc.tipo_acao || "Sem tipo"}
              {proc.resumo_cliente ? " · resumo do cliente preenchido" : " · sem resumo"}
            </p>
          </div>
        </button>
        <Switch checked={proc.visivel} onCheckedChange={onToggle} />
      </div>
      {aberto && (
        <div className="mt-2 pl-6 space-y-2">
          <Label className="text-xs text-muted-foreground">Resumo do caso (visível ao cliente)</Label>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Estamos pleiteando a aposentadoria por tempo de contribuição. Já enviamos a petição inicial e aguardamos a citação do INSS..."
            rows={4}
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant={dirty ? "default" : "outline"}
              disabled={!dirty}
              onClick={async () => { await onSalvarResumo(texto); }}
            >
              Salvar resumo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------- Liberação de andamentos por processo -----------
interface AndamentoLib {
  id: string;
  descricao: string;
  data: string;
  visivel: boolean;
  liberacao_id: string | null;
  observacao: string;
}

function AndamentosLiberacao({
  clienteId,
  processos,
}: {
  clienteId: string;
  processos: ProcessoLib[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [andamentos, setAndamentos] = useState<AndamentoLib[]>([]);

  const abrir = async (procId: string) => {
    if (aberto === procId) { setAberto(null); return; }
    setAberto(procId); setCarregando(true);
    const [aRes, libRes] = await Promise.all([
      supabase.from("andamentos").select("id, descricao, data").eq("processo_id", procId).order("data", { ascending: false }).limit(100),
      supabase.from("cliente_portal_andamentos").select("id, andamento_id, visivel, observacao_cliente").eq("cliente_id", clienteId),
    ]);
    const libMap = new Map((libRes.data as any[] ?? []).map(l => [l.andamento_id, l]));
    setAndamentos((aRes.data as any[] ?? []).map(a => {
      const l = libMap.get(a.id);
      return {
        id: a.id,
        descricao: a.descricao,
        data: a.data,
        // Default = oculto (cliente só vê quando explicitamente liberado)
        visivel: l ? l.visivel : false,
        liberacao_id: l?.id ?? null,
        observacao: l?.observacao_cliente ?? "",
      };
    }));
    setCarregando(false);
  };

  const toggleAndamento = async (a: AndamentoLib, novoVisivel: boolean) => {
    if (a.liberacao_id) {
      const { error } = await supabase.from("cliente_portal_andamentos")
        .update({ visivel: novoVisivel }).eq("id", a.liberacao_id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("cliente_portal_andamentos")
        .insert({ cliente_id: clienteId, andamento_id: a.id, visivel: novoVisivel })
        .select("id").single();
      if (error) { toast.error(error.message); return; }
      a.liberacao_id = data.id;
    }
    setAndamentos(andamentos.map(x => x.id === a.id ? { ...x, visivel: novoVisivel, liberacao_id: a.liberacao_id } : x));
  };

  const liberarTodos = async (visivel: boolean) => {
    setCarregando(true);
    for (const a of andamentos) {
      if (a.visivel !== visivel) {
        // eslint-disable-next-line no-await-in-loop
        await toggleAndamento(a, visivel);
      }
    }
    setCarregando(false);
    toast.success(visivel ? "Todos liberados" : "Todos ocultados");
  };

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h3 className="font-display text-lg">Andamentos visíveis no portal</h3>
        <p className="text-xs text-muted-foreground">
          Por padrão os andamentos ficam <strong>ocultos</strong> para o cliente. Libere apenas o que faz sentido mostrar para evitar interpretações equivocadas.
        </p>
      </div>
      {processos.length === 0
        ? <p className="text-sm text-muted-foreground">Nenhum processo cadastrado.</p>
        : <div className="divide-y divide-border/40">
            {processos.map(p => (
              <div key={p.id} className="py-2">
                <button
                  onClick={() => abrir(p.id)}
                  className="w-full flex items-center justify-between gap-3 text-left hover:bg-muted/30 px-2 py-1.5 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    {aberto === p.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-mono text-sm">{p.numero_cnj || "—"}</span>
                    <span className="text-xs text-muted-foreground">· {p.tipo_acao || "Sem tipo"}</span>
                  </div>
                  {!p.visivel && <Badge variant="outline" className="text-xs">Processo oculto</Badge>}
                </button>
                {aberto === p.id && (
                  <div className="pl-6 pr-2 pt-2 space-y-2">
                    {carregando
                      ? <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                      : andamentos.length === 0
                        ? <p className="text-xs text-muted-foreground py-2">Sem andamentos cadastrados.</p>
                        : <>
                            <div className="flex gap-2 pb-2">
                              <Button size="sm" variant="outline" onClick={() => liberarTodos(true)}><Eye className="w-3.5 h-3.5" /> Liberar todos</Button>
                              <Button size="sm" variant="ghost" onClick={() => liberarTodos(false)}><EyeOff className="w-3.5 h-3.5" /> Ocultar todos</Button>
                            </div>
                            {andamentos.map(a => (
                              <div key={a.id} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                                <div className="text-sm min-w-0 flex-1">
                                  <p className="text-xs text-muted-foreground">{new Date(a.data).toLocaleDateString("pt-BR")}</p>
                                  <p className="text-xs whitespace-pre-wrap line-clamp-3">{a.descricao}</p>
                                </div>
                                <Switch checked={a.visivel} onCheckedChange={(v) => toggleAndamento(a, v)} />
                              </div>
                            ))}
                          </>}
                  </div>
                )}
              </div>
            ))}
          </div>}
    </Card>
  );
}

function AutorizaWhatsappParceiro({ clienteId }: { clienteId: string }) {
  const [autorizado, setAutorizado] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clientes")
        .select("autoriza_parceiro_ver_whatsapp")
        .eq("id", clienteId)
        .maybeSingle();
      setAutorizado(!!(data as any)?.autoriza_parceiro_ver_whatsapp);
    })();
  }, [clienteId]);

  const toggle = async (v: boolean) => {
    const { error } = await supabase
      .from("clientes")
      .update({ autoriza_parceiro_ver_whatsapp: v })
      .eq("id", clienteId);
    if (error) { toast.error(error.message); return; }
    setAutorizado(v);
    toast.success(v ? "Parceiro autorizado a ver o WhatsApp" : "WhatsApp protegido");
  };

  if (autorizado === null) return null;

  return (
    <div className="flex items-start gap-3 pt-2 border-t border-border/40">
      <Switch checked={autorizado} onCheckedChange={toggle} />
      <div>
        <Label className="cursor-pointer">Autorizar parceiros a verem o WhatsApp do cliente</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Por padrão o contato é protegido. Ative apenas com consentimento do cliente.
        </p>
      </div>
    </div>
  );
}
