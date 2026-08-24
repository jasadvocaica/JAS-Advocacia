import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WhatsAppMsgModal, type MensagemItem } from "@/components/whatsapp/WhatsAppMsgModal";
import {
  TIPOS_PARCEIRO, TIPOS_CLIENTE,
  parceiroNovaTarefa, parceiroAtualizacaoProcesso, parceiroPericiaAgendada,
  parceiroBeneficioDeferido, parceiroAudienciaMarcada, parceiroSentencaRecebida,
  parceiroRepasse, parceiroPrazoUrgente,
  clienteBoasVindas, clienteRequerimentoProtocolado, clientePericiaAgendada,
  clienteBeneficioDeferido, clienteBeneficioNegadoJudicial, clientePeticaoProtocolada,
  clienteAudienciaMarcada, clienteSentencaFavoravel, clienteSentencaDesfavoravel,
  clienteCobrancaHonorarios, clienteSolicitacaoDocumentos, clienteAtualizacaoProcesso,
  clienteRevisaoBienalBPC, clienteOrientacaoPosConcessao,
  type TipoMsgParceiro, type TipoMsgCliente,
} from "@/lib/whatsapp-mensagens";

interface SimplObj { id: string; nome: string; whatsapp?: string | null }
interface ProcessoObj { id: string; numero_cnj: string | null; nb_inss: string | null; cliente_id: string | null; tipo_acao: string | null }

const STORAGE_KEY = "whatsapp-hub-campos-v1";

