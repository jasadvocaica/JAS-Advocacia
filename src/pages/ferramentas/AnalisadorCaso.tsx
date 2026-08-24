import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Upload, FileText, AlertTriangle, CheckCircle2, XCircle, Sparkles, Save, FilePlus2, Bug, Copy } from "lucide-react";
import { registrarAtendimento } from "@/lib/atendimentos";

interface ClienteOpt { id: string; nome: string; cpf_cnpj: string | null }
interface ProcessoOpt { id: string; numero_cnj: string | null; tipo_acao: string | null }

interface DadosExtraidos {
  tipo_documento?: string;
  area_direito?: string;
  dados_identificacao?: Record<string, string>;
  resumo_fatos?: string;
  motivo_negativa_decisao?: string;
  pontos_favoraveis?: string[];
  pontos_desfavoraveis?: string[];
  teses_juridicas_aplicaveis?: { tese: string; descricao: string; aplicavel?: boolean; motivo?: string }[];
  estrategia_sugerida?: string;
  urgencia?: "alta" | "media" | "baixa";
  prazo_atencao?: string;
  observacoes_adicionais?: string;
}

const URGENCIA_COLOR: Record<string, string> = {
  alta: "bg-red-500/15 text-red-600 border-red-500/30",
  media: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  baixa: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

type DiagEtapa = "validacao" | "permissao_storage" | "upload" | "leitura_storage" | "fallback_base64" | "ia" | "parsing";
type DiagStatus = "pendente" | "ok" | "skip" | "erro" | "aviso";
interface DiagPasso {
  etapa: DiagEtapa;
  rotulo: string;
  status: DiagStatus;
  detalhe?: string;
  causa_provavel?: string;
  acao_sugerida?: string;
  duracao_ms?: number;
}

const DIAG_PASSOS_BASE: { etapa: DiagEtapa; rotulo: string }[] = [
  { etapa: "validacao", rotulo: "Validação do arquivo / texto" },
  { etapa: "permissao_storage", rotulo: "Verificação de permissões no Storage" },
  { etapa: "upload", rotulo: "Upload para o storage" },
  { etapa: "leitura_storage", rotulo: "Leitura do arquivo enviado" },
  { etapa: "fallback_base64", rotulo: "Conversão para base64 (fallback)" },
  { etapa: "ia", rotulo: "Chamada da IA (edge function)" },
  { etapa: "parsing", rotulo: "Interpretação da resposta" },
];

interface DiagDetalhe {
  causa_provavel: string;
  acao_sugerida: string;
}

function classificarErroPermissao(msg?: string): DiagDetalhe | null {
  const m = (msg ?? "").toLowerCase();
  if (m.includes("row-level security") || m.includes("rls") || m.includes("policy"))
    return {
      causa_provavel: "RLS do bucket 'ferramentas-analises' está bloqueando seu usuário.",
      acao_sugerida: "Peça ao gestor para revisar as policies de INSERT/SELECT em storage.objects para esse bucket, garantindo que usuários autenticados possam gravar e ler suas próprias pastas (auth.uid()::text = (storage.foldername(name))[1]).",
    };
  if (m.includes("not authorized") || m.includes("unauthorized") || m.includes("401"))
    return {
      causa_provavel: "Sessão expirada ou credenciais inválidas ao acessar o Storage.",
      acao_sugerida: "Faça logout e login novamente. Se persistir, verifique se o token JWT do Supabase está sendo enviado nas requisições.",
    };
  if (m.includes("permission denied") || m.includes("forbidden") || m.includes("403"))
    return {
      causa_provavel: "Permissão negada pelo Storage (bucket privado sem policy compatível).",
      acao_sugerida: "Confirme se o bucket existe e se há policy permitindo a operação para o seu papel (gestor/advogado).",
    };
  if (m.includes("bucket") && (m.includes("not found") || m.includes("does not exist")))
    return {
      causa_provavel: "Bucket 'ferramentas-analises' não existe.",
      acao_sugerida: "Crie o bucket via migration (insert into storage.buckets) e adicione policies de INSERT/SELECT para usuários autenticados.",
    };
  if (m.includes("not found") || m.includes("404"))
    return {
      causa_provavel: "Arquivo não encontrado no bucket (pode ter sido removido ou nunca foi gravado).",
      acao_sugerida: "Reenvie o arquivo. Se reaparecer, verifique policies de SELECT no bucket.",
    };
  return null;
}

function causaProvavel(etapa: DiagEtapa, msg?: string): string {
  const m = (msg ?? "").toLowerCase();
  if (etapa === "validacao") {
    if (m.includes("20mb")) return "Arquivo acima de 20 MB. Reduza o tamanho ou cole o texto manualmente.";
    return "Nenhum arquivo nem texto foi informado.";
  }
  if (etapa === "permissao_storage") {
    const cls = classificarErroPermissao(msg);
    if (cls) return cls.causa_provavel;
    if (m.includes("network") || m.includes("failed to fetch") || m.includes("cors"))
      return "Não foi possível contatar o Storage (rede / CORS / extensão de navegador).";
    return "Não foi possível confirmar permissões de leitura/escrita no bucket.";
  }
  if (etapa === "upload" || etapa === "leitura_storage") {
    const cls = classificarErroPermissao(msg);
    if (cls) return cls.causa_provavel;
    if (m.includes("network") || m.includes("failed to fetch") || m.includes("cors"))
      return "Bloqueio de rede / CORS / extensão do navegador. O sistema tenta fallback automático em base64.";
    if (m.includes("size") || m.includes("payload")) return "Arquivo muito grande para upload direto.";
    return etapa === "upload"
      ? "Falha no upload. Tentando enviar o arquivo embutido na requisição."
      : "Falha ao reler o arquivo do bucket.";
  }
  if (etapa === "fallback_base64") {
    if (m.includes("memory") || m.includes("range")) return "Arquivo grande demais para conversão em base64 no navegador.";
    return "Não foi possível ler o arquivo localmente para envio inline.";
  }
  if (etapa === "ia") {
    if (m.includes("429") || m.includes("rate")) return "Limite de uso da IA atingido. Aguarde alguns segundos e tente novamente.";
    if (m.includes("402") || m.includes("payment") || m.includes("credit"))
      return "Créditos da IA esgotados. Adicione créditos no workspace de Lovable AI.";
    if (m.includes("timeout") || m.includes("timed out")) return "A IA demorou demais para responder. Tente um trecho menor.";
    if (m.includes("unauthorized") || m.includes("401")) return "Sessão expirada. Faça login novamente.";
    if (m.includes("non-2xx") || m.includes("500")) return "Erro interno na função de análise. Veja os logs ou tente novamente.";
    return "Falha ao chamar a IA de análise.";
  }
  if (etapa === "parsing") {
    return "A IA respondeu, mas o conteúdo não pôde ser interpretado como JSON estruturado.";
  }
  return "Erro inesperado.";
}

function acaoSugerida(etapa: DiagEtapa, msg?: string): string {
  const cls = classificarErroPermissao(msg);
  if (cls) return cls.acao_sugerida;
  const m = (msg ?? "").toLowerCase();
  if (etapa === "validacao") return "Anexe um arquivo PDF/imagem de até 20 MB ou cole o texto no campo abaixo.";
  if (etapa === "permissao_storage") return "Confirme com o gestor que o bucket existe e que as policies permitem o seu usuário.";
  if (etapa === "upload" || etapa === "leitura_storage") {
    if (m.includes("network") || m.includes("cors") || m.includes("failed to fetch"))
      return "Desative extensões/adblock, troque de rede, ou aguarde o fallback automático em base64.";
    return "Tente novamente. Se persistir, use o campo de texto colado em vez do arquivo.";
  }
  if (etapa === "fallback_base64") return "Reduza o arquivo (compactando o PDF) ou copie/cole o texto do documento.";
  if (etapa === "ia") {
    if (m.includes("429")) return "Aguarde 30s e tente novamente.";
    if (m.includes("402")) return "Adicione créditos em Settings > Workspace > Usage.";
    return "Tente novamente em instantes ou reduza o trecho enviado.";
  }
  if (etapa === "parsing") return "Tente novamente — a IA pode ter retornado um formato inválido pontualmente.";
  return "Tente novamente.";
}

export default function AnalisadorCaso() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [textoLivre, setTextoLivre] = useState("");
  const [titulo, setTitulo] = useState("");
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<DadosExtraidos | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string>("");
  const [processoId, setProcessoId] = useState<string>("");
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [processos, setProcessos] = useState<ProcessoOpt[]>([]);
  const [diagnostico, setDiagnostico] = useState<DiagPasso[] | null>(null);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nome, cpf_cnpj")
      .eq("ativo", true)
      .order("nome")
      .limit(500)
      .then(({ data }) => setClientes((data ?? []) as ClienteOpt[]));
  }, []);

  useEffect(() => {
    if (!clienteId) {
      setProcessos([]);
      setProcessoId("");
      return;
    }
    supabase
      .from("processos")
      .select("id, numero_cnj, tipo_acao")
      .eq("cliente_id", clienteId)
      .order("criado_em", { ascending: false })
      .limit(100)
      .then(({ data }) => setProcessos((data ?? []) as ProcessoOpt[]));
  }, [clienteId]);

  async function analisar() {
    if (!user) return;

    // Inicializa diagnóstico (todas pendentes)
    const passos: DiagPasso[] = DIAG_PASSOS_BASE.map((p) => ({ ...p, status: "pendente" }));
    const setPasso = (etapa: DiagEtapa, patch: Partial<DiagPasso>) => {
      const idx = passos.findIndex((p) => p.etapa === etapa);
      if (idx >= 0) passos[idx] = { ...passos[idx], ...patch };
      setDiagnostico([...passos]);
    };
    setDiagnostico(passos);
    setResultado(null);

    // 1) Validação
    const tValid = performance.now();
    if (!arquivo && !textoLivre.trim()) {
      const msg = "Envie um arquivo ou cole o texto do documento.";
      setPasso("validacao", { status: "erro", detalhe: msg, causa_provavel: causaProvavel("validacao", msg), duracao_ms: Math.round(performance.now() - tValid) });
      toast.error(msg);
      return;
    }
    if (arquivo && arquivo.size > 20 * 1024 * 1024) {
      const msg = "Arquivo maior que 20MB. Reduza o tamanho ou cole o texto.";
      setPasso("validacao", { status: "erro", detalhe: msg, causa_provavel: causaProvavel("validacao", msg), duracao_ms: Math.round(performance.now() - tValid) });
      toast.error(msg);
      return;
    }
    setPasso("validacao", {
      status: "ok",
      detalhe: arquivo ? `${arquivo.name} (${(arquivo.size / 1024).toFixed(1)} KB)` : "Texto colado manualmente",
      duracao_ms: Math.round(performance.now() - tValid),
    });

    setAnalisando(true);
    try {
      let path: string | null = null;
      let mime: string | undefined;
      let arquivoBase64: string | undefined;
      // Bytes do arquivo lidos UMA ÚNICA VEZ no início — evita "reference invalidated"
      // quando o handle do File é tocado pelo upload e depois falha o arrayBuffer().
      let arquivoBytes: Uint8Array | null = null;

      if (arquivo) {
        const ext = arquivo.name.split(".").pop() || "pdf";
        path = `${user.id}/${Date.now()}.${ext}`;
        mime = arquivo.type;

        // 1.5) Lê o arquivo PRIMEIRO — assim os bytes ficam garantidos em memória
        try {
          const buf = await arquivo.arrayBuffer();
          arquivoBytes = new Uint8Array(buf);
        } catch (readErr) {
          const msg = readErr instanceof Error ? readErr.message : String(readErr);
          setPasso("validacao", {
            status: "erro",
            detalhe: msg,
            causa_provavel: "Não foi possível ler o arquivo do disco/memória do navegador (referência inválida ou arquivo movido).",
            acao_sugerida: "Re-selecione o arquivo no campo acima e tente novamente. Se persistir, desative extensões do navegador.",
            duracao_ms: Math.round(performance.now() - tValid),
          });
          toast.error("Falha ao ler o arquivo. Re-selecione e tente novamente.");
          setAnalisando(false);
          return;
        }

        // 2) Preflight: verifica se temos permissão de leitura na pasta do usuário
        const tPerm = performance.now();
        try {
          const { error: listErr } = await supabase.storage
            .from("ferramentas-analises")
            .list(user.id, { limit: 1 });
          if (listErr) {
            const msg = listErr.message ?? String(listErr);
            const cls = classificarErroPermissao(msg);
            // Lista pode falhar por pasta vazia em alguns ambientes — só tratamos como erro se for permissão
            if (cls) {
              setPasso("permissao_storage", {
                status: "erro",
                detalhe: msg,
                causa_provavel: cls.causa_provavel,
                acao_sugerida: cls.acao_sugerida,
                duracao_ms: Math.round(performance.now() - tPerm),
              });
            } else {
              setPasso("permissao_storage", {
                status: "aviso",
                detalhe: msg,
                causa_provavel: causaProvavel("permissao_storage", msg),
                acao_sugerida: acaoSugerida("permissao_storage", msg),
                duracao_ms: Math.round(performance.now() - tPerm),
              });
            }
          } else {
            setPasso("permissao_storage", {
              status: "ok",
              detalhe: "Leitura/escrita autorizada na sua pasta do bucket",
              duracao_ms: Math.round(performance.now() - tPerm),
            });
          }
        } catch (permErr) {
          const msg = permErr instanceof Error ? permErr.message : String(permErr);
          setPasso("permissao_storage", {
            status: "aviso",
            detalhe: msg,
            causa_provavel: causaProvavel("permissao_storage", msg),
            acao_sugerida: acaoSugerida("permissao_storage", msg),
            duracao_ms: Math.round(performance.now() - tPerm),
          });
        }

        // 3) Upload pro storage — usa Blob a partir dos bytes em memória (não o File original),
        // assim mesmo se o handle do File for invalidado por extensão/CORS, ainda temos os bytes
        // disponíveis para o fallback base64.
        const tUp = performance.now();
        let uploadOk = false;
        try {
          const uploadBlob = new Blob([arquivoBytes!.buffer as ArrayBuffer], { type: arquivo.type || "application/octet-stream" });
          const { error: upErr } = await supabase.storage
            .from("ferramentas-analises")
            .upload(path, uploadBlob, { contentType: arquivo.type || "application/octet-stream" });
          if (upErr) throw upErr;
          uploadOk = true;
          setStoragePath(path);
          setPasso("upload", { status: "ok", detalhe: `bucket: ferramentas-analises · ${path}`, duracao_ms: Math.round(performance.now() - tUp) });
        } catch (upErr) {
          const msg = upErr instanceof Error ? upErr.message : String(upErr);
          console.warn("Upload pro storage falhou, tentando fallback base64:", upErr);
          const cls = classificarErroPermissao(msg);
          setPasso("upload", {
            status: "erro",
            detalhe: msg,
            causa_provavel: cls?.causa_provavel ?? causaProvavel("upload", msg),
            acao_sugerida: cls?.acao_sugerida ?? acaoSugerida("upload", msg),
            duracao_ms: Math.round(performance.now() - tUp),
          });
          path = null;
          setStoragePath(null);
        }

        // 4) Leitura de verificação (download) pra confirmar que a edge function vai conseguir baixar
        if (uploadOk && path) {
          const tRead = performance.now();
          try {
            const { error: dlErr } = await supabase.storage
              .from("ferramentas-analises")
              .download(path);
            if (dlErr) throw dlErr;
            setPasso("leitura_storage", {
              status: "ok",
              detalhe: "Download de verificação OK — edge function conseguirá ler",
              duracao_ms: Math.round(performance.now() - tRead),
            });
            setPasso("fallback_base64", { status: "skip", detalhe: "Não necessário (upload + leitura OK)" });
          } catch (dlErr) {
            const msg = dlErr instanceof Error ? dlErr.message : String(dlErr);
            const cls = classificarErroPermissao(msg);
            setPasso("leitura_storage", {
              status: "erro",
              detalhe: msg,
              causa_provavel: cls?.causa_provavel ?? causaProvavel("leitura_storage", msg),
              acao_sugerida: cls?.acao_sugerida ?? acaoSugerida("leitura_storage", msg),
              duracao_ms: Math.round(performance.now() - tRead),
            });
            // Força fallback base64
            uploadOk = false;
            path = null;
            setStoragePath(null);
          }
        } else {
          setPasso("leitura_storage", { status: "skip", detalhe: "Upload falhou — pulando leitura" });
        }

        // 5) Fallback base64 se upload/leitura falharam — reusa os bytes já lidos no início
        if (!uploadOk) {
          const tB64 = performance.now();
          try {
            if (!arquivoBytes) throw new Error("Bytes do arquivo indisponíveis em memória.");
            let bin = "";
            const chunk = 0x8000;
            for (let i = 0; i < arquivoBytes.length; i += chunk) {
              bin += String.fromCharCode(...arquivoBytes.subarray(i, i + chunk));
            }
            arquivoBase64 = btoa(bin);
            setPasso("fallback_base64", {
              status: "ok",
              detalhe: `${(arquivoBase64.length / 1024).toFixed(1)} KB em base64`,
              duracao_ms: Math.round(performance.now() - tB64),
            });
          } catch (b64Err) {
            const msg = b64Err instanceof Error ? b64Err.message : String(b64Err);
            setPasso("fallback_base64", { status: "erro", detalhe: msg, causa_provavel: causaProvavel("fallback_base64", msg), acao_sugerida: acaoSugerida("fallback_base64", msg), duracao_ms: Math.round(performance.now() - tB64) });
            throw new Error(`Não foi possível enviar o arquivo: ${msg}`);
          }
        }
      } else {
        setPasso("permissao_storage", { status: "skip", detalhe: "Sem arquivo (apenas texto)" });
        setPasso("upload", { status: "skip", detalhe: "Sem arquivo (apenas texto)" });
        setPasso("leitura_storage", { status: "skip", detalhe: "Sem arquivo (apenas texto)" });
        setPasso("fallback_base64", { status: "skip", detalhe: "Sem arquivo (apenas texto)" });
      }

      // 4) Chamada da IA
      const tIa = performance.now();
      let data: any;
      try {
        const resp = await supabase.functions.invoke("ferramentas-analisar-caso", {
          body: {
            texto_livre: textoLivre.trim() || undefined,
            storage_path: path || undefined,
            mime_type: mime,
            arquivo_base64: arquivoBase64,
          },
        });
        if (resp.error) throw resp.error;
        if (resp.data?.error) throw new Error(resp.data.error);
        data = resp.data;
        setPasso("ia", { status: "ok", detalhe: "IA respondeu com sucesso", duracao_ms: Math.round(performance.now() - tIa) });
      } catch (iaErr) {
        const msg = iaErr instanceof Error ? iaErr.message : String(iaErr);
        setPasso("ia", { status: "erro", detalhe: msg, causa_provavel: causaProvavel("ia", msg), duracao_ms: Math.round(performance.now() - tIa) });
        throw iaErr;
      }

      // 5) Parsing do resultado
      const tParse = performance.now();
      try {
        if (!data?.dados_extraidos || typeof data.dados_extraidos !== "object") {
          throw new Error("Resposta sem dados_extraidos");
        }
        setResultado(data.dados_extraidos);
        setPasso("parsing", { status: "ok", detalhe: "Dados estruturados aceitos", duracao_ms: Math.round(performance.now() - tParse) });
        toast.success("Análise concluída!");
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        setPasso("parsing", { status: "erro", detalhe: msg, causa_provavel: causaProvavel("parsing", msg), duracao_ms: Math.round(performance.now() - tParse) });
        throw parseErr;
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao analisar documento");
    } finally {
      setAnalisando(false);
    }
  }

  async function salvar() {
    if (!resultado || !user) return;
    setSalvando(true);
    try {
      const { data, error } = await supabase
        .from("ferramentas_analises_caso")
        .insert({
          tipo_documento: (resultado.tipo_documento as never) || "outro",
          titulo: titulo || (arquivo?.name ?? "Análise sem título"),
          arquivo_nome: arquivo?.name ?? null,
          arquivo_url: storagePath,
          texto_origem: textoLivre || null,
          dados_extraidos: resultado as never,
          cliente_id: clienteId || null,
          processo_id: processoId || null,
          criado_por: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Se houver cliente vinculado, registra também na aba Atendimentos do cliente
      if (clienteId) {
        const partes = [
          resultado.resumo_fatos && `Resumo: ${resultado.resumo_fatos}`,
          resultado.motivo_negativa_decisao && `Motivo: ${resultado.motivo_negativa_decisao}`,
          resultado.estrategia_sugerida && `Estratégia sugerida: ${resultado.estrategia_sugerida}`,
        ].filter(Boolean) as string[];
        const resumoTexto = partes.length > 0
          ? partes.join("\n\n")
          : `Análise de caso: ${resultado.tipo_documento ?? "documento"}.`;
        await registrarAtendimento({
          clienteId,
          titulo: titulo || (arquivo?.name ?? "Análise de caso"),
          resumo: resumoTexto,
          ferramenta: "analisador_caso",
          link: `/ferramentas/analisador-caso?id=${data.id}`,
          processoId: processoId || null,
          metadados: {
            tipo_documento: resultado.tipo_documento ?? null,
            urgencia: resultado.urgencia ?? null,
          },
          criadoPor: user.id,
        });
      }

      toast.success("Análise salva no histórico!");
      navigate(`/ferramentas/analisador-caso?id=${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  function criarProcessoDaAnalise() {
    if (!resultado) return;
    const ident = resultado.dados_identificacao ?? {};
    const tipoMap: Record<string, "judicial" | "administrativo"> = {
      indeferimento_inss: "administrativo",
      processo_administrativo: "administrativo",
      carta_concessao: "administrativo",
    };
    const tipo = tipoMap[resultado.tipo_documento ?? ""] ?? "judicial";

    // Normaliza área para os valores aceitos pelo enum do form
    const AREAS_VALIDAS = new Set([
      "previdenciario", "familia", "civil", "trabalhista",
      "tributario", "consumidor", "criminal", "administrativo", "outro",
    ]);
    const areaNorm = (resultado.area_direito ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const area = AREAS_VALIDAS.has(areaNorm) ? areaNorm : "";

    // Normaliza datas vindas como "DD/MM/AAAA" para ISO
    const toISO = (v?: string) => {
      if (!v) return "";
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : "";
    };

    const obs: string[] = [];
    if (resultado.resumo_fatos) obs.push(`Resumo dos fatos:\n${resultado.resumo_fatos}`);
    if (resultado.motivo_negativa_decisao) obs.push(`Motivo da decisão / negativa:\n${resultado.motivo_negativa_decisao}`);
    if (resultado.estrategia_sugerida) obs.push(`Estratégia sugerida:\n${resultado.estrategia_sugerida}`);
    const dadosLinhas: string[] = [];
    if (ident.nome_segurado) dadosLinhas.push(`Segurado: ${ident.nome_segurado}`);
    if (ident.cpf) dadosLinhas.push(`CPF: ${ident.cpf}`);
    if (ident.nb) dadosLinhas.push(`NB: ${ident.nb}`);
    if (ident.der) dadosLinhas.push(`DER: ${ident.der}`);
    if (ident.dib) dadosLinhas.push(`DIB: ${ident.dib}`);
    if (ident.dcb) dadosLinhas.push(`DCB: ${ident.dcb}`);
    if (ident.cid) dadosLinhas.push(`CID: ${ident.cid}`);
    if (ident.tipo_beneficio) dadosLinhas.push(`Tipo de benefício: ${ident.tipo_beneficio}`);
    if (dadosLinhas.length) obs.push(`Dados identificados:\n${dadosLinhas.join("\n")}`);
    if (resultado.pontos_favoraveis?.length) {
      obs.push(`Pontos favoráveis:\n- ${resultado.pontos_favoraveis.join("\n- ")}`);
    }
    if (resultado.pontos_desfavoraveis?.length) {
      obs.push(`Pontos desfavoráveis:\n- ${resultado.pontos_desfavoraveis.join("\n- ")}`);
    }

    navigate("/processos/novo", {
      state: {
        prefill: {
          cliente_id: clienteId || "",
          tipo,
          area_direito: area,
          tipo_acao: ident.tipo_beneficio ?? "",
          nb_inss: ident.nb ?? "",
          data_der: toISO(ident.der),
          observacoes_internas: obs.join("\n\n"),
        },
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analisador de caso jurídico"
        description="Envie um documento e a IA extrai resumo, pontos favoráveis/desfavoráveis e estratégia sugerida."
      />

      <Card className="p-6 space-y-4">
        <div>
          <Label className="mb-2 block">Documento (PDF ou imagem)</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-gold/40 transition">
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="cursor-pointer text-sm">
              {arquivo ? (
                <span className="text-foreground font-medium">{arquivo.name}</span>
              ) : (
                <>
                  <span className="text-gold font-medium">Clique para selecionar</span>{" "}
                  <span className="text-muted-foreground">ou arraste o arquivo aqui</span>
                </>
              )}
            </label>
            <p className="text-xs text-muted-foreground mt-1">PDF ou imagem · até 20MB</p>
          </div>
        </div>

        <div>
          <Label htmlFor="texto" className="mb-2 block">
            Ou cole o texto do documento
          </Label>
          <Textarea
            id="texto"
            value={textoLivre}
            onChange={(e) => setTextoLivre(e.target.value)}
            placeholder="Cole aqui o texto integral do documento..."
            rows={6}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-2 block">Cliente vinculado (opcional)</Label>
            <Select value={clienteId || "none"} onValueChange={(v) => setClienteId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sem vinculação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem vinculação</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}{c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Processo vinculado (opcional)</Label>
            <Select
              value={processoId || "none"}
              onValueChange={(v) => setProcessoId(v === "none" ? "" : v)}
              disabled={!clienteId}
            >
              <SelectTrigger>
                <SelectValue placeholder={clienteId ? "Sem vinculação" : "Selecione um cliente primeiro"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem vinculação</SelectItem>
                {processos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.numero_cnj || "Sem CNJ"}{p.tipo_acao ? ` · ${p.tipo_acao}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={analisar} disabled={analisando} className="w-full sm:w-auto">
          {analisando ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analisando...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" /> Analisar com IA
            </>
          )}
        </Button>
      </Card>

      {diagnostico && <DiagnosticoPainel passos={diagnostico} onLimpar={() => setDiagnostico(null)} />}

      {resultado && (
        <Card className="p-6 space-y-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {resultado.tipo_documento?.replace(/_/g, " ") || "—"}
                </Badge>
                {resultado.area_direito && (
                  <Badge variant="outline" className="capitalize">{resultado.area_direito}</Badge>
                )}
                {resultado.urgencia && (
                  <Badge className={URGENCIA_COLOR[resultado.urgencia]}>
                    Urgência {resultado.urgencia}
                  </Badge>
                )}
              </div>
              {resultado.prazo_atencao && (
                <p className="text-sm flex items-center gap-2 text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                  {resultado.prazo_atencao}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder="Título da análise"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm bg-background"
              />
              <Button onClick={salvar} disabled={salvando} size="sm">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
              <Button onClick={criarProcessoDaAnalise} variant="secondary" size="sm">
                <FilePlus2 className="w-4 h-4 mr-1" />
                Criar processo
              </Button>
            </div>
          </div>

          {(clienteId || processoId) && (
            <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
              Vinculado a:{" "}
              {clienteId && <span className="font-medium">{clientes.find((c) => c.id === clienteId)?.nome}</span>}
              {processoId && (
                <>
                  {" · processo "}
                  <span className="font-medium">{processos.find((p) => p.id === processoId)?.numero_cnj || "sem CNJ"}</span>
                </>
              )}
            </div>
          )}

          {resultado.dados_identificacao && Object.values(resultado.dados_identificacao).some(Boolean) && (
            <div>
              <h3 className="font-display text-lg mb-2">Dados identificados</h3>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {Object.entries(resultado.dados_identificacao)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}:</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {resultado.resumo_fatos && (
            <div>
              <h3 className="font-display text-lg mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Resumo dos fatos
              </h3>
              <p className="text-sm leading-relaxed">{resultado.resumo_fatos}</p>
            </div>
          )}

          {resultado.motivo_negativa_decisao && (
            <div>
              <h3 className="font-display text-lg mb-2">Motivo da decisão / negativa</h3>
              <p className="text-sm leading-relaxed">{resultado.motivo_negativa_decisao}</p>
            </div>
          )}

          <Separator />

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-display text-lg mb-2 flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" /> Pontos favoráveis
              </h3>
              <ul className="space-y-1.5 text-sm">
                {(resultado.pontos_favoraveis ?? []).map((p, i) => (
                  <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span>{p}</li>
                ))}
                {!resultado.pontos_favoraveis?.length && (
                  <li className="text-muted-foreground italic">Nenhum identificado</li>
                )}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-lg mb-2 flex items-center gap-2 text-red-600">
                <XCircle className="w-4 h-4" /> Pontos desfavoráveis
              </h3>
              <ul className="space-y-1.5 text-sm">
                {(resultado.pontos_desfavoraveis ?? []).map((p, i) => (
                  <li key={i} className="flex gap-2"><span className="text-red-600">✗</span>{p}</li>
                ))}
                {!resultado.pontos_desfavoraveis?.length && (
                  <li className="text-muted-foreground italic">Nenhum identificado</li>
                )}
              </ul>
            </div>
          </div>

          {resultado.teses_juridicas_aplicaveis?.length ? (
            <div>
              <h3 className="font-display text-lg mb-2">Teses jurídicas aplicáveis</h3>
              <div className="space-y-2">
                {resultado.teses_juridicas_aplicaveis.map((t, i) => (
                  <div key={i} className="border rounded p-3 text-sm">
                    <div className="font-medium">{t.tese}</div>
                    <div className="text-muted-foreground text-xs mt-1">{t.descricao}</div>
                    {t.motivo && <div className="text-xs mt-1">→ {t.motivo}</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {resultado.estrategia_sugerida && (
            <div className="bg-gold/5 border border-gold/20 rounded p-4">
              <h3 className="font-display text-lg mb-2 text-gold">Estratégia sugerida</h3>
              <p className="text-sm leading-relaxed">{resultado.estrategia_sugerida}</p>
            </div>
          )}

          {resultado.observacoes_adicionais && (
            <p className="text-xs text-muted-foreground italic">{resultado.observacoes_adicionais}</p>
          )}
        </Card>
      )}
    </div>
  );
}

function DiagnosticoPainel({ passos, onLimpar }: { passos: DiagPasso[]; onLimpar: () => void }) {
  const houveErro = passos.some((p) => p.status === "erro");
  const primeiroErro = passos.find((p) => p.status === "erro");
  const tudoOk = passos.every((p) => p.status === "ok" || p.status === "skip");

  const ICONE: Record<DiagStatus, JSX.Element> = {
    pendente: <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />,
    ok: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    skip: <span className="w-4 h-4 inline-flex items-center justify-center text-muted-foreground text-xs">—</span>,
    erro: <XCircle className="w-4 h-4 text-red-600" />,
    aviso: <AlertTriangle className="w-4 h-4 text-amber-600" />,
  };

  const ROTULO_STATUS: Record<DiagStatus, string> = {
    pendente: "em andamento",
    ok: "OK",
    skip: "ignorada",
    erro: "FALHOU",
    aviso: "AVISO",
  };

  function copiarRelatorio() {
    const linhas = [
      "Diagnóstico — Analisador de Caso Jurídico",
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      "",
      ...passos.map((p) =>
        `[${ROTULO_STATUS[p.status].toUpperCase()}] ${p.rotulo}` +
        (p.duracao_ms != null ? ` (${p.duracao_ms} ms)` : "") +
        (p.detalhe ? `\n   detalhe: ${p.detalhe}` : "") +
        (p.causa_provavel ? `\n   causa provável: ${p.causa_provavel}` : "") +
        (p.acao_sugerida ? `\n   ação sugerida: ${p.acao_sugerida}` : ""),
      ),
    ].join("\n");
    navigator.clipboard.writeText(linhas).then(
      () => toast.success("Relatório copiado para a área de transferência"),
      () => toast.error("Não foi possível copiar"),
    );
  }

  return (
    <Card className={`p-5 space-y-4 border-2 ${houveErro ? "border-red-500/40" : tudoOk ? "border-emerald-500/40" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-display text-base">
            Diagnóstico da análise
          </h3>
          {houveErro && primeiroErro && (
            <Badge variant="outline" className="border-red-500/40 text-red-600">
              Falhou em: {primeiroErro.rotulo}
            </Badge>
          )}
          {tudoOk && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
              Todas as etapas concluídas
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={copiarRelatorio}>
            <Copy className="w-3.5 h-3.5 mr-1" /> Copiar relatório
          </Button>
          <Button variant="ghost" size="sm" onClick={onLimpar}>
            Fechar
          </Button>
        </div>
      </div>

      {houveErro && primeiroErro?.causa_provavel && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-sm space-y-2">
          <div>
            <p className="font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-4 h-4" /> Causa provável
            </p>
            <p className="text-foreground">{primeiroErro.causa_provavel}</p>
          </div>
          {primeiroErro.acao_sugerida && (
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-4 h-4" /> Ação sugerida
              </p>
              <p className="text-foreground">{primeiroErro.acao_sugerida}</p>
            </div>
          )}
          {primeiroErro.detalhe && (
            <p className="text-xs text-muted-foreground break-words">
              <span className="font-medium">Detalhe técnico:</span> {primeiroErro.detalhe}
            </p>
          )}
        </div>
      )}

      <ol className="space-y-2 text-sm">
        {passos.map((p, i) => (
          <li key={p.etapa} className="flex items-start gap-3">
            <span className="text-xs text-muted-foreground tabular-nums w-5 pt-0.5">{i + 1}.</span>
            <span className="pt-0.5">{ICONE[p.status]}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{p.rotulo}</span>
                <span className="text-xs text-muted-foreground">{ROTULO_STATUS[p.status]}</span>
                {p.duracao_ms != null && p.status !== "pendente" && (
                  <span className="text-xs text-muted-foreground">· {p.duracao_ms} ms</span>
                )}
              </div>
              {p.detalhe && (
                <p className="text-xs text-muted-foreground break-words">{p.detalhe}</p>
              )}
              {(p.status === "erro" || p.status === "aviso") && p.causa_provavel && (
                <p className={`text-xs mt-0.5 ${p.status === "erro" ? "text-red-600" : "text-amber-600"}`}>
                  <span className="font-medium">Causa: </span>{p.causa_provavel}
                </p>
              )}
              {(p.status === "erro" || p.status === "aviso") && p.acao_sugerida && (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  <span className="font-medium">Ação: </span>{p.acao_sugerida}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
