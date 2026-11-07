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

/** GETs exclusivamente de metadados; reduz cada resposta a nomes/IDs antes de armazenar. */
export async function consultarMetaSelecionada(
  contasSelecionadas: { externo_id: string; plataforma: string }[],
  get: (path: string, params?: Record<string, unknown>) => Promise<unknown>,
) {
  const selecionadas = contasSelecionadas.filter(c => c.plataforma === "metaads");
  if (!selecionadas.length || selecionadas.length > 5) throw new Error("consulta_meta_invalida");
  const resposta = objeto(await get("/v1/accounts"));
  if (!Array.isArray(resposta.accounts)) throw new Error("consulta_meta_invalida");
  const contas = [];
  for (const selecionada of selecionadas) {
    const conta = resposta.accounts.map(objeto).find(c => c._id === selecionada.externo_id);
    if (!conta || conta.isActive !== true || conta.needsReconnection === true) throw new Error("consulta_meta_invalida");
    const metadata = objeto(conta.metadata), paginaId = texto(metadata.selectedPageId);
    const paginas = Array.isArray(metadata.availablePages) ? metadata.availablePages.map(objeto) : [];
    const pagina = paginas.find(p => p.id === paginaId);
    const anuncios = objeto(await get("/v1/ads/accounts", { accountId: selecionada.externo_id, inScopeOnly: true }));
    if (!Array.isArray(anuncios.accounts) || anuncios.accounts.length > 100) throw new Error("consulta_meta_invalida");
    const formularios: { id: string; nome: string }[] = [];
    let cursor: string | undefined;
    let hasMore = false;
    for (let n = 0; n < 4; n++) {
      const p = normalizarFormularios(await get("/v1/ads/lead-forms", { accountId: selecionada.externo_id, limit: 25, cursor }));
      formularios.push(...p.formularios.map(f => ({ id: f.id, nome: f.nome })));
      hasMore = p.hasMore;
      if (!hasMore) break;
      if (p.cursor === cursor) throw new Error("consulta_meta_invalida");
      cursor = p.cursor ?? undefined;
    }
    contas.push({
      id: selecionada.externo_id, nome: texto(conta.displayName, 300),
      pagina: paginaId ? { id: paginaId, nome: texto(pagina?.name, 300) } : null,
      anuncios: anuncios.accounts.map(objeto).filter(a => a.selected !== false).map(a => {
        const id = texto(a.id); if (!id) throw new Error("consulta_meta_invalida");
        return { id, nome: texto(a.name, 300) };
      }),
      formularios: [...new Map(formularios.map(f => [f.id, f])).values()],
      consulta_parcial: hasMore,
    });
  }
  return { contas };
}
