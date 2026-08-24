import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileSpreadsheet, Users, Settings2, Database, Download } from "lucide-react";

/**
 * Aba "Exportar" do hub. Cards com cada tipo de saída.
 * Implementação completa de cada exportação virá na próxima rodada via edge functions.
 */
export function ExportarTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CardExportar
        icon={Calculator}
        titulo="Relatório para contador"
        descricao="DRE simplificada com receitas, inadimplência e repasses por período."
        textoBotao="Gerar relatório"
        onAction={() => alert("Em breve: edge function gera Excel multi-aba.")}
      />
      <CardExportar
        icon={FileSpreadsheet}
        titulo="Lista de processos"
        descricao="Excel/CSV com filtros por área, status, advogado, parceiro. Versões interno/parceiro/cliente."
        textoBotao="Exportar"
        onAction={() => alert("Em breve.")}
      />
      <CardExportar
        icon={Users}
        titulo="Lista de clientes"
        descricao="Versão completa (gestor) ou mailing (sem dados sensíveis)."
        textoBotao="Exportar"
        onAction={() => alert("Em breve.")}
      />
      <CardExportar
        icon={Settings2}
        titulo="Exportação personalizada"
        descricao="Escolha módulos, filtros, formato (Excel/CSV/PDF) e gere o arquivo."
        textoBotao="Configurar"
        onAction={() => alert("Em breve.")}
      />
      <CardExportar
        icon={Database}
        titulo="Backup completo"
        descricao="Todos os dados do sistema em arquivo .zip — clientes, processos, financeiro, modelos…"
        textoBotao="Gerar backup"
        onAction={() => alert("Em breve: edge function empacota tudo em .zip.")}
      />
    </div>
  );
}

function CardExportar({
  icon: Icon,
  titulo,
  descricao,
  textoBotao,
  onAction,
}: {
  icon: typeof Calculator;
  titulo: string;
  descricao: string;
  textoBotao: string;
  onAction: () => void;
}) {
  return (
    <Card className="hover:border-gold/50 transition-colors">
      <CardHeader>
        <div className="w-10 h-10 rounded-md bg-gold/10 text-gold flex items-center justify-center mb-2">
          <Icon className="w-5 h-5" />
        </div>
        <CardTitle className="text-lg">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" onClick={onAction}>
          <Download className="w-4 h-4 mr-2" /> {textoBotao}
        </Button>
      </CardContent>
    </Card>
  );
}
