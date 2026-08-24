import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search, Wand2, UserPlus, ArrowRight, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { formatCNJ, onlyDigits } from "@/lib/format";
import {
  TRIBUNAIS,
  derivarTribunalDoCNJ,
  validarCNJ,
  validarCNJDigitoVerificador,
  normalizarCNJ,
  tribunalSuportado,
} from "@/lib/datajud";
import { toast } from "sonner";

interface DataJudParte {
  nome: string | null;
  cpf_cnpj: string | null;
  advogado_nome?: string | null;
  advogado_oab?: string | null;
}

interface DataJudPreview {
  numero_cnj: string;
  tribunal_sigla: string;
  tribunal_nome: string | null;
  orgao_julgador: string | null;
  classe: string | null;
  assuntos: { codigo: number; nome: string }[];
  grau: string | null;
  data_ajuizamento: string | null;
  valor_causa: number | null;
  sistema: string | null;
  partes: { ativo: DataJudParte[]; passivo: DataJudParte[] } | null;
  total_movimentos: number;
  ultimo_movimento: { data: string | null; descricao: string | null } | null;
}

interface ClienteMatch {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CadastroAssistidoDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cnjInput, setCnjInput] = useState("");
  const [tribunalManual, setTribunalManual] = useState<string>("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<DataJudPreview | null>(null);
  const [previewFonte, setPreviewFonte] = useState<"datajud" | "pje_comunica">("datajud");
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<string>("");
  const [clientesSugeridos, setClientesSugeridos] = useState<ClienteMatch[]>([]);
  const [criandoCliente, setCriandoCliente] = useState<DataJudParte | null>(null);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteCpf, setNovoClienteCpf] = useState("");
  const [salvandoCliente, setSalvandoCliente] = useState(false);

  const cnjLimpo = onlyDigits(cnjInput);
  const cnjValido = cnjLimpo.length === 20;
  // Detecta entrada apenas-dígitos (usuário colou sem pontuação) para sinalizar a normalização.
  const cnjApenasDigitos = cnjInput.length > 0 && /^\d+$/.test(cnjInput.trim());
  const cnjFormatado = useMemo(() => normalizarCNJ(cnjLimpo), [cnjLimpo]);
  const cnjDvOk = useMemo(
    () => (cnjValido ? validarCNJDigitoVerificador(cnjLimpo) : true),
    [cnjValido, cnjLimpo],
  );
  const tribunalDetectado = useMemo(
    () => (cnjValido ? derivarTribunalDoCNJ(cnjLimpo) : null),
    [cnjValido, cnjLimpo],
  );
  const tribunalEfetivo = tribunalManual || tribunalDetectado || "";
  const tribunalOk = tribunalSuportado(tribunalEfetivo);

  const reset = () => {
    setCnjInput("");
    setTribunalManual("");
    setPreview(null);
    setPreviewFonte("datajud");
    setErro(null);
    setNaoEncontrado(false);
    setClienteSelecionado("");
    setClientesSugeridos([]);
    setCriandoCliente(null);
    setNovoClienteNome("");
    setNovoClienteCpf("");
  };

  const buscarClientesPorPartes = async (partes: { ativo: DataJudParte[] } | null) => {
    if (!partes?.ativo?.length) return [];
    const docs = partes.ativo
      .map((p) => p.cpf_cnpj?.replace(/\D/g, ""))
      .filter((d): d is string => !!d && d.length >= 11);
    const nomes = partes.ativo.map((p) => p.nome).filter((n): n is string => !!n);
    if (docs.length === 0 && nomes.length === 0) return [];
    const filtros: string[] = [];
    if (docs.length > 0) filtros.push(`cpf_cnpj.in.(${docs.join(",")})`);
    nomes.slice(0, 3).forEach((n) => filtros.push(`nome.ilike.%${n}%`));
    const { data } = await supabase
      .from("clientes")
      .select("id, nome, cpf_cnpj")
      .or(filtros.join(","))
      .limit(5);
    return (data ?? []) as ClienteMatch[];
  };

  const handleBuscar = async () => {
    if (!cnjValido) {
      setErro("Informe um CNJ com 20 dígitos.");
      return;
    }
    if (!cnjDvOk) {
      setErro("CNJ inválido: o dígito verificador não confere. Revise o número.");
      return;
    }
    if (!tribunalOk) {
      setErro("Selecione um tribunal suportado pelo DataJud.");
      return;
    }
    // Garante que enviamos sempre o CNJ no formato canônico com pontuação,
    // mesmo que o usuário tenha colado apenas dígitos.
    const numeroParaConsulta = cnjFormatado ?? cnjLimpo;
    // Se a entrada veio só em dígitos, normaliza visualmente o campo.
    if (cnjApenasDigitos && cnjFormatado) {
      setCnjInput(cnjFormatado);
    }
    setBuscando(true);
    setErro(null);
    setPreview(null);
    setNaoEncontrado(false);
    setClientesSugeridos([]);

    try {
      const { data, error } = await supabase.functions.invoke("datajud-consulta", {
        body: {
          modo: "preview",
          numero_cnj: numeroParaConsulta,
          tribunal_sigla: tribunalEfetivo,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let dados: DataJudPreview | null = data?.encontrado ? (data.dados as DataJudPreview) : null;
      let fonte: "datajud" | "pje_comunica" = "datajud";

      // Fallback: se o Datajud não encontrou, tenta o PJe Comunica (CNJ)
      if (!dados) {
        const fb = await supabase.functions.invoke("pje-comunica-consulta", {
          body: { numero_cnj: numeroParaConsulta },
        });
        if (!fb.error && fb.data?.encontrado) {
          dados = fb.data.dados as DataJudPreview;
          fonte = "pje_comunica";
          toast.info("Dados obtidos do PJe Comunica (fallback)", {
            description: "O Datajud não retornou esse processo. Os campos foram preenchidos a partir das publicações públicas.",
          });
        }
      }

      if (!dados) {
        setNaoEncontrado(true);
        return;
      }
      setPreview(dados);
      setPreviewFonte(fonte);
      const sug = await buscarClientesPorPartes(dados.partes);
      setClientesSugeridos(sug);
      if (sug.length === 1) setClienteSelecionado(sug[0].id);
    } catch (err: any) {
      setErro(err?.message ?? "Falha ao consultar o DataJud");
    } finally {
      setBuscando(false);
    }
  };

  const handleAbrirCadastroCliente = (parte: DataJudParte) => {
    setCriandoCliente(parte);
    setNovoClienteNome(parte.nome ?? "");
    setNovoClienteCpf(parte.cpf_cnpj ?? "");
  };

  const handleSalvarCliente = async () => {
    if (!novoClienteNome.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSalvandoCliente(true);
    const cpfLimpo = novoClienteCpf.replace(/\D/g, "") || null;
    const tipoPessoa = cpfLimpo && cpfLimpo.length === 14 ? "juridica" : "fisica";
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nome: novoClienteNome.trim(),
        cpf_cnpj: cpfLimpo,
        tipo_pessoa: tipoPessoa,
        criado_por: user?.id,
        status: "ativo",
      })
      .select("id, nome, cpf_cnpj")
      .single();
    setSalvandoCliente(false);
    if (error) {
      toast.error("Erro ao cadastrar cliente", { description: error.message });
      return;
    }
    toast.success("Cliente cadastrado");
    const novo = data as ClienteMatch;
    setClientesSugeridos((cs) => [novo, ...cs.filter((c) => c.id !== novo.id)]);
    setClienteSelecionado(novo.id);
    setCriandoCliente(null);
  };

  const handleProsseguir = () => {
    if (!preview) return;
    if (!clienteSelecionado) {
      toast.error("Selecione (ou cadastre) o cliente do processo");
      return;
    }
    // Mapear assunto -> área quando conhecido (heurística simples).
    const txtAssuntos = preview.assuntos.map((a) => a.nome.toLowerCase()).join(" ");
    let area_direito = "";
    if (/previd|inss|aposentad|benef|bpc|loas/.test(txtAssuntos)) area_direito = "previdenciario";
    else if (/famil|alimen|guarda|divor/.test(txtAssuntos)) area_direito = "familia";
    else if (/trabalh|clt|empreg/.test(txtAssuntos)) area_direito = "trabalhista";
    else if (/tribut|fisc|imposto/.test(txtAssuntos)) area_direito = "tributario";
    else if (/consum|cdc/.test(txtAssuntos)) area_direito = "consumidor";
    else if (/penal|crim/.test(txtAssuntos)) area_direito = "criminal";
    else if (/civil|contrat|indeniz/.test(txtAssuntos)) area_direito = "civil";

    const prefill = {
      cliente_id: clienteSelecionado,
      tipo: "judicial" as const,
      numero_cnj: preview.numero_cnj,
      tribunal_sigla: preview.tribunal_sigla,
      area_direito,
      tipo_acao: preview.classe ?? "",
      vara: preview.orgao_julgador ?? "",
      data_distribuicao: preview.data_ajuizamento ? preview.data_ajuizamento.slice(0, 10) : "",
      valor_causa: preview.valor_causa != null ? String(preview.valor_causa) : "",
      instancia: preview.grau === "G2" ? "2grau" : preview.grau === "G1" ? "1grau" : "",
    };
    onOpenChange(false);
    reset();
    navigate("/processos/novo", { state: { prefill } });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            Cadastro assistido de processo
          </DialogTitle>
          <DialogDescription>
            Digite o número CNJ. Buscamos os dados no DataJud e você só preenche o que faltar.
          </DialogDescription>
        </DialogHeader>

        {/* PASSO 1 — busca */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <div className="space-y-1.5">
              <Label>Número CNJ</Label>
              <Input
                value={cnjInput ? formatCNJ(onlyDigits(cnjInput)) : ""}
                onChange={(e) => setCnjInput(e.target.value)}
                placeholder="0000000-00.0000.0.00.0000"
                className="font-mono"
                disabled={buscando}
              />
              {cnjApenasDigitos && cnjValido && (
                <p className="text-xs text-muted-foreground">
                  Detectamos apenas dígitos — será normalizado para{" "}
                  <span className="font-mono font-medium text-foreground">{cnjFormatado}</span>{" "}
                  antes da consulta.
                </p>
              )}
              {cnjValido && !cnjDvOk && (
                <p className="text-xs text-destructive font-medium">
                  Dígito verificador inválido — confira o número antes de buscar.
                </p>
              )}
              {tribunalDetectado && (
                <p className="text-xs text-muted-foreground">
                  Tribunal detectado:{" "}
                  <span className={tribunalSuportado(tribunalDetectado) ? "text-success font-medium" : "text-warning font-medium"}>
                    {tribunalDetectado}
                    {tribunalSuportado(tribunalDetectado) ? "" : " (não suportado)"}
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Tribunal {!tribunalDetectado && "*"}</Label>
              <Select
                value={tribunalEfetivo || undefined}
                onValueChange={setTribunalManual}
                disabled={buscando}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {Object.entries(TRIBUNAIS).map(([sigla, info]) => (
                    <SelectItem key={sigla} value={sigla}>
                      {sigla} — {info.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleBuscar}
              disabled={buscando || !cnjValido || !tribunalOk}
              variant="gold"
              className="flex-1"
            >
              {buscando ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Consultando DataJud...</>
              ) : (
                <><Search className="w-4 h-4" /> Buscar no DataJud</>
              )}
            </Button>
            {(preview || naoEncontrado || erro) && (
              <Button
                onClick={() => {
                  toast.info("Reconsultando CNJ no DataJud...");
                  handleBuscar();
                }}
                disabled={buscando || !cnjValido || !tribunalOk}
                variant="outline"
                title="Forçar nova consulta ao DataJud com o CNJ atual"
              >
                <RefreshCw className={`w-4 h-4 ${buscando ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Sincronizar CNJ</span>
              </Button>
            )}
          </div>

          {erro && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {naoEncontrado && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Processo não localizado no DataJud.</p>
                <p className="text-muted-foreground">
                  Você ainda pode cadastrar manualmente — clique em "Cadastrar manualmente" abaixo.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    onOpenChange(false);
                    reset();
                    navigate("/processos/novo", {
                      state: { prefill: { numero_cnj: cnjLimpo, tribunal_sigla: tribunalEfetivo } },
                    });
                  }}
                >
                  Cadastrar manualmente <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* PASSO 2 — preview */}
          {preview && (
            <div className="space-y-4 rounded-lg border border-border p-4 bg-muted/20">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="font-medium">
                  {previewFonte === "pje_comunica"
                    ? "Processo encontrado no PJe Comunica"
                    : "Processo encontrado no DataJud"}
                </span>
                {previewFonte === "pje_comunica" && (
                  <Badge variant="secondary" className="text-xs">
                    Fallback — dados de publicações
                  </Badge>
                )}
                <Badge variant="outline" className="ml-auto">
                  {preview.total_movimentos} {previewFonte === "pje_comunica" ? "publicação" : "movimento"}
                  {preview.total_movimentos !== 1 ? (previewFonte === "pje_comunica" ? "ões" : "s") : ""}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <Linha label="Classe">{preview.classe ?? "—"}</Linha>
                <Linha label="Tribunal">{preview.tribunal_nome ?? preview.tribunal_sigla}</Linha>
                <Linha label="Órgão julgador">{preview.orgao_julgador ?? "—"}</Linha>
                <Linha label="Grau">{preview.grau ?? "—"}</Linha>
                <Linha label="Distribuído em">
                  {preview.data_ajuizamento ? new Date(preview.data_ajuizamento).toLocaleDateString("pt-BR") : "—"}
                </Linha>
                <Linha label="Valor da causa">
                  {preview.valor_causa != null
                    ? preview.valor_causa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : "—"}
                </Linha>
                {preview.assuntos.length > 0 && (
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">Assuntos: </span>
                    {preview.assuntos.map((a) => a.nome).join(", ")}
                  </div>
                )}
                {preview.ultimo_movimento && (
                  <div className="md:col-span-2 text-xs text-muted-foreground border-t border-border/60 pt-2 mt-1">
                    Último movimento:{" "}
                    {preview.ultimo_movimento.data
                      ? new Date(preview.ultimo_movimento.data).toLocaleDateString("pt-BR")
                      : ""}{" "}
                    — {preview.ultimo_movimento.descricao}
                  </div>
                )}
              </div>

              {/* Partes */}
              {preview.partes && (preview.partes.ativo.length > 0 || preview.partes.passivo.length > 0) && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Partes</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Polo</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Documento</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.partes.ativo.map((p, i) => (
                        <TableRow key={`a${i}`}>
                          <TableCell><Badge variant="outline">Ativo</Badge></TableCell>
                          <TableCell className="font-medium">{p.nome}</TableCell>
                          <TableCell className="font-mono text-xs">{p.cpf_cnpj ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAbrirCadastroCliente(p)}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Cadastrar como cliente
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {preview.partes.passivo.map((p, i) => (
                        <TableRow key={`p${i}`}>
                          <TableCell><Badge variant="outline">Passivo</Badge></TableCell>
                          <TableCell>{p.nome}</TableCell>
                          <TableCell className="font-mono text-xs">{p.cpf_cnpj ?? "—"}</TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Cliente do processo */}
              <div className="space-y-2">
                <Label>Cliente vinculado ao processo *</Label>
                {clientesSugeridos.length > 0 ? (
                  <Select value={clienteSelecionado} onValueChange={setClienteSelecionado}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente sugerido" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientesSugeridos.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                          {c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum cliente cadastrado bate com as partes do processo. Use o botão "Cadastrar como cliente" acima ou prossiga e selecione manualmente no formulário.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="gold"
            disabled={!preview || !clienteSelecionado}
            onClick={handleProsseguir}
          >
            Continuar para cadastro <ArrowRight className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Mini-form de novo cliente (sub-dialog) */}
      <Dialog open={!!criandoCliente} onOpenChange={(o) => !o && setCriandoCliente(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar cliente rápido</DialogTitle>
            <DialogDescription>
              Cria um cadastro mínimo. Você poderá completar depois na ficha do cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={novoClienteNome} onChange={(e) => setNovoClienteNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CPF / CNPJ</Label>
              <Input
                value={novoClienteCpf}
                onChange={(e) => setNovoClienteCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCriandoCliente(null)}>Cancelar</Button>
            <Button variant="gold" onClick={handleSalvarCliente} disabled={salvandoCliente}>
              {salvandoCliente ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
