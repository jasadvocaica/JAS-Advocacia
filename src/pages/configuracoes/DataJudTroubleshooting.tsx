import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  ShieldAlert,
  WifiOff,
  Building2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface ErroDoc {
  id: string;
  titulo: string;
  badge: string;
  icon: typeof AlertCircle;
  sintomas: string[];
  causa: string;
  passos: { titulo: string; descricao: string }[];
  reteste: string;
}

const ERROS: ErroDoc[] = [
  {
    id: "auth",
    titulo: "401 — Chave inválida ou expirada",
    badge: "Autenticação",
    icon: ShieldAlert,
    sintomas: [
      "Mensagem contendo \"401\", \"unauthorized\" ou \"security_exception\".",
      "Banner amarelo/vermelho \"Chave do DataJud inválida ou expirada\" ao consultar processo.",
      "Falha imediata, sem demora de rede.",
    ],
    causa:
      "O CNJ rotacionou a chave pública do DataJud (acontece de tempos em tempos) ou o segredo DATAJUD_API_KEY foi cadastrado com espaços/aspas extras.",
    passos: [
      {
        titulo: "Abrir a wiki oficial do CNJ",
        descricao:
          "Acesse https://datajud-wiki.cnj.jus.br/api-publica/acesso e copie a chave pública atual (string base64 que começa com letras e termina com \"==\").",
      },
      {
        titulo: "Atualizar o segredo DATAJUD_API_KEY",
        descricao:
          "No painel de Integrações → DataJud, clique em \"Atualizar chave\" e cole o valor exatamente como está na wiki — sem aspas, sem espaços antes ou depois, sem o prefixo \"ApiKey \".",
      },
      {
        titulo: "Aguardar a propagação",
        descricao:
          "Após salvar, espere ~15 segundos para o segredo propagar nas funções de borda.",
      },
    ],
    reteste:
      "Volte para um processo com número CNJ válido e clique em \"Consultar DataJud\". Em caso de sucesso, novos andamentos aparecem em até 5 segundos.",
  },
  {
    id: "rate_limit",
    titulo: "429 — Limite de consultas atingido",
    badge: "Rate limit",
    icon: AlertCircle,
    sintomas: [
      "Mensagem contendo \"429\", \"rate\" ou \"limit\".",
      "Funcionou minutos atrás e parou de funcionar de repente.",
    ],
    causa:
      "O CNJ aplica limites por IP/chave. Consultas em massa (jobs ou cliques repetidos) saturam a janela.",
    passos: [
      {
        titulo: "Aguardar 2–5 minutos",
        descricao: "A janela de rate limit do DataJud é curta. Não tente reconsultar imediatamente.",
      },
      {
        titulo: "Evitar disparos paralelos",
        descricao:
          "Se houver job mensal rodando, espere ele terminar antes de consultas manuais. Verifique o histórico em Configurações → DataJud.",
      },
    ],
    reteste:
      "Após o tempo de espera, repita a consulta. Se persistir por mais de 30 minutos, abra a wiki para confirmar mudanças nos limites.",
  },
  {
    id: "network",
    titulo: "Falha de rede / timeout",
    badge: "Conectividade",
    icon: WifiOff,
    sintomas: [
      "Mensagem contendo \"network\", \"fetch failed\", \"timeout\" ou \"econnrefused\".",
      "Demora longa antes do erro aparecer.",
    ],
    causa:
      "O endpoint do CNJ ficou intermitente ou houve uma queda momentânea. Não é problema do escritório.",
    passos: [
      {
        titulo: "Verificar status do CNJ",
        descricao:
          "Confirme em https://datajud-wiki.cnj.jus.br se há aviso de manutenção ou indisponibilidade.",
      },
      {
        titulo: "Tentar de novo em 1–2 minutos",
        descricao: "Use o botão \"Tentar novamente\" do banner — ele já reexecuta a chamada.",
      },
    ],
    reteste:
      "Se o segundo retry falhar, aguarde mais alguns minutos. O sistema também tenta automaticamente uma vez em caso de 401 logo após rotação de chave.",
  },
  {
    id: "tribunal",
    titulo: "Tribunal não suportado",
    badge: "Cobertura",
    icon: Building2,
    sintomas: [
      "Mensagem contendo \"tribunal\", \"não suportado\" ou \"nao suportado\".",
      "Acontece sempre para o mesmo processo, independentemente da chave.",
    ],
    causa:
      "Nem todos os tribunais publicam dados na API pública do DataJud. Tribunais militares, eleitorais antigos ou alguns ramos específicos podem ficar de fora.",
    passos: [
      {
        titulo: "Confirmar o ramo do tribunal",
        descricao:
          "Verifique na wiki do CNJ a lista atualizada de tribunais com endpoint disponível em https://datajud-wiki.cnj.jus.br/api-publica/endpoints.",
      },
      {
        titulo: "Cadastrar andamentos manualmente",
        descricao:
          "Use a aba \"Andamentos\" do processo e marque a fonte como \"manual\" — assim os fluxos seguem funcionando.",
      },
    ],
    reteste:
      "Não é necessário reconsultar via DataJud. O processo continuará funcionando com andamentos manuais.",
  },
  {
    id: "generic",
    titulo: "Erro genérico (5xx ou inesperado)",
    badge: "Outros",
    icon: AlertCircle,
    sintomas: [
      "Mensagem sem padrão claro, geralmente com 500/502/503.",
      "Resposta vazia ou \"Edge function returned 502\".",
    ],
    causa:
      "Erro temporário do servidor do CNJ ou da função de borda durante deploy/atualização.",
    passos: [
      {
        titulo: "Conferir o detalhe técnico",
        descricao:
          "Expanda o item \"Detalhe técnico\" do banner — o conteúdo bruto da resposta ajuda a identificar se o erro vem do CNJ ou da nossa função.",
      },
      {
        titulo: "Repetir após 1 minuto",
        descricao: "Aguarde e tente novamente — a maioria dos 5xx do CNJ se resolve sozinha.",
      },
      {
        titulo: "Persistindo, abra um chamado",
        descricao:
          "Se ocorrer em múltiplos processos por mais de 15 minutos, registre o detalhe técnico e contate o suporte.",
      },
    ],
    reteste:
      "Após o intervalo, repita a consulta. O banner deve sumir assim que a chamada for bem-sucedida.",
  },
];

