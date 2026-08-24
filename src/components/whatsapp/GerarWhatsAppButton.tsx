import { useState, useEffect, useMemo } from "react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MessageCircle, Loader2 } from "lucide-react";
import { WhatsAppMsgModal, type MensagemItem } from "./WhatsAppMsgModal";
import { CamposDinamicosDialog, type TipoCampos } from "./CamposDinamicosDialog";
import {
  TIPOS_PARCEIRO, TIPOS_CLIENTE,
  parceiroNovaTarefa, parceiroAtualizacaoProcesso, parceiroPericiaAgendada,
  parceiroBeneficioDeferido, parceiroAudienciaMarcada, parceiroSentencaRecebida,
  parceiroRepasse, parceiroPrazoUrgente,
  clienteBoasVindas, clienteRequerimentoProtocolado, clientePericiaAgendada,
  clienteBeneficioDeferido, clienteBeneficioNegadoJudicial, clientePeticaoProtocolada,
  clienteAudienciaMarcada, clienteSentencaFavoravel, clienteSentencaDesfavoravel,
  clienteCobrancaHonorarios, clienteSolicitacaoDocumentos, clienteAtualizacaoProcesso,
  clienteRevisaoBienalBPC, clienteOrientacaoPosConcessao,
  type TipoMsgParceiro, type TipoMsgCliente,
} from "@/lib/whatsapp-mensagens";

interface BaseProps {
  contexto?: {
    numeroProcesso?: string | null;
    tipoAcao?: string | null;
    cliente?: string | null;
  };
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "icon";
  label?: string;
}

interface ParceiroProps extends BaseProps {
  alvo: "parceiro";
  parceiro: { id: string; nome: string; whatsapp?: string | null };
}

interface ClienteProps extends BaseProps {
  alvo: "cliente";
  cliente: { id: string; nome: string; whatsapp?: string | null };
}

type Props = ParceiroProps | ClienteProps;

// Mapeia o tipo escolhido para os campos dinâmicos necessários
function camposParaTipo(alvo: "parceiro" | "cliente", tipo: string): TipoCampos[] {
  if (alvo === "parceiro") {
    switch (tipo as TipoMsgParceiro) {
      case "nova_tarefa":
        return [
          { name: "titulo", label: "Título da tarefa", type: "text", required: true },
          { name: "dataVencimento", label: "Data de vencimento", type: "date" },
          { name: "prioridade", label: "Prioridade", type: "select", options: ["baixa", "media", "alta", "urgente"] },
        ];
      case "atualizacao":
        return [
          { name: "descricao", label: "O que aconteceu", type: "textarea", required: true },
          { name: "proximoPasso", label: "Próximo passo", type: "textarea" },
        ];
      case "pericia":
        return [
          { name: "dataPericia", label: "Data da perícia", type: "date", required: true },
          { name: "local", label: "Local", type: "text" },
        ];
      case "beneficio_deferido":
        return [
          { name: "nb", label: "NB", type: "text" },
          { name: "dib", label: "DIB", type: "date" },
        ];
      case "audiencia":
        return [
          { name: "dataAudiencia", label: "Data da audiência", type: "date", required: true },
          { name: "tipo", label: "Tipo (ex: Conciliação, Instrução)", type: "text" },
          { name: "local", label: "Local ou link", type: "text" },
        ];
      case "sentenca":
        return [
          { name: "resultado", label: "Resultado", type: "select", options: ["favoravel", "parcial", "desfavoravel"], required: true },
          { name: "prazoRecurso", label: "Prazo para recurso", type: "date" },
        ];
      case "repasse":
        return [
          { name: "valor", label: "Valor (R$)", type: "number", required: true },
        ];
      case "prazo_urgente":
        return [
          { name: "titulo", label: "Descrição do prazo", type: "text", required: true },
          { name: "dataVencimento", label: "Vencimento", type: "date", required: true },
        ];
    }
  } else {
    switch (tipo as TipoMsgCliente) {
      case "boas_vindas":
      case "beneficio_negado_judicial":
      case "sentenca_desfavoravel":
      case "orientacao_pos_concessao":
        return [];
      case "requerimento_protocolado":
        return [
          { name: "nb", label: "NB", type: "text" },
          { name: "der", label: "DER (data de entrada)", type: "date" },
        ];
      case "pericia":
        return [
          { name: "dataPericia", label: "Data da perícia", type: "date", required: true },
          { name: "local", label: "Local", type: "text" },
        ];
      case "beneficio_deferido":
        return [
          { name: "nb", label: "NB", type: "text" },
          { name: "dib", label: "DIB", type: "date" },
          { name: "valor", label: "Valor mensal (R$)", type: "number" },
        ];
      case "peticao_protocolada":
        return [
          { name: "numeroCNJ", label: "Número CNJ", type: "text", required: true },
        ];
      case "audiencia":
        return [
          { name: "dataAudiencia", label: "Data da audiência", type: "date", required: true },
          { name: "tipo", label: "Tipo", type: "text" },
          { name: "local", label: "Local", type: "text" },
        ];
      case "sentenca_favoravel":
        return [
          { name: "resumo", label: "Resumo da decisão", type: "textarea" },
        ];
      case "cobranca":
        return [
          { name: "valor", label: "Valor (R$)", type: "number", required: true },
          { name: "vencimento", label: "Vencimento", type: "date", required: true },
        ];
      case "solicitar_docs":
        return [
          { name: "documentos", label: "Documentos (um por linha)", type: "textarea", required: true },
        ];
      case "atualizacao":
        return [
          { name: "descricao", label: "O que aconteceu", type: "textarea", required: true },
          { name: "proximoPasso", label: "Próximo passo", type: "textarea" },
        ];
      case "revisao_bienal":
        return [
          { name: "dataRevisao", label: "Data da revisão", type: "date", required: true },
        ];
    }
  }
  return [];
}

