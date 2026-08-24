import * as XLSX from "xlsx";

/** Gera um modelo .xlsx para importação de processos com header e exemplo. */
export function gerarModeloProcessos(): Blob {
  const dados = [
    ["MODELO DE IMPORTAÇÃO DE PROCESSOS — LegisFlow"],
    ["Preencha a partir da linha 3. Não altere os nomes das colunas."],
    [
      "numero_cnj","nb","tipo","area_direito","tipo_acao","status",
      "valor_causa","data_distribuicao","cliente_nome","cliente_cpf",
      "vara","juiz","observacoes",
    ],
    [
      "0000892-11.2026.8.11.0014","","judicial","previdenciario",
      "BPC/LOAS","em_andamento","22252.39","15/04/2026",
      "Maria dos Milagres Nunes","004.516.312-00",
      "1ª Vara Federal","Dr. João Silva","Negativa INSS em 10/02/2026",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Processos");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Gera um modelo .xlsx para importação de clientes com header e exemplo. */
export function gerarModeloClientes(): Blob {
  const dados = [
    ["MODELO DE IMPORTAÇÃO DE CLIENTES — LegisFlow"],
    ["Preencha a partir da linha 3. Não altere os nomes das colunas."],
    [
      "nome","cpf","data_nascimento","whatsapp","email",
      "cidade","estado","profissao","como_chegou","observacoes",
    ],
    [
      "Maria dos Milagres Nunes","004.516.312-00","15/03/1975",
      "91999999999","maria@email.com","Belém","PA",
      "Do lar","indicacao","Indicada pelo Dr. Matheus",
    ],
  ];
  const ws = XLSX.utils.aoa_to_sheet(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