export default function DataJudTroubleshooting() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/configuracoes/integracoes">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Voltar para Integrações
            </Link>
          </Button>
          <h1 className="text-2xl font-display tracking-tight">Troubleshooting · Consulta DataJud</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Guia rápido para identificar e resolver os erros mais comuns ao consultar processos
            via API pública do CNJ. Cada bloco lista os sintomas, a causa provável e o passo-a-passo
            para corrigir o segredo e validar a correção.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a
            href="https://datajud-wiki.cnj.jus.br/api-publica/acesso"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Wiki oficial do CNJ
          </a>
        </Button>
      </div>

      <Alert>
        <KeyRound className="h-4 w-4" />
        <AlertTitle>Antes de começar</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <p>
            A maioria dos erros de DataJud é resolvida atualizando o segredo{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">DATAJUD_API_KEY</code> com o
            valor publicado na wiki. O sistema faz <strong>uma tentativa automática</strong> após
            falha de autenticação — se ainda assim falhar, siga o guia abaixo.
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid gap-4">
        {ERROS.map((erro) => {
          const Icon = erro.icon;
          return (
            <Card key={erro.id} id={erro.id} className="scroll-mt-24">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="w-5 h-5 text-foreground/70" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{erro.titulo}</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">
                        {erro.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{erro.causa}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Como reconhecer
                  </h3>
                  <ul className="space-y-1 list-disc pl-5 text-foreground/85">
                    {erro.sintomas.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>

                <Separator />

                <div>
                  <h3 className="font-medium text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Passos para corrigir
                  </h3>
                  <ol className="space-y-2.5">
                    {erro.passos.map((p, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium">{p.titulo}</div>
                          <p className="text-xs text-muted-foreground mt-0.5">{p.descricao}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <Separator />

                <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Como reteastar
                      </div>
                      <p className="text-xs mt-1">{erro.reteste}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Roteiro rápido de validação após trocar a chave
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <ol className="space-y-2 list-decimal pl-5">
            <li>
              Abra um processo conhecido com número CNJ válido (ex.: o último consultado com sucesso).
            </li>
            <li>
              Clique em <strong>"Consultar DataJud"</strong> e aguarde — o banner de erro deve
              desaparecer.
            </li>
            <li>
              Confirme que novos andamentos foram salvos e que o log de execução em{" "}
              <Link to="/configuracoes/datajud" className="underline text-primary">
                Configurações → DataJud
              </Link>{" "}
              mostra a chamada com status verde.
            </li>
            <li>
              Se houver job agendado, dispare manualmente um <em>dry run</em> para validar antes da
              próxima execução automática.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
