/** Retorna somente metadados públicos do formulário; nunca respostas de leads. */
export interface FormularioDisponivel {
  id: string;
  nome: string;
  pagina_id: string | null;
  status: string | null;
}
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const texto = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : null;
export function normalizarFormularios(resposta: unknown) {
  const r = objeto(resposta), p = objeto(r.pagination);
  if (!Array.isArray(r.forms) || r.forms.length > 100)
    throw new Error("Resposta de formulários inválida; nenhuma autorização foi alterada");
  const cursor = texto(p.cursor, 1000);
  if (p.hasMore === true && !cursor)
    throw new Error("Paginação de formulários inválida");
  const formularios: FormularioDisponivel[] = r.forms.map((v: unknown) => {
    const f = objeto(v), id = texto(f.id);
    if (!id) throw new Error("Formulário sem identificador válido");
    return {
      id,
      nome: texto(f.name, 300) ?? id,
      pagina_id: texto(f.pageId) ?? texto(f.page_id) ?? texto(objeto(f.page).id),
      status: texto(f.status, 60),
    };
  });
  return { formularios, cursor, hasMore: p.hasMore === true };
}
