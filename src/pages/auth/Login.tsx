import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Briefcase, Users, Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { registrarEventoLogin } from "@/lib/auth-audit";

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname as string | undefined;

  // Equipe / Parceiro
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Cliente (CPF)
  const [cpf, setCpf] = useState("");
  const [senhaCliente, setSenhaCliente] = useState("");
  const [loadingCliente, setLoadingCliente] = useState(false);
  const [showSenhaEquipe, setShowSenhaEquipe] = useState(false);
  const [showSenhaCliente, setShowSenhaCliente] = useState(false);

  const handleSubmitEquipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      toast.error("Falha no login", {
        description: error.includes("Invalid") ? "E-mail ou senha incorretos." : error,
      });
      return;
    }
    toast.success("Bem-vinda de volta!");
    navigate(from ?? "/selecionar-portal", { replace: true });
  };

  const handleSubmitCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      toast.error("CPF inválido", { description: "Digite os 11 números do seu CPF." });
      return;
    }
    if (!senhaCliente) {
      toast.error("Informe sua senha");
      return;
    }
    setLoadingCliente(true);
    const loginEmail = `${cpfDigits}@cliente.local`;
    const { error } = await signIn(loginEmail, senhaCliente);
    setLoadingCliente(false);
    if (error) {
      toast.error("Falha no login", {
        description: error.includes("Invalid")
          ? "CPF ou senha incorretos. Confira com o escritório a senha inicial enviada."
          : error,
      });
      return;
    }
    toast.success("Bem-vindo(a)!");
    void registrarEventoLogin({
      evento: "escolha_manual",
      email: loginEmail,
      portal: "cliente",
      rotaDestino: "/portal-cliente",
      motivo: "login direto por CPF",
    });
    navigate("/portal-cliente", { replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex p-12 flex-col justify-between relative overflow-hidden bg-[hsl(215_55%_10%)] text-white">
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-[28rem] h-[28rem] rounded-full bg-primary blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-[28rem] h-[28rem] rounded-full bg-accent blur-3xl" />
        </div>
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative">
          <BrandLogo variant="dark" size="h-28" className="items-start" />
        </div>
        <div className="relative space-y-6 max-w-md">
          <div className="h-px w-12 bg-gradient-to-r from-white/70 to-transparent" />
          <h2 className="text-5xl font-display leading-tight text-white">
            Excelência<br />em cada{" "}
            <em className="not-italic bg-gradient-to-r from-[hsl(207_90%_70%)] to-[hsl(210_79%_55%)] bg-clip-text text-transparent">
              prazo
            </em>.
          </h2>
          <p className="text-lg text-white/75 leading-relaxed">
            Controladoria jurídica completa, prazos automáticos e visibilidade total do escritório em uma única plataforma.
          </p>
        </div>
        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Juliana Araujo Advocacia. Todos os direitos reservados.
        </p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-primary-foreground">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <BrandLogo variant="light" size="h-24" />
          </div>

          <Card className="p-8 brand-shadow border-border/60">
            <div className="space-y-2 mb-6">
              <h2 className="text-3xl font-display">Acesso ao sistema</h2>
              <p className="text-sm text-muted-foreground">
                Escolha o tipo de acesso para continuar.
              </p>
            </div>

            <Tabs defaultValue="equipe" className="w-full">
              <TabsList className="grid grid-cols-2 w-full mb-6">
                <TabsTrigger value="equipe" className="gap-2">
                  <Briefcase className="w-4 h-4" />
                  Equipe / Parceiro
                </TabsTrigger>
                <TabsTrigger value="cliente" className="gap-2">
                  <Users className="w-4 h-4" />
                  Cliente
                </TabsTrigger>
              </TabsList>

              <TabsContent value="equipe">
                <form onSubmit={handleSubmitEquipe} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@escritorio.com.br"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Senha</Label>
                      <Link to="/esqueci-senha" className="text-xs text-gold-dark hover:text-gold underline-offset-4 hover:underline">
                        Esqueci minha senha
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showSenhaEquipe ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenhaEquipe((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                        aria-label={showSenhaEquipe ? "Ocultar senha" : "Mostrar senha"}
                        tabIndex={-1}
                      >
                        {showSenhaEquipe ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="cliente">
                <form onSubmit={handleSubmitCliente} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      type="text"
                      inputMode="numeric"
                      required
                      value={cpf}
                      onChange={(e) => setCpf(formatarCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      autoComplete="username"
                      maxLength={14}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Use apenas os números do seu CPF.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="senha-cliente">Senha</Label>
                    <div className="relative">
                      <Input
                        id="senha-cliente"
                        type={showSenhaCliente ? "text" : "password"}
                        required
                        value={senhaCliente}
                        onChange={(e) => setSenhaCliente(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenhaCliente((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                        aria-label={showSenhaCliente ? "Ocultar senha" : "Mostrar senha"}
                        tabIndex={-1}
                      >
                        {showSenhaCliente ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Primeiro acesso? Use a senha inicial enviada pelo escritório (geralmente seu primeiro nome + 123#).
                    </p>
                  </div>
                  <Button type="submit" variant="gold" size="lg" className="w-full" disabled={loadingCliente}>
                    {loadingCliente ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar no portal"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 pt-6 border-t border-border text-center text-sm text-muted-foreground">
              Acesso restrito. Em caso de dúvida, entre em contato com o escritório.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

