import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { PreviewModeProvider } from "@/contexts/PreviewModeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import PortalParceiroLayout from "@/portal-parceiro/PortalParceiroLayout";
import PortalClienteLayout from "@/portal-cliente/PortalClienteLayout";

// Auth
const Login = lazy(() => import("@/pages/auth/Login"));
const EsqueciSenha = lazy(() => import("@/pages/auth/EsqueciSenha"));
const ResetSenha = lazy(() => import("@/pages/auth/ResetSenha"));
const SelecionarPortal = lazy(() => import("@/pages/auth/SelecionarPortal"));
const ContaInativa = lazy(() => import("@/pages/ContaInativa"));
const SemPermissao = lazy(() => import("@/pages/SemPermissao"));

// Portal Interno — páginas
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const DashboardGestor = lazy(() => import("@/pages/dashboard-gestor/DashboardGestor"));
const PainelOperacional = lazy(() => import("@/pages/painel-operacional/PainelOperacional"));
const PainelJuliana = lazy(() => import("@/pages/painel-juliana/PainelJuliana"));
const PainelValeska = lazy(() => import("@/pages/painel-valeska/PainelValeska"));
const PainelProducao = lazy(() => import("@/pages/painel-producao/PainelProducao"));
const MuralAvisos = lazy(() => import("@/pages/mural/MuralAvisos"));
const MeuPonto = lazy(() => import("@/pages/ponto/MeuPonto"));
const ClientesList = lazy(() => import("@/pages/clientes/ClientesList"));
const ClienteForm = lazy(() => import("@/pages/clientes/ClienteForm"));
const ClienteDetalhe = lazy(() => import("@/pages/clientes/ClienteDetalhe"));
const ClientesDuplicados = lazy(() => import("@/pages/clientes/ClientesDuplicados"));
const AtendimentosList = lazy(() => import("@/pages/clientes/AtendimentosList"));
const TriagemList = lazy(() => import("@/pages/triagem/TriagemList"));
const FichaAtendimentoPage = lazy(() => import("@/pages/clientes/FichaAtendimentoPage"));
const ProcessosList = lazy(() => import("@/pages/processos/ProcessosList"));
const ProcessoForm = lazy(() => import("@/pages/processos/ProcessoForm"));
const ProcessoDetalhe = lazy(() => import("@/pages/processos/ProcessoDetalhe"));
const EmConstrucao = lazy(() => import("@/pages/EmConstrucao"));
const Controladoria = lazy(() => import("@/pages/controladoria/Controladoria"));
const ControladoriaPerformance = lazy(() => import("@/pages/controladoria/Performance"));
const FluxosList = lazy(() => import("@/pages/fluxos/FluxosList"));
const FluxoEditor = lazy(() => import("@/pages/fluxos/FluxoEditor"));
const FinanceiroDashboard = lazy(() => import("@/pages/financeiro/FinanceiroDashboard"));
const ContratosList = lazy(() => import("@/pages/financeiro/ContratosList"));
const ContratoForm = lazy(() => import("@/pages/financeiro/ContratoForm"));
const ContratoDetalhe = lazy(() => import("@/pages/financeiro/ContratoDetalhe"));
const PagamentosList = lazy(() => import("@/pages/financeiro/PagamentosList"));
const ParcelasAReceber = lazy(() => import("@/pages/financeiro/ParcelasAReceber"));
const RepassesList = lazy(() => import("@/pages/financeiro/RepassesList"));
const RepassesPorParceiro = lazy(() => import("@/pages/financeiro/RepassesPorParceiro"));
const ComissoesFechamento = lazy(() => import("@/pages/financeiro/ComissoesFechamento"));
const ConfiguracoesFinanceiro = lazy(() => import("@/pages/financeiro/ConfiguracoesFinanceiro"));
const FechamentoMensal = lazy(() => import("@/pages/financeiro/FechamentoMensal"));
const FinanceiroDashboardGestor = lazy(() => import("@/pages/financeiro/FinanceiroDashboardGestor"));
const SaidasList = lazy(() => import("@/pages/financeiro/SaidasList"));
const SuprimentosList = lazy(() => import("@/pages/financeiro/SuprimentosList"));
const Conciliacao = lazy(() => import("@/pages/financeiro/Conciliacao"));
const ConfiguracoesDataJud = lazy(() => import("@/pages/configuracoes/ConfiguracoesDataJud"));
const DataJudTroubleshooting = lazy(() => import("@/pages/configuracoes/DataJudTroubleshooting"));
const ParceirosList = lazy(() => import("@/pages/parceiros/ParceirosList"));
const ParceiroForm = lazy(() => import("@/pages/parceiros/ParceiroForm"));
const ParceiroDetalhe = lazy(() => import("@/pages/parceiros/ParceiroDetalhe"));
const ParceirosPainel = lazy(() => import("@/pages/parceiros/ParceirosPainel"));
const ParceirosDistribuicaoIA = lazy(() => import("@/pages/parceiros/ParceirosDistribuicaoIA"));
const SubmissoesParceiros = lazy(() => import("@/pages/parceiros/SubmissoesParceiros"));
const EquipeList = lazy(() => import("@/pages/equipe/EquipeList"));
const EquipeForm = lazy(() => import("@/pages/equipe/EquipeForm"));
const EquipeDetalhe = lazy(() => import("@/pages/equipe/EquipeDetalhe"));
const GestaoPessoasLayout = lazy(() => import("@/pages/equipe/GestaoPessoasLayout"));
const PontoEquipe = lazy(() => import("@/pages/equipe/PontoEquipe"));
const FeriasEquipe = lazy(() => import("@/pages/equipe/FeriasEquipe"));
const FolhaPagamentoEquipe = lazy(() => import("@/pages/equipe/FolhaPagamentoEquipe"));
const MetasEquipe = lazy(() => import("@/pages/equipe/MetasEquipe"));
const MetasRelatorio = lazy(() => import("@/pages/equipe/MetasRelatorio"));
const ComissoesEquipe = lazy(() => import("@/pages/equipe/ComissoesEquipe"));
const ComissoesExtrato = lazy(() => import("@/pages/equipe/ComissoesExtrato"));
const PecasList = lazy(() => import("@/pages/documentos/PecasList"));
const ModelosList = lazy(() => import("@/pages/documentos/ModelosList"));
const ModeloEditor = lazy(() => import("@/pages/documentos/ModeloEditor"));
const PecaForm = lazy(() => import("@/pages/documentos/PecaForm"));
const UsuariosList = lazy(() => import("@/pages/usuarios/UsuariosList"));
const LogAtividades = lazy(() => import("@/pages/configuracoes/LogAtividades"));
const MonitoramentoSeguranca = lazy(() => import("@/pages/configuracoes/seguranca/MonitoramentoSeguranca"));
const ConfiguracoesLayout = lazy(() => import("@/pages/configuracoes/ConfiguracoesLayout"));
const CatalogoServicos = lazy(() => import("@/pages/configuracoes/catalogo/CatalogoServicos"));

