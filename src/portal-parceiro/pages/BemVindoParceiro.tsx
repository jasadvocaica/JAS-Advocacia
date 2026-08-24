import { useNavigate, useOutletContext, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  LayoutDashboard, Briefcase, Users, ListChecks, Calendar,
  HandCoins, FileText, UserPlus, User, MessageSquare, Upload,
  Eye, EyeOff, ShieldCheck, ArrowRight, Sparkles, BookOpen, CheckCircle2,
  Check, X, Minus, KeyRound,
} from "lucide-react";
import type { PortalParceiroContext } from "../PortalParceiroLayout";

interface ModuloInfo {
  icon: any;
  rota: string;
  titulo: string;
  resumo: string;
  comoUsar: string[];
  permissao: string;
}

const MODULOS: ModuloInfo[] = [
  {
    icon: LayoutDashboard,
    rota: "/portal-parceiro",
    titulo: "Painel inicial",
    resumo: "Visão rápida do dia: tarefas, prazos da semana, próxima audiência, valores a receber e alertas urgentes.",
    comoUsar: [
      "Acesse pelo item Painel no menu lateral.",
      "Cards no topo mostram processos ativos, tarefas em aberto, prazos e a receber.",
      "A caixa em destaque alerta sobre prazos vencidos exigindo ação imediata.",
      "Clique em qualquer atalho para ir direto ao módulo correspondente.",
    ],
    permissao: "Mostra apenas dados dos processos vinculados a você.",
  },
  {
    icon: Briefcase,
    rota: "/portal-parceiro/processos",
    titulo: "Meus processos",
    resumo: "Lista completa dos processos em que você está formalmente vinculado pela banca.",
    comoUsar: [
      "Acesse pelo item Processos no menu lateral.",
      "Use a busca por número CNJ, NB do INSS ou nome do cliente.",
      "Clique em um processo para abrir a ficha completa: andamentos, partes, documentos, chat e financeiro.",
      "Dentro do processo, use a aba Chat para falar com a equipe interna.",
    ],
    permissao: "Você só vê processos onde está como parceiro principal ou vinculado em coautoria.",
  },
  {
    icon: Users,
    rota: "/portal-parceiro/clientes",
    titulo: "Meus clientes",
    resumo: "Clientes dos processos em que você atua. Acesse a ficha resumida de cada um.",
    comoUsar: [
      "Acesse pelo item Clientes no menu lateral.",
      "Clique no cliente para ver dados de contato, processos vinculados e histórico de atendimentos.",
      "O WhatsApp do cliente só aparece quando há autorização expressa do cliente.",
    ],
    permissao: "Apenas clientes ligados aos seus processos. Lista geral do escritório nunca é exibida.",
  },
  {
    icon: ListChecks,
    rota: "/portal-parceiro/tarefas",
    titulo: "Minhas tarefas",
    resumo: "Tarefas atribuídas diretamente a você, com status, prioridade e prazo.",
    comoUsar: [
      "Acesse pelo item Tarefas no menu lateral.",
      "Marque a caixa para concluir uma tarefa — o registro é salvo automaticamente.",
      "Filtre por status (pendente, em andamento, concluída) e prioridade.",
      "Clique no título para abrir a tarefa dentro do processo.",
    ],
    permissao: "Apenas tarefas onde você é o responsável designado.",
  },
  {
    icon: Calendar,
    rota: "/portal-parceiro/prazos",
    titulo: "Meus prazos",
    resumo: "Audiências, prazos fatais e processuais dos seus processos, com destaque para o que vence em breve.",
    comoUsar: [
      "Acesse pelo item Prazos no menu lateral.",
      "Visualização em lista ou calendário (use o botão de alternância no topo).",
      "Prazos vencidos e fatais aparecem em vermelho.",
      "Clique em um prazo para ir até o processo de origem.",
    ],
    permissao: "Apenas prazos dos processos vinculados a você.",
  },
  {
    icon: HandCoins,
    rota: "/portal-parceiro/financeiro",
    titulo: "Financeiro / Repasses",
    resumo: "Acompanhe valores a receber, repasses pagos e o percentual aplicado conforme o acordo de cada processo.",
    comoUsar: [
      "Acesse pelo item Financeiro no menu lateral.",
      "Veja totais por status: pendente, pago, atrasado.",
      "Cada linha mostra o processo de origem, valor base e o valor do seu repasse.",
      "Use os filtros de período para conferir competências específicas.",
    ],
    permissao: "Apenas repasses cujo destinatário é você. Financeiro do escritório não é exibido.",
  },
  {
    icon: FileText,
    rota: "/portal-parceiro/documentos",
    titulo: "Documentos",
    resumo: "Documentos compartilhados com você (procurações, comprovantes, peças, decisões).",
    comoUsar: [
      "Acesse pelo item Documentos no menu lateral.",
      "Use Upload para enviar documentos relacionados a um processo seu.",
      "Cada arquivo enviado fica vinculado ao processo correspondente.",
      "Baixe documentos compartilhados pela equipe interna a qualquer momento.",
    ],
    permissao: "Apenas documentos dos seus processos ou compartilhados diretamente com você.",
  },
  {
    icon: UserPlus,
    rota: "/portal-parceiro/indicacoes",
    titulo: "Indicações",
    resumo: "Indique novos clientes para a banca e acompanhe o status de cada indicação.",
    comoUsar: [
      "Acesse pelo item Indicações no menu lateral.",
      "Clique em Nova indicação e preencha os dados do potencial cliente.",
      "Acompanhe o andamento: recebida, em análise, convertida ou descartada.",
      "Se a indicação virar processo, ela aparece automaticamente nos seus processos.",
    ],
    permissao: "Você vê apenas as indicações que você mesmo registrou.",
  },
  {
    icon: User,
    rota: "/portal-parceiro/perfil",
    titulo: "Meu perfil",
    resumo: "Seus dados cadastrais, dados bancários para repasse e preferências de notificação.",
    comoUsar: [
      "Acesse pelo item Perfil no menu lateral ou pelo avatar no rodapé.",
      "Mantenha dados bancários e PIX atualizados para não atrasar repasses.",
      "Altere senha e preferências de notificação por e-mail.",
    ],
    permissao: "Edição apenas dos seus próprios dados.",
  },
];