function gerarMensagem(
  alvo: "parceiro" | "cliente",
  tipo: string,
  alvoData: { nome: string; whatsapp?: string | null },
  contexto: { numeroProcesso?: string | null; tipoAcao?: string | null; cliente?: string | null },
  campos: Record<string, any>,
): string {
  if (alvo === "parceiro") {
    const p = { nome: alvoData.nome, whatsapp: alvoData.whatsapp };
    switch (tipo as TipoMsgParceiro) {
      case "nova_tarefa":
        return parceiroNovaTarefa({
          parceiro: p, titulo: campos.titulo, numeroProcesso: contexto.numeroProcesso,
          cliente: contexto.cliente, dataVencimento: campos.dataVencimento, prioridade: campos.prioridade,
        });
      case "atualizacao":
        return parceiroAtualizacaoProcesso({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, tipoAcao: contexto.tipoAcao,
          cliente: contexto.cliente, descricao: campos.descricao, proximoPasso: campos.proximoPasso,
        });
      case "pericia":
        return parceiroPericiaAgendada({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, cliente: contexto.cliente,
          dataPericia: campos.dataPericia, local: campos.local,
        });
      case "beneficio_deferido":
        return parceiroBeneficioDeferido({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, cliente: contexto.cliente,
          nb: campos.nb, dib: campos.dib,
        });
      case "audiencia":
        return parceiroAudienciaMarcada({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, cliente: contexto.cliente,
          dataAudiencia: campos.dataAudiencia, tipo: campos.tipo, local: campos.local,
        });
      case "sentenca":
        return parceiroSentencaRecebida({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, cliente: contexto.cliente,
          resultado: campos.resultado, prazoRecurso: campos.prazoRecurso,
        });
      case "repasse":
        return parceiroRepasse({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, cliente: contexto.cliente,
          valor: Number(campos.valor) || 0,
        });
      case "prazo_urgente":
        return parceiroPrazoUrgente({
          parceiro: p, numeroProcesso: contexto.numeroProcesso, cliente: contexto.cliente,
          titulo: campos.titulo, dataVencimento: campos.dataVencimento,
        });
    }
  } else {
    const c = { nome: alvoData.nome, whatsapp: alvoData.whatsapp };
    switch (tipo as TipoMsgCliente) {
      case "boas_vindas": return clienteBoasVindas({ cliente: c });
      case "requerimento_protocolado":
        return clienteRequerimentoProtocolado({ cliente: c, nb: campos.nb, der: campos.der });
      case "pericia":
        return clientePericiaAgendada({ cliente: c, dataPericia: campos.dataPericia, local: campos.local });
      case "beneficio_deferido":
        return clienteBeneficioDeferido({ cliente: c, nb: campos.nb, dib: campos.dib, valor: campos.valor ? Number(campos.valor) : null });
      case "beneficio_negado_judicial":
        return clienteBeneficioNegadoJudicial({ cliente: c });
      case "peticao_protocolada":
        return clientePeticaoProtocolada({ cliente: c, numeroCNJ: campos.numeroCNJ });
      case "audiencia":
        return clienteAudienciaMarcada({ cliente: c, dataAudiencia: campos.dataAudiencia, tipo: campos.tipo, local: campos.local });
      case "sentenca_favoravel":
        return clienteSentencaFavoravel({ cliente: c, resumo: campos.resumo });
      case "sentenca_desfavoravel":
        return clienteSentencaDesfavoravel({ cliente: c });
      case "cobranca":
        return clienteCobrancaHonorarios({ cliente: c, valor: Number(campos.valor) || 0, vencimento: campos.vencimento });
      case "solicitar_docs":
        return clienteSolicitacaoDocumentos({
          cliente: c,
          documentos: typeof campos.documentos === "string"
            ? campos.documentos.split("\n").map((s: string) => s.trim()).filter(Boolean)
            : (campos.documentos || []),
        });
      case "atualizacao":
        return clienteAtualizacaoProcesso({ cliente: c, descricao: campos.descricao, proximoPasso: campos.proximoPasso });
      case "revisao_bienal":
        return clienteRevisaoBienalBPC({ cliente: c, dataRevisao: campos.dataRevisao });
      case "orientacao_pos_concessao":
        return clienteOrientacaoPosConcessao({ cliente: c });
    }
  }
  return "";
}

