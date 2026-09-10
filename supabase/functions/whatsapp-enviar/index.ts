import { createClient } from "npm:@supabase/supabase-js@2";

const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const chavePublica = () => {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    if (keys.default) return keys.default as string;
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return resposta({ error: "Método não permitido." }, 405);

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return resposta({ error: "Sessão obrigatória." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const publicKey = chavePublica();
  if (!supabaseUrl || !publicKey) return resposta({ error: "Servidor não configurado." }, 503);

  const db = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenUsuario = authorization.slice("Bearer ".length);
  const { data: usuario, error: erroUsuario } = await db.auth.getUser(tokenUsuario);
  if (erroUsuario || !usuario.user) return resposta({ error: "Sessão inválida." }, 401);

  let body: { conversa_id?: string; texto?: string; template_id?: string; template_parametros?: string[] };
  try {
    body = await request.json();
  } catch {
    return resposta({ error: "Corpo inválido." }, 400);
  }

  const conversaId = body.conversa_id?.trim();
  const texto = body.texto?.trim();
  const templateId = body.template_id?.trim();
  if (!conversaId || (!texto && !templateId) || (texto && templateId)) {
    return resposta({ error: "Informe a conversa e exatamente um conteúdo: texto ou template." }, 400);
  }
  if (texto && texto.length > 4096) return resposta({ error: "A mensagem ultrapassa 4.096 caracteres." }, 400);

  const { data: conversa, error: erroConversa } = await db
    .from("whatsapp_conversas")
    .select("id,telefone,conexao_id,whatsapp_conexoes!inner(phone_number_id,status,ativo)")
    .eq("id", conversaId)
    .single();

  if (erroConversa || !conversa) return resposta({ error: "Conversa não encontrada ou sem permissão." }, 404);

  const conexao = Array.isArray(conversa.whatsapp_conexoes)
    ? conversa.whatsapp_conexoes[0]
    : conversa.whatsapp_conexoes;

  if (!conexao?.ativo || conexao.status !== "conectado" || !conexao.phone_number_id) {
    return resposta({ error: "O canal oficial não está conectado." }, 409);
  }

  let template: { nome: string; idioma: string; componentes: unknown } | null = null;
  let parametrosTemplate: string[] = [];
  if (templateId) {
    const { data, error } = await db
      .from("whatsapp_templates")
      .select("nome,idioma,componentes")
      .eq("id", templateId)
      .eq("conexao_id", conversa.conexao_id)
      .eq("presente_meta", true)
      .eq("status", "APPROVED")
      .maybeSingle();
    if (error || !data) return resposta({ error: "Template aprovado não encontrado para este canal." }, 404);

    const componentes = Array.isArray(data.componentes) ? data.componentes as Array<Record<string, unknown>> : [];
    const corpo = componentes.find((item) => String(item.type || "").toUpperCase() === "BODY");
    const textoCorpo = typeof corpo?.text === "string" ? corpo.text : "";
    const indices = Array.from(textoCorpo.matchAll(/{{\s*(\d+)\s*}}/g))
      .map((match) => Number(match[1]))
      .filter((numero) => Number.isInteger(numero) && numero > 0);
    const quantidadeParametros = indices.length > 0 ? Math.max(...indices) : 0;
    const componentesNaoCorpo = componentes.filter((item) => String(item.type || "").toUpperCase() !== "BODY");
    if (/{{\s*\d+\s*}}/.test(JSON.stringify(componentesNaoCorpo))) {
      return resposta({ error: "Este template possui parâmetros fora do corpo e ainda requer homologação específica." }, 409);
    }

    parametrosTemplate = Array.isArray(body.template_parametros)
      ? body.template_parametros.map((valor) => String(valor ?? "").trim())
      : [];
    if (parametrosTemplate.length !== quantidadeParametros || parametrosTemplate.some((valor) => !valor)) {
      return resposta({ error: `Preencha os ${quantidadeParametros} parâmetro(s) obrigatórios do template.` }, 400);
    }
    if (parametrosTemplate.some((valor) => valor.length > 1024)) {
      return resposta({ error: "Um parâmetro do template ultrapassa 1.024 caracteres." }, 400);
    }
    template = data;
  }

  const { data: ultimaEntrada, error: erroJanela } = await db
    .from("whatsapp_mensagens")
    .select("ocorrida_em")
    .eq("conversa_id", conversa.id)
    .eq("direcao", "entrada")
    .order("ocorrida_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroJanela) return resposta({ error: "Não foi possível validar a janela de atendimento." }, 500);
  const entradaEm = ultimaEntrada?.ocorrida_em ? new Date(ultimaEntrada.ocorrida_em).getTime() : 0;
  if (!template && (!entradaEm || Date.now() - entradaEm > 24 * 60 * 60 * 1000)) {
    return resposta({
      error: "A janela de 24 horas está encerrada. Use um template aprovado pela Meta para retomar o contato.",
      codigo: "JANELA_24H_ENCERRADA",
    }, 409);
  }

  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN") || "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION") || "";
  if (!accessToken || !graphVersion) {
    return resposta({ error: "As credenciais oficiais ainda não foram configuradas." }, 503);
  }

  const { data: mensagem, error: erroInsert } = await db
    .from("whatsapp_mensagens")
    .insert({
      conversa_id: conversa.id,
      direcao: "saida",
      tipo: template ? "template" : "texto",
      conteudo: template ? `[Template: ${template.nome}]` : texto,
      status: "pendente",
      enviada_por: usuario.user.id,
      ocorrida_em: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (erroInsert || !mensagem) {
    return resposta({ error: "Não foi possível registrar a mensagem." }, 500);
  }

  try {
    const envio = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(conexao.phone_number_id)}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(template
          ? {
              messaging_product: "whatsapp",
              to: conversa.telefone.replace(/\D/g, ""),
              type: "template",
              template: {
                name: template.nome,
                language: { code: template.idioma },
                ...(parametrosTemplate.length > 0
                  ? {
                      components: [{
                        type: "body",
                        parameters: parametrosTemplate.map((textoParametro) => ({
                          type: "text",
                          text: textoParametro,
                        })),
                      }],
                    }
                  : {}),
              },
            }
          : {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: conversa.telefone.replace(/\D/g, ""),
              type: "text",
              text: { preview_url: false, body: texto },
            }),
      },
    );

    const resultado = await envio.json();
    if (!envio.ok) {
      await db.from("whatsapp_mensagens")
        .update({ status: "falha" })
        .eq("id", mensagem.id);
      console.error("Falha sanitizada no envio WhatsApp:", envio.status);
      return resposta({ error: "A Meta recusou o envio. Consulte a conexão do canal." }, 502);
    }

    const providerMessageId = resultado?.messages?.[0]?.id || null;
    const { error: erroUpdate } = await db
      .from("whatsapp_mensagens")
      .update({ provider_message_id: providerMessageId, status: "enviada" })
      .eq("id", mensagem.id);

    if (erroUpdate) throw erroUpdate;

    return resposta({ enviada: true, mensagem_id: mensagem.id });
  } catch (error) {
    await db.from("whatsapp_mensagens")
      .update({ status: "falha" })
      .eq("id", mensagem.id);
    console.error("Falha sanitizada no envio WhatsApp:", error instanceof Error ? error.message : "erro desconhecido");
    return resposta({ error: "Falha temporária ao enviar a mensagem." }, 502);
  }
});