const NAO_VE = [
  "Lista geral de clientes do escritório",
  "Modelos de peças e materiais internos da banca",
  "Financeiro e contratos de outros parceiros",
  "Equipe interna, folha de pagamento e metas",
  "Configurações, integrações e logs administrativos",
  "Tarefas, prazos e fluxos de processos que não são seus",
];

type Acesso = "sim" | "nao" | "condicional";

interface PermissaoLinha {
  icon: any;
  modulo: string;
  ver: Acesso;
  criar: Acesso;
  editar: Acesso;
  excluir: Acesso;
  observacao?: string;
}

const PERMISSOES: PermissaoLinha[] = [
  { icon: LayoutDashboard, modulo: "Painel inicial", ver: "sim", criar: "nao", editar: "nao", excluir: "nao", observacao: "Apenas leitura dos seus indicadores." },
  { icon: Briefcase, modulo: "Processos", ver: "sim", criar: "nao", editar: "condicional", excluir: "nao", observacao: "Edição limitada a campos liberados pela banca." },
  { icon: Users, modulo: "Clientes", ver: "condicional", criar: "nao", editar: "nao", excluir: "nao", observacao: "Apenas clientes ligados aos seus processos. WhatsApp só com autorização." },
  { icon: ListChecks, modulo: "Tarefas", ver: "sim", criar: "nao", editar: "condicional", excluir: "nao", observacao: "Pode concluir e comentar tarefas atribuídas a você." },
  { icon: Calendar, modulo: "Prazos / Agenda", ver: "sim", criar: "nao", editar: "nao", excluir: "nao", observacao: "Somente prazos e eventos vinculados a você." },
  { icon: HandCoins, modulo: "Financeiro / Repasses", ver: "sim", criar: "nao", editar: "nao", excluir: "nao", observacao: "Apenas seus repasses. Financeiro do escritório fica oculto." },
  { icon: FileText, modulo: "Documentos", ver: "sim", criar: "sim", editar: "condicional", excluir: "condicional", observacao: "Você pode editar/excluir apenas documentos que você mesmo enviou." },
  { icon: MessageSquare, modulo: "Chat do processo", ver: "sim", criar: "sim", editar: "nao", excluir: "nao", observacao: "Mensagens enviadas não podem ser apagadas (auditoria)." },
  { icon: UserPlus, modulo: "Indicações", ver: "condicional", criar: "sim", editar: "condicional", excluir: "nao", observacao: "Vê e edita apenas indicações que você mesmo registrou." },
  { icon: User, modulo: "Meu perfil", ver: "sim", criar: "nao", editar: "sim", excluir: "nao", observacao: "Edição completa dos seus próprios dados e dados bancários." },
];


