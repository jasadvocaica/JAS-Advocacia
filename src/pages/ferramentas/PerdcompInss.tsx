import { useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Receipt,
  Info,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  FileText,
  Calculator,
  Banknote,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidCNPJ } from "@/lib/cpf";
import { avaliarConsistencias, type AcaoId } from "./perdcomp-inss/consistencias";

/* ─────────────── Helpers ─────────────── */
const fmt = (v: number | string) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtPct = (v: number) => `${Number(v || 0).toFixed(2).replace(".", ",")}%`;

// Selic mensal aproximada 2024-2026 ~ 0,83% a.m.
const selic = (meses: number) => Math.pow(1 + 0.0083, meses) - 1;

/* ─────────────── Schemas de validação ─────────────── */
const ANO_ATUAL = new Date().getFullYear();
const MES_ATUAL = new Date().getMonth() + 1;

const cnpjSchema = z
  .string()
  .trim()
  .min(1, "CNPJ é obrigatório")
  .refine((v) => isValidCNPJ(v), "CNPJ inválido (verifique os dígitos)");

const competenciaSchema = z
  .string()
  .trim()
  .min(1, "Competência é obrigatória")
  .regex(/^(0[1-9]|1[0-2])\/(19|20)\d{2}$/, "Use o formato MM/AAAA (ex: 03/2026)")
  .refine((v) => {
    const [m, a] = v.split("/").map(Number);
    if (a < ANO_ATUAL - 10) return false;
    if (a > ANO_ATUAL) return false;
    if (a === ANO_ATUAL && m > MES_ATUAL) return false;
    return true;
  }, `Competência deve estar entre ${String(MES_ATUAL).padStart(2, "0")}/${ANO_ATUAL - 10} e ${String(MES_ATUAL).padStart(2, "0")}/${ANO_ATUAL}`);

const aliquotaSchema = z
  .string()
  .trim()
  .min(1, "Alíquota é obrigatória")
  .refine((v) => !isNaN(Number(v.replace(",", "."))), "Alíquota inválida")
  .refine((v) => {
    const n = Number(v.replace(",", "."));
    return n > 0 && n <= 100;
  }, "Alíquota deve ser maior que 0 e até 100%");

const valorBrutoSchema = z
  .string()
  .trim()
  .min(1, "Valor bruto é obrigatório")
  .refine((v) => !isNaN(Number(v.replace(",", "."))), "Valor inválido")
  .refine((v) => Number(v.replace(",", ".")) > 0, "Valor bruto deve ser maior que zero")
  .refine(
    (v) => Number(v.replace(",", ".")) < 1_000_000_000,
    "Valor bruto excede o limite suportado",
  );

const dadosSchema = z.object({
  cnpjPrestador: cnpjSchema,
  nomePrestador: z.string().trim().min(2, "Informe o nome empresarial").max(200),
  cnpjTomador: cnpjSchema,
  nomeTomador: z.string().trim().min(2, "Informe o nome do tomador").max(200),
  nfseNum: z.string().trim().min(1, "Número da NFS-e é obrigatório").max(30),
  competencia: competenciaSchema,
  aliquota: aliquotaSchema,
  valorBruto: valorBrutoSchema,
});

const calculoSchema = z.object({
  modoMaterial: z.enum(["presuncao", "discriminado"]),
  materialPct: z.string().trim(),
  deducaoDCTF: z
    .string()
    .trim()
    .refine((v) => v === "" || !isNaN(Number(v.replace(",", "."))), "Valor inválido")
    .refine(
      (v) => v === "" || Number(v.replace(",", ".")) >= 0,
      "Dedução não pode ser negativa",
    ),
}).superRefine((data, ctx) => {
  if (data.modoMaterial === "discriminado") {
    const n = Number(data.materialPct.replace(",", "."));
    if (data.materialPct.trim() === "" || isNaN(n)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["materialPct"],
        message: "Informe o % de materiais",
      });
    } else if (n < 0 || n > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["materialPct"],
        message: "Percentual deve estar entre 0 e 100",
      });
    }
  }
});

type Erros = Partial<Record<string, string>>;


/* ─────────────── Tipos de obra (presunção legal) ─────────────── */
const TIPOS_OBRA = [
  { label: "Pavimentação asfáltica", pct: 10 },
  { label: "Pavimentação intertravada / concreto", pct: 10 },
  { label: "Terraplenagem / aterro sanitário / dragagem", pct: 15 },
  { label: "Obras de arte (pontes, viadutos)", pct: 45 },
  { label: "Drenagem", pct: 50 },
  { label: "Demais serviços com equipamentos", pct: 35 },
  { label: "Serviços gerais sem equipamentos mecânicos", pct: 50 },
];

/* ─────────────── Perfis de regime (thresholds de alerta) ───────────────
 * Cada perfil corresponde a uma regra/regime tributário com faixas típicas
 * de valor bruto e % de materiais. Reduz falsos positivos em retenções
 * que naturalmente fogem da média (ex.: limpeza não tem materiais).
 */
type PerfilRegime = {
  id: string;
  nome: string;
  base: string; // base legal/normativa
  vbMin: number; // valor bruto considerado anormalmente baixo
  vbMax: number; // valor bruto considerado anormalmente alto
  matMin: number; // % materiais (discriminado) considerado baixo
  matMax: number; // % materiais (discriminado) considerado alto
  matFaixaTipica: string; // descrição textual da faixa esperada
  aliquotaPadrao: number; // % padrão da retenção para o regime
};

const PERFIS_REGIME: PerfilRegime[] = [
  {
    id: "construcao_civil",
    nome: "Construção Civil (padrão)",
    base: "Lei 9.711/98 + IN RFB 2.110/22",
    vbMin: 100,
    vbMax: 100_000_000,
    matMin: 5,
    matMax: 95,
    matFaixaTipica: "30% a 80% (obras com fornecimento de materiais)",
    aliquotaPadrao: 11,
  },
  {
    id: "desoneracao",
    nome: "Construção Civil — Desoneração da Folha (CPRB)",
    base: "Lei 12.546/11 + Lei 14.973/24",
    vbMin: 100,
    vbMax: 100_000_000,
    matMin: 5,
    matMax: 95,
    matFaixaTipica: "30% a 80% (mesma faixa do regime padrão)",
    aliquotaPadrao: 3.5,
  },
  {
    id: "limpeza_conservacao",
    nome: "Limpeza, Conservação e Zeladoria",
    base: "Art. 117, II, IN RFB 2.110/22",
    vbMin: 50,
    vbMax: 20_000_000,
    matMin: 0,
    matMax: 15,
    matFaixaTipica: "0% a 15% (serviço majoritariamente de mão de obra)",
    aliquotaPadrao: 11,
  },
  {
    id: "cessao_mao_obra",
    nome: "Cessão de Mão de Obra (geral)",
    base: "Art. 31, Lei 8.212/91 + IN RFB 2.110/22",
    vbMin: 50,
    vbMax: 50_000_000,
    matMin: 0,
    matMax: 30,
    matFaixaTipica: "0% a 30% (predominância de mão de obra)",
    aliquotaPadrao: 11,
  },
  {
    id: "personalizado",
    nome: "Personalizado (definido pelo usuário)",
    base: "Limites manuais — sem amparo normativo automático",
    vbMin: 100,
    vbMax: 100_000_000,
    matMin: 5,
    matMax: 95,
    matFaixaTipica: "definida pelo usuário",
    aliquotaPadrao: 11,
  },
];

const PERFIL_PADRAO_ID = "construcao_civil";
const STORAGE_KEY_PERFIL = "perdcomp_inss_perfil_v1";
const STORAGE_KEY_OVERRIDES = "perdcomp_inss_thresholds_v1";

/* ─────────────── Subcomponentes ─────────────── */
type AvisoTipo = "info" | "warn" | "ok" | "error" | "gold";

