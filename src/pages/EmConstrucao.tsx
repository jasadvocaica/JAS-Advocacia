import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, ArrowLeft } from "lucide-react";

export default function EmConstrucao({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={titulo} description={descricao} />
      <Card className="p-12 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-gold/10 flex items-center justify-center mb-4">
          <Construction className="w-8 h-8 text-gold-dark" />
        </div>
        <h3 className="font-display text-2xl mb-2">Módulo em construção</h3>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          A estrutura de banco de dados e permissões deste módulo já está pronta.
          A interface será entregue na próxima leva. Peça para continuar quando quiser.
        </p>
        <Button asChild variant="gold-outline">
          <Link to="/"><ArrowLeft className="w-4 h-4" /> Voltar ao Dashboard</Link>
        </Button>
      </Card>
    </div>
  );
}
