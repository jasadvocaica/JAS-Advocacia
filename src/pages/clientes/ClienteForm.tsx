import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, Loader2, AlertCircle, RotateCcw, Sparkles, FileCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCpfCnpj, formatPhone, formatCEP, onlyDigits, formatBRL } from "@/lib/format";
import { isValidCpfCnpj } from "@/lib/cpf";
import { buscarCep } from "@/lib/cep";
import {
  ESTADOS_BR, ESTADO_CIVIL_OPTS, ESCOLARIDADE_OPTS, ORIGEM_OPTS, STATUS_OPTS,
  calcularIdade, SALARIO_MINIMO_2025,
} from "./types";

interface Profile { id: string; nome: string }

export default function ClienteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advogados, setAdvogados] = useState<Profile[]>([]);
  const [cpfErro, setCpfErro] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<Array<{ id: string; nome: string; cpf_cnpj: string | null; whatsapp: string | null; status: string }>>([]);
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false);
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState<Date | null>(null);

  // Triagem com IA
  const [triagemDescricao, setTriagemDescricao] = useState("");
  const [triagemLoading, setTriagemLoading] = useState(false);
  const [triagemResultado, setTriagemResultado] = useState<{
    area_direito: string;
    tipo_acao: string;
    documentos_necessarios: string[];
    observacoes: string;
    urgencia: "baixa" | "media" | "alta";
  } | null>(null);

  // Chave de rascunho local: por usuário + (novo/edicao com id do cliente)
  const rascunhoKey = `cliente_form_rascunho:${user?.id ?? "anon"}:${id ?? "novo"}`;

  const [form, setForm] = useState({
    // Identificação
    nome: "", nome_social: "", cpf_cnpj: "", tipo_pessoa: "fisica", nascimento: "",
    estado_civil: "", escolaridade: "",
    // Documentos
    rg: "", rg_orgao_emissor: "", rg_data_expedicao: "",
    nit_pis: "", cnh_numero: "", cnh_categoria: "", cnh_validade: "",
    // Previdenciário
    profissao: "", cbo: "", ultimo_vinculo_emprego: "",
    renda_mensal: "", membros_familia: "1",
    // Contato
    whatsapp: "", telefone_adicional: "", email: "",
    cep: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
    contato_emergencia_nome: "", contato_emergencia_parentesco: "", contato_emergencia_telefone: "",
    // Responsável legal
    responsavel_legal_nome: "", responsavel_legal_cpf: "", responsavel_legal_parentesco: "", responsavel_legal_telefone: "",
    // Gestão
    origem: "", origem_detalhe: "", advogado_responsavel_id: "",
    observacoes: "", status: "ativo",
    proximo_contato_data: "", proximo_contato_motivo: "",
  });

  useEffect(() => {
    supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome")
      .then(({ data }) => setAdvogados((data ?? []) as Profile[]));
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    supabase.from("clientes").select("*").eq("id", id).maybeSingle().then(({ data, error }) => {
      if (error || !data) {
        toast.error("Cliente não encontrado");
        navigate("/clientes");
        return;
      }
      const d: any = data;
      setForm({
        nome: d.nome ?? "",
        nome_social: d.nome_social ?? "",
        cpf_cnpj: d.cpf_cnpj ?? "",
        tipo_pessoa: d.tipo_pessoa ?? "fisica",
        nascimento: d.nascimento ?? "",
        estado_civil: d.estado_civil ?? "",
        escolaridade: d.escolaridade ?? "",
        rg: d.rg ?? "",
        rg_orgao_emissor: d.rg_orgao_emissor ?? "",
        rg_data_expedicao: d.rg_data_expedicao ?? "",
        nit_pis: d.nit_pis ?? "",
        cnh_numero: d.cnh_numero ?? "",
        cnh_categoria: d.cnh_categoria ?? "",
        cnh_validade: d.cnh_validade ?? "",
        profissao: d.profissao ?? "",
        cbo: d.cbo ?? "",
        ultimo_vinculo_emprego: d.ultimo_vinculo_emprego ?? "",
        renda_mensal: d.renda_mensal != null ? String(d.renda_mensal) : "",
        membros_familia: String(d.membros_familia ?? 1),
        whatsapp: d.whatsapp ?? d.telefones?.[0] ?? "",
        telefone_adicional: d.telefone_adicional ?? d.telefones?.[1] ?? "",
        email: d.email ?? "",
        cep: d.cep ?? "",
        endereco: d.endereco ?? "",
        numero: d.numero ?? "",
        complemento: d.complemento ?? "",
        bairro: d.bairro ?? "",
        cidade: d.cidade ?? "",
        estado: d.estado ?? "",
        contato_emergencia_nome: d.contato_emergencia_nome ?? "",
        contato_emergencia_parentesco: d.contato_emergencia_parentesco ?? "",
        contato_emergencia_telefone: d.contato_emergencia_telefone ?? "",
        responsavel_legal_nome: d.responsavel_legal_nome ?? "",
        responsavel_legal_cpf: d.responsavel_legal_cpf ?? "",
        responsavel_legal_parentesco: d.responsavel_legal_parentesco ?? "",
        responsavel_legal_telefone: d.responsavel_legal_telefone ?? "",
        origem: d.origem ?? "",
        origem_detalhe: d.origem_detalhe ?? "",
        advogado_responsavel_id: d.advogado_responsavel_id ?? "",
        observacoes: d.observacoes ?? "",
        status: d.status ?? (d.ativo ? "ativo" : "inativo"),
        proximo_contato_data: d.proximo_contato_data ?? "",
        proximo_contato_motivo: d.proximo_contato_motivo ?? "",
      });
      setLoading(false);
    });
  }, [id, navigate]);

  // Restaurar rascunho local (somente após o load do registro, se for edição)
  useEffect(() => {
    if (loading) return;
    try {
      const raw = localStorage.getItem(rascunhoKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { form: typeof form; salvoEm: string };
      if (parsed?.form && typeof parsed.form === "object") {
        setForm((atual) => ({ ...atual, ...parsed.form }));
        setRascunhoSalvoEm(parsed.salvoEm ? new Date(parsed.salvoEm) : null);
        setRascunhoRestaurado(true);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rascunhoKey]);

  // Auto-save em localStorage com debounce de 500ms
  useEffect(() => {
    if (loading) return;
    // Não persiste rascunho vazio (form intocado)
    const algumPreenchido = Object.entries(form).some(([k, v]) => {
      if (k === "tipo_pessoa" && v === "fisica") return false;
      if (k === "status" && v === "ativo") return false;
      if (k === "membros_familia" && v === "1") return false;
      return Boolean(v && String(v).trim());
    });
    if (!algumPreenchido) return;

    const t = setTimeout(() => {
      try {
        const salvoEm = new Date().toISOString();
        localStorage.setItem(rascunhoKey, JSON.stringify({ form, salvoEm }));
        setRascunhoSalvoEm(new Date(salvoEm));
      } catch {
        /* quota cheia ou indisponível */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form, loading, rascunhoKey]);

  function descartarRascunho() {
    try {
      localStorage.removeItem(rascunhoKey);
    } catch { /* ignore */ }
    setRascunhoRestaurado(false);
    setRascunhoSalvoEm(null);
    if (!isEdit) {
      // Limpa o form para o estado inicial
      window.location.reload();
    }
  }

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function onCepBlur() {
    const r = await buscarCep(form.cep);
    if (r) update({
      endereco: r.logradouro || form.endereco,
      bairro: r.bairro || form.bairro,
      cidade: r.cidade || form.cidade,
      estado: r.estado || form.estado,
    });
  }

  function validarCpf(v: string) {
    if (!v || form.tipo_pessoa !== "fisica") { setCpfErro(null); return; }
    if (!isValidCpfCnpj(v)) setCpfErro("CPF inválido");
    else setCpfErro(null);
  }

  // Verifica em tempo real se o documento já existe em outro cliente
  useEffect(() => {
    const doc = onlyDigits(form.cpf_cnpj);
    if (doc.length < 11) { setDuplicados([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("clientes_por_documento", { _doc: doc });
      const lista = ((data ?? []) as any[]).filter((c) => c.id !== id);
      setDuplicados(lista);
    }, 400);
    return () => clearTimeout(t);
  }, [form.cpf_cnpj, id]);

  const idade = calcularIdade(form.nascimento);
  const rendaPC = (() => {
    const r = parseFloat(form.renda_mensal.replace(",", ".")) || 0;
    const m = parseInt(form.membros_familia) || 0;
    return m > 0 ? r / m : 0;
  })();
  const rendaAbaixoMinimo = rendaPC > 0 && rendaPC < SALARIO_MINIMO_2025 / 4;

  async function analisarTriagem() {
    const desc = triagemDescricao.trim();
    if (desc.length < 10) {
      toast.error("Descreva o caso com pelo menos 10 caracteres.");
      return;
    }
    setTriagemLoading(true);
    setTriagemResultado(null);
    try {
      const { data, error } = await supabase.functions.invoke("clientes-triagem-ia", {
        body: {
          descricao: desc,
          contexto: {
            nome: form.nome || undefined,
            profissao: form.profissao || undefined,
            idade: idade,
          },
        },
      });
      if (error) throw error;
      if (!data?.success || !data?.data?.area_direito) {
        throw new Error(data?.error ?? "Resposta inválida da IA");
      }
      setTriagemResultado(data.data);
      toast.success("Triagem concluída");
    } catch (e: any) {
      toast.error("Falha ao analisar", { description: e?.message ?? String(e) });
    } finally {
      setTriagemLoading(false);
    }
  }

  function aplicarTriagemNasObservacoes() {
    if (!triagemResultado) return;
    const r = triagemResultado;
    const bloco = [
      `=== TRIAGEM INICIAL (IA) ===`,
      `Área: ${r.area_direito}`,
      `Tipo de ação: ${r.tipo_acao}`,
      `Urgência: ${r.urgencia}`,
      ``,
      `Relato do cliente:`,
      triagemDescricao.trim(),
      ``,
      `Documentos necessários:`,
      ...r.documentos_necessarios.map((d) => `- ${d}`),
      ``,
      `Observações: ${r.observacoes}`,
      `=============================`,
    ].join("\n");
    update({
      observacoes: form.observacoes ? `${bloco}\n\n${form.observacoes}` : bloco,
    });
    toast.success("Triagem adicionada às observações internas");
  }


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cpfErro) { toast.error(cpfErro); return; }
    setSaving(true);

    const payload: any = {
      nome: form.nome,
      nome_social: form.nome_social || null,
      cpf_cnpj: form.cpf_cnpj ? onlyDigits(form.cpf_cnpj) : null,
      tipo_pessoa: form.tipo_pessoa,
      nascimento: form.nascimento || null,
      estado_civil: form.estado_civil || null,
      escolaridade: form.escolaridade || null,
      rg: form.rg || null,
      rg_orgao_emissor: form.rg_orgao_emissor || null,
      rg_data_expedicao: form.rg_data_expedicao || null,
      nit_pis: form.nit_pis ? onlyDigits(form.nit_pis) : null,
      cnh_numero: form.cnh_numero || null,
      cnh_categoria: form.cnh_categoria || null,
      cnh_validade: form.cnh_validade || null,
      profissao: form.profissao || null,
      cbo: form.cbo || null,
      ultimo_vinculo_emprego: form.ultimo_vinculo_emprego || null,
      renda_mensal: form.renda_mensal ? parseFloat(form.renda_mensal.replace(",", ".")) : null,
      membros_familia: parseInt(form.membros_familia) || 1,
      whatsapp: form.whatsapp ? onlyDigits(form.whatsapp) : null,
      telefone_adicional: form.telefone_adicional ? onlyDigits(form.telefone_adicional) : null,
      // Mantém retrocompatibilidade com o campo array existente
      telefones: [form.whatsapp, form.telefone_adicional].filter(Boolean).map(onlyDigits),
      email: form.email || null,
      cep: form.cep ? onlyDigits(form.cep) : null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      contato_emergencia_nome: form.contato_emergencia_nome || null,
      contato_emergencia_parentesco: form.contato_emergencia_parentesco || null,
      contato_emergencia_telefone: form.contato_emergencia_telefone ? onlyDigits(form.contato_emergencia_telefone) : null,
      responsavel_legal_nome: form.responsavel_legal_nome || null,
      responsavel_legal_cpf: form.responsavel_legal_cpf ? onlyDigits(form.responsavel_legal_cpf) : null,
      responsavel_legal_parentesco: form.responsavel_legal_parentesco || null,
      responsavel_legal_telefone: form.responsavel_legal_telefone ? onlyDigits(form.responsavel_legal_telefone) : null,
      origem: form.origem || null,
      origem_detalhe: form.origem_detalhe || null,
      advogado_responsavel_id: form.advogado_responsavel_id || null,
      observacoes: form.observacoes || null,
      status: form.status,
      ativo: form.status === "ativo",
      proximo_contato_data: form.proximo_contato_data || null,
      proximo_contato_motivo: form.proximo_contato_motivo || null,
    };
    if (!isEdit) payload.criado_por = user?.id;

    const { data: saved, error } = isEdit
      ? await supabase.from("clientes").update(payload).eq("id", id!).select("id").maybeSingle()
      : await supabase.from("clientes").insert(payload).select("id").maybeSingle();

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    // Limpa o rascunho local ao salvar com sucesso
    try { localStorage.removeItem(rascunhoKey); } catch { /* ignore */ }
    toast.success(isEdit ? "Cliente atualizado" : "Cliente cadastrado");

    // Ativação automática do portal: para novos clientes PF ativos com CPF válido (11 dígitos).
    // Falha silenciosa — o portal pode ser ativado manualmente em /clientes/:id depois.
    const cpfDigits = onlyDigits(form.cpf_cnpj);
    if (!isEdit && saved?.id && form.tipo_pessoa === "fisica" && form.status === "ativo" && cpfDigits.length === 11) {
      try {
        const { data: ativ, error: ativErr } = await supabase.functions.invoke("ativar-portal-cliente", {
          body: { cliente_ids: [saved.id] },
        });
        const r = (ativ as any)?.resultados?.[0];
        if (ativErr) {
          toast.message("Portal do cliente não ativado", { description: ativErr.message });
        } else if (r?.status === "ativado") {
          toast.success("Portal do cliente ativado", { description: `${r.email} • senha: ${r.senha}` });
        }
      } catch (e) {
        // não bloqueia o fluxo
        console.warn("ativar-portal-cliente falhou:", e);
      }
    }

    navigate(`/clientes/${saved?.id ?? id}`);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gold" /></div>;

  const isFisica = form.tipo_pessoa === "fisica";
  const mostraResponsavelLegal = isFisica && (idade != null && idade < 18);

  return (
    <form onSubmit={submit} className="space-y-6 max-w-5xl">
      <Button type="button" variant="ghost" size="sm" onClick={() => navigate(isEdit ? `/clientes/${id}` : "/clientes")}>
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Button>
      <PageHeader title={isEdit ? "Editar cliente" : "Novo cliente"} />

      {rascunhoRestaurado && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md border border-gold/40 bg-gold/10 text-sm">
          <div className="flex items-start gap-2">
            <RotateCcw className="w-4 h-4 mt-0.5 text-gold-dark shrink-0" />
            <div>
              <p className="font-medium text-foreground">Rascunho restaurado</p>
              <p className="text-xs text-muted-foreground">
                Recuperamos o que você havia preenchido
                {rascunhoSalvoEm ? ` em ${rascunhoSalvoEm.toLocaleString("pt-BR")}` : ""}.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={descartarRascunho}>
            Descartar rascunho
          </Button>
        </div>
      )}

      {/* IDENTIFICAÇÃO */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-xl">Identificação</h3>
        <div className="grid sm:grid-cols-6 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>Tipo de pessoa</Label>
            <Select value={form.tipo_pessoa} onValueChange={(v) => update({ tipo_pessoa: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fisica">Pessoa física</SelectItem>
                <SelectItem value="juridica">Pessoa jurídica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-4 space-y-2">
            <Label>Nome / Razão social *</Label>
            <Input required value={form.nome} onChange={(e) => update({ nome: e.target.value })} />
          </div>
          {isFisica && (
            <div className="sm:col-span-3 space-y-2">
              <Label>Nome social</Label>
              <Input value={form.nome_social} onChange={(e) => update({ nome_social: e.target.value })} placeholder="Opcional" />
            </div>
          )}
          <div className="sm:col-span-3 space-y-2">
            <Label>{isFisica ? "CPF" : "CNPJ"}</Label>
            <Input
              value={formatCpfCnpj(form.cpf_cnpj)}
              onChange={(e) => { update({ cpf_cnpj: e.target.value }); setCpfErro(null); }}
              onBlur={(e) => validarCpf(e.target.value)}
              className={cpfErro ? "border-destructive" : ""}
            />
            {cpfErro && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {cpfErro}</p>}
            {duplicados.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs space-y-1">
                <p className="font-semibold text-amber-700 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Já existe {duplicados.length === 1 ? "1 cliente" : `${duplicados.length} clientes`} com este documento
                </p>
                {duplicados.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{d.nome} <span className="text-muted-foreground">({d.status})</span></span>
                    <a href={`/clientes/${d.id}`} target="_blank" rel="noreferrer" className="text-primary underline shrink-0">abrir</a>
                  </div>
                ))}
                <p className="text-muted-foreground">Você pode salvar mesmo assim — depois é possível unificar em Clientes → Duplicados.</p>
              </div>
            )}
          </div>
          {isFisica && (
            <>
              <div className="sm:col-span-2 space-y-2">
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.nascimento} onChange={(e) => update({ nascimento: e.target.value })} />
                {idade != null && <p className="text-xs text-muted-foreground">{idade} anos</p>}
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Estado civil</Label>
                <Select value={form.estado_civil} onValueChange={(v) => update({ estado_civil: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>{ESTADO_CIVIL_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Escolaridade</Label>
                <Select value={form.escolaridade} onValueChange={(v) => update({ escolaridade: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>{ESCOLARIDADE_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* TRIAGEM INICIAL COM IA */}
      <Card className="p-6 space-y-4 border-primary/30 bg-primary/[0.03]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Triagem inicial com IA
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Descreva o caso em linguagem comum e a IA sugere área do direito, tipo de ação e documentos necessários.
            </p>
          </div>
          {triagemResultado && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={aplicarTriagemNasObservacoes}
            >
              <FileCheck2 className="w-4 h-4" /> Salvar nas observações
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <Label>Relato do cliente</Label>
          <Textarea
            rows={4}
            value={triagemDescricao}
            onChange={(e) => setTriagemDescricao(e.target.value)}
            placeholder="Ex.: Cliente trabalhou 12 anos em frigorífico, foi demitido sem justa causa há 2 meses, não recebeu verbas rescisórias e tem laudo de LER no ombro direito..."
            maxLength={5000}
            disabled={triagemLoading}
          />
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {triagemDescricao.length}/5000 caracteres
            </span>
            <Button
              type="button"
              onClick={analisarTriagem}
              disabled={triagemLoading || triagemDescricao.trim().length < 10}
              size="sm"
            >
              {triagemLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</>
                : <><Sparkles className="w-4 h-4" /> Analisar com IA</>}
            </Button>
          </div>
        </div>

        {triagemResultado && (
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Área do direito</p>
                <p className="font-medium text-sm">{triagemResultado.area_direito}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Tipo de ação</p>
                <p className="font-medium text-sm">{triagemResultado.tipo_acao}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Urgência</p>
                <Badge
                  variant={
                    triagemResultado.urgencia === "alta"
                      ? "destructive"
                      : triagemResultado.urgencia === "media"
                        ? "default"
                        : "secondary"
                  }
                >
                  {triagemResultado.urgencia}
                </Badge>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Documentos necessários ({triagemResultado.documentos_necessarios.length})
              </p>
              <ul className="space-y-1 text-sm">
                {triagemResultado.documentos_necessarios.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            {triagemResultado.observacoes && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Observações</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{triagemResultado.observacoes}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">
              Sugestão automática — sempre revise antes de aplicar.
            </p>
          </div>
        )}
      </Card>

      {isFisica && (
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-xl">Documentos de identificação</h3>
          <div className="grid sm:grid-cols-6 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label>RG</Label>
              <Input value={form.rg} onChange={(e) => update({ rg: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Órgão emissor</Label>
              <Input value={form.rg_orgao_emissor} onChange={(e) => update({ rg_orgao_emissor: e.target.value })} placeholder="Ex: SSP/SP" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Data de expedição</Label>
              <Input type="date" value={form.rg_data_expedicao} onChange={(e) => update({ rg_data_expedicao: e.target.value })} />
            </div>
            <div className="sm:col-span-3 space-y-2">
              <Label>NIT/PIS/PASEP</Label>
              <Input value={form.nit_pis} onChange={(e) => update({ nit_pis: e.target.value })} placeholder="Para consultas no INSS" />
            </div>
            <div className="sm:col-span-3 space-y-2">
              <Label>CNH</Label>
              <Input value={form.cnh_numero} onChange={(e) => update({ cnh_numero: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Categoria CNH</Label>
              <Input value={form.cnh_categoria} onChange={(e) => update({ cnh_categoria: e.target.value })} placeholder="Ex: B, AB, D" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Validade CNH</Label>
              <Input type="date" value={form.cnh_validade} onChange={(e) => update({ cnh_validade: e.target.value })} />
            </div>
          </div>
        </Card>
      )}

      {/* PREVIDENCIÁRIO */}
      {isFisica && (
        <Card className="p-6 space-y-4">
          <h3 className="font-display text-xl">Trabalho e renda</h3>
          <div className="grid sm:grid-cols-6 gap-4">
            <div className="sm:col-span-3 space-y-2">
              <Label>Profissão</Label>
              <Input value={form.profissao} onChange={(e) => update({ profissao: e.target.value })} />
            </div>
            <div className="sm:col-span-1 space-y-2">
              <Label>CBO</Label>
              <Input value={form.cbo} onChange={(e) => update({ cbo: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Último vínculo</Label>
              <Input type="date" value={form.ultimo_vinculo_emprego} onChange={(e) => update({ ultimo_vinculo_emprego: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Renda mensal (R$)</Label>
              <Input value={form.renda_mensal} onChange={(e) => update({ renda_mensal: e.target.value })} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Membros da família</Label>
              <Input type="number" min={1} value={form.membros_familia} onChange={(e) => update({ membros_familia: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Renda per capita</Label>
              <div className={`h-10 px-3 rounded-md border bg-muted/30 flex items-center text-sm font-medium ${rendaAbaixoMinimo ? "text-amber-600 border-amber-500/40" : ""}`}>
                {formatBRL(rendaPC)}
              </div>
              {rendaAbaixoMinimo && <p className="text-xs text-amber-600">Abaixo de 1/4 do salário mínimo (BPC/LOAS)</p>}
            </div>
          </div>
        </Card>
      )}

      {/* CONTATO */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-xl">Contato</h3>
        <div className="grid sm:grid-cols-6 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>WhatsApp</Label>
            <Input value={formatPhone(form.whatsapp)} onChange={(e) => update({ whatsapp: e.target.value })} placeholder="(00) 00000-0000" />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Telefone adicional</Label>
            <Input value={formatPhone(form.telefone_adicional)} onChange={(e) => update({ telefone_adicional: e.target.value })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={(e) => update({ email: e.target.value })} />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <Label>CEP</Label>
            <Input
              value={formatCEP(form.cep)}
              onChange={(e) => update({ cep: e.target.value })}
              onBlur={onCepBlur}
              placeholder="00000-000"
            />
          </div>
          <div className="sm:col-span-3 space-y-2">
            <Label>Endereço</Label>
            <Input value={form.endereco} onChange={(e) => update({ endereco: e.target.value })} />
          </div>
          <div className="sm:col-span-1 space-y-2">
            <Label>Nº</Label>
            <Input value={form.numero} onChange={(e) => update({ numero: e.target.value })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Complemento</Label>
            <Input value={form.complemento} onChange={(e) => update({ complemento: e.target.value })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Bairro</Label>
            <Input value={form.bairro} onChange={(e) => update({ bairro: e.target.value })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Cidade</Label>
            <Input value={form.cidade} onChange={(e) => update({ cidade: e.target.value })} />
          </div>
          <div className="sm:col-span-1 space-y-2">
            <Label>UF</Label>
            <Select value={form.estado} onValueChange={(v) => update({ estado: v })}>
              <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>{ESTADOS_BR.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-6 pt-2 border-t border-border/50">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Contato de emergência</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Input placeholder="Nome" value={form.contato_emergencia_nome} onChange={(e) => update({ contato_emergencia_nome: e.target.value })} />
              <Input placeholder="Parentesco" value={form.contato_emergencia_parentesco} onChange={(e) => update({ contato_emergencia_parentesco: e.target.value })} />
              <Input placeholder="Telefone" value={formatPhone(form.contato_emergencia_telefone)} onChange={(e) => update({ contato_emergencia_telefone: e.target.value })} />
            </div>
          </div>
        </div>
      </Card>

      {/* RESPONSÁVEL LEGAL */}
      {mostraResponsavelLegal && (
        <Card className="p-6 space-y-4 border-amber-500/30">
          <h3 className="font-display text-xl">Responsável legal <span className="text-xs font-sans text-muted-foreground">(menor de idade)</span></h3>
          <div className="grid sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label>Nome</Label>
              <Input value={form.responsavel_legal_nome} onChange={(e) => update({ responsavel_legal_nome: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={formatCpfCnpj(form.responsavel_legal_cpf)} onChange={(e) => update({ responsavel_legal_cpf: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Parentesco</Label>
              <Input value={form.responsavel_legal_parentesco} onChange={(e) => update({ responsavel_legal_parentesco: e.target.value })} />
            </div>
            <div className="sm:col-span-2 space-y-2">
              <Label>Telefone</Label>
              <Input value={formatPhone(form.responsavel_legal_telefone)} onChange={(e) => update({ responsavel_legal_telefone: e.target.value })} />
            </div>
          </div>
        </Card>
      )}

      {/* GESTÃO INTERNA */}
      <Card className="p-6 space-y-4">
        <h3 className="font-display text-xl">Gestão interna</h3>
        <div className="grid sm:grid-cols-6 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => update({ status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Origem</Label>
            <Select value={form.origem} onValueChange={(v) => update({ origem: v })}>
              <SelectTrigger><SelectValue placeholder="Como chegou..." /></SelectTrigger>
              <SelectContent>{ORIGEM_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Detalhe da origem</Label>
            <Input value={form.origem_detalhe} onChange={(e) => update({ origem_detalhe: e.target.value })} placeholder="Quem indicou, qual campanha..." />
          </div>
          <div className="sm:col-span-3 space-y-2">
            <Label>Advogado responsável</Label>
            <Select value={form.advogado_responsavel_id || "_none"} onValueChange={(v) => update({ advogado_responsavel_id: v === "_none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Sem responsável —</SelectItem>
                {advogados.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-3 space-y-2">
            <Label>Próximo contato — data</Label>
            <Input type="date" value={form.proximo_contato_data} onChange={(e) => update({ proximo_contato_data: e.target.value })} />
          </div>
          <div className="sm:col-span-6 space-y-2">
            <Label>Próximo contato — motivo</Label>
            <Input value={form.proximo_contato_motivo} onChange={(e) => update({ proximo_contato_motivo: e.target.value })} placeholder="Ex: Retornar sobre laudo médico" />
          </div>
          <div className="sm:col-span-6 space-y-2">
            <Label>Observações internas</Label>
            <Textarea rows={4} value={form.observacoes} onChange={(e) => update({ observacoes: e.target.value })} placeholder="Informações privadas, não aparecem em documentos impressos..." />
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/clientes/${id}` : "/clientes")}>Cancelar</Button>
        <Button type="submit" variant="gold" disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Salvar</>}
        </Button>
      </div>
    </form>
  );
}
