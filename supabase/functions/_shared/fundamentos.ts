export interface FonteLegal {
  id: string;
  norma_id: string;
  titulo: string;
  artigo: string;
  trecho: string;
  fonte_oficial: string;
  fonte_repositorio: string;
  versao_sha: string;
  commit: string;
  versao_texto: string;
  capturado_em: string | null;
  importado_em: string;
  notas: string;
  referencia?: string;
}
interface BancoPesquisa {
  rpc: (
    nome: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function prepararConsulta(consulta: string): string {
  let q = consulta.slice(0, 1600).replace(/(\d)\.(?=\d)/g, "$1");
  const normal = q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const expansoes: string[] = [];
  if (/\bbpc\b|\bloas\b/.test(normal))
    expansoes.push(
      "benefício prestação continuada deficiência idoso renda familiar",
    );
  if (/nome sujo|negativacao/.test(normal))
    expansoes.push("cadastro consumidor dívida indevida inscrição");
  if (/auxilio.doenca|incapacidade/.test(normal))
    expansoes.push("benefício incapacidade trabalho segurado perícia");
  if (/salario.maternidade/.test(normal))
    expansoes.push("maternidade parto segurada carência");
  q = q.replace(
    /\b(redija|elabore|prepare|minuta|petição|peticao|modelo|documento|texto|jurídica|juridica)\b/gi,
    " ",
  );
  return (q + " " + expansoes.join(" ")).trim().slice(0, 1600);
}

export async function buscarFundamentos(
  banco: BancoPesquisa,
  params: { consulta: string; normaId?: string; selecionados?: string[] },
) {
  const avisos: string[] = [];
  const selecionados = [...new Set(params.selecionados ?? [])]
    .filter((s) => /^[a-f0-9]{64}$/.test(s))
    .slice(0, 12);
  const fontes: FonteLegal[] = [];
  if (selecionados.length) {
    const r = await banco.rpc("jur_pesquisar", {
      p_consulta: "",
      p_limite: 30,
      p_ids: selecionados,
    });
    if (r.error || !Array.isArray(r.data))
      throw new Error(
        "Não foi possível conferir os dispositivos selecionados na biblioteca.",
      );
    fontes.push(...(r.data as FonteLegal[]));
    if (selecionados.some((id) => !fontes.some((f) => f.id === id)))
      avisos.push(
        "Há fonte selecionada fora da versão ativa do acervo. Refaça a pesquisa antes de aproveitar essa citação.",
      );
  }
  const consulta = prepararConsulta(params.consulta);
  if (consulta.length >= 2) {
    const r = await banco.rpc("jur_pesquisar", {
      p_consulta: consulta,
      p_norma_id: params.normaId || null,
      p_limite: 12,
    });
    if (r.error || !Array.isArray(r.data))
      throw new Error(
        "Não foi possível pesquisar a biblioteca jurídica. Tente novamente antes de gerar a peça.",
      );
    fontes.push(...(r.data as FonteLegal[]));
  }
  let tamanho = 0;
  const unicas: FonteLegal[] = [];
  for (const f of fontes) {
    if (
      unicas.some((v) => v.id === f.id) ||
      unicas.length >= 12 ||
      tamanho + f.trecho.length > 42000
    )
      continue;
    tamanho += f.trecho.length;
    unicas.push({ ...f, referencia: `L${unicas.length + 1}` });
  }
  if (!unicas.length)
    avisos.push(
      "A pesquisa não encontrou dispositivo no acervo importado. Isso não significa inexistência de fundamento legal; amplie a pesquisa ou acrescente uma fonte oficial.",
    );
  if (
    unicas.some((f) => !/compilad|atualizad|consolidad/i.test(f.versao_texto))
  )
    avisos.push(
      "Há texto sem indicação de compilação atualizada. Confira alterações posteriores e a redação aplicável à data dos fatos.",
    );
  avisos.push(
    "A recuperação de dispositivos não confirma vigência, eficácia temporal nem adequação ao caso. Confira as fontes oficiais na revisão.",
  );
  return { fontes: unicas, avisos, consulta };
}

export function fontesCitadas(
  ids: unknown,
  fontes: FonteLegal[],
): FonteLegal[] {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
    throw new Error("O assistente não identificou corretamente suas fontes.");
  const citadas: FonteLegal[] = [];
  for (const id of new Set(ids)) {
    const fonte = fontes.find((f) => f.referencia === id || f.id === id);
    if (!fonte)
      throw new Error(
        "O assistente citou uma fonte que não foi recuperada do acervo. Solicite uma nova consulta.",
      );
    citadas.push(fonte);
  }
  return citadas;
}