export function GerarWhatsAppButton(props: Props) {
  const { variant = "outline", size = "sm", label = "WhatsApp", contexto = {} } = props;
  const tipos = props.alvo === "parceiro" ? TIPOS_PARCEIRO : TIPOS_CLIENTE;
  const alvoData = props.alvo === "parceiro" ? props.parceiro : props.cliente;

  const [tipoSelecionado, setTipoSelecionado] = useState<string | null>(null);
  const [mensagemPronta, setMensagemPronta] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const camposNecessarios = useMemo(
    () => (tipoSelecionado ? camposParaTipo(props.alvo, tipoSelecionado) : []),
    [tipoSelecionado, props.alvo]
  );

  const escolherTipo = (tipo: string) => {
    setTipoSelecionado(tipo);
    const campos = camposParaTipo(props.alvo, tipo);
    if (campos.length === 0) {
      // sem campos: gera direto
      const msg = gerarMensagem(props.alvo, tipo, alvoData, contexto, {});
      setMensagemPronta(msg);
      setModalOpen(true);
    }
  };

  const onCamposPreenchidos = (valores: Record<string, any>) => {
    if (!tipoSelecionado) return;
    const msg = gerarMensagem(props.alvo, tipoSelecionado, alvoData, contexto, valores);
    setMensagemPronta(msg);
    setModalOpen(true);
  };

  const fecharModal = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setMensagemPronta(null);
      setTipoSelecionado(null);
    }
  };

  const mensagensModal: MensagemItem[] = mensagemPronta
    ? [{ id: "1", nome: alvoData.nome, whatsapp: alvoData.whatsapp, mensagem: mensagemPronta }]
    : [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size={size}>
            <MessageCircle className="w-4 h-4 mr-1.5" style={{ color: "#25D366" }} />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">
            Mensagens para {props.alvo === "parceiro" ? "parceiro" : "cliente"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {tipos.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => escolherTipo(t.id)}>
              <span className="mr-2">{t.emoji}</span>
              {t.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {tipoSelecionado && camposNecessarios.length > 0 && !mensagemPronta && (
        <CamposDinamicosDialog
          open
          onOpenChange={(o) => { if (!o) setTipoSelecionado(null); }}
          titulo={tipos.find((t) => t.id === tipoSelecionado)?.label || "Preencher dados"}
          campos={camposNecessarios}
          onConfirmar={onCamposPreenchidos}
        />
      )}

      <WhatsAppMsgModal
        open={modalOpen}
        onOpenChange={fecharModal}
        titulo={tipos.find((t) => t.id === tipoSelecionado)?.label}
        mensagens={mensagensModal}
      />
    </>
  );
}
