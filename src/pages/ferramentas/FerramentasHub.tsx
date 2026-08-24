import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, Scale, FileSearch, Receipt, Wrench, Bell, FileWarning, Sparkles, Brain, Banknote, PlugZap } from "lucide-react";

interface FerramentaCard {
  to?: string;
  titulo: string;
  descricao: string;
  icone: typeof Calculator;
  disponivel: boolean;
  tag?: string;
}

const FERRAMENTAS: FerramentaCard[] = [
  {
    to: "/ferramentas/calculadora-honorarios",
    titulo: "Calculadora de Honorários",
    descricao: "Calcule honorários conforme a tabela OAB do seu estado e gere proposta em PDF.",
    icone: Calculator,
    disponivel: true,
    tag: "OAB",
  },
  {
    to: "/ferramentas/publicacoes-pje",
    titulo: "Publicações PJe Comunica",
    descricao: "Monitoramento automático do DJE eletrônico do CNJ por OAB, com vínculo aos processos.",
    icone: Bell,
    disponivel: true,
    tag: "Novo",
  },
  {
    to: "/ferramentas/notificacao-extrajudicial",
    titulo: "Notificação Extrajudicial",
    descricao: "Gere notificação e recibo em PDF, com cálculo de multa, juros e honorários, extração por IA opcional.",
    icone: FileWarning,
    disponivel: true,
    tag: "Novo",
  },
  {
    to: "/ferramentas/analise-publicacoes-ia",
    titulo: "Análise de Publicações com IA",
    descricao: "Suba o caderno do DJE, intimações ou decisões e a IA identifica processos, prazos e sugere atividades para a Controladoria.",
    icone: Sparkles,
    disponivel: true,
    tag: "IA",
  },
  {
    to: "/ferramentas/analisador-caso",
    titulo: "Analisador de caso jurídico",
    descricao: "Envie um documento (indeferimento, sentença, petição) e a IA extrai resumo, pontos favoráveis/desfavoráveis e estratégia.",
    icone: Brain,
    disponivel: true,
    tag: "IA",
  },
  {
    to: "/ferramentas/calculadora-cnis",
    titulo: "Calculadora de CNIS",
    descricao: "Extraia vínculos do CNIS com IA, calcule tempo de contribuição, período de graça e benefícios possíveis.",
    icone: FileSearch,
    disponivel: true,
    tag: "IA",
  },
  {
    to: "/ferramentas/perdcomp-inss",
    titulo: "PER/DCOMP INSS Retido",
    descricao: "Calcule e monte o pedido de restituição de INSS retido na fonte (Lei 9.711/98) com gabarito de preenchimento do e-CAC.",
    icone: Banknote,
    disponivel: true,
    tag: "Tributário",
  },
  {
    to: "/ferramentas/publijus",
    titulo: "Integração PubliJus",
    descricao: "Configure base URL, endpoints e teste a conexão com a API do PubliJus. A chave fica protegida no servidor.",
    icone: PlugZap,
    disponivel: true,
    tag: "Integração",
  },
  {
    titulo: "Calculadora Jurídica",
    descricao: "Prazos processuais, juros de mora e correção monetária em um só lugar.",
    icone: Scale,
    disponivel: false,
  },
  {
    titulo: "Tabela de Custas",
    descricao: "Custas judiciais por tribunal e por tipo de ação.",
    icone: Receipt,
    disponivel: false,
  },
];

export default function FerramentasHub() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ferramentas internas"
        description="Calculadoras, consultas e utilitários do escritório"
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FERRAMENTAS.map((f) => {
          const Icon = f.icone;
          const conteudo = (
            <Card
              className={`p-6 h-full transition-all ${
                f.disponivel
                  ? "hover:shadow-lg hover:border-gold/40 cursor-pointer"
                  : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  f.disponivel ? "bg-gold/10 text-gold" : "bg-muted text-muted-foreground"
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                {f.disponivel ? (
                  f.tag && <Badge variant="secondary" className="bg-gold/20 text-gold border-gold/30">{f.tag}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Em breve</Badge>
                )}
              </div>
              <h3 className="font-display text-lg mb-1">{f.titulo}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.descricao}</p>
            </Card>
          );
          return f.disponivel && f.to ? (
            <Link key={f.titulo} to={f.to}>{conteudo}</Link>
          ) : (
            <div key={f.titulo}>{conteudo}</div>
          );
        })}

        {/* Card placeholder para "+ Nova ferramenta" */}
        <Card className="p-6 h-full border-dashed flex flex-col items-center justify-center text-center text-muted-foreground">
          <Wrench className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm font-medium">Mais ferramentas em desenvolvimento</p>
          <p className="text-xs">Sugira uma ferramenta para o gestor</p>
        </Card>
      </div>
    </div>
  );
}
