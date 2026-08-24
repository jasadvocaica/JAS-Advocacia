// Gerador de mensagens WhatsApp - LegisFlow
// Todas as mensagens usam formatação WhatsApp: *negrito*, _itálico_

export const PORTAL_PARCEIRO = "parceiros.app.julianaaraujoadvocacia.com.br";
export const PORTAL_CLIENTE = "clientes.app.julianaaraujoadvocacia.com.br";
export const ASSINATURA = "Juliana Araújo — OAB/MT 34.182 · (66) 99262-4753";

// ── Helpers ─────────────────────────────────────────────
export function fmtData(d?: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

export function fmtMoeda(v?: number | string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function hojeBR(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function primeiroNome(nome?: string | null): string {
  return nome?.trim().split(/\s+/)[0] || "cliente";
}

export function capitalize(s?: string | null): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export function emojiPrioridade(p?: string | null): string {
  const map: Record<string, string> = {
    urgente: "🚨",
    alta: "🔴",
    media: "🟡",
    média: "🟡",
    baixa: "🟢",
  };
  return map[(p || "").toLowerCase()] || "▪";
}

const sig = () => `_${ASSINATURA}_`;

// ══════════════════════════════════════════════════════
//  PARCEIROS
// ══════════════════════════════════════════════════════

export interface ParceiroCtx {
  nome: string;
  whatsapp?: string | null;
}

export function parceiroNovaTarefa(args: {
  parceiro: ParceiroCtx;
  titulo: string;
  numeroProcesso?: string | null;
  cliente?: string | null;
  dataVencimento?: string | null;
  prioridade?: string | null;
}): string {
  const { parceiro, titulo, numeroProcesso, cliente, dataVencimento, prioridade } = args;
  return `📋 *Nova tarefa — ${parceiro.nome}*

Processo: ${numeroProcesso || "—"}
Cliente: ${cliente || "—"}
Tarefa: ${titulo}
Prazo: ${dataVencimento ? fmtData(dataVencimento) : "A definir"}
Prioridade: ${emojiPrioridade(prioridade)} ${capitalize(prioridade || "média")}

Acesse o portal para confirmar:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroAtualizacaoProcesso(args: {
  parceiro: ParceiroCtx;
  numeroProcesso?: string | null;
  tipoAcao?: string | null;
  cliente?: string | null;
  descricao: string;
  proximoPasso?: string | null;
}): string {
  const { parceiro, numeroProcesso, tipoAcao, cliente, descricao, proximoPasso } = args;
  return `⚖️ *Atualização de processo*

Parceiro(a): ${parceiro.nome}
Processo: ${numeroProcesso || "—"} — ${tipoAcao || "—"}
Cliente: ${cliente || "—"}

📌 O que aconteceu:
${descricao}${proximoPasso ? `\n\n➡️ Próximo passo: ${proximoPasso}` : ""}

Ver no portal:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroPericiaAgendada(args: {
  parceiro: ParceiroCtx;
  numeroProcesso?: string | null;
  cliente?: string | null;
  dataPericia: string;
  local?: string | null;
}): string {
  return `🔬 *Perícia médica agendada*

Parceiro(a): ${args.parceiro.nome}
Processo: ${args.numeroProcesso || "—"}
Cliente: ${args.cliente || "—"}

📅 Data: ${fmtData(args.dataPericia)}
📍 Local: ${args.local || "A confirmar"}

Orientar o cliente a levar todos os laudos e exames originais.

Ver detalhes no portal:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroBeneficioDeferido(args: {
  parceiro: ParceiroCtx;
  numeroProcesso?: string | null;
  cliente?: string | null;
  nb?: string | null;
  dib?: string | null;
}): string {
  return `✅ *Benefício deferido!*

Parceiro(a): ${args.parceiro.nome}
Processo: ${args.numeroProcesso || "—"}
Cliente: ${args.cliente || "—"}
NB: ${args.nb || "—"}
DIB (início do pagamento): ${args.dib ? fmtData(args.dib) : "A confirmar"}

Próximo passo: verificar se há atrasados e calcular honorários.

Ver no portal:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroAudienciaMarcada(args: {
  parceiro: ParceiroCtx;
  numeroProcesso?: string | null;
  cliente?: string | null;
  dataAudiencia: string;
  tipo?: string | null;
  local?: string | null;
}): string {
  return `🏛️ *Audiência marcada*

Parceiro(a): ${args.parceiro.nome}
Processo: ${args.numeroProcesso || "—"}
Cliente: ${args.cliente || "—"}
Tipo: ${args.tipo || "Audiência"}
📅 Data: ${fmtData(args.dataAudiencia)}
📍 Local/Link: ${args.local || "A confirmar"}

Preparar cliente e documentos com antecedência.

Ver no portal:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroSentencaRecebida(args: {
  parceiro: ParceiroCtx;
  numeroProcesso?: string | null;
  cliente?: string | null;
  resultado: "favoravel" | "parcial" | "desfavoravel" | string;
  prazoRecurso?: string | null;
}): string {
  const emoji = args.resultado === "favoravel" ? "✅" : args.resultado === "parcial" ? "⚠️" : "❌";
  return `📜 *Sentença recebida*

Parceiro(a): ${args.parceiro.nome}
Processo: ${args.numeroProcesso || "—"}
Cliente: ${args.cliente || "—"}
Resultado: ${emoji} ${capitalize(args.resultado || "aguardando análise")}${args.prazoRecurso ? `\n⏰ Prazo para recurso: ${fmtData(args.prazoRecurso)}` : ""}

Ver análise completa no portal:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroRepasse(args: {
  parceiro: ParceiroCtx;
  numeroProcesso?: string | null;
  cliente?: string | null;
  valor: number;
}): string {
  return `💰 *Repasse disponível*

Parceiro(a): ${args.parceiro.nome}
Processo: ${args.numeroProcesso || "—"}
Cliente: ${args.cliente || "—"}
Valor: ${fmtMoeda(args.valor)}

O repasse referente à sua participação neste processo está disponível.
Entre em contato para confirmar os dados bancários ou acesse o portal.

👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

export function parceiroPrazoUrgente(args: {
  parceiro: ParceiroCtx;
  titulo: string;
  numeroProcesso?: string | null;
  cliente?: string | null;
  dataVencimento: string;
}): string {
  const hoje = new Date().toISOString().split("T")[0];
  const venceTxt = args.dataVencimento === hoje ? "*HOJE*" : `*${fmtData(args.dataVencimento)}*`;
  return `🚨 *PRAZO URGENTE*

Parceiro(a): ${args.parceiro.nome}
Processo: ${args.numeroProcesso || "—"}
Cliente: ${args.cliente || "—"}
Prazo: ${args.titulo}
Vencimento: ${venceTxt}

Acesse o portal para registrar a ação tomada:
👉 ${PORTAL_PARCEIRO}

${sig()}`;
}

// ══════════════════════════════════════════════════════
//  CLIENTES
// ══════════════════════════════════════════════════════

export interface ClienteCtx {
  nome: string;
  whatsapp?: string | null;
}

export function clienteBoasVindas(args: { cliente: ClienteCtx }): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 👋

Seja muito bem-vindo(a) ao nosso escritório!

Confirmamos que você agora é nosso cliente e já estamos cuidando do seu caso com todo carinho e dedicação.

Seu processo está em boas mãos. Qualquer dúvida, pode falar comigo por aqui mesmo.

${sig()}`;
}

export function clienteRequerimentoProtocolado(args: {
  cliente: ClienteCtx;
  nb?: string | null;
  der?: string | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 😊

Boas notícias! Seu requerimento foi protocolado no INSS.

📋 Número do benefício (NB): *${args.nb || "Aguardando"}*
📅 Data de entrada (DER): *${args.der ? fmtData(args.der) : "—"}*

A partir de agora o INSS tem até 45 dias para dar uma resposta. Fique tranquilo(a), estarei acompanhando tudo.

Assim que tiver novidades, te aviso! 😊

${sig()}`;
}

export function clientePericiaAgendada(args: {
  cliente: ClienteCtx;
  dataPericia: string;
  local?: string | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*!

Sua perícia médica no INSS foi agendada:

📅 Data: *${fmtData(args.dataPericia)}*
📍 Local: *${args.local || "Confirmar pelo Meu INSS"}*

⚠️ *Orientações importantes:*
▪ Leve TODOS os laudos e exames médicos *originais*
▪ Descreva ao perito como é o seu *pior dia* — não minimize
▪ Relate todas as dificuldades do dia a dia
▪ Pode levar um acompanhante

Qualquer dúvida antes da perícia, me chame!

${sig()}`;
}

export function clienteBeneficioDeferido(args: {
  cliente: ClienteCtx;
  nb?: string | null;
  dib?: string | null;
  valor?: number | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 🎉

Temos uma *ótima notícia*! Seu benefício foi *concedido* pelo INSS!

✅ NB: *${args.nb || "—"}*
📅 Início do pagamento (DIB): *${args.dib ? fmtData(args.dib) : "A confirmar"}*
💰 Valor: *${args.valor ? fmtMoeda(args.valor) : "1 salário mínimo"}*

Estou verificando se há valores em atraso a receber e já te informo.

Parabéns! Foi uma conquista sua e estou muito feliz por você! 🥳

${sig()}`;
}

export function clienteBeneficioNegadoJudicial(args: { cliente: ClienteCtx }): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*,

Infelizmente o INSS negou seu benefício administrativamente. Mas isso *não significa o fim* — pelo contrário.

⚖️ Vamos entrar com uma *ação judicial* para garantir o seu direito. Tenho boas teses jurídicas que se aplicam ao seu caso.

Preciso que você me envie os seguintes documentos atualizados:
▪ Laudo médico com CID (se ainda não tiver)
▪ Comprovante de renda atualizado

Não se preocupe — estou cuidando de tudo para você!

${sig()}`;
}

export function clientePeticaoProtocolada(args: {
  cliente: ClienteCtx;
  numeroCNJ?: string | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 😊

Sua ação foi *protocolada na Justiça Federal*!

📁 Número do processo: *${args.numeroCNJ || "—"}*

A partir de agora o processo corre pela Justiça. Estarei acompanhando todos os movimentos e te aviso assim que houver novidades.

Você também pode acompanhar pelo portal do cliente:
👉 ${PORTAL_CLIENTE}

${sig()}`;
}

export function clienteAudienciaMarcada(args: {
  cliente: ClienteCtx;
  dataAudiencia: string;
  tipo?: string | null;
  local?: string | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*!

Uma audiência foi marcada no seu processo! 🏛️

📅 Data: *${fmtData(args.dataAudiencia)}*
🕐 Tipo: *${args.tipo || "Audiência"}*
📍 Local: *${args.local || "A confirmar"}*

*Sua presença é obrigatória.*

Vou te ligar antes para explicar direitinho o que vai acontecer e como você deve se comportar. Não precisa se preocupar agora!

${sig()}`;
}

export function clienteSentencaFavoravel(args: {
  cliente: ClienteCtx;
  resumo?: string | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 🎉

*VITÓRIA!* O juiz deu a sentença no seu processo e a decisão foi *favorável* a você!

📜 O que significa: ${args.resumo || "você ganhou a ação. Detalhes em breve."}

Agora preciso verificar o prazo para a outra parte recorrer e os próximos passos. Te aviso em breve!

Muito obrigada pela confiança. Foi uma conquista nossa! 😊

${sig()}`;
}

export function clienteSentencaDesfavoravel(args: { cliente: ClienteCtx }): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*,

Recebi a sentença do seu processo e, infelizmente, a decisão não foi favorável desta vez.

Mas *ainda não acabou*. Temos o direito de recorrer para uma instância superior e já estou analisando os argumentos para o recurso.

Vou entrar em contato em breve para conversarmos sobre os próximos passos. Fique tranquilo(a)!

${sig()}`;
}

export function clienteCobrancaHonorarios(args: {
  cliente: ClienteCtx;
  valor: number;
  vencimento: string;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 😊

Passando para lembrar que há um honorário em aberto:

💰 Valor: *${fmtMoeda(args.valor)}*
📅 Vencimento: *${fmtData(args.vencimento)}*

Pix: *advocaciajulianaaraujo@gmail.com*
Favorecido: Juliana Araújo da Silva

Qualquer dificuldade para o pagamento, pode me chamar para conversarmos! 😊

${sig()}`;
}

export function clienteSolicitacaoDocumentos(args: {
  cliente: ClienteCtx;
  documentos: string[] | string;
}): string {
  const lista = Array.isArray(args.documentos)
    ? args.documentos.map((d) => `▪ ${d}`).join("\n")
    : args.documentos;
  return `Olá, *${primeiroNome(args.cliente.nome)}*!

Para dar continuidade ao seu processo, preciso dos seguintes documentos:

${lista}

Você pode me enviar por aqui (WhatsApp), pelo portal do cliente ou trazer pessoalmente ao escritório.

Qualquer dúvida sobre os documentos, é só me chamar! 😊

${sig()}`;
}

export function clienteAtualizacaoProcesso(args: {
  cliente: ClienteCtx;
  descricao: string;
  proximoPasso?: string | null;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 😊

Trouxe uma atualização sobre o seu processo:

📌 *O que aconteceu:*
${args.descricao}${args.proximoPasso ? `\n\n➡️ *Próximo passo:*\n${args.proximoPasso}` : ""}

Acompanhe pelo portal do cliente:
👉 ${PORTAL_CLIENTE}

Qualquer dúvida, estou aqui! 😊

${sig()}`;
}

export function clienteRevisaoBienalBPC(args: {
  cliente: ClienteCtx;
  dataRevisao: string;
}): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*!

⚠️ *Aviso importante sobre seu BPC/LOAS*

Sua revisão bienal obrigatória está chegando:
📅 Data: *${fmtData(args.dataRevisao)}*

*Para não perder o benefício, você precisa:*
▪ Comparecer ao INSS na data marcada
▪ Levar laudo médico atualizado
▪ Confirmar que sua renda não mudou

Me chame assim que receber a carta do INSS! Vou te ajudar a se preparar. 😊

${sig()}`;
}

export function clienteOrientacaoPosConcessao(args: { cliente: ClienteCtx }): string {
  return `Olá, *${primeiroNome(args.cliente.nome)}*! 🎉

Agora que seu benefício foi concedido, é importante seguir algumas orientações para não perdê-lo:

✅ *Fique atento(a):*
▪ Não deixe a renda familiar passar de 1/4 do salário mínimo por pessoa
▪ Informe ao INSS qualquer mudança na família ou na renda
▪ A revisão bienal é obrigatória — não perca!
▪ O BPC não pode ser acumulado com outro benefício de mesmo valor

Se surgir alguma dúvida, pode sempre me chamar! 😊

${sig()}`;
}

// ══════════════════════════════════════════════════════
//  Dispatcher: nome do tipo → função
// ══════════════════════════════════════════════════════

export type TipoMsgParceiro =
  | "nova_tarefa"
  | "atualizacao"
  | "pericia"
  | "beneficio_deferido"
  | "audiencia"
  | "sentenca"
  | "repasse"
  | "prazo_urgente";

export type TipoMsgCliente =
  | "boas_vindas"
  | "requerimento_protocolado"
  | "pericia"
  | "beneficio_deferido"
  | "beneficio_negado_judicial"
  | "peticao_protocolada"
  | "audiencia"
  | "sentenca_favoravel"
  | "sentenca_desfavoravel"
  | "cobranca"
  | "solicitar_docs"
  | "atualizacao"
  | "revisao_bienal"
  | "orientacao_pos_concessao";

export const TIPOS_PARCEIRO: { id: TipoMsgParceiro; label: string; emoji: string }[] = [
  { id: "nova_tarefa", label: "Nova tarefa", emoji: "📋" },
  { id: "atualizacao", label: "Atualização de processo", emoji: "⚖️" },
  { id: "pericia", label: "Perícia agendada", emoji: "🔬" },
  { id: "beneficio_deferido", label: "Benefício deferido", emoji: "✅" },
  { id: "audiencia", label: "Audiência marcada", emoji: "🏛️" },
  { id: "sentenca", label: "Sentença recebida", emoji: "📜" },
  { id: "repasse", label: "Repasse disponível", emoji: "💰" },
  { id: "prazo_urgente", label: "Prazo urgente", emoji: "🚨" },
];

export const TIPOS_CLIENTE: { id: TipoMsgCliente; label: string; emoji: string }[] = [
  { id: "boas_vindas", label: "Boas-vindas", emoji: "👋" },
  { id: "requerimento_protocolado", label: "Requerimento protocolado (INSS)", emoji: "📋" },
  { id: "pericia", label: "Perícia agendada", emoji: "🔬" },
  { id: "beneficio_deferido", label: "Benefício deferido", emoji: "🎉" },
  { id: "beneficio_negado_judicial", label: "Benefício negado → judicial", emoji: "⚖️" },
  { id: "peticao_protocolada", label: "Petição protocolada", emoji: "📁" },
  { id: "audiencia", label: "Audiência marcada", emoji: "🏛️" },
  { id: "sentenca_favoravel", label: "Sentença favorável", emoji: "🎉" },
  { id: "sentenca_desfavoravel", label: "Sentença desfavorável", emoji: "📜" },
  { id: "cobranca", label: "Cobrança de honorários", emoji: "💰" },
  { id: "solicitar_docs", label: "Solicitar documentos", emoji: "📎" },
  { id: "atualizacao", label: "Atualização geral", emoji: "📌" },
  { id: "revisao_bienal", label: "Revisão bienal BPC", emoji: "⚠️" },
  { id: "orientacao_pos_concessao", label: "Orientação pós-concessão", emoji: "✅" },
];

// Helpers para abrir WhatsApp com texto pronto
export function whatsappLinkComTexto(numero?: string | null, texto?: string): string | null {
  if (!numero) return null;
  const limpo = numero.replace(/\D/g, "");
  if (!limpo) return null;
  const com55 = limpo.startsWith("55") ? limpo : `55${limpo}`;
  const t = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${com55}${t}`;
}
