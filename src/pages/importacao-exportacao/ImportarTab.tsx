import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, Sparkles, Download, FileStack, Table as TableIcon, Landmark } from "lucide-react";
import { gerarModeloProcessos, gerarModeloClientes } from "./modelos-planilha";
import { ImportarCsvWizard } from "./importar/ImportarCsvWizard";
import { ImportarDocxLoteDialog } from "./importar/ImportarDocxLoteDialog";
import { EntradaAssistidaDialog } from "./importar/EntradaAssistidaDialog";
import { ImportarPdpjPdfDialog } from "./importar/ImportarPdpjPdfDialog";
import { ImportarInssPdfDialog } from "./importar/ImportarInssPdfDialog";

/**
 * Aba "Importar" do hub. Cards com cada tipo de entrada.
 * Os dialogs são controlados aqui e abertos sob demanda para evitar
 * carregar o parser CSV / DOCX antes do necessário.
 */
export function ImportarTab() {
  const [openCsv, setOpenCsv] = useState<null | "processos" | "clientes">(null);
  const [openDocx, setOpenDocx] = useState(false);
  const [openAssistida, setOpenAssistida] = useState(false);
  const [openPdpj, setOpenPdpj] = useState(false);
  const [openInss, setOpenInss] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardImportar
          icon={FileSpreadsheet}
          titulo="Processos via CSV"
          descricao="Carregue uma planilha com lista de processos (CNJ, NB, área, cliente)."
          onImportar={() => setOpenCsv("processos")}
          onModelo={() => downloadBlob(gerarModeloProcessos(), "modelo-processos.xlsx")}
        />
        <CardImportar
          icon={FileSpreadsheet}
          titulo="Clientes via CSV"
          descricao="Carregue uma planilha com clientes (nome, CPF, contato, endereço)."
          onImportar={() => setOpenCsv("clientes")}
          onModelo={() => downloadBlob(gerarModeloClientes(), "modelo-clientes.xlsx")}
        />
        <CardImportar
          icon={FileText}
          titulo="Modelos de documentos (.docx)"
          descricao="Importe várias petições antigas de uma vez como modelos editáveis. Selecione vários arquivos ou uma pasta inteira."
          onImportar={() => setOpenDocx(true)}
          textoBotao="Importar .docx em lote"
        />
        <CardImportar
          icon={Sparkles}
          titulo="Entrada assistida"
          descricao="Cadastre processos um a um com busca automática no DataJud."
          onImportar={() => setOpenAssistida(true)}
          textoBotao="Iniciar cadastro"
        />
        <Card className="hover:border-gold/50 transition-colors">
          <CardHeader>
            <div className="w-10 h-10 rounded-md bg-gold/10 text-gold flex items-center justify-center mb-2">
              <FileStack className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg">Lote via PDF do Portal PDPJ</CardTitle>
            <CardDescription>
              Carregue o relatório em PDF do PDPJ e cadastre todos os processos em lote, com progresso e status item-a-item.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link to="/importacao-exportacao/pdpj">
                <TableIcon className="w-4 h-4 mr-2" /> Ver importados
              </Link>
            </Button>
            <Button size="sm" onClick={() => setOpenPdpj(true)}>
              Importar PDF
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:border-gold/50 transition-colors">
          <CardHeader>
            <div className="w-10 h-10 rounded-md bg-gold/10 text-gold flex items-center justify-center mb-2">
              <Landmark className="w-5 h-5" />
            </div>
            <CardTitle className="text-lg">PDF do Portal INSS (administrativos)</CardTitle>
            <CardDescription>
              Importe o relatório do Portal de Atendimento INSS. Vincula cada protocolo ao cliente pelo CPF
              (cria novos quando necessário) e atualiza a situação dos já cadastrados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={() => setOpenInss(true)}>
              Importar PDF INSS
            </Button>
          </CardContent>
        </Card>
      </div>

      {openCsv && (
        <ImportarCsvWizard
          modulo={openCsv}
          open={!!openCsv}
          onOpenChange={(o) => !o && setOpenCsv(null)}
        />
      )}
      <ImportarDocxLoteDialog open={openDocx} onOpenChange={setOpenDocx} />
      <EntradaAssistidaDialog open={openAssistida} onOpenChange={setOpenAssistida} />
      <ImportarPdpjPdfDialog open={openPdpj} onOpenChange={setOpenPdpj} />
      <ImportarInssPdfDialog open={openInss} onOpenChange={setOpenInss} />
    </>
  );
}

function CardImportar({
  icon: Icon,
  titulo,
  descricao,
  onImportar,
  onModelo,
  textoBotao,
}: {
  icon: typeof FileSpreadsheet;
  titulo: string;
  descricao: string;
  onImportar: () => void;
  onModelo?: () => void;
  textoBotao?: string;
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
      <CardContent className="flex gap-2 flex-wrap">
        {onModelo && (
          <Button variant="outline" size="sm" onClick={onModelo}>
            <Download className="w-4 h-4 mr-2" /> Baixar modelo
          </Button>
        )}
        <Button size="sm" onClick={onImportar}>
          {textoBotao ?? "Importar arquivo"}
        </Button>
      </CardContent>
    </Card>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
