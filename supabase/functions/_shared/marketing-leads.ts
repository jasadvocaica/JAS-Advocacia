// Normalizador puro: o corpo de uma publicação é dado, nunca instrução de execução.
type J = Record<string, unknown>;
const obj = (x: unknown): J =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as J) : {};
const str = (x: unknown, max = 200) =>
  typeof x === "string" ? x.trim().slice(0, max) : "";
export async function assinaturaValida(
  corpo: string,
  assinatura: string | null,
  segredo: string,
): Promise<boolean> {
  if (!segredo || !assinatura || !/^[a-f0-9]{64}$/.test(assinatura))
    return false;
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(assinatura.match(/../g)!, (h) =>
    parseInt(h, 16),
  );
  return crypto.subtle.verify(
    "HMAC",
    chave,
    bytes,
    new TextEncoder().encode(corpo),
  );
}
export function normalizarLead(
  payload: unknown,
  eventoHeader?: string | null,
  testeAutorizado = false,
) {
  const p = obj(payload),
    a = obj(p.account),
    l = obj(p.lead),
    campos = obj(l.fields);
  if (p.event !== "lead.received") throw new Error("Evento não suportado");
  const evento = str(p.id),
    conta = str(a.accountId) || str(a.id),
    externo = str(l.leadgenId),
    formulario = str(l.formId);
  if (
    !evento ||
    !conta ||
    !externo ||
    !formulario ||
    (eventoHeader && eventoHeader !== evento)
  )
    throw new Error("Identidade incompleta ou divergente");
  const data = str(l.createdAt);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(data) || !Number.isFinite(Date.parse(data)))
    throw new Error("Data de aquisição inválida");
  // Não recebe dados de saúde, respostas abertas, diagnósticos, laudos ou o corpo integral.
  const nome =
    str(campos.full_name) ||
    [str(campos.first_name), str(campos.last_name)].filter(Boolean).join(" ");
  if (!nome) throw new Error("Contato sem nome; revisar formulário");
  const email = str(campos.email, 254),
    telefone = str(campos.phone_number, 40);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("E-mail inválido");
  return {
    evento_id: evento,
    conta_id: conta,
    externo_id: externo,
    formulario_id: formulario,
    nome,
    email,
    telefone,
    adquirido_em: new Date(data).toISOString(),
    campanha_externa_id: str(l.campaignId) || null,
    conjunto_externo_id: str(l.adsetId) || null,
    anuncio_externo_id: str(l.adId) || null,
    organico: l.isOrganic === true,
    // Teste é atributo da rota/configuração do servidor; um remetente não pode misturar ambientes.
    teste: testeAutorizado,
  };
}

export async function reconciliarPagina(
  conta: string,
  formulario: string,
  teste: boolean,
  cursor: string | undefined,
  listar: (params: {
    accountId: string;
    limit: number;
    cursor?: string;
  }) => Promise<unknown>,
  gravar: (dados: ReturnType<typeof normalizarLead>) => Promise<void>,
) {
  const pagina = obj(await listar({ accountId: conta, limit: 50, cursor }));
  if (!Array.isArray(pagina.leads))
    throw new Error("Resposta de leads inválida; nenhuma paginação presumida");
  let processados = 0;
  for (const l of pagina.leads) {
    const lead = obj(l);
    if (str(lead.formId) && str(lead.formId) !== formulario)
      throw new Error("Formulário divergente na resposta de leads");
    // GET /lead-forms/{id}/leads retorna id/createdTime; webhook usa leadgenId/createdAt.
    const externo = str(lead.leadgenId) || str(lead.id);
    const normal = normalizarLead(
      {
        id: `reconciliacao:${conta}:${externo}`,
        event: "lead.received",
        account: { accountId: conta },
        lead: { ...lead, leadgenId: externo, createdAt: str(lead.createdAt) || str(lead.createdTime), formId: formulario },
      },
      null,
      teste,
    );
    await gravar(normal);
    processados++;
  }
  const pagination = obj(pagina.pagination);
  if (pagination.hasMore === true && !str(pagination.cursor, 1000))
    throw new Error("Próxima página sem cursor; revisar provedor");
  return {
    processados,
    cursor: str(pagination.cursor, 1000) || null,
    hasMore: pagination.hasMore === true,
  };
}