function loadCampos(): Record<string, Record<string, any>> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function saveCampos(tipo: string, valores: Record<string, any>) {
  const all = loadCampos();
  all[tipo] = valores;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export default function ComunicacaoWhatsApp() {
  const [aba, setAba] = useState<"parceiros" | "clientes">("parceiros");

  // ── PARCEIROS ───────────────────────────────────────
  const [parceiros, setParceiros] = useState<SimplObj[]>([]);
  const [parceiroId, setParceiroId] = useState<string>("");
  const [tipoParc, setTipoParc] = useState<TipoMsgParceiro | "">("");
  const [camposParc, setCamposParc] = useState<Record<string, any>>({});
  const [numeroProcessoParc, setNumeroProcessoParc] = useState("");
  const [tipoAcaoParc, setTipoAcaoParc] = useState("");
  const [clienteNomeParc, setClienteNomeParc] = useState("");

  // ── CLIENTES ────────────────────────────────────────
  const [clientes, setClientes] = useState<SimplObj[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [processosCliente, setProcessosCliente] = useState<ProcessoObj[]>([]);
  const [processoIdCli, setProcessoIdCli] = useState<string>("");
  const [tipoCli, setTipoCli] = useState<TipoMsgCliente | "">("");
  const [camposCli, setCamposCli] = useState<Record<string, any>>({});

  // ── Modal ───────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [mensagensModal, setMensagensModal] = useState<MensagemItem[]>([]);
  const [tituloModal, setTituloModal] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pRes, cRes] = await Promise.all([
        supabase.from("parceiros").select("id, nome, whatsapp").eq("ativo", true).order("nome"),
        supabase.from("clientes").select("id, nome, whatsapp").eq("ativo", true).order("nome").limit(500),
      ]);
      setParceiros((pRes.data as any[]) ?? []);
      setClientes((cRes.data as any[]) ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!clienteId) { setProcessosCliente([]); setProcessoIdCli(""); return; }
    (async () => {
      const { data } = await supabase
        .from("processos")
        .select("id, numero_cnj, nb_inss, cliente_id, tipo_acao")
        .eq("cliente_id", clienteId)
        .order("criado_em", { ascending: false });
      setProcessosCliente((data as any[]) ?? []);
    })();
  }, [clienteId]);

  // Restaura campos salvos por tipo
  useEffect(() => {
    if (!tipoParc) return;
    const saved = loadCampos()[`p_${tipoParc}`];
    if (saved) setCamposParc(saved);
    else setCamposParc({});
  }, [tipoParc]);
  useEffect(() => {
    if (!tipoCli) return;
    const saved = loadCampos()[`c_${tipoCli}`];
    if (saved) setCamposCli(saved);
    else setCamposCli({});
  }, [tipoCli]);

  const setValParc = (k: string, v: any) => setCamposParc((p) => ({ ...p, [k]: v }));
  const setValCli = (k: string, v: any) => setCamposCli((p) => ({ ...p, [k]: v }));

  const gerarParceiro = () => {
    const p = parceiros.find((x) => x.id === parceiroId);
    if (!p) { toast.error("Selecione um parceiro"); return; }
    if (!tipoParc) { toast.error("Selecione o tipo de mensagem"); return; }
    const ctx = {
      numeroProcesso: numeroProcessoParc || null,
      tipoAcao: tipoAcaoParc || null,
      cliente: clienteNomeParc || null,
    };
    let msg = "";
    try {
      switch (tipoParc) {
        case "nova_tarefa":
          msg = parceiroNovaTarefa({ parceiro: p, titulo: camposParc.titulo, ...ctx, dataVencimento: camposParc.dataVencimento, prioridade: camposParc.prioridade });
          break;
        case "atualizacao":
          msg = parceiroAtualizacaoProcesso({ parceiro: p, ...ctx, descricao: camposParc.descricao, proximoPasso: camposParc.proximoPasso });
          break;
        case "pericia":
          msg = parceiroPericiaAgendada({ parceiro: p, ...ctx, dataPericia: camposParc.dataPericia, local: camposParc.local });
          break;
        case "beneficio_deferido":
          msg = parceiroBeneficioDeferido({ parceiro: p, ...ctx, nb: camposParc.nb, dib: camposParc.dib });
          break;
        case "audiencia":
          msg = parceiroAudienciaMarcada({ parceiro: p, ...ctx, dataAudiencia: camposParc.dataAudiencia, tipo: camposParc.tipo, local: camposParc.local });
          break;
        case "sentenca":
          msg = parceiroSentencaRecebida({ parceiro: p, ...ctx, resultado: camposParc.resultado || "favoravel", prazoRecurso: camposParc.prazoRecurso });
          break;
        case "repasse":
          msg = parceiroRepasse({ parceiro: p, ...ctx, valor: Number(camposParc.valor) || 0 });
          break;
        case "prazo_urgente":
          msg = parceiroPrazoUrgente({ parceiro: p, ...ctx, titulo: camposParc.titulo, dataVencimento: camposParc.dataVencimento });
          break;
      }
    } catch (e: any) { toast.error("Erro ao gerar: " + e.message); return; }
    saveCampos(`p_${tipoParc}`, camposParc);
    setMensagensModal([{ id: "1", nome: p.nome, whatsapp: p.whatsapp, mensagem: msg }]);
    setTituloModal(TIPOS_PARCEIRO.find((t) => t.id === tipoParc)?.label || "Mensagem");
    setModalOpen(true);
  };

  const gerarCliente = () => {
    const c = clientes.find((x) => x.id === clienteId);
    if (!c) { toast.error("Selecione um cliente"); return; }
    if (!tipoCli) { toast.error("Selecione o tipo de mensagem"); return; }
    let msg = "";
    try {
      switch (tipoCli) {
        case "boas_vindas": msg = clienteBoasVindas({ cliente: c }); break;
        case "requerimento_protocolado":
          msg = clienteRequerimentoProtocolado({ cliente: c, nb: camposCli.nb, der: camposCli.der }); break;
        case "pericia":
          msg = clientePericiaAgendada({ cliente: c, dataPericia: camposCli.dataPericia, local: camposCli.local }); break;
        case "beneficio_deferido":
          msg = clienteBeneficioDeferido({ cliente: c, nb: camposCli.nb, dib: camposCli.dib, valor: camposCli.valor ? Number(camposCli.valor) : null }); break;
        case "beneficio_negado_judicial":
          msg = clienteBeneficioNegadoJudicial({ cliente: c }); break;
        case "peticao_protocolada":
          msg = clientePeticaoProtocolada({ cliente: c, numeroCNJ: camposCli.numeroCNJ }); break;
        case "audiencia":
          msg = clienteAudienciaMarcada({ cliente: c, dataAudiencia: camposCli.dataAudiencia, tipo: camposCli.tipo, local: camposCli.local }); break;
        case "sentenca_favoravel":
          msg = clienteSentencaFavoravel({ cliente: c, resumo: camposCli.resumo }); break;
        case "sentenca_desfavoravel":
          msg = clienteSentencaDesfavoravel({ cliente: c }); break;
        case "cobranca":
          msg = clienteCobrancaHonorarios({ cliente: c, valor: Number(camposCli.valor) || 0, vencimento: camposCli.vencimento }); break;
        case "solicitar_docs": {
          const docs = (camposCli.documentos || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
          msg = clienteSolicitacaoDocumentos({ cliente: c, documentos: docs }); break;
        }
        case "atualizacao":
          msg = clienteAtualizacaoProcesso({ cliente: c, descricao: camposCli.descricao, proximoPasso: camposCli.proximoPasso }); break;
        case "revisao_bienal":
          msg = clienteRevisaoBienalBPC({ cliente: c, dataRevisao: camposCli.dataRevisao }); break;
        case "orientacao_pos_concessao":
          msg = clienteOrientacaoPosConcessao({ cliente: c }); break;
      }
    } catch (e: any) { toast.error("Erro: " + e.message); return; }
    saveCampos(`c_${tipoCli}`, camposCli);
    setMensagensModal([{ id: "1", nome: c.nome, whatsapp: c.whatsapp, mensagem: msg }]);
    setTituloModal(TIPOS_CLIENTE.find((t) => t.id === tipoCli)?.label || "Mensagem");
    setModalOpen(true);
  };

  // Renderizadores de campos por tipo
  const renderCamposParceiro = () => {
    if (!tipoParc) return null;
    return (
      <div className="space-y-3">
        {(tipoParc === "nova_tarefa" || tipoParc === "prazo_urgente") && (
          <div>
            <Label className="text-xs">Título / descrição da tarefa{tipoParc === "prazo_urgente" && " *"}</Label>
            <Input value={camposParc.titulo ?? ""} onChange={(e) => setValParc("titulo", e.target.value)} />
          </div>
        )}
        {tipoParc === "nova_tarefa" && (
          <>
            <div>
              <Label className="text-xs">Data de vencimento</Label>
              <Input type="date" value={camposParc.dataVencimento ?? ""} onChange={(e) => setValParc("dataVencimento", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={camposParc.prioridade ?? ""} onValueChange={(v) => setValParc("prioridade", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {["baixa", "media", "alta", "urgente"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {tipoParc === "prazo_urgente" && (
          <div>
            <Label className="text-xs">Vencimento *</Label>
            <Input type="date" value={camposParc.dataVencimento ?? ""} onChange={(e) => setValParc("dataVencimento", e.target.value)} />
          </div>
        )}
        {tipoParc === "atualizacao" && (
          <>
            <div>
              <Label className="text-xs">O que aconteceu *</Label>
              <Textarea rows={3} value={camposParc.descricao ?? ""} onChange={(e) => setValParc("descricao", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Próximo passo</Label>
              <Textarea rows={2} value={camposParc.proximoPasso ?? ""} onChange={(e) => setValParc("proximoPasso", e.target.value)} />
            </div>
          </>
        )}
        {tipoParc === "pericia" && (
          <>
            <div>
              <Label className="text-xs">Data da perícia *</Label>
              <Input type="date" value={camposParc.dataPericia ?? ""} onChange={(e) => setValParc("dataPericia", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Local</Label>
              <Input value={camposParc.local ?? ""} onChange={(e) => setValParc("local", e.target.value)} />
            </div>
          </>
        )}
        {tipoParc === "beneficio_deferido" && (
          <>
            <div>
              <Label className="text-xs">NB</Label>
              <Input value={camposParc.nb ?? ""} onChange={(e) => setValParc("nb", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">DIB</Label>
              <Input type="date" value={camposParc.dib ?? ""} onChange={(e) => setValParc("dib", e.target.value)} />
            </div>
          </>
        )}
        {tipoParc === "audiencia" && (
          <>
            <div>
              <Label className="text-xs">Data da audiência *</Label>
              <Input type="date" value={camposParc.dataAudiencia ?? ""} onChange={(e) => setValParc("dataAudiencia", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo (Conciliação, Instrução…)</Label>
              <Input value={camposParc.tipo ?? ""} onChange={(e) => setValParc("tipo", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Local ou link</Label>
              <Input value={camposParc.local ?? ""} onChange={(e) => setValParc("local", e.target.value)} />
            </div>
          </>
        )}
        {tipoParc === "sentenca" && (
          <>
            <div>
              <Label className="text-xs">Resultado *</Label>
              <Select value={camposParc.resultado ?? ""} onValueChange={(v) => setValParc("resultado", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {["favoravel", "parcial", "desfavoravel"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Prazo para recurso</Label>
              <Input type="date" value={camposParc.prazoRecurso ?? ""} onChange={(e) => setValParc("prazoRecurso", e.target.value)} />
            </div>
          </>
        )}
        {tipoParc === "repasse" && (
          <div>
            <Label className="text-xs">Valor (R$) *</Label>
            <Input type="number" step="0.01" value={camposParc.valor ?? ""} onChange={(e) => setValParc("valor", e.target.value)} />
          </div>
        )}
      </div>
    );
  };

  const renderCamposCliente = () => {
    if (!tipoCli) return null;
    return (
      <div className="space-y-3">
        {tipoCli === "requerimento_protocolado" && (
          <>
            <div>
              <Label className="text-xs">NB</Label>
              <Input value={camposCli.nb ?? ""} onChange={(e) => setValCli("nb", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">DER</Label>
              <Input type="date" value={camposCli.der ?? ""} onChange={(e) => setValCli("der", e.target.value)} />
            </div>
          </>
        )}
        {tipoCli === "pericia" && (
          <>
            <div><Label className="text-xs">Data *</Label>
              <Input type="date" value={camposCli.dataPericia ?? ""} onChange={(e) => setValCli("dataPericia", e.target.value)} /></div>
            <div><Label className="text-xs">Local</Label>
              <Input value={camposCli.local ?? ""} onChange={(e) => setValCli("local", e.target.value)} /></div>
          </>
        )}
        {tipoCli === "beneficio_deferido" && (
          <>
            <div><Label className="text-xs">NB</Label><Input value={camposCli.nb ?? ""} onChange={(e) => setValCli("nb", e.target.value)} /></div>
            <div><Label className="text-xs">DIB</Label><Input type="date" value={camposCli.dib ?? ""} onChange={(e) => setValCli("dib", e.target.value)} /></div>
            <div><Label className="text-xs">Valor mensal (R$)</Label><Input type="number" step="0.01" value={camposCli.valor ?? ""} onChange={(e) => setValCli("valor", e.target.value)} /></div>
          </>
        )}
        {tipoCli === "peticao_protocolada" && (
          <div><Label className="text-xs">Número CNJ *</Label><Input value={camposCli.numeroCNJ ?? ""} onChange={(e) => setValCli("numeroCNJ", e.target.value)} /></div>
        )}
        {tipoCli === "audiencia" && (
          <>
            <div><Label className="text-xs">Data *</Label><Input type="date" value={camposCli.dataAudiencia ?? ""} onChange={(e) => setValCli("dataAudiencia", e.target.value)} /></div>
            <div><Label className="text-xs">Tipo</Label><Input value={camposCli.tipo ?? ""} onChange={(e) => setValCli("tipo", e.target.value)} /></div>
            <div><Label className="text-xs">Local</Label><Input value={camposCli.local ?? ""} onChange={(e) => setValCli("local", e.target.value)} /></div>
          </>
        )}
        {tipoCli === "sentenca_favoravel" && (
          <div><Label className="text-xs">Resumo da decisão</Label><Textarea rows={3} value={camposCli.resumo ?? ""} onChange={(e) => setValCli("resumo", e.target.value)} /></div>
        )}
        {tipoCli === "cobranca" && (
          <>
            <div><Label className="text-xs">Valor (R$) *</Label><Input type="number" step="0.01" value={camposCli.valor ?? ""} onChange={(e) => setValCli("valor", e.target.value)} /></div>
            <div><Label className="text-xs">Vencimento *</Label><Input type="date" value={camposCli.vencimento ?? ""} onChange={(e) => setValCli("vencimento", e.target.value)} /></div>
          </>
        )}
        {tipoCli === "solicitar_docs" && (
          <div>
            <Label className="text-xs">Documentos (um por linha) *</Label>
            <Textarea rows={4} value={camposCli.documentos ?? ""} onChange={(e) => setValCli("documentos", e.target.value)}
              placeholder="Ex:&#10;Laudo médico atualizado&#10;Comprovante de residência" />
          </div>
        )}
        {tipoCli === "atualizacao" && (
          <>
            <div><Label className="text-xs">O que aconteceu *</Label><Textarea rows={3} value={camposCli.descricao ?? ""} onChange={(e) => setValCli("descricao", e.target.value)} /></div>
            <div><Label className="text-xs">Próximo passo</Label><Textarea rows={2} value={camposCli.proximoPasso ?? ""} onChange={(e) => setValCli("proximoPasso", e.target.value)} /></div>
          </>
        )}
        {tipoCli === "revisao_bienal" && (
          <div><Label className="text-xs">Data da revisão *</Label><Input type="date" value={camposCli.dataRevisao ?? ""} onChange={(e) => setValCli("dataRevisao", e.target.value)} /></div>
        )}
        {(tipoCli === "boas_vindas" || tipoCli === "beneficio_negado_judicial" || tipoCli === "sentenca_desfavoravel" || tipoCli === "orientacao_pos_concessao") && (
          <p className="text-xs text-muted-foreground">Esta mensagem não requer campos extras.</p>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Gerador de Mensagens WhatsApp"
        description="Crie mensagens prontas para colar no grupo do parceiro ou na conversa do cliente. Nada é enviado automaticamente."
      />

      <Tabs value={aba} onValueChange={(v) => setAba(v as any)} className="mt-4">
        <TabsList>
          <TabsTrigger value="parceiros">Parceiros</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="parceiros">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Parceiro *</Label>
                <Select value={parceiroId} onValueChange={setParceiroId} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? "Carregando..." : "Selecione o parceiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    {parceiros.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo de mensagem *</Label>
                <Select value={tipoParc} onValueChange={(v) => setTipoParc(v as TipoMsgParceiro)}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_PARCEIRO.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.emoji} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-3">Contexto do processo (opcional, aparece na mensagem)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Número do processo (CNJ ou NB)</Label>
                  <Input value={numeroProcessoParc} onChange={(e) => setNumeroProcessoParc(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Tipo / área da ação</Label>
                  <Input value={tipoAcaoParc} onChange={(e) => setTipoAcaoParc(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Input value={clienteNomeParc} onChange={(e) => setClienteNomeParc(e.target.value)} />
                </div>
              </div>
            </div>

            {tipoParc && (
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-3">Dados específicos da mensagem</p>
                {renderCamposParceiro()}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={gerarParceiro} style={{ background: "#25D366", color: "white" }}>
                <MessageCircle className="w-4 h-4 mr-2" />
                Gerar mensagem
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="clientes">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cliente *</Label>
                <Select value={clienteId} onValueChange={setClienteId} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue placeholder={loading ? "Carregando..." : "Selecione o cliente"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Processo (opcional)</Label>
                <Select value={processoIdCli} onValueChange={setProcessoIdCli} disabled={!clienteId || processosCliente.length === 0}>
                  <SelectTrigger>
                    <SelectValue placeholder={!clienteId ? "Selecione um cliente primeiro" : processosCliente.length === 0 ? "Sem processos" : "Selecione..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {processosCliente.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.numero_cnj || p.nb_inss || p.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Tipo de mensagem *</Label>
              <Select value={tipoCli} onValueChange={(v) => setTipoCli(v as TipoMsgCliente)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {TIPOS_CLIENTE.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.emoji} {t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tipoCli && (
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-3">Dados específicos da mensagem</p>
                {renderCamposCliente()}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={gerarCliente} style={{ background: "#25D366", color: "white" }}>
                <MessageCircle className="w-4 h-4 mr-2" />
                Gerar mensagem
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <WhatsAppMsgModal open={modalOpen} onOpenChange={setModalOpen} titulo={tituloModal} mensagens={mensagensModal} />
    </div>
  );
}