export default function BemVindoParceiro() {
  const { parceiro } = useOutletContext<PortalParceiroContext>();
  const navigate = useNavigate();

  const continuar = () => {
    try { localStorage.setItem(`portal-parceiro:onboarding:${parceiro.id}`, "1"); } catch {}
    navigate("../", { relative: "path" });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Bem-vindo, ${parceiro.nome.split(" ")[0]}`}
        description="Guia completo do portal: o que cada módulo faz, como acessá-lo e o que está protegido por sigilo."
      />

      {/* Hero */}
      <Card className="p-6 bg-gradient-to-br from-sidebar to-sidebar/80 text-sidebar-foreground border-gold/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6 text-gold" />
          </div>
          <div className="space-y-2">
            <Badge className="bg-gold text-sidebar-primary-foreground">Espaço exclusivo</Badge>
            <h2 className="font-display text-2xl">Este portal é seu, e só seu.</h2>
            <p className="text-sm text-sidebar-foreground/80 max-w-2xl">
              Tudo que aparece aqui é estritamente o que está atribuído a você como parceiro da banca.
              Você não vê — nem por engano — clientes, processos, modelos ou números do escritório que
              não fazem parte do seu trabalho.
            </p>
          </div>
        </div>
      </Card>

      {/* Como navegar */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg">Como navegar</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Use o <strong>menu lateral à esquerda</strong> para alternar entre os módulos. No rodapé do
              menu fica o seu avatar com acesso ao perfil e logout. Em telas menores, o menu abre pelo
              ícone no canto superior esquerdo.
            </p>
          </div>
        </div>
      </Card>

      {/* Módulos */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-gold" />
          <h3 className="font-display text-lg">Módulos do portal</h3>
        </div>
        <div className="grid gap-3">
          {MODULOS.map((m) => {
            const Icon = m.icon;
            return (
              <Card key={m.titulo} className="p-5 hover:border-gold/40 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-display text-base">{m.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{m.resumo}</p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link to={m.rota}>
                          Abrir
                          <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        </Link>
                      </Button>
                    </div>

                    <Separator />

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                        Como usar
                      </p>
                      <ul className="space-y-1">
                        {m.comoUsar.map((p, i) => (
                          <li key={i} className="text-xs text-foreground/80 flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex items-start gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/15">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Permissão:</span> {m.permissao}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Recursos transversais */}
      <section className="space-y-3">
        <h3 className="font-display text-lg">Recursos disponíveis em vários módulos</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-4 h-4 text-gold mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Chat por processo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dentro de cada processo, a aba <strong>Chat</strong> permite trocar mensagens com a
                  equipe interna. Tudo fica registrado por caso.
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Upload className="w-4 h-4 text-gold mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Upload de documentos</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Em cada processo ou na ficha do cliente, você pode anexar documentos que entram
                  diretamente no caso correspondente.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Matriz de permissões */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gold" />
          <h3 className="font-display text-lg">Resumo de permissões por módulo</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Confira rapidamente o que você consegue fazer em cada módulo do portal.
        </p>

        <Card className="overflow-hidden">
          {/* Legenda */}
          <div className="flex flex-wrap gap-3 p-3 bg-muted/40 border-b text-xs">
            <LegendaItem acesso="sim" label="Permitido" />
            <LegendaItem acesso="condicional" label="Parcial / com regra" />
            <LegendaItem acesso="nao" label="Não permitido" />
          </div>

          {/* Tabela (desktop) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Módulo</th>
                  <th className="text-center px-3 py-2.5 font-medium">Ver</th>
                  <th className="text-center px-3 py-2.5 font-medium">Criar</th>
                  <th className="text-center px-3 py-2.5 font-medium">Editar</th>
                  <th className="text-center px-3 py-2.5 font-medium">Excluir</th>
                  <th className="text-left px-4 py-2.5 font-medium">Observação</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSOES.map((p) => {
                  const Icon = p.icon;
                  return (
                    <tr key={p.modulo} className="border-t hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gold shrink-0" />
                          <span className="font-medium">{p.modulo}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center"><AcessoIcon acesso={p.ver} /></td>
                      <td className="px-3 py-2.5 text-center"><AcessoIcon acesso={p.criar} /></td>
                      <td className="px-3 py-2.5 text-center"><AcessoIcon acesso={p.editar} /></td>
                      <td className="px-3 py-2.5 text-center"><AcessoIcon acesso={p.excluir} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.observacao ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cards (mobile) */}
          <div className="md:hidden divide-y">
            {PERMISSOES.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.modulo} className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gold shrink-0" />
                    <span className="font-medium text-sm">{p.modulo}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <AcessoCelula label="Ver" acesso={p.ver} />
                    <AcessoCelula label="Criar" acesso={p.criar} />
                    <AcessoCelula label="Editar" acesso={p.editar} />
                    <AcessoCelula label="Excluir" acesso={p.excluir} />
                  </div>
                  {p.observacao && (
                    <p className="text-xs text-muted-foreground">{p.observacao}</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* O que NÃO aparece */}
      <Card className="p-5 border-dashed">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
            <EyeOff className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">O que não aparece para você</p>
            <p className="text-xs text-muted-foreground mt-1">
              Por sigilo profissional e proteção do escritório, o portal nunca exibe:
            </p>
            <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {NAO_VE.map((t) => (
                <li key={t} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="mt-1 w-1 h-1 rounded-full bg-muted-foreground/60 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* Privacidade */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Suas ações ficam registradas</p>
            <p className="text-xs text-muted-foreground mt-1">
              Para sua segurança e a do escritório, mantemos um log de auditoria das ações no portal
              (acessos, downloads de documentos e mensagens). Você não precisa fazer nada — é automático.
            </p>
          </div>
        </div>
      </Card>

      {/* CTA */}
      <div className="flex flex-wrap gap-3 justify-end pt-2">
        <Button variant="outline" onClick={() => navigate("../perfil", { relative: "path" })}>
          Conferir meu perfil
        </Button>
        <Button onClick={continuar} className="bg-gold hover:bg-gold/90 text-sidebar-primary-foreground">
          Ir para o meu painel
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}

function AcessoIcon({ acesso }: { acesso: Acesso }) {
  if (acesso === "sim") {
    return (
      <span className="inline-flex w-6 h-6 rounded-full bg-emerald-500/10 items-center justify-center">
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      </span>
    );
  }
  if (acesso === "condicional") {
    return (
      <span className="inline-flex w-6 h-6 rounded-full bg-amber-500/10 items-center justify-center">
        <Minus className="w-3.5 h-3.5 text-amber-600" />
      </span>
    );
  }
  return (
    <span className="inline-flex w-6 h-6 rounded-full bg-muted items-center justify-center">
      <X className="w-3.5 h-3.5 text-muted-foreground" />
    </span>
  );
}

function LegendaItem({ acesso, label }: { acesso: Acesso; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <AcessoIcon acesso={acesso} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function AcessoCelula({ label, acesso }: { label: string; acesso: Acesso }) {
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-md bg-muted/30">
      <AcessoIcon acesso={acesso} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
