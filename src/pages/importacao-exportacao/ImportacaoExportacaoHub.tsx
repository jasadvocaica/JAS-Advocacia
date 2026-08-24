import { useState } from "react";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, Download, History, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { ImportarTab } from "./ImportarTab";
import { ExportarTab } from "./ExportarTab";
import { HistoricoJobs } from "./HistoricoJobs";

/**
 * Hub central do módulo Importação e Exportação.
 * Apenas gestores acessam (ver rota em App.tsx). Conta com duas abas grandes
 * — Importar e Exportar — e uma tabela de histórico com os últimos jobs.
 */
export default function ImportacaoExportacaoHub() {
  const [tab, setTab] = useState<"importar" | "exportar">("importar");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação e Exportação"
        description="Carregue dados em massa, gere relatórios para o contador, exporte listas para parceiros e faça backup completo do sistema."
      >
        <Button variant="gold" size="sm" asChild>
          <Link to="/importacao-exportacao/migracao-clientes-processos">
            <Database className="w-4 h-4 mr-2" /> Revisar migração de clientes
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/importacao-exportacao/historico">
            <History className="w-4 h-4 mr-2" /> Histórico de importações
          </Link>
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "importar" | "exportar")}>
        <TabsList>
          <TabsTrigger value="importar" className="gap-2">
            <Upload className="w-4 h-4" /> Importar
          </TabsTrigger>
          <TabsTrigger value="exportar" className="gap-2">
            <Download className="w-4 h-4" /> Exportar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-4">
          <ImportarTab />
        </TabsContent>
        <TabsContent value="exportar" className="mt-4">
          <ExportarTab />
        </TabsContent>
      </Tabs>

      <HistoricoJobs />
    </div>
  );
}
