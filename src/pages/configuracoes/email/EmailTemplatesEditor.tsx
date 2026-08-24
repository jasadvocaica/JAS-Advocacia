import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, RotateCcw, Eye, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface EmailTemplate {
  chave: string;
  nome: string;
  descricao: string | null;
  assunto: string;
  html: string;
  variaveis: string[];
  ativo: boolean;
  atualizado_em: string;
}

const ENVELOPE = (corpo: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:Georgia,'Times New Roman',serif;margin:0;padding:0;background:#f1ece4;color:#1c1c1c}
.container{max-width:580px;margin:24px auto;background:#fff;border:1px solid #e6dfd2}
.header{padding:32px 40px 22px;border-bottom:1px solid #ece5d6;text-align:center}
.brand{font-size:11px;letter-spacing:3px;color:#BC943F;text-transform:uppercase;margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-weight:600}
.header h1{color:#010423;font-size:22px;margin:0;font-weight:400;letter-spacing:0.5px}
.header .sub{color:#7a7062;font-size:12px;margin:6px 0 0;font-style:italic}
.rule{width:36px;height:2px;background:#BC943F;margin:18px auto 0}
.body{padding:30px 40px}
.body h2{font-size:18px;color:#010423;margin:0 0 16px;font-weight:500}
.body p{font-size:14.5px;color:#3a3a3a;line-height:1.7;margin:0 0 14px}
.highlight{background:#faf5ec;border-left:2px solid #BC943F;padding:14px 18px;margin:18px 0;font-size:13.5px;color:#5a4a2a;line-height:1.6}
.btn{display:inline-block;background:#010423;color:#fff !important;padding:11px 22px;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-family:'Helvetica Neue',Arial,sans-serif;margin-top:10px}
.footer{padding:18px 40px 24px;font-size:11px;color:#9a9388;text-align:center;border-top:1px solid #ece5d6;background:#fbf8f3;line-height:1.6}
</style></head><body><div class="container">
<div class="header">
  <p class="brand">Juliana Araújo · Advocacia</p>
  <h1>Dra. Juliana Araújo da Silva</h1>
  <p class="sub">OAB/MT 34.182</p>
  <div class="rule"></div>
</div>
<div class="body">${corpo}</div>
<div class="footer">Pré-visualização do modelo</div>
</div></body></html>`;

// Valores de exemplo por chave de modelo, para a pré-visualização
const EXEMPLOS: Record<string, Record<string, string>> = {
  tarefa_atribuida: {
    titulo: "Contestação - Ação Trabalhista 0001234-56.2025.5.02.0001",
    titulo_email: "Nova tarefa atribuída",
    saudacao_nome: ", Valeska",
    verbo_atribuicao: "foi designada para",
    vinculo_sufixo: " — João da Silva",
    linha_vinculo: "Cliente/Processo: João da Silva<br>",
    prazo: "20/05/2026",
    prioridade: "alta",
    bloco_descricao: "<p>Verificar documentos anexos e elaborar contestação até a data limite.</p>",
    link: "https://app.julianaaraujoadvocacia.com/controladoria/exemplo",
  },
  revisao_solicitada: {
    nome_remetente: "Esther",
    titulo: "Petição inicial - Maria Souza",
    bloco_anotacoes: "Anotações: revisar pedido de tutela de urgência.",
    link: "https://app.julianaaraujoadvocacia.com/controladoria/exemplo",
  },
  revisao_aprovada: {
    titulo: "Petição inicial - Maria Souza",
    comentario: "Pode protocolar, está ótimo.",
    bloco_comentario:
      '<p style="color:#633806"><strong>Comentário:</strong> "Pode protocolar, está ótimo."</p>',
    link: "https://app.julianaaraujoadvocacia.com/controladoria/exemplo",
  },
  revisao_reprovada: {
    titulo: "Petição inicial - Maria Souza",
    comentario: "Ajustar fundamentação do pedido de danos morais e citar jurisprudência recente.",
    link: "https://app.julianaaraujoadvocacia.com/controladoria/exemplo",
  },
  aviso_urgente: {
    titulo: "Reunião de equipe adiada",
    conteudo: "A reunião de hoje será às 16h.<br>Por favor, confirmem presença.",
    link: "https://app.julianaaraujoadvocacia.com/mural-avisos",
  },
  prazo_24h: {
    titulo: "Recurso ordinário - Processo 0009876-54.2025.5.02.0001",
    vinculo_sufixo: " — Carlos Mendes",
    linha_vinculo: "Cliente/Processo: Carlos Mendes<br>",
    prazo: "15/05/2026",
    link: "https://app.julianaaraujoadvocacia.com/controladoria/exemplo",
  },
  prazo_atrasado: {
    titulo: "Manifestação sobre laudo pericial",
    vinculo_sufixo: " — Ana Paula Lima",
    linha_vinculo: "Cliente: Ana Paula Lima<br>",
    prazo: "10/05/2026",
    dias_atraso: "3",
    link: "https://app.julianaaraujoadvocacia.com/controladoria/exemplo",
  },
  ponto_incompleto: {
    data_curta: "13/05/2026",
    data_extensa: "quarta-feira, 13 de maio",
    detalhe_ponto: "Entrada: 09:02<br>Saída: não registrada",
    link: "https://app.julianaaraujoadvocacia.com/ponto",
  },
};

function substituirComExemplos(tpl: string, chave: string | null, vars: string[]): string {
  const exemplos = (chave && EXEMPLOS[chave]) || {};
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    if (k in exemplos) return exemplos[k];
    if (vars.includes(k)) return `[exemplo:${k}]`;
    return `{{${k}}}`;
  });
}

export default function EmailTemplatesEditor() {
  const qc = useQueryClient();
  const [chaveSelecionada, setChaveSelecionada] = useState<string | null>(null);
  const [assunto, setAssunto] = useState("");
  const [html, setHtml] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates" as any)
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as EmailTemplate[];
    },
  });

  // Seleciona o primeiro automaticamente
  useEffect(() => {
    if (!chaveSelecionada && templates && templates.length > 0) {
      setChaveSelecionada(templates[0].chave);
    }
  }, [templates, chaveSelecionada]);

  const atual = useMemo(
    () => templates?.find((t) => t.chave === chaveSelecionada) ?? null,
    [templates, chaveSelecionada],
  );

  // Carrega valores no form quando muda o template
  useEffect(() => {
    if (atual) {
      setAssunto(atual.assunto);
      setHtml(atual.html);
      setAtivo(atual.ativo);
    }
  }, [atual]);

  const dirty =
    !!atual &&
    (assunto !== atual.assunto || html !== atual.html || ativo !== atual.ativo);

  async function salvar() {
    if (!atual) return;
    if (!assunto.trim()) {
      toast.error("O assunto não pode ficar em branco.");
      return;
    }
    if (!html.trim()) {
      toast.error("O HTML não pode ficar em branco.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("email_templates" as any)
      .update({ assunto, html, ativo })
      .eq("chave", atual.chave);
    setSalvando(false);
    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    toast.success("Modelo salvo");
    qc.invalidateQueries({ queryKey: ["email_templates"] });
  }

  function reverter() {
    if (!atual) return;
    setAssunto(atual.assunto);
    setHtml(atual.html);
    setAtivo(atual.ativo);
  }

  const previewHtml = useMemo(
    () => ENVELOPE(substituirComExemplos(html, atual?.chave ?? null, atual?.variaveis ?? [])),
    [html, atual],
  );
  const previewAssunto = useMemo(
    () => substituirComExemplos(assunto, atual?.chave ?? null, atual?.variaveis ?? []),
    [assunto, atual],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      {/* Lista */}
      <Card className="h-fit">
        <CardHeader className="py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileCode2 className="h-4 w-4" />
            Modelos de email
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 space-y-1">
          {isLoading && (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          )}
          {templates?.map((t) => (
            <button
              key={t.chave}
              type="button"
              onClick={() => setChaveSelecionada(t.chave)}
              className={`w-full text-left rounded-md p-2 hover:bg-muted/60 transition ${
                chaveSelecionada === t.chave ? "bg-muted ring-1 ring-primary/30" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t.nome}</span>
                {!t.ativo && (
                  <Badge variant="secondary" className="text-[10px]">inativo</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                {t.descricao}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Editor */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">
                {atual ? atual.nome : "Selecione um modelo"}
              </CardTitle>
              {atual && (
                <CardDescription className="mt-1">
                  Chave: <code className="text-xs">{atual.chave}</code>
                </CardDescription>
              )}
            </div>
            {atual && (
              <div className="flex items-center gap-2">
                <Label htmlFor="ativo" className="text-xs">Ativo</Label>
                <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!atual && !isLoading && (
            <p className="text-sm text-muted-foreground">
              Escolha um modelo na lista ao lado para editar.
            </p>
          )}
          {atual && (
            <>
              {atual.variaveis.length > 0 && (
                <Alert>
                  <AlertDescription className="text-xs">
                    <strong>Variáveis disponíveis</strong> (use entre <code>{"{{ }}"}</code>
                    ):
                    <div className="flex flex-wrap gap-1 mt-2">
                      {atual.variaveis.map((v) => (
                        <code
                          key={v}
                          className="text-[11px] bg-muted px-1.5 py-0.5 rounded cursor-pointer hover:bg-muted/80"
                          onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
                          title="Clique para copiar"
                        >
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div>
                <Label htmlFor="assunto">Assunto</Label>
                <Input
                  id="assunto"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <Tabs defaultValue="html">
                <TabsList>
                  <TabsTrigger value="html">
                    <FileCode2 className="h-3.5 w-3.5 mr-1.5" /> HTML
                  </TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="h-3.5 w-3.5 mr-1.5" /> Pré-visualização
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="html" className="mt-3">
                  <Textarea
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    rows={18}
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                </TabsContent>
                <TabsContent value="preview" className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Assunto: <strong>{previewAssunto}</strong>
                  </div>
                  <iframe
                    title="Pré-visualização"
                    srcDoc={previewHtml}
                    className="w-full h-[460px] rounded-md border bg-white"
                  />
                </TabsContent>
              </Tabs>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={reverter}
                  disabled={!dirty || salvando}
                >
                  <RotateCcw className="h-4 w-4 mr-1.5" /> Reverter
                </Button>
                <Button onClick={salvar} disabled={!dirty || salvando}>
                  {salvando ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Salvar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
