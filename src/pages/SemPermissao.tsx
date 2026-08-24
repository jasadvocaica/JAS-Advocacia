import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export default function SemPermissao() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-8 h-8 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-display">Sem permissão</h1>
        <p className="text-muted-foreground">
          Você não tem permissão para acessar este módulo. Solicite ao Gestor.
        </p>
        <Button asChild variant="gold-outline">
          <Link to="/">Voltar ao Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