const ConfiguracoesPlaceholder = lazy(() => import("@/pages/configuracoes/ConfiguracoesPlaceholder"));
const SistemaLayout = lazy(() => import("@/pages/configuracoes/sistema/SistemaLayout"));
const SistemaFuso = lazy(() => import("@/pages/configuracoes/sistema/SistemaFuso"));
const SistemaSobre = lazy(() => import("@/pages/configuracoes/sistema/SistemaSobre"));
const SistemaNotificacoes = lazy(() => import("@/pages/configuracoes/sistema/SistemaNotificacoes"));
const SistemaManutencao = lazy(() => import("@/pages/configuracoes/sistema/SistemaManutencao"));
const EscritorioForm = lazy(() => import("@/pages/configuracoes/escritorio/EscritorioForm"));
const PortaisForm = lazy(() => import("@/pages/configuracoes/portais/PortaisForm"));
const ProcessosConfig = lazy(() => import("@/pages/configuracoes/processos/ProcessosConfig"));
const ControladoriaConfig = lazy(() => import("@/pages/configuracoes/controladoria/ControladoriaConfig"));
const DocumentosConfig = lazy(() => import("@/pages/configuracoes/documentos/DocumentosConfig"));
const IntegracoesConfig = lazy(() => import("@/pages/configuracoes/integracoes/IntegracoesConfig"));
const BiaPreferencias = lazy(() => import("@/pages/configuracoes/bia/BiaPreferencias"));
const ConfiguracoesEmail = lazy(() => import("@/pages/configuracoes/email/ConfiguracoesEmail"));
const Notificacoes = lazy(() => import("@/pages/Notificacoes"));
const Agenda = lazy(() => import("@/pages/agenda/Agenda"));
const Diligencias = lazy(() => import("@/pages/diligencias/Diligencias"));
const FerramentasHub = lazy(() => import("@/pages/ferramentas/FerramentasHub"));
const CalculadoraHonorarios = lazy(() => import("@/pages/ferramentas/CalculadoraHonorarios"));
const GerenciarTabelasOAB = lazy(() => import("@/pages/ferramentas/GerenciarTabelasOAB"));
const PublicacoesPje = lazy(() => import("@/pages/ferramentas/PublicacoesPje"));
const NotificacaoExtrajudicial = lazy(() => import("@/pages/ferramentas/notificacao/NotificacaoExtrajudicial"));
const AnalisePublicacoesIA = lazy(() => import("@/pages/ferramentas/AnalisePublicacoesIA"));
const AnalisadorCaso = lazy(() => import("@/pages/ferramentas/AnalisadorCaso"));
const CalculadoraCNIS = lazy(() => import("@/pages/ferramentas/CalculadoraCNIS"));
const PerdcompInss = lazy(() => import("@/pages/ferramentas/PerdcompInss"));
const PubliJusConfig = lazy(() => import("@/pages/ferramentas/PubliJusConfig"));
const ImportacaoExportacaoHub = lazy(() => import("@/pages/importacao-exportacao/ImportacaoExportacaoHub"));
const AssistenteIA = lazy(() => import("@/pages/assistente/AssistenteIA"));
const AutomacoesIA = lazy(() => import("@/pages/ia/AutomacoesIA"));
const MCPServer = lazy(() => import("@/pages/ia/MCPServer"));
const HistoricoImportacoes = lazy(() => import("@/pages/importacao-exportacao/HistoricoImportacoes"));
const ProcessosImportadosPdpj = lazy(() => import("@/pages/importacao-exportacao/ProcessosImportadosPdpj"));
const ValidacaoImportPdpj = lazy(() => import("@/pages/importacao-exportacao/ValidacaoImportPdpj"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Portal Parceiro — páginas
const DashboardParceiro = lazy(() => import("@/portal-parceiro/pages/DashboardParceiro"));
const BemVindoParceiro = lazy(() => import("@/portal-parceiro/pages/BemVindoParceiro"));
const ProcessosParceiro = lazy(() => import("@/portal-parceiro/pages/ProcessosParceiro"));
const ProcessoDetalheParceiro = lazy(() => import("@/portal-parceiro/pages/ProcessoDetalheParceiro"));
const ClientesParceiro = lazy(() => import("@/portal-parceiro/pages/ClientesParceiro"));
const ClienteDetalheParceiro = lazy(() => import("@/portal-parceiro/pages/ClienteDetalheParceiro"));
const IndicacoesParceiro = lazy(() => import("@/portal-parceiro/pages/IndicacoesParceiro"));
const TarefasParceiro = lazy(() => import("@/portal-parceiro/pages/TarefasParceiro"));
const PrazosParceiro = lazy(() => import("@/portal-parceiro/pages/PrazosParceiro"));
const DocumentosParceiro = lazy(() => import("@/portal-parceiro/pages/DocumentosParceiro"));
const FinanceiroParceiro = lazy(() => import("@/portal-parceiro/pages/FinanceiroParceiro"));
const PerfilParceiro = lazy(() => import("@/portal-parceiro/pages/PerfilParceiro"));

// Portal Cliente — páginas
const HomeCliente = lazy(() => import("@/portal-cliente/pages/HomeCliente"));
const ProcessosCliente = lazy(() => import("@/portal-cliente/pages/ProcessosCliente"));
const ProcessoDetalheCliente = lazy(() => import("@/portal-cliente/pages/ProcessoDetalheCliente"));
const AtualizacoesCliente = lazy(() => import("@/portal-cliente/pages/AtualizacoesCliente"));
const DocumentosCliente = lazy(() => import("@/portal-cliente/pages/DocumentosCliente"));
const FinanceiroCliente = lazy(() => import("@/portal-cliente/pages/FinanceiroCliente"));
const MensagensCliente = lazy(() => import("@/portal-cliente/pages/MensagensCliente"));
const PerfilCliente = lazy(() => import("@/portal-cliente/pages/PerfilCliente"));
const TrocarSenhaCliente = lazy(() => import("@/portal-cliente/pages/TrocarSenhaCliente"));
const BemVindoCliente = lazy(() => import("@/portal-cliente/pages/BemVindoCliente"));
const SobrePortalCliente = lazy(() => import("@/portal-cliente/pages/SobrePortalCliente"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,       // 5 minutos
      gcTime: 1000 * 60 * 10,          // 10 minutos
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" richColors />
      <BrowserRouter>
        <PreviewModeProvider>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <AppRoutes />
            </Suspense>
          </AuthProvider>
        </PreviewModeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const AppRoutes = () => {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/reset-password" element={<ResetSenha />} />
      <Route path="/conta-inativa" element={<ContaInativa />} />
      <Route path="/selecionar-portal" element={<SelecionarPortal />} />

      {/* Atalhos públicos / compatibilidade com URLs antigas */}
      <Route path="/bem-vindo" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/boas-vindas" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/welcome" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/onboarding" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/sobre" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/sobre-portal" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/guia" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />

      <Route path="/parceiro" element={<Navigate to="/portal-parceiro" replace />} />
      <Route path="/parceiro/bem-vindo" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/parceiro/boas-vindas" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/parceiro/welcome" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/portal/bem-vindo" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/portal-parceiro/boas-vindas" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/portal-parceiro/welcome" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/portal-parceiro/onboarding" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/portal-parceiro/sobre" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />
      <Route path="/portal-parceiro/guia" element={<Navigate to="/portal-parceiro/bem-vindo" replace />} />

      <Route path="/cliente" element={<Navigate to="/portal-cliente" replace />} />
      <Route path="/cliente/bem-vindo" element={<Navigate to="/portal-cliente/bem-vindo" replace />} />
      <Route path="/cliente/boas-vindas" element={<Navigate to="/portal-cliente/bem-vindo" replace />} />
      <Route path="/cliente/sobre" element={<Navigate to="/portal-cliente/sobre" replace />} />
      <Route path="/portal-cliente/boas-vindas" element={<Navigate to="/portal-cliente/bem-vindo" replace />} />
      <Route path="/portal-cliente/welcome" element={<Navigate to="/portal-cliente/bem-vindo" replace />} />
      <Route path="/portal-cliente/onboarding" element={<Navigate to="/portal-cliente/bem-vindo" replace />} />
      <Route path="/portal-cliente/guia" element={<Navigate to="/portal-cliente/sobre" replace />} />

      {/* Portal do Parceiro */}
      <Route
        path="/portal-parceiro"
        element={
          <ProtectedRoute requirePortal="parceiro">
            <PortalParceiroLayout basePath="/portal-parceiro" />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardParceiro />} />
        <Route path="bem-vindo" element={<BemVindoParceiro />} />
        <Route path="processos" element={<ProcessosParceiro />} />
        <Route path="processos/:id" element={<ProcessoDetalheParceiro />} />
        <Route path="clientes" element={<ClientesParceiro />} />
        <Route path="clientes/:id" element={<ClienteDetalheParceiro />} />
        <Route path="indicacoes" element={<IndicacoesParceiro />} />
        <Route path="tarefas" element={<TarefasParceiro />} />
        <Route path="prazos" element={<PrazosParceiro />} />
        <Route path="documentos" element={<DocumentosParceiro />} />
        <Route path="repasses" element={<FinanceiroParceiro />} />
        <Route path="perfil" element={<PerfilParceiro />} />
      </Route>

      {/* Portal do Cliente */}
      <Route
        path="/portal-cliente"
        element={
          <ProtectedRoute requirePortal="cliente">
            <PortalClienteLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomeCliente />} />
        <Route path="processos" element={<ProcessosCliente />} />
        <Route path="processos/:id" element={<ProcessoDetalheCliente />} />
        <Route path="atualizacoes" element={<AtualizacoesCliente />} />
        <Route path="documentos" element={<DocumentosCliente />} />
        <Route path="financeiro" element={<FinanceiroCliente />} />
        <Route path="mensagens" element={<MensagensCliente />} />
        <Route path="perfil" element={<PerfilCliente />} />
        <Route path="trocar-senha" element={<TrocarSenhaCliente />} />
        <Route path="bem-vindo" element={<BemVindoCliente />} />
        <Route path="sobre" element={<SobrePortalCliente />} />
      </Route>

      {/* App interno */}
      <Route element={<ProtectedRoute requirePortal="interno"><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard-gestor" element={<ProtectedRoute requireGestor><DashboardGestor /></ProtectedRoute>} />
        <Route path="/painel-operacional" element={<ProtectedRoute><PainelOperacional /></ProtectedRoute>} />
        <Route path="/painel-juliana" element={<ProtectedRoute requireGestor><PainelJuliana /></ProtectedRoute>} />
        {/* Painel comercial: autorização por configuração explícita + gestor (checada no componente) */}
        <Route path="/painel-comercial" element={<ProtectedRoute><PainelValeska /></ProtectedRoute>} />
        <Route path="/painel-producao" element={<ProtectedRoute><PainelProducao /></ProtectedRoute>} />
        <Route path="/mural-avisos" element={<ProtectedRoute><MuralAvisos /></ProtectedRoute>} />
        <Route path="/ponto" element={<ProtectedRoute><MeuPonto /></ProtectedRoute>} />
        <Route path="/sem-permissao" element={<SemPermissao />} />

        <Route path="/clientes" element={<ProtectedRoute requireModulo="clientes"><ClientesList /></ProtectedRoute>} />
        <Route path="/clientes/duplicados" element={<ProtectedRoute requireModulo="clientes" requireAcao="editar"><ClientesDuplicados /></ProtectedRoute>} />
        <Route path="/clientes/novo" element={<ProtectedRoute requireModulo="clientes" requireAcao="criar"><ClienteForm /></ProtectedRoute>} />
        <Route path="/clientes/:id" element={<ProtectedRoute requireModulo="clientes"><ClienteDetalhe /></ProtectedRoute>} />
        <Route path="/clientes/:id/editar" element={<ProtectedRoute requireModulo="clientes" requireAcao="editar"><ClienteForm /></ProtectedRoute>} />
        <Route path="/atendimentos" element={<ProtectedRoute requireModulo="clientes"><AtendimentosList /></ProtectedRoute>} />
        <Route path="/atendimentos/:id" element={<ProtectedRoute requireModulo="clientes"><FichaAtendimentoPage /></ProtectedRoute>} />
        <Route path="/triagem" element={<ProtectedRoute requireModulo="clientes"><TriagemList /></ProtectedRoute>} />

        <Route path="/processos" element={<ProtectedRoute requireModulo="processos"><ProcessosList /></ProtectedRoute>} />
        <Route path="/processos/novo" element={<ProtectedRoute requireModulo="processos" requireAcao="criar"><ProcessoForm /></ProtectedRoute>} />
        <Route path="/processos/:id" element={<ProtectedRoute requireModulo="processos"><ProcessoDetalhe /></ProtectedRoute>} />
        <Route path="/processos/:id/editar" element={<ProtectedRoute requireModulo="processos" requireAcao="editar"><ProcessoForm /></ProtectedRoute>} />
        <Route path="/controladoria" element={<ProtectedRoute requireModulo="controladoria"><Controladoria /></ProtectedRoute>} />
        <Route path="/controladoria/performance" element={<ProtectedRoute requireModulo="controladoria"><ControladoriaPerformance /></ProtectedRoute>} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/diligencias" element={<Diligencias />} />
        <Route path="/fluxos" element={<ProtectedRoute requireModulo="controladoria"><FluxosList /></ProtectedRoute>} />
        <Route path="/fluxos/novo" element={<ProtectedRoute requireModulo="controladoria"><FluxoEditor /></ProtectedRoute>} />
        <Route path="/fluxos/:id" element={<ProtectedRoute requireModulo="controladoria"><FluxoEditor /></ProtectedRoute>} />
        <Route path="/financeiro" element={<ProtectedRoute requireModulo="financeiro"><FinanceiroDashboard /></ProtectedRoute>} />
        <Route path="/financeiro/contratos" element={<ProtectedRoute requireModulo="financeiro"><ContratosList /></ProtectedRoute>} />
        <Route path="/financeiro/contratos/novo" element={<ProtectedRoute requireModulo="financeiro" requireAcao="criar"><ContratoForm /></ProtectedRoute>} />
        <Route path="/financeiro/contratos/:id" element={<ProtectedRoute requireModulo="financeiro"><ContratoDetalhe /></ProtectedRoute>} />
        <Route path="/financeiro/contratos/:id/editar" element={<ProtectedRoute requireModulo="financeiro" requireAcao="editar"><ContratoForm /></ProtectedRoute>} />
        <Route path="/financeiro/pagamentos" element={<ProtectedRoute requireModulo="financeiro"><PagamentosList /></ProtectedRoute>} />
        <Route path="/financeiro/parcelas" element={<ProtectedRoute requireModulo="financeiro"><ParcelasAReceber /></ProtectedRoute>} />
        <Route path="/financeiro/repasses" element={<ProtectedRoute requireModulo="financeiro"><RepassesList /></ProtectedRoute>} />
        <Route path="/financeiro/repasses/por-parceiro" element={<ProtectedRoute requireModulo="financeiro"><RepassesPorParceiro /></ProtectedRoute>} />
        <Route path="/financeiro/comissoes-fechamento" element={<ProtectedRoute requireModulo="financeiro"><ComissoesFechamento /></ProtectedRoute>} />
        <Route path="/financeiro/configuracoes" element={<ProtectedRoute requireModulo="financeiro"><ConfiguracoesFinanceiro /></ProtectedRoute>} />
        <Route path="/financeiro/fechamento" element={<ProtectedRoute requireModulo="financeiro"><FechamentoMensal /></ProtectedRoute>} />
        <Route path="/financeiro/dashboard" element={<ProtectedRoute requireModulo="financeiro"><FinanceiroDashboardGestor /></ProtectedRoute>} />
        <Route path="/financeiro/saidas" element={<ProtectedRoute requireModulo="financeiro"><SaidasList /></ProtectedRoute>} />
        <Route path="/financeiro/suprimentos" element={<ProtectedRoute requireModulo="financeiro"><SuprimentosList /></ProtectedRoute>} />
        <Route path="/financeiro/conciliacao" element={<ProtectedRoute requireModulo="financeiro"><Conciliacao /></ProtectedRoute>} />
        <Route path="/documentos" element={<ProtectedRoute requireModulo="documentos"><PecasList /></ProtectedRoute>} />
        <Route path="/documentos/modelos" element={<ProtectedRoute requireModulo="documentos"><ModelosList /></ProtectedRoute>} />
        <Route path="/documentos/modelos/novo" element={<ProtectedRoute requireModulo="documentos" requireAcao="criar"><ModeloEditor /></ProtectedRoute>} />
        <Route path="/documentos/modelos/:id" element={<ProtectedRoute requireModulo="documentos"><ModeloEditor /></ProtectedRoute>} />
        <Route path="/documentos/pecas/novo" element={<ProtectedRoute requireModulo="documentos" requireAcao="criar"><PecaForm /></ProtectedRoute>} />
        <Route path="/documentos/pecas/:id" element={<ProtectedRoute requireModulo="documentos"><PecaForm /></ProtectedRoute>} />
        <Route path="/parceiros" element={<ProtectedRoute requireModulo="parceiros"><ParceirosList /></ProtectedRoute>} />
        <Route path="/parceiros/painel" element={<ProtectedRoute requireModulo="parceiros"><ParceirosPainel /></ProtectedRoute>} />
        <Route path="/parceiros/submissoes" element={<ProtectedRoute requireModulo="parceiros"><SubmissoesParceiros /></ProtectedRoute>} />
        <Route path="/parceiros/distribuicao-ia" element={<ProtectedRoute requireModulo="parceiros"><ParceirosDistribuicaoIA /></ProtectedRoute>} />
        <Route path="/parceiros/novo" element={<ProtectedRoute requireModulo="parceiros" requireAcao="criar"><ParceiroForm /></ProtectedRoute>} />
        <Route path="/parceiros/:id" element={<ProtectedRoute requireModulo="parceiros"><ParceiroDetalhe /></ProtectedRoute>} />
        <Route path="/parceiros/:id/editar" element={<ProtectedRoute requireModulo="parceiros" requireAcao="editar"><ParceiroForm /></ProtectedRoute>} />
        <Route path="/equipe" element={<ProtectedRoute requireModulo="equipe"><GestaoPessoasLayout /></ProtectedRoute>}>
          <Route index element={<EquipeList />} />
          <Route path="ponto" element={<PontoEquipe />} />
          <Route path="ferias" element={<FeriasEquipe />} />
          <Route path="metas" element={<MetasEquipe />} />
          <Route path="metas/relatorio" element={<MetasRelatorio />} />
          <Route path="comissoes" element={<ComissoesEquipe />} />
          <Route path="comissoes/extrato" element={<ComissoesExtrato />} />
          <Route path="folha" element={<ProtectedRoute requireGestor><FolhaPagamentoEquipe /></ProtectedRoute>} />
        </Route>
        <Route path="/equipe/novo" element={<ProtectedRoute requireModulo="equipe" requireAcao="criar"><EquipeForm /></ProtectedRoute>} />
        <Route path="/equipe/:id" element={<ProtectedRoute requireModulo="equipe"><EquipeDetalhe /></ProtectedRoute>} />
        <Route path="/equipe/:id/editar" element={<ProtectedRoute requireModulo="equipe" requireAcao="editar"><EquipeForm /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute requireGestor><UsuariosList /></ProtectedRoute>} />
        <Route path="/notificacoes" element={<Notificacoes />} />
        <Route path="/configuracoes" element={<ProtectedRoute requireGestor><ConfiguracoesLayout /></ProtectedRoute>}>
          <Route path="escritorio" element={<EscritorioForm />} />
          <Route path="usuarios" element={<UsuariosList />} />
          <Route path="portais" element={<PortaisForm />} />
          <Route path="processos" element={<ProcessosConfig />} />
          <Route path="controladoria" element={<ControladoriaConfig />} />
          <Route path="financeiro" element={<ConfiguracoesFinanceiro />} />
          <Route path="documentos" element={<DocumentosConfig />} />
          <Route path="integracoes" element={<IntegracoesConfig />} />
          <Route path="bia" element={<BiaPreferencias />} />
          <Route path="email" element={<ConfiguracoesEmail />} />
          <Route path="sistema" element={<SistemaLayout />}>
            <Route index element={<SistemaFuso />} />
            <Route path="notificacoes" element={<SistemaNotificacoes />} />
            <Route path="manutencao" element={<SistemaManutencao />} />
            <Route path="sobre" element={<SistemaSobre />} />
          </Route>
          <Route path="datajud" element={<ConfiguracoesDataJud />} />
          <Route path="datajud/troubleshooting" element={<DataJudTroubleshooting />} />
          <Route path="log-atividades" element={<LogAtividades />} />
          <Route path="seguranca" element={<MonitoramentoSeguranca />} />
          <Route path="catalogo" element={<CatalogoServicos />} />

        </Route>
        <Route path="/ferramentas" element={<FerramentasHub />} />
        <Route path="/ferramentas/calculadora-honorarios" element={<CalculadoraHonorarios />} />
        <Route path="/ferramentas/tabelas-oab" element={<ProtectedRoute requireGestor><GerenciarTabelasOAB /></ProtectedRoute>} />
        <Route path="/ferramentas/publicacoes-pje" element={<ProtectedRoute requireModulo="processos"><PublicacoesPje /></ProtectedRoute>} />
        <Route path="/ferramentas/notificacao-extrajudicial" element={<NotificacaoExtrajudicial />} />
        <Route path="/ferramentas/analise-publicacoes-ia" element={<ProtectedRoute requireModulo="controladoria"><AnalisePublicacoesIA /></ProtectedRoute>} />
        <Route path="/ferramentas/analisador-caso" element={<AnalisadorCaso />} />
        <Route path="/ferramentas/calculadora-cnis" element={<CalculadoraCNIS />} />
        <Route path="/ferramentas/perdcomp-inss" element={<PerdcompInss />} />
        <Route path="/ferramentas/publijus" element={<ProtectedRoute requireGestor><PubliJusConfig /></ProtectedRoute>} />
        <Route path="/assistente" element={<AssistenteIA />} />
        <Route path="/ia/automacoes" element={<ProtectedRoute requireGestor><AutomacoesIA /></ProtectedRoute>} />
        <Route path="/ia/mcp-server" element={<ProtectedRoute requireGestor><MCPServer /></ProtectedRoute>} />
        <Route path="/ia/servidor-mcp" element={<ProtectedRoute requireGestor><MCPServer /></ProtectedRoute>} />
        <Route path="/importacao-exportacao" element={<ProtectedRoute requireGestor><ImportacaoExportacaoHub /></ProtectedRoute>} />
        <Route path="/importacao-exportacao/historico" element={<ProtectedRoute requireGestor><HistoricoImportacoes /></ProtectedRoute>} />
        <Route path="/importacao-exportacao/pdpj" element={<ProtectedRoute requireGestor><ProcessosImportadosPdpj /></ProtectedRoute>} />
        <Route path="/importacao-exportacao/pdpj/validacao" element={<ProtectedRoute requireGestor><ValidacaoImportPdpj /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default App;
