// Glossário simples — tradução de termos jurídicos para linguagem do cliente.
export interface TermoGlossario {
  termo: string;
  traducao: string;
}

export const GLOSSARIO: TermoGlossario[] = [
  { termo: "Autor", traducao: "Você (quem entrou com o processo)" },
  { termo: "Réu", traducao: "A outra parte (geralmente o INSS, banco ou empresa)" },
  { termo: "Petição inicial", traducao: "Documento que dá início ao processo" },
  { termo: "Citação", traducao: "Aviso oficial à outra parte de que existe um processo" },
  { termo: "Contestação", traducao: "Resposta da outra parte ao processo" },
  { termo: "Sentença", traducao: "Decisão do juiz no final do processo" },
  { termo: "Recurso", traducao: "Pedido para um juiz superior revisar a decisão" },
  { termo: "Perícia médica", traducao: "Exame feito por um médico nomeado pelo juiz para avaliar sua saúde" },
  { termo: "Avaliação social", traducao: "Visita de um assistente social para confirmar sua situação familiar e financeira" },
  { termo: "Audiência", traducao: "Reunião marcada pelo juiz para ouvir as partes" },
  { termo: "Trânsito em julgado", traducao: "Quando a decisão não pode mais ser contestada" },
  { termo: "Cumprimento de sentença", traducao: "Fase em que cobramos o que foi decidido pelo juiz" },
  { termo: "Indeferido", traducao: "Pedido negado" },
  { termo: "Deferido", traducao: "Pedido aceito" },
  { termo: "Via administrativa", traducao: "Processo direto no INSS, sem juiz" },
  { termo: "Via judicial", traducao: "Processo na Justiça, com um juiz decidindo" },
];

export const TIPOS_BENEFICIO = [
  "Aposentadoria por idade",
  "Aposentadoria por tempo de contribuição",
  "Aposentadoria por invalidez",
  "Aposentadoria especial",
  "Auxílio-doença",
  "Auxílio-acidente",
  "BPC/LOAS — Idoso",
  "BPC/LOAS — Pessoa com deficiência",
  "Pensão por morte",
  "Salário-maternidade",
  "Revisão de benefício",
  "Outro",
];

export const ETAPAS_COMUNS = [
  "Aguardando perícia médica",
  "Aguardando avaliação social",
  "Juntar documentos pessoais",
  "Juntar laudos médicos",
  "Juntar comprovantes de renda",
  "Aguardando audiência",
  "Aguardando manifestação do INSS",
  "Aguardando decisão do juiz",
  "Aguardando cumprimento de sentença",
];

export const VIAS_PROCESSUAIS = [
  { value: "administrativo", label: "Administrativo (no INSS)", explicacao: "Seu pedido está sendo analisado direto pelo INSS, sem ir à Justiça." },
  { value: "judicial", label: "Judicial", explicacao: "Seu caso está na Justiça e será decidido por um juiz." },
  { value: "judicial_apos_negativa", label: "Judicial após negativa administrativa", explicacao: "O INSS negou seu pedido na via administrativa, então levamos o caso à Justiça." },
];