function Aviso({ tipo, children }: { tipo: AvisoTipo; children: React.ReactNode }) {
  const map: Record<AvisoTipo, { className: string; Icon: typeof Info }> = {
    info: {
      className: "border-primary/30 bg-primary/5 text-foreground",
      Icon: Info,
    },
    warn: {
      className: "border-warning/40 bg-warning/10 text-foreground",
      Icon: AlertTriangle,
    },
    ok: {
      className: "border-success/40 bg-success/10 text-foreground",
      Icon: CheckCircle2,
    },
    error: {
      className: "border-destructive/40 bg-destructive/10 text-foreground",
      Icon: XCircle,
    },
    gold: {
      className: "border-gold/40 bg-gold/10 text-foreground",
      Icon: Lightbulb,
    },
  };
  const { className, Icon } = map[tipo];
  return (
    <Alert className={cn("border", className)}>
      <Icon className="h-4 w-4" />
      <AlertDescription className="text-sm leading-relaxed">{children}</AlertDescription>
    </Alert>
  );
}

function Secao({
  title,
  subtitle,
  step,
  children,
}: {
  title: string;
  subtitle?: string;
  step?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gold/30 bg-gradient-to-r from-primary to-primary/80 px-5 py-3">
        {step && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-bold text-primary">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-primary-foreground">{title}</div>
          {subtitle && (
            <div className="text-xs text-primary-foreground/70">{subtitle}</div>
          )}
        </div>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </Card>
  );
}

function LinhaResultado({
  label,
  value,
  highlight,
  sub,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-2",
        highlight
          ? "border border-success/40 bg-success/10"
          : "bg-muted/50",
      )}
    >
      <span
        className={cn(
          "text-sm",
          highlight ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <div className="text-right">
        <div
          className={cn(
            "text-sm font-bold",
            highlight ? "text-success" : "text-foreground",
          )}
        >
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

function CampoRFB({
  campo,
  resposta,
  detalhe,
  obrigatorio = true,
}: {
  campo: string;
  resposta: string;
  detalhe?: string;
  obrigatorio?: boolean;
}) {
  return (
    <div className="border-l-[3px] border-gold pl-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Campo no sistema
        {obrigatorio ? (
          <Badge
            variant="outline"
            className="h-4 border-destructive/40 px-1.5 text-[10px] text-destructive"
          >
            Obrigatório
          </Badge>
        ) : (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            Opcional
          </Badge>
        )}
      </div>
      <div className="my-1 text-sm font-semibold text-foreground">{campo}</div>
      <div className="rounded-md border border-success/30 bg-success/10 px-3 py-1.5 font-mono text-sm font-semibold text-success">
        ➤ {resposta}
      </div>
      {detalhe && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detalhe}</p>
      )}
    </div>
  );
}

/* ─────────────── Página principal ─────────────── */
export default function PerdcompInss() {
  /* Dados da NFS-e */
  const [cnpjPrestador, setCnpjPrestador] = useState("");
  const [nomePrestador, setNomePrestador] = useState("");
  const [cnpjTomador, setCnpjTomador] = useState("");
  const [nomeTomador, setNomeTomador] = useState("");
  const [nfseNum, setNfseNum] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [valorBruto, setValorBruto] = useState("");
  const [aliquota, setAliquota] = useState("11");

  /* Cálculo de base */
  const [tipoEmpreitada, setTipoEmpreitada] = useState<"total" | "parcial" | "indefinido">("parcial");
  const [modoMaterial, setModoMaterial] = useState<"presuncao" | "discriminado">("presuncao");
  const [tipoObra, setTipoObra] = useState(1);
  const [materialPct, setMaterialPct] = useState("");
  const [deducaoDCTF, setDeducaoDCTF] = useState("0");

  /* Dados bancários */
  const [tipoPagamento, setTipoPagamento] = useState<"conta" | "pix">("conta");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [pixChave, setPixChave] = useState("");

  const [tab, setTab] = useState("dados");
  const [erros, setErros] = useState<Erros>({});

  /* Perfil de regime para thresholds de alerta + overrides do usuário.
   * Persistidos em localStorage para sobreviver entre sessões. */
  const [perfilId, setPerfilId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_PERFIL) || PERFIL_PADRAO_ID;
    } catch {
      return PERFIL_PADRAO_ID;
    }
  });
  const [thresholdsOverride, setThresholdsOverride] = useState<
    Partial<Pick<PerfilRegime, "vbMin" | "vbMax" | "matMin" | "matMax">>
  >(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OVERRIDES);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [mostrarConfigAlertas, setMostrarConfigAlertas] = useState(false);

  const perfilAtivo = useMemo(
    () => PERFIS_REGIME.find((p) => p.id === perfilId) ?? PERFIS_REGIME[0],
    [perfilId],
  );

  /** Limites efetivos = perfil + overrides do usuário */
  const thresholds = useMemo(
    () => ({
      vbMin: thresholdsOverride.vbMin ?? perfilAtivo.vbMin,
      vbMax: thresholdsOverride.vbMax ?? perfilAtivo.vbMax,
      matMin: thresholdsOverride.matMin ?? perfilAtivo.matMin,
      matMax: thresholdsOverride.matMax ?? perfilAtivo.matMax,
    }),
    [perfilAtivo, thresholdsOverride],
  );

  const persistirPerfil = (id: string) => {
    setPerfilId(id);
    try {
      localStorage.setItem(STORAGE_KEY_PERFIL, id);
    } catch {
      /* ignore */
    }
  };
  const persistirOverrides = (
    next: Partial<Pick<PerfilRegime, "vbMin" | "vbMax" | "matMin" | "matMax">>,
  ) => {
    setThresholdsOverride(next);
    try {
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const resetarOverrides = () => {
    setThresholdsOverride({});
    try {
      localStorage.removeItem(STORAGE_KEY_OVERRIDES);
    } catch {
      /* ignore */
    }
  };
  const usandoOverride = (
    campo: "vbMin" | "vbMax" | "matMin" | "matMax",
  ) => thresholdsOverride[campo] !== undefined;

  /* Limpa erro de um campo conforme o usuário corrige */
  const limparErro = (campo: string) =>
    setErros((prev) => {
      if (!prev[campo]) return prev;
      const { [campo]: _, ...rest } = prev;
      return rest;
    });

  /* Valida a aba atual e retorna true se ok */
  const validarAba = (origem: "dados" | "calculo"): boolean => {
    const novosErros: Erros = {};

    if (origem === "dados") {
      const r = dadosSchema.safeParse({
        cnpjPrestador,
        nomePrestador,
        cnpjTomador,
        nomeTomador,
        nfseNum,
        competencia,
        aliquota,
        valorBruto,
      });
      if (!r.success) {
        for (const issue of r.error.issues) {
          const k = issue.path[0]?.toString();
          if (k && !novosErros[k]) novosErros[k] = issue.message;
        }
      }
    }

    if (origem === "calculo") {
      const r = calculoSchema.safeParse({ modoMaterial, materialPct, deducaoDCTF });
      if (!r.success) {
        for (const issue of r.error.issues) {
          const k = issue.path[0]?.toString();
          if (k && !novosErros[k]) novosErros[k] = issue.message;
        }
      }
    }

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      toast.error("Verifique os campos destacados antes de avançar.");
      return false;
    }
    return true;
  };

  const irPara = (destino: string, origem?: "dados" | "calculo") => {
    if (origem && !validarAba(origem)) return;
    if (origem === "calculo") {
      const errosCons = consistencias.filter((c) => c.severidade === "error");
      if (errosCons.length > 0) {
        toast.error(
          `Resolva os ${errosCons.length} erro(s) de consistência antes de avançar.`,
        );
        return;
      }
    }
    setTab(destino);
  };

  /* ─────────── Cálculos ─────────── */
  const calc = useMemo(() => {
    const vb = parseFloat(valorBruto) || 0;
    const alq = (parseFloat(aliquota) || 0) / 100;
    const inssRetido = vb * alq;
    const dedDCTF = parseFloat(deducaoDCTF) || 0;
    const presuncaoPct = TIPOS_OBRA[tipoObra]?.pct ?? 35;
    const matPct =
      modoMaterial === "discriminado"
        ? parseFloat(materialPct) || 0
        : 100 - presuncaoPct;
    const bcCorreta = vb * (1 - matPct / 100);
    const inssCorreto = bcCorreta * alq;
    const inssIndevido = Math.max(0, inssRetido - inssCorreto);
    const creditoOriginal = Math.max(0, inssRetido - dedDCTF);

    const [mesComp, anoComp] = competencia.split("/").map(Number);
    const hoje = new Date();
    const mesesAtraso =
      (hoje.getFullYear() - (anoComp || hoje.getFullYear())) * 12 +
      (hoje.getMonth() + 1 - (mesComp || hoje.getMonth() + 1));
    const selicEstimada = mesesAtraso > 1 ? selic(mesesAtraso - 1) : 0;
    const creditoAtualizado = creditoOriginal * (1 + selicEstimada);

    return {
      vb,
      alq,
      inssRetido,
      dedDCTF,
      presuncaoPct,
      matPct,
      bcCorreta,
      inssCorreto,
      inssIndevido,
      creditoOriginal,
      mesesAtraso,
      selicEstimada,
      creditoAtualizado,
    };
  }, [valorBruto, aliquota, deducaoDCTF, tipoObra, modoMaterial, materialPct, competencia]);

  /* ─────────── Verificações de consistência ─────────── */
  // A lógica pura mora em ./perdcomp-inss/consistencias.ts (testada
  // unitariamente). Aqui apenas mapeamos as ações semânticas para
  // handlers reais (setters de estado, navegação, toasts).

  // Helper: retorna competência do mês anterior em formato MM/AAAA
  const competenciaMesAnterior = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };

  // Aplica uma ação rápida + feedback de "recálculo automático"
  const aplicarAcao = (msg: string, fn: () => void) => {
    fn();
    toast.success(msg, { description: "Valores recalculados automaticamente." });
  };

  /** Resolve o handler real para um identificador semântico de ação. */
  const handlerDaAcao = (id: AcaoId): (() => void) => {
    switch (id) {
      case "set_aliquota_11":
        return () => aplicarAcao("Alíquota ajustada para 11%", () => setAliquota("11"));
      case "set_aliquota_3_5":
        return () => aplicarAcao("Alíquota ajustada para 3,5%", () => setAliquota("3.5"));
      case "voltar_dados":
        return () => aplicarAcao("Volte para a aba de dados", () => setTab("dados"));
      case "abrir_config_alertas":
        return () =>
          aplicarAcao("Painel de configuração aberto", () =>
            setMostrarConfigAlertas(true),
          );
      case "recarregar":
        return () => window.location.reload();
      case "modo_presuncao":
        return () =>
          aplicarAcao("Modo alterado para presunção legal", () =>
            setModoMaterial("presuncao"),
          );
      case "modo_discriminado":
        return () =>
          aplicarAcao("Modo alterado para discriminação", () =>
            setModoMaterial("discriminado"),
          );
      case "tipo_total":
        return () =>
          aplicarAcao("Cabimento alterado para empreitada total", () =>
            setTipoEmpreitada("total"),
          );
      case "resetar_materiais":
        return () =>
          aplicarAcao("Materiais resetados — base zerada", () => {
            setModoMaterial("presuncao");
            setMaterialPct("");
          });
      case "zerar_dctf":
        return () => aplicarAcao("Dedução DCTFWeb zerada", () => setDeducaoDCTF("0"));
      case "limitar_dctf_ao_retido":
        return () =>
          aplicarAcao(`Dedução ajustada para ${fmt(calc.inssRetido)}`, () =>
            setDeducaoDCTF(calc.inssRetido.toFixed(2)),
          );
      case "ajustar_competencia_mes_anterior":
        return () => {
          const novaComp = competenciaMesAnterior();
          aplicarAcao(`Competência ajustada para ${novaComp}`, () =>
            setCompetencia(novaComp),
          );
        };
    }
  };

  const consistencias = useMemo(() => {
    const lista = avaliarConsistencias({
      calc,
      tipoEmpreitada,
      modoMaterial,
      materialPctRaw: materialPct,
      thresholds,
      perfilAtivo,
      overrides: {
        vbMin: usandoOverride("vbMin"),
        vbMax: usandoOverride("vbMax"),
        matMin: usandoOverride("matMin"),
        matMax: usandoOverride("matMax"),
      },
    });
    // Anexa handlers reais às ações semânticas para o JSX
    return lista.map((c) => ({
      ...c,
      acoes: c.acoes?.map((a) => ({
        label: a.label,
        hint: a.hint,
        onClick: handlerDaAcao(a.id),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc, tipoEmpreitada, modoMaterial, materialPct, thresholds, perfilAtivo, thresholdsOverride]);

  const PRE_REQUISITOS: [string, string, AvisoTipo][] = [
    [
      "EFD-Reinf R-2020 enviada",
      `A retenção da competência ${competencia || "[informe]"} deve constar no evento R-2020 (Prestador de Serviços) da EFD-Reinf. Sem esse envio, o PER/DCOMP não é possível.`,
      "error",
    ],
    [
      "DCTFWeb da competência transmitida",
      `A DCTFWeb de ${competencia || "[informe]"} deve estar enviada. O PER/DCOMP Web importa os dados automaticamente.`,
      "error",
    ],
    [
      "CND Previdenciária válida",
      "O CNPJ do prestador não pode ter débitos previdenciários em aberto. Consultar no e-CAC.",
      "error",
    ],
    [
      "Certificado Digital A1/A3",
      `Em nome do CNPJ ${cnpjPrestador || "[informe]"}. Necessário para acessar o e-CAC.`,
      "error",
    ],
    [
      "Dados bancários do prestador",
      "Conta corrente ou PIX no CNPJ do prestador para receber a restituição.",
      "warn",
    ],
    [
      "Documentação física pronta",
      "NFS-e, contrato, boletins de medição, NFs de materiais — a RFB pode solicitar.",
      "warn",
    ],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="PER/DCOMP INSS Retido"
        description="Recuperação de INSS retido na fonte — Lei 9.711/98 · Construção civil"
      />

      {/* Resumo no topo */}
      <Card className="border-gold/30 bg-gradient-to-br from-primary to-primary/90 p-5 text-primary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-bold tracking-[3px] text-gold">
              FERRAMENTA TRIBUTÁRIA
            </div>
            <h2 className="mt-1 font-display text-xl">Calculadora PER/DCOMP</h2>
            <p className="text-xs text-primary-foreground/70">
              Lei 9.711/98 · IN RFB 971/2009 · IN RFB 2.289/2025
            </p>
          </div>
          <div className="rounded-lg border border-gold/40 bg-background/10 px-4 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-primary-foreground/70">
              Crédito estimado
            </div>
            <div className="font-display text-2xl font-bold text-gold">
              {fmt(calc.creditoOriginal)}
            </div>
            {calc.selicEstimada > 0 && (
              <div className="text-[10px] text-primary-foreground/70">
                + SELIC: {fmt(calc.creditoAtualizado)}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="dados" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">1. Dados NFS-e</span>
            <span className="sm:hidden">Dados</span>
          </TabsTrigger>
          <TabsTrigger value="calculo" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">2. Cálculo</span>
            <span className="sm:hidden">Cálculo</span>
          </TabsTrigger>
          <TabsTrigger value="preench" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">3. PER/DCOMP</span>
            <span className="sm:hidden">PER/DCOMP</span>
          </TabsTrigger>
          <TabsTrigger value="relatorio" className="gap-1.5">
            <Banknote className="h-4 w-4" />
            <span className="hidden sm:inline">4. Relatório</span>
            <span className="sm:hidden">Relatório</span>
          </TabsTrigger>
        </TabsList>

        {/* ════════ ABA 1 — DADOS DA NFS-e ════════ */}
        <TabsContent value="dados" className="space-y-4">
          <Aviso tipo="info">
            Preencha os dados conforme constam na NFS-e e no contrato. Eles serão usados
            para pré-preencher o relatório e o gabarito do PER/DCOMP automaticamente.
          </Aviso>

          <Secao title="Dados do Prestador (quem sofreu a retenção)" step="A">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CNPJ do Prestador *</Label>
                <Input
                  value={cnpjPrestador}
                  onChange={(e) => {
                    setCnpjPrestador(e.target.value);
                    limparErro("cnpjPrestador");
                  }}
                  placeholder="00.000.000/0000-00"
                  className={cn("font-mono", erros.cnpjPrestador && "border-destructive")}
                  aria-invalid={!!erros.cnpjPrestador}
                  maxLength={18}
                />
                {erros.cnpjPrestador && (
                  <p className="text-xs text-destructive">{erros.cnpjPrestador}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Nome Empresarial *</Label>
                <Input
                  value={nomePrestador}
                  onChange={(e) => {
                    setNomePrestador(e.target.value);
                    limparErro("nomePrestador");
                  }}
                  className={cn(erros.nomePrestador && "border-destructive")}
                  aria-invalid={!!erros.nomePrestador}
                  maxLength={200}
                />
                {erros.nomePrestador && (
                  <p className="text-xs text-destructive">{erros.nomePrestador}</p>
                )}
              </div>
            </div>
            <Aviso tipo="gold">
              O prestador é quem protocola o PER/DCOMP — precisa de certificado digital
              A1/A3 no CNPJ e CND previdenciária em dia.
            </Aviso>
          </Secao>

          <Secao title="Dados do Tomador (quem efetuou a retenção)" step="B">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>CNPJ do Tomador *</Label>
                <Input
                  value={cnpjTomador}
                  onChange={(e) => {
                    setCnpjTomador(e.target.value);
                    limparErro("cnpjTomador");
                  }}
                  placeholder="00.000.000/0000-00"
                  className={cn("font-mono", erros.cnpjTomador && "border-destructive")}
                  aria-invalid={!!erros.cnpjTomador}
                  maxLength={18}
                />
                {erros.cnpjTomador && (
                  <p className="text-xs text-destructive">{erros.cnpjTomador}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Nome do Tomador *</Label>
                <Input
                  value={nomeTomador}
                  onChange={(e) => {
                    setNomeTomador(e.target.value);
                    limparErro("nomeTomador");
                  }}
                  className={cn(erros.nomeTomador && "border-destructive")}
                  aria-invalid={!!erros.nomeTomador}
                  maxLength={200}
                />
                {erros.nomeTomador && (
                  <p className="text-xs text-destructive">{erros.nomeTomador}</p>
                )}
              </div>
            </div>
          </Secao>

          <Secao title="Dados da NFS-e" step="C">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Número da NFS-e *</Label>
                <Input
                  value={nfseNum}
                  onChange={(e) => {
                    setNfseNum(e.target.value);
                    limparErro("nfseNum");
                  }}
                  className={cn(erros.nfseNum && "border-destructive")}
                  aria-invalid={!!erros.nfseNum}
                  maxLength={30}
                />
                {erros.nfseNum && (
                  <p className="text-xs text-destructive">{erros.nfseNum}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Competência (MM/AAAA) *</Label>
                <Input
                  value={competencia}
                  onChange={(e) => {
                    setCompetencia(e.target.value);
                    limparErro("competencia");
                  }}
                  placeholder="03/2026"
                  className={cn(erros.competencia && "border-destructive")}
                  aria-invalid={!!erros.competencia}
                  maxLength={7}
                />
                {erros.competencia ? (
                  <p className="text-xs text-destructive">{erros.competencia}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Mês/ano da prestação do serviço
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Alíquota Retida (%) *</Label>
                <Input
                  value={aliquota}
                  onChange={(e) => {
                    setAliquota(e.target.value);
                    limparErro("aliquota");
                  }}
                  inputMode="decimal"
                  className={cn(erros.aliquota && "border-destructive")}
                  aria-invalid={!!erros.aliquota}
                  maxLength={6}
                />
                {erros.aliquota && (
                  <p className="text-xs text-destructive">{erros.aliquota}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Valor Bruto do Serviço (R$) *</Label>
              <Input
                value={valorBruto}
                onChange={(e) => {
                  setValorBruto(e.target.value);
                  limparErro("valorBruto");
                }}
                inputMode="decimal"
                placeholder="0,00"
                className={cn(erros.valorBruto && "border-destructive")}
                aria-invalid={!!erros.valorBruto}
                maxLength={15}
              />
              {erros.valorBruto ? (
                <p className="text-xs text-destructive">{erros.valorBruto}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Total antes de qualquer retenção
                </p>
              )}
            </div>
            <LinhaResultado
              label="INSS Retido Calculado"
              value={fmt(calc.inssRetido)}
              highlight
            />
          </Secao>

          <div className="flex justify-end">
            <Button onClick={() => irPara("calculo", "dados")} variant="gold">
              Próximo: Calcular Crédito
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </TabsContent>

        {/* ════════ ABA 2 — CÁLCULO ════════ */}
        <TabsContent value="calculo" className="space-y-4">
          {/* ─── Painel de configuração de alertas (perfil + thresholds) ─── */}
          <Card className="overflow-hidden border-primary/30">
            <button
              type="button"
              onClick={() => setMostrarConfigAlertas((v) => !v)}
              className="flex w-full items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  Perfil de regras dos alertas
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {perfilAtivo.nome}
                </Badge>
                {(usandoOverride("vbMin") ||
                  usandoOverride("vbMax") ||
                  usandoOverride("matMin") ||
                  usandoOverride("matMax")) && (
                  <Badge
                    variant="outline"
                    className="border-warning/40 bg-warning/10 text-[10px]"
                  >
                    com overrides
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {mostrarConfigAlertas ? "Ocultar" : "Configurar alertas"}
              </span>
            </button>

            {mostrarConfigAlertas && (
              <div className="space-y-4 p-4">
                <div className="space-y-2">
                  <Label className="text-xs">
                    Regime / regra aplicável (define faixas esperadas)
                  </Label>
                  <Select value={perfilId} onValueChange={persistirPerfil}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERFIS_REGIME.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex flex-col">
                            <span className="text-sm">{p.nome}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {p.base}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Faixa típica de materiais neste perfil:{" "}
                    <strong>{perfilAtivo.matFaixaTipica}</strong>. Alíquota
                    padrão: {fmtPct(perfilAtivo.aliquotaPadrao)}.
                  </p>
                </div>

                <Separator />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Valor bruto mínimo (R$){" "}
                      {usandoOverride("vbMin") && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[9px]"
                        >
                          override
                        </Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={thresholds.vbMin}
                      onChange={(e) =>
                        persistirOverrides({
                          ...thresholdsOverride,
                          vbMin: Number(e.target.value),
                        })
                      }
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Padrão do perfil: {fmt(perfilAtivo.vbMin)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Valor bruto máximo (R$){" "}
                      {usandoOverride("vbMax") && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[9px]"
                        >
                          override
                        </Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={thresholds.vbMax}
                      onChange={(e) =>
                        persistirOverrides({
                          ...thresholdsOverride,
                          vbMax: Number(e.target.value),
                        })
                      }
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Padrão do perfil: {fmt(perfilAtivo.vbMax)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Materiais mínimos (%){" "}
                      {usandoOverride("matMin") && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[9px]"
                        >
                          override
                        </Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={thresholds.matMin}
                      onChange={(e) =>
                        persistirOverrides({
                          ...thresholdsOverride,
                          matMin: Number(e.target.value),
                        })
                      }
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Padrão do perfil: {fmtPct(perfilAtivo.matMin)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Materiais máximos (%){" "}
                      {usandoOverride("matMax") && (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[9px]"
                        >
                          override
                        </Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={thresholds.matMax}
                      onChange={(e) =>
                        persistirOverrides({
                          ...thresholdsOverride,
                          matMax: Number(e.target.value),
                        })
                      }
                      className="h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Padrão do perfil: {fmtPct(perfilAtivo.matMax)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    Limites são salvos no seu navegador. Use overrides para
                    reduzir falsos positivos no seu fluxo.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      resetarOverrides();
                      toast.success("Limites restaurados ao padrão do perfil");
                    }}
                  >
                    Restaurar padrão do perfil
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {consistencias.length > 0 && (
            <Card className="overflow-hidden border-warning/40">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-semibold">
                    Verificações de consistência
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {consistencias.some((c) => c.severidade === "error") && (
                    <Badge variant="destructive" className="text-[10px]">
                      {consistencias.filter((c) => c.severidade === "error").length}{" "}
                      erro(s)
                    </Badge>
                  )}
                  {consistencias.some((c) => c.severidade === "warn") && (
                    <Badge
                      variant="outline"
                      className="border-warning/40 bg-warning/10 text-[10px]"
                    >
                      {consistencias.filter((c) => c.severidade === "warn").length}{" "}
                      alerta(s)
                    </Badge>
                  )}
                </div>
              </div>
              <div className="space-y-2 p-4">
                {consistencias.map((c) => (
                  <Aviso key={c.id} tipo={c.severidade === "error" ? "error" : "warn"}>
                    <div className="space-y-2">
                      <div>
                        <strong>{c.titulo}.</strong> {c.descricao}
                      </div>
                      {c.motivo && (
                        <div className="flex items-start gap-1.5 rounded-md border border-muted-foreground/20 bg-muted/40 px-2.5 py-1.5 text-xs">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            <strong className="text-foreground/80">Motivo do enquadramento:</strong>{" "}
                            {c.motivo}
                          </span>
                        </div>
                      )}
                      {c.dica && (
                        <div className="flex items-start gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="text-foreground/90">
                            <strong>Dica:</strong> {c.dica}
                          </span>
                        </div>
                      )}
                      {c.acoes && c.acoes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {c.acoes.map((a, i) => (
                            <Button
                              key={i}
                              type="button"
                              size="sm"
                              variant={
                                c.severidade === "error" && i === 0
                                  ? "default"
                                  : "outline"
                              }
                              className="h-7 text-xs"
                              onClick={a.onClick}
                              title={a.hint}
                            >
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </Aviso>
                ))}
              </div>
            </Card>
          )}

          <Secao title="Tipo de Empreitada (definição do cabimento)" step="1">
            <Aviso tipo="warn">
              Esta classificação determina se a retenção era devida. Consulte o contrato
              para confirmar.
            </Aviso>
            <RadioGroup
              value={tipoEmpreitada}
              onValueChange={(v) => setTipoEmpreitada(v as typeof tipoEmpreitada)}
              className="space-y-2"
            >
              {[
                {
                  v: "total",
                  l: "Empreitada TOTAL",
                  hint: "Empresa assume responsabilidade integral por toda a obra. Com tomador público: retenção era DISPENSADA (SC COSIT 65/2020 + IN RFB 2.289/2025). Crédito = 100% do retido.",
                },
                {
                  v: "parcial",
                  l: "Empreitada PARCIAL",
                  hint: "Execução de parte da obra. Retenção era obrigatória. Crédito = excesso sobre base correta (materiais deduzidos).",
                },
                {
                  v: "indefinido",
                  l: "Ainda não analisado",
                  hint: "Solicite o contrato para classificar. Use este campo para cálculo estimado.",
                },
              ].map((opt) => (
                <Label
                  key={opt.v}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                    tipoEmpreitada === opt.v
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <RadioGroupItem value={opt.v} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{opt.l}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {opt.hint}
                    </p>
                  </div>
                </Label>
              ))}
            </RadioGroup>
            {tipoEmpreitada === "total" && (
              <Aviso tipo="ok">
                <strong>Empreitada Total confirmada.</strong> O Município estava
                DISPENSADO de reter (art. 157 IN RFB 971/2009; IN RFB 2.289/2025).
                Crédito = valor total retido: <strong>{fmt(calc.inssRetido)}</strong>.
              </Aviso>
            )}
          </Secao>

          {tipoEmpreitada !== "total" && (
            <Secao title="Base de Cálculo Correta (dedução de materiais)" step="2">
              <Aviso tipo="info">
                Art. 121 da IN RFB 971/2009: materiais e equipamentos NÃO integram a
                base de cálculo do INSS. Escolha como calcular:
              </Aviso>
              <RadioGroup
                value={modoMaterial}
                onValueChange={(v) => setModoMaterial(v as typeof modoMaterial)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {[
                  { v: "presuncao", l: "📐 Presunção legal (tabela RFB)" },
                  { v: "discriminado", l: "📄 % real discriminado" },
                ].map((opt) => (
                  <Label
                    key={opt.v}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                      modoMaterial === opt.v
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <RadioGroupItem value={opt.v} />
                    <span className="text-sm font-medium">{opt.l}</span>
                  </Label>
                ))}
              </RadioGroup>

              {modoMaterial === "presuncao" && (
                <div className="space-y-1.5">
                  <Label>Tipo de obra *</Label>
                  <Select
                    value={String(tipoObra)}
                    onValueChange={(v) => setTipoObra(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_OBRA.map((o, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {o.label} — base mínima: {o.pct}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {modoMaterial === "discriminado" && (
                <div className="space-y-1.5">
                  <Label>% de materiais/equipamentos discriminados *</Label>
                  <Input
                    value={materialPct}
                    onChange={(e) => {
                      setMaterialPct(e.target.value);
                      limparErro("materialPct");
                    }}
                    inputMode="decimal"
                    placeholder="Ex: 60"
                    className={cn(erros.materialPct && "border-destructive")}
                    aria-invalid={!!erros.materialPct}
                    maxLength={6}
                  />
                  {erros.materialPct ? (
                    <p className="text-xs text-destructive">{erros.materialPct}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Conforme contrato, boletim de medição ou NFS-e
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5 rounded-md bg-muted/50 p-4">
                <div className="text-sm font-semibold text-foreground">
                  Cálculo da retenção correta
                </div>
                <LinhaResultado label="Valor bruto da NFS-e" value={fmt(calc.vb)} />
                <LinhaResultado
                  label={`(-) Materiais/equipamentos (${fmtPct(calc.matPct)})`}
                  value={`- ${fmt((calc.vb * calc.matPct) / 100)}`}
                />
                <LinhaResultado
                  label="= Base de cálculo correta (mão de obra)"
                  value={fmt(calc.bcCorreta)}
                />
                <LinhaResultado
                  label={`INSS correto (${fmtPct(calc.alq * 100)} × BC)`}
                  value={fmt(calc.inssCorreto)}
                />
                <LinhaResultado
                  label="INSS retido pelo tomador"
                  value={fmt(calc.inssRetido)}
                />
                <LinhaResultado
                  label="INSS retido a maior (crédito)"
                  value={fmt(calc.inssIndevido)}
                  highlight
                />
              </div>
            </Secao>
          )}

          <Secao title="Dedução já utilizada na DCTFWeb" step="3">
            <Aviso tipo="info">
              Se o prestador já utilizou parte do crédito de retenção para abater
              débitos na DCTFWeb da mesma competência, informe aqui. O PER/DCOMP pedirá
              apenas o SALDO restante.
            </Aviso>
            <div className="space-y-1.5">
              <Label>Valor já deduzido na DCTFWeb (R$)</Label>
              <Input
                value={deducaoDCTF}
                onChange={(e) => {
                  setDeducaoDCTF(e.target.value);
                  limparErro("deducaoDCTF");
                }}
                inputMode="decimal"
                placeholder="0,00"
                className={cn(erros.deducaoDCTF && "border-destructive")}
                aria-invalid={!!erros.deducaoDCTF}
                maxLength={15}
              />
              {erros.deducaoDCTF ? (
                <p className="text-xs text-destructive">{erros.deducaoDCTF}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Se não houve dedução, deixe 0,00. Este valor vem da DCTFWeb da
                  competência.
                </p>
              )}
            </div>
            <div className="space-y-1.5 rounded-md border-2 border-gold/40 bg-gold/5 p-4">
              <div className="text-sm font-semibold text-foreground">
                Resumo do crédito a pedir
              </div>
              <LinhaResultado label="INSS retido total" value={fmt(calc.inssRetido)} />
              {tipoEmpreitada === "parcial" && (
                <LinhaResultado
                  label="Parcela indevida (materiais)"
                  value={fmt(calc.inssIndevido)}
                />
              )}
              <LinhaResultado
                label="(-) Já deduzido na DCTFWeb"
                value={`- ${fmt(calc.dedDCTF)}`}
              />
              <LinhaResultado
                label="= Crédito Líquido para PER/DCOMP"
                value={fmt(calc.creditoOriginal)}
                highlight
                sub={
                  calc.selicEstimada > 0
                    ? `Com SELIC estimada: ${fmt(calc.creditoAtualizado)}`
                    : undefined
                }
              />
            </div>
          </Secao>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setTab("dados")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar
            </Button>
            <Button variant="gold" onClick={() => irPara("preench", "calculo")}>
              Próximo: Preencher PER/DCOMP
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </TabsContent>

        {/* ════════ ABA 3 — PREENCHIMENTO ════════ */}
        <TabsContent value="preench" className="space-y-4">
          <Aviso tipo="gold">
            <strong>Manual oficial RFB v31/05/2025.</strong> Cada campo abaixo é
            exatamente como aparece no PER/DCOMP Web do e-CAC. A resposta destacada é
            o que você digita/seleciona no sistema.
          </Aviso>

          <Secao title="Pré-Requisitos — Antes de Abrir o e-CAC" step="0">
            <Aviso tipo="warn">Confirme todos antes de iniciar o preenchimento.</Aviso>
            <div className="space-y-2">
              {PRE_REQUISITOS.map(([titulo, desc], i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-start gap-3 rounded-md bg-muted/50 p-3"
                >
                  <Checkbox className="mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {titulo}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </Secao>

          <Secao
            title="Etapa a — Identificar Documento"
            subtitle="e-CAC › Restituição e Compensação › PER/DCOMP Web › Novo PER/DCOMP"
            step="a"
          >
            <CampoRFB
              campo="Tipo de Documento"
              resposta="Pedido de Restituição"
              detalhe="Escolha 'Pedido de Restituição' se quer receber o valor em conta. Escolha 'Declaração de Compensação' se preferir usar o crédito para abater outros débitos federais."
            />
            <CampoRFB
              campo="Documento Retificador?"
              resposta="NÃO"
              detalhe="Só marque SIM se estiver corrigindo um PER/DCOMP já transmitido para esta competência."
            />
            <CampoRFB
              campo="Tipo de Crédito"
              resposta="Retenção – Lei nº 9.711/98"
              detalhe="Esta opção específica é para retenção previdenciária sofrida pelo prestador. Não confundir com 'Contribuição Previdenciária Indevida'."
            />
            <CampoRFB
              campo="Apelido para Identificação"
              resposta={`INSS Retido NFS-e ${nfseNum || "[nº]"} – ${competencia || "[comp.]"} – ${nomeTomador || "[tomador]"}`}
              detalhe="Campo livre. Facilita localizar o documento depois em 'Visualizar Documentos'."
              obrigatorio={false}
            />
            <CampoRFB
              campo="Qualificação do Contribuinte"
              resposta="Outra Qualificação"
              detalhe={`Selecione a opção que mais se enquadra na atividade de ${nomePrestador || "[prestador]"}. Para construção civil sem qualificação específica listada, use 'Outra Qualificação'.`}
            />
            <CampoRFB
              campo="Detalhamento do Crédito"
              resposta="O crédito será detalhado neste documento"
              detalhe="Primeira vez pedindo este crédito para esta competência. Se já houve PER/DCOMP anterior, selecionar 'crédito já foi detalhado em PER/DCOMP anterior'."
            />
            <CampoRFB
              campo="Pessoa Jurídica Extinta por Liquidação Voluntária?"
              resposta="NÃO"
              detalhe="Selecionar SIM apenas se a empresa foi baixada."
            />
            <CampoRFB
              campo="Crédito com fundamento em inconstitucionalidade de lei?"
              resposta="NÃO"
              detalhe="A recuperação por excesso de base ou empreitada total não se fundamenta em inconstitucionalidade. Responder NÃO."
            />
          </Secao>

          <Secao
            title="Etapa b — Identificação do Crédito"
            subtitle="Aba: Informar Crédito › Identificação do Crédito"
            step="b"
          >
            <CampoRFB
              campo="Detentor do Crédito"
              resposta="Crédito apurado pelo próprio contribuinte"
              detalhe={`${nomePrestador || "[prestador]"} sofreu diretamente a retenção. Só marcar 'empresa sucedida' se houve fusão/incorporação.`}
            />
            <CampoRFB
              campo="Mês da Competência"
              resposta={competencia.split("/")[0]?.padStart(2, "0") || "—"}
              detalhe="Mês em que a NFS-e foi emitida e o serviço prestado."
            />
            <CampoRFB
              campo="Ano da Competência"
              resposta={competencia.split("/")[1] || "—"}
              detalhe="ATENÇÃO: cada competência = um PER/DCOMP separado."
            />
            <Aviso tipo="warn">
              O sistema verifica se existe EFD-Reinf R-2020 transmitida para esta
              competência. Se não existir, retifique a EFD-Reinf primeiro.
            </Aviso>
          </Secao>

          <Secao
            title="Etapa c — Detalhamento do Crédito"
            subtitle="Aba: Informar Crédito › Detalhamento do Crédito"
            step="c"
          >
            <Aviso tipo="info">
              Esta aba é majoritariamente de conferência. O PER/DCOMP Web importa
              automaticamente os dados da EFD-Reinf R-2020 e DCTFWeb.
            </Aviso>
            <CampoRFB
              campo="Número do Recibo da DCTFWeb"
              resposta="[Preenchido automaticamente pelo sistema]"
              detalhe="O sistema puxará o recibo da última DCTFWeb da competência."
            />
            <CampoRFB
              campo="Total das Retenções (conferência)"
              resposta={fmt(calc.inssRetido)}
              detalhe={`Valor importado do R-2020: retenção sofrida de ${nomeTomador || "[tomador]"} (CNPJ ${cnpjTomador || "[—]"}).`}
            />
            <CampoRFB
              campo="Total das Deduções"
              resposta={fmt(calc.dedDCTF)}
              detalhe="Valor que o prestador já utilizou para deduzir da DCTFWeb. Se não houve dedução, aparecerá R$ 0,00."
            />
            <Aviso tipo="warn">
              Se os dados importados estiverem errados, clique em "Recarregar
              EFD-Reinf/DCTFWeb". Se ainda divergir, retifique a R-2020 antes de
              continuar.
            </Aviso>
          </Secao>

          <Secao
            title="Etapa e — Demonstrativo do Crédito"
            subtitle="Aba: Informar Crédito › Demonstrativo do Crédito"
            step="e"
          >
            <CampoRFB
              campo="Valor Original do Crédito Inicial"
              resposta={fmt(calc.creditoOriginal)}
              detalhe={`Calculado automaticamente: Total das Retenções (${fmt(calc.inssRetido)}) – Total das Deduções (${fmt(calc.dedDCTF)}) = ${fmt(calc.creditoOriginal)}.`}
            />
            <CampoRFB
              campo="Crédito Original na Data de Entrega"
              resposta={fmt(calc.creditoOriginal)}
              detalhe="Como é o primeiro PER/DCOMP desta competência, informe o mesmo valor do campo anterior."
            />
            <CampoRFB
              campo="Valor do Pedido de Restituição"
              resposta={fmt(calc.creditoOriginal)}
              detalhe="Preenchido automaticamente. Este é o valor que será depositado em conta após análise e deferimento."
            />
            {calc.selicEstimada > 0 && (
              <Aviso tipo="gold">
                <strong>Sobre correção pela SELIC:</strong> No pedido de restituição, a
                Selic NÃO é calculada no PER/DCOMP Web — será aplicada pela RFB até a
                data efetiva do pagamento. Estimativa:{" "}
                <strong>{fmt(calc.creditoAtualizado)}</strong> (
                {fmtPct(calc.selicEstimada * 100)} sobre {calc.mesesAtraso - 1} meses).
              </Aviso>
            )}
          </Secao>

          <Secao
            title="Etapa g — Dados Bancários"
            subtitle="Para recebimento da restituição"
            step="g"
          >
            <Aviso tipo="info">
              O pagamento só pode ser em conta do próprio CNPJ do prestador (
              {cnpjPrestador || "[—]"}), exceto MEI ou empresa baixada.
            </Aviso>
            <RadioGroup
              value={tipoPagamento}
              onValueChange={(v) => setTipoPagamento(v as typeof tipoPagamento)}
              className="grid gap-2 sm:grid-cols-2"
            >
              {[
                { v: "conta", l: "🏦 Conta Corrente / Poupança" },
                { v: "pix", l: "⚡ PIX (chave CNPJ)" },
              ].map((opt) => (
                <Label
                  key={opt.v}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border p-3",
                    tipoPagamento === opt.v
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <RadioGroupItem value={opt.v} />
                  <span className="text-sm font-medium">{opt.l}</span>
                </Label>
              ))}
            </RadioGroup>
            {tipoPagamento === "conta" ? (
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <Input
                    value={banco}
                    onChange={(e) => setBanco(e.target.value)}
                    placeholder="Ex: 104 – Caixa"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Agência</Label>
                  <Input
                    value={agencia}
                    onChange={(e) => setAgencia(e.target.value)}
                    placeholder="0000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Conta</Label>
                  <Input
                    value={conta}
                    onChange={(e) => setConta(e.target.value)}
                    placeholder="00000-0"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Chave PIX (CNPJ do prestador)</Label>
                <Input
                  value={pixChave}
                  onChange={(e) => setPixChave(e.target.value)}
                  placeholder={cnpjPrestador || "CNPJ"}
                />
              </div>
            )}
            <Aviso tipo="warn">
              Confira os dados bancários com atenção. Erro pode causar devolução do
              pagamento e atraso de meses.
            </Aviso>
          </Secao>

          <Secao title="Etapas h e i — Verificar Pendências e Enviar" step="h/i">
            <Aviso tipo="info">
              Antes de transmitir, o sistema mostrará a tela de pendências:
            </Aviso>
            <div className="space-y-2">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <div className="text-sm font-semibold text-destructive">
                  ERROS (impedem transmissão)
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Campos obrigatórios em branco, valores inconsistentes, EFD-Reinf não
                  encontrada, CND vencida. Devem ser corrigidos.
                </p>
              </div>
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
                <div className="text-sm font-semibold">ALERTAS (não impedem)</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valores divergentes, possível inconsistência. Verifique se precisa
                  corrigir antes de enviar.
                </p>
              </div>
            </div>
            <CampoRFB
              campo="Ação final"
              resposta="Clicar em ENVIAR após revisar tudo"
              detalhe="O sistema gerará o número do PER/DCOMP. Guarde esse número! Ele é necessário para consultar o status e para retificações."
            />
            <Aviso tipo="ok">
              Após transmitir: e-CAC › Restituição e Compensação › Consulta
              Processamento PER/DCOMP para acompanhar o status.
            </Aviso>
          </Secao>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setTab("calculo")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar
            </Button>
            <Button variant="gold" onClick={() => setTab("relatorio")}>
              Ver Relatório Final
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </TabsContent>

        {/* ════════ ABA 4 — RELATÓRIO ════════ */}
        <TabsContent value="relatorio" className="space-y-4">
          {/* Barra de ações (oculta na impressão) */}
          <div className="no-print flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                toast.success("Abrindo diálogo de impressão", {
                  description: "Escolha \"Salvar como PDF\" para exportar.",
                });
                // pequeno timeout para o toast aparecer antes do print bloquear a UI
                setTimeout(() => window.print(), 150);
              }}
            >
              <Printer className="mr-1 h-4 w-4" />
              Exportar / Imprimir PDF
            </Button>
          </div>

          <div className="perdcomp-print space-y-4">
          <Card className="border-gold/30 bg-gradient-to-br from-primary to-primary/90 p-6 text-primary-foreground">
            <div className="font-mono text-[10px] font-bold tracking-[3px] text-gold">
              RELATÓRIO PER/DCOMP
            </div>
            <h2 className="mt-2 font-display text-xl">
              Resumo Executivo — Recuperação de INSS
            </h2>
            <p className="mt-1 text-xs text-primary-foreground/70">
              Lei 9.711/98 · Competência {competencia || "—"} · Gerado em{" "}
              {new Date().toLocaleDateString("pt-BR")}
            </p>
          </Card>

          <Secao title="Identificação das Partes">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["Prestador (credor)", `${nomePrestador || "—"}\nCNPJ: ${cnpjPrestador || "—"}`],
                  ["Tomador (reteve)", `${nomeTomador || "—"}\nCNPJ: ${cnpjTomador || "—"}`],
                  ["NFS-e", `Nº ${nfseNum || "—"} — Competência ${competencia || "—"}`],
                  [
                    "Valor da operação",
                    `Bruto: ${fmt(calc.vb)}\nAlíquota: ${fmtPct(calc.alq * 100)}`,
                  ],
                ] as const
              ).map(([t, v], i) => (
                <div key={i} className="rounded-md bg-muted/50 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t}
                  </div>
                  <div className="mt-1 whitespace-pre-line text-sm font-semibold">
                    {v}
                  </div>
                </div>
              ))}
            </div>
          </Secao>

          <Secao title="Memória de Cálculo">
            <LinhaResultado label="Valor Bruto da NFS-e" value={fmt(calc.vb)} />
            <LinhaResultado
              label="Alíquota aplicada pelo tomador"
              value={fmtPct(calc.alq * 100)}
            />
            <LinhaResultado label="INSS Retido pelo Tomador" value={fmt(calc.inssRetido)} />
            {tipoEmpreitada !== "total" && (
              <>
                <LinhaResultado
                  label={`Base de cálculo correta (${fmtPct(100 - calc.matPct)} do bruto)`}
                  value={fmt(calc.bcCorreta)}
                />
                <LinhaResultado
                  label={`INSS correto (${fmtPct(calc.alq * 100)} × BC correta)`}
                  value={fmt(calc.inssCorreto)}
                />
                <LinhaResultado
                  label="Excesso de retenção (indevido)"
                  value={fmt(calc.inssIndevido)}
                />
              </>
            )}
            <LinhaResultado label="(-) Já deduzido na DCTFWeb" value={fmt(calc.dedDCTF)} />
            <LinhaResultado
              label="Crédito Líquido para PER/DCOMP"
              value={fmt(calc.creditoOriginal)}
              highlight
            />
            {calc.selicEstimada > 0 && (
              <LinhaResultado
                label={`Crédito c/ SELIC estimada (${fmtPct(calc.selicEstimada * 100)})`}
                value={fmt(calc.creditoAtualizado)}
              />
            )}
          </Secao>

          <Secao title="Fundamentação Legal">
            {tipoEmpreitada === "total" ? (
              <Aviso tipo="ok">
                <strong>Tese 1 — Empreitada Total.</strong> A retenção era indevida
                pois o ente público está DISPENSADO de reter em contratos de
                empreitada total (art. 157 IN RFB 971/2009; SC COSIT 65/2020; SC COSIT
                116/2020; IN RFB 2.289/2025).
              </Aviso>
            ) : (
              <Aviso tipo="info">
                <strong>Tese 2 — Dedução de Materiais.</strong> Art. 121 da IN RFB
                971/2009: materiais e equipamentos não integram a base de cálculo.
                Presunção legal para {TIPOS_OBRA[tipoObra]?.label}: base mínima de{" "}
                {fmtPct(calc.presuncaoPct)} do valor bruto.
              </Aviso>
            )}
            <Aviso tipo="gold">
              <strong>Prazo prescricional:</strong> 5 anos a contar da competência{" "}
              {competencia || "—"} (art. 168, I do CTN; SC COSIT 125/2021).
              {competencia.match(/^\d{2}\/\d{4}$/) && (
                <>
                  {" "}Vencimento:{" "}
                  {competencia.replace(
                    /(\d{2})\/(\d{4})/,
                    (_, m, a) => `${m}/${parseInt(a, 10) + 5}`,
                  )}
                  .
                </>
              )}
            </Aviso>
          </Secao>

          <Secao title="Gabarito de Preenchimento PER/DCOMP Web">
            <div className="space-y-1.5">
              {(
                [
                  ["Tipo de Documento", "Pedido de Restituição"],
                  ["Documento Retificador?", "NÃO"],
                  ["Tipo de Crédito", "Retenção – Lei nº 9.711/98"],
                  [
                    "Apelido",
                    `INSS Retido NFS-e ${nfseNum || "[nº]"} – ${competencia || "[comp.]"} – ${nomeTomador || "[tomador]"}`,
                  ],
                  ["Qualificação do Contribuinte", "Outra Qualificação"],
                  ["Detalhamento do Crédito", "O crédito será detalhado neste documento"],
                  ["PJ Extinta por Liquidação?", "NÃO"],
                  ["Fundamento em inconstitucionalidade?", "NÃO"],
                  ["Detentor do Crédito", "Crédito apurado pelo próprio contribuinte"],
                  ["Mês/Ano da Competência", competencia || "—"],
                  ["Total das Retenções (conferência)", fmt(calc.inssRetido)],
                  ["Total das Deduções (DCTFWeb)", fmt(calc.dedDCTF)],
                  ["Crédito Original na Data de Entrega", fmt(calc.creditoOriginal)],
                  ["Valor do Pedido de Restituição", fmt(calc.creditoOriginal)],
                  [
                    "Dados bancários",
                    tipoPagamento === "pix"
                      ? `PIX: ${pixChave || cnpjPrestador || "—"}`
                      : `Banco: ${banco || "—"} | Ag: ${agencia || "—"} | Conta: ${conta || "—"}`,
                  ],
                ] as const
              ).map(([campo, valor], i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-wrap items-start gap-3 rounded-md px-3 py-2",
                    i % 2 === 0 ? "bg-muted/50" : "bg-background",
                  )}
                >
                  <span className="min-w-[200px] flex-shrink-0 text-xs text-muted-foreground">
                    {campo}
                  </span>
                  <span className="font-mono text-sm font-semibold text-success">
                    ➤ {valor}
                  </span>
                </div>
              ))}
            </div>
          </Secao>

          <Secao title="Próximos Passos e Acompanhamento">
            {(
              [
                [
                  "Protocolar PER/DCOMP no e-CAC",
                  "Usar o gabarito acima. Guardar o número do protocolo.",
                  "alta",
                ],
                [
                  "Monitorar status no e-CAC",
                  "e-CAC › Restituição e Compensação › Consulta Processamento PER/DCOMP. Verificar semanalmente.",
                  "média",
                ],
                [
                  "Se Intimação: responder em 30 dias",
                  "A RFB pode solicitar documentos complementares. Não perder o prazo.",
                  "crítica",
                ],
                [
                  "Verificar competências anteriores",
                  "Cada competência com retenção = um PER/DCOMP separado. Calcular prazo prescricional de cada.",
                  "alta",
                ],
                [
                  "Se indeferido: Manifestação de Inconformidade",
                  "Prazo de 30 dias após ciência do despacho. Base legal: IN RFB 2.055/2021.",
                  "contingência",
                ],
              ] as const
            ).map(([t, d, p], i) => {
              const cor =
                p === "crítica"
                  ? "bg-destructive text-destructive-foreground"
                  : p === "alta"
                    ? "bg-primary text-primary-foreground"
                    : p === "contingência"
                      ? "bg-warning text-foreground"
                      : "bg-success text-success-foreground";
              return (
                <div key={i} className="flex items-start gap-3 rounded-md bg-muted/50 p-3">
                  <Badge className={cn("shrink-0 text-[10px] uppercase", cor)}>
                    {p}
                  </Badge>
                  <div>
                    <div className="text-sm font-semibold">{t}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{d}</p>
                  </div>
                </div>
              );
            })}
          </Secao>

          {/* ─── Resumo das verificações de consistência (vai junto no PDF) ─── */}
          <Secao title="Verificações de Consistência">
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <strong>Perfil de regras:</strong> {perfilAtivo.nome}
                </span>
                <span className="text-muted-foreground">
                  ({perfilAtivo.base})
                </span>
              </div>
              <div className="mt-1 grid gap-x-4 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                <span>
                  Faixa de valor bruto: {fmt(thresholds.vbMin)} – {fmt(thresholds.vbMax)}
                  {(usandoOverride("vbMin") || usandoOverride("vbMax")) && (
                    <em className="ml-1 not-italic text-warning">(override)</em>
                  )}
                </span>
                <span>
                  Faixa de materiais: {fmtPct(thresholds.matMin)} – {fmtPct(thresholds.matMax)}
                  {(usandoOverride("matMin") || usandoOverride("matMax")) && (
                    <em className="ml-1 not-italic text-warning">(override)</em>
                  )}
                </span>
              </div>
            </div>

            {consistencias.length === 0 ? (
              <Aviso tipo="ok">
                <strong>Nenhuma inconsistência detectada.</strong> Todos os
                cálculos e parâmetros estão dentro das faixas esperadas para o
                perfil de regras ativo.
              </Aviso>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  {consistencias.some((c) => c.severidade === "error") && (
                    <Badge variant="destructive">
                      {consistencias.filter((c) => c.severidade === "error").length}{" "}
                      erro(s)
                    </Badge>
                  )}
                  {consistencias.some((c) => c.severidade === "warn") && (
                    <Badge
                      variant="outline"
                      className="border-warning/40 bg-warning/10"
                    >
                      {consistencias.filter((c) => c.severidade === "warn").length}{" "}
                      alerta(s)
                    </Badge>
                  )}
                </div>
                {consistencias.map((c, i) => (
                  <div
                    key={c.id}
                    className={cn(
                      "rounded-md border-l-4 px-3 py-2 text-xs",
                      c.severidade === "error"
                        ? "border-l-destructive bg-destructive/5"
                        : "border-l-warning bg-warning/5",
                      i % 2 === 0 ? "bg-muted/30" : "",
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {c.severidade === "error" ? "ERRO" : "ALERTA"}
                      </span>
                      <strong className="text-sm">{c.titulo}</strong>
                    </div>
                    <p className="mt-1 text-foreground/90">{c.descricao}</p>
                    {c.motivo && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <strong>Motivo do enquadramento:</strong> {c.motivo}
                      </p>
                    )}
                    {c.dica && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        <strong>Dica:</strong> {c.dica}
                      </p>
                    )}
                  </div>
                ))}
                <p className="text-[10px] italic text-muted-foreground">
                  Resumo gerado automaticamente em{" "}
                  {new Date().toLocaleString("pt-BR")} para fins de auditoria
                  interna. Os alertas refletem o perfil "{perfilAtivo.nome}" e
                  os limites configurados no momento da exportação.
                </p>
              </div>
            )}
          </Secao>

          <Card className="border-t-4 border-t-gold p-4 text-center">
            <div className="text-sm font-semibold">
              Documento gerado em {new Date().toLocaleString("pt-BR")} —
              relatório executivo + verificações de consistência.
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Use o botão <strong>Exportar / Imprimir PDF</strong> no topo da
              página (ou Ctrl+P) e escolha "Salvar como PDF".
            </div>
          </Card>
          </div>
          {/* ↑ fim de .perdcomp-print */}

          <Separator className="no-print" />

          <div className="no-print flex justify-start">
            <Button variant="outline" onClick={() => setTab("preench")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar ao preenchimento
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
