import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

export default function ConfiguracoesPlaceholder({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Construction className="w-5 h-5 text-muted-foreground" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {descricao ?? "Esta seção será habilitada em breve. A fundação do módulo já está pronta."}
        </p>
      </CardContent>
    </Card>
  );
}
