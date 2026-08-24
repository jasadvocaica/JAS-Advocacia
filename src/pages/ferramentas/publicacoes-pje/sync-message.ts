/**
 * Mensagem padrão exibida quando a edge function `pje-comunica-sync`
 * retorna sem `totais` e sem `message` (ex.: nenhum monitoramento ativo).
 *
 * Cita explicitamente os 4 tipos de campo aceitos pelo formulário de
 * cadastro de monitoramento.
 */
export const MENSAGEM_PADRAO_SEM_TOTAIS =
  "Nenhum monitoramento ativo. Cadastre ao menos um: OAB do advogado, nome da parte, CPF/CNPJ ou número CNJ do processo.";

export type SyncResponse = {
  ok?: boolean;
  message?: string;
  totais?: {
    consultadas?: number;
    novas?: number;
    vinculadas?: number;
    erros?: number;
  };
} | null | undefined;

export type SyncToast = {
  title: string;
  description: string;
  /**
   * Indica que a resposta sugere ausência de monitoramentos cadastrados —
   * o componente pode usar isso para exibir um botão de ação (ex.:
   * "Cadastrar agora") apontando para o formulário.
   */
  precisaCadastrar?: boolean;
};

/**
 * Constrói o conteúdo do toast de sincronização de forma defensiva,
 * lidando com respostas sem `totais` e/ou sem `message`.
 *
 * Nunca deve lançar — o frontend não pode quebrar por uma resposta parcial.
 */
export function formatarMensagemSync(r: SyncResponse): SyncToast {
  if (!r || !r.totais) {
    return {
      title: "Sincronização concluída",
      description: r?.message ?? MENSAGEM_PADRAO_SEM_TOTAIS,
      precisaCadastrar: true,
    };
  }
  const { novas = 0, vinculadas = 0, erros = 0 } = r.totais;
  return {
    title: "Sincronização concluída",
    description: `${novas} nova(s) · ${vinculadas} vinculada(s) · ${erros} erro(s)`,
    precisaCadastrar: false,
  };
}
