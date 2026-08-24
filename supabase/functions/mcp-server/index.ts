// MCP Server LegisFlow — expõe ferramentas de leitura para Claude.ai via JSON-RPC
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =============== Ferramentas ===============
const TOOLS = [
  {
    name: "listar_casos_ativos",
    description: "Lista processos ativos do escritório JAS Advocacia",
    inputSchema: {
      type: "object",
      properties: {
        area: { type: "string", description: "Filtrar por área de direito (opcional)" },
        limite: { type: "number", description: "Quantidade (padrão 20)" },
      },
    },
  },
  {
    name: "prazos_urgentes",
    description: "Lista prazos e tarefas pendentes vencendo nos próximos N dias",
    inputSchema: {
      type: "object",
      properties: { dias: { type: "number", description: "Dias à frente (padrão 7)" } },
    },
  },
  {
    name: "resumo_dashboard",
    description: "Resumo geral: casos ativos, prazos urgentes (7 dias) e receita do mês",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "resumo_financeiro",
    description: "Receitas (honorários pagos) e parcelas pendentes/atrasadas por mês",
    inputSchema: {
      type: "object",
      properties: {
        mes: { type: "number", description: "Mês 1-12 (padrão: atual)" },
        ano: { type: "number", description: "Ano (padrão: atual)" },
      },
    },
  },
  {
    name: "buscar_caso",
    description: "Busca processo por número CNJ ou nome do cliente",
    inputSchema: {
      type: "object",
      properties: { busca: { type: "string", description: "Número CNJ ou nome do cliente" } },
      required: ["busca"],
    },
  },
  // ============ FERRAMENTAS DE ESCRITA ============
  {
    name: "criar_cliente",
    description: "Cadastra um novo cliente no sistema",
    inputSchema: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo (obrigatório)" },
        cpf_cnpj: { type: "string", description: "CPF ou CNPJ (opcional)" },
        telefone: { type: "string", description: "Telefone com DDD (opcional)" },
        email: { type: "string", description: "Email (opcional)" },
        endereco: { type: "string", description: "Endereço (opcional)" },
        observacoes: { type: "string", description: "Observações (opcional)" },
      },
      required: ["nome"],
    },
  },
  {
    name: "criar_processo",
    description: "Cadastra um novo processo vinculado a um cliente",
    inputSchema: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "UUID do cliente (obrigatório)" },
        numero_cnj: { type: "string", description: "Número CNJ (opcional)" },
        area_direito: { type: "string", description: "Área do direito (obrigatório)" },
        status: { type: "string", description: "Status (obrigatório). Ex: 'Em andamento'" },
        vara: { type: "string" },
        comarca: { type: "string" },
        descricao: { type: "string", description: "Resumo do caso (vai para observacoes_internas)" },
        valor_causa: { type: "number" },
      },
      required: ["cliente_id", "area_direito", "status"],
    },
  },
  {
    name: "atualizar_status_processo",
    description: "Atualiza status e/ou fase de um processo, registrando andamento",
    inputSchema: {
      type: "object",
      properties: {
        processo_id: { type: "string", description: "UUID do processo (obrigatório)" },
        status: { type: "string", description: "Novo status (obrigatório)" },
        fase_atual: { type: "string" },
        observacao: { type: "string" },
      },
      required: ["processo_id", "status"],
    },
  },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa vinculada a um processo (item de controladoria)",
    inputSchema: {
      type: "object",
      properties: {
        processo_id: { type: "string", description: "UUID do processo (obrigatório)" },
        titulo: { type: "string", description: "Título (obrigatório)" },
        descricao: { type: "string" },
        responsavel: { type: "string", description: "Nome ou email do responsável (apenas informativo)" },
        prazo: { type: "string", description: "Data YYYY-MM-DD (padrão: +7 dias)" },
        prioridade: { type: "string", description: "baixa|media|alta|urgente (padrão media)" },
      },
      required: ["processo_id", "titulo"],
    },
  },
  {
    name: "lancar_financeiro",
    description: "Lança parcela financeira (cria contrato simplificado se necessário)",
    inputSchema: {
      type: "object",
      properties: {
        processo_id: { type: "string" },
        cliente_id: { type: "string" },
        tipo: { type: "string", description: "honorario|parcela|despesa|reembolso" },
        descricao: { type: "string" },
        valor: { type: "number" },
        data_vencimento: { type: "string", description: "YYYY-MM-DD" },
        status_pagamento: { type: "string", description: "pendente|pago|atrasado" },
        data_pagamento: { type: "string", description: "YYYY-MM-DD (quando pago)" },
      },
      required: ["tipo", "descricao", "valor", "data_vencimento", "status_pagamento"],
    },
  },
  {
    name: "atualizar_pagamento",
    description: "Marca uma parcela como paga e registra pagamento",
    inputSchema: {
      type: "object",
      properties: {
        lancamento_id: { type: "string", description: "UUID da parcela (obrigatório)" },
        data_pagamento: { type: "string", description: "YYYY-MM-DD (obrigatório)" },
        observacao: { type: "string" },
      },
      required: ["lancamento_id", "data_pagamento"],
    },
  },
  {
    name: "adicionar_documento",
    description: "Registra metadado de documento vinculado a processo/cliente",
    inputSchema: {
      type: "object",
      properties: {
        processo_id: { type: "string" },
        cliente_id: { type: "string" },
        nome_documento: { type: "string", description: "Nome do arquivo (obrigatório)" },
        tipo_documento: { type: "string", description: "Categoria (obrigatório)" },
        observacao: { type: "string" },
      },
      required: ["nome_documento", "tipo_documento"],
    },
  },
  {
    name: "registrar_movimentacao",
    description: "Registra uma movimentação processual (andamento manual)",
    inputSchema: {
      type: "object",
      properties: {
        processo_id: { type: "string", description: "UUID do processo (obrigatório)" },
        tipo_movimentacao: { type: "string", description: "Despacho|Sentença|Intimação|... (obrigatório)" },
        descricao: { type: "string", description: "(obrigatório)" },
        data_movimentacao: { type: "string", description: "YYYY-MM-DD (obrigatório)" },
        prazo_resposta: { type: "string", description: "YYYY-MM-DD (opcional, gera item na controladoria)" },
      },
      required: ["processo_id", "tipo_movimentacao", "descricao", "data_movimentacao"],
    },
  },
];

// processos.status é texto livre — filtramos excluindo encerrados/arquivados
const aplicarFiltroAtivo = (q: any) =>
  q.not("status", "ilike", "Encerrado%").not("status", "ilike", "Arquivado%").not("status", "eq", "encerrado").not("status", "eq", "arquivado");
// Enum status_item no banco: pendente | em_andamento | aguardando | concluido | cancelado
// "atrasado" não é status persistido — é classificação derivada de data_vencimento < hoje.
const STATUS_PRAZO_PENDENTE = ["pendente", "em_andamento", "aguardando"];

// =============== Validação unificada (ferramentas de escrita) ===============
const FERRAMENTAS_ESCRITA = new Set([
  "criar_cliente", "criar_processo", "atualizar_status_processo", "criar_tarefa",
  "lancar_financeiro", "atualizar_pagamento", "adicionar_documento", "registrar_movimentacao",
]);

type Tipo = "string" | "number" | "boolean" | "uuid" | "date" | "enum";
interface Regra { tipo: Tipo; obrigatorio?: boolean; enum?: string[]; min?: number; max?: number; }
type Schema = Record<string, Regra>;

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

class ErroValidacao extends Error {
  codigo = "VALIDACAO";
  campo?: string;
  constructor(msg: string, campo?: string) { super(msg); this.campo = campo; }
}

function validar<T = any>(args: any, schema: Schema): T {
  const out: any = {};
  const entrada = args ?? {};
  for (const [campo, regra] of Object.entries(schema)) {
    const v = entrada[campo];
    const ausente = v === undefined || v === null || v === "";
    if (ausente) {
      if (regra.obrigatorio) throw new ErroValidacao(`Parâmetro obrigatório ausente: ${campo}`, campo);
      continue;
    }
    switch (regra.tipo) {
      case "string": {
        if (typeof v !== "string") throw new ErroValidacao(`'${campo}' deve ser string`, campo);
        const s = v.trim();
        if (regra.min != null && s.length < regra.min) throw new ErroValidacao(`'${campo}' deve ter ao menos ${regra.min} caracteres`, campo);
        if (regra.max != null && s.length > regra.max) throw new ErroValidacao(`'${campo}' excede ${regra.max} caracteres`, campo);
        out[campo] = s;
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) throw new ErroValidacao(`'${campo}' deve ser número`, campo);
        if (regra.min != null && n < regra.min) throw new ErroValidacao(`'${campo}' deve ser ≥ ${regra.min}`, campo);
        out[campo] = n;
        break;
      }
      case "boolean": { out[campo] = Boolean(v); break; }
      case "uuid": {
        if (typeof v !== "string" || !REGEX_UUID.test(v)) throw new ErroValidacao(`'${campo}' deve ser UUID válido`, campo);
        out[campo] = v;
        break;
      }
      case "date": {
        if (typeof v !== "string" || !REGEX_DATA.test(v) || isNaN(new Date(v).getTime())) {
          throw new ErroValidacao(`'${campo}' deve ser data YYYY-MM-DD válida`, campo);
        }
        out[campo] = v;
        break;
      }
      case "enum": {
        if (!regra.enum?.includes(String(v))) {
          throw new ErroValidacao(`'${campo}' deve ser um de: ${regra.enum?.join(", ")}`, campo);
        }
        out[campo] = v;
        break;
      }
    }
  }
  return out as T;
}

function formatarErro(e: any) {
  if (e instanceof ErroValidacao) {
    return { success: false, erro: e.message, codigo: e.codigo, campo: e.campo };
  }
  const msg = e?.message ?? String(e);
  const codigo = e?.code ?? (String(msg).toLowerCase().includes("não encontrad") ? "NAO_ENCONTRADO" : "ERRO_INTERNO");
  const detalhes = [e?.details, e?.hint].filter(Boolean).join(" — ");
  return { success: false, erro: detalhes ? `${msg} (${detalhes})` : msg, codigo };
}

// =============== Execução das ferramentas ===============
async function executar(admin: any, nome: string, args: any) {
  const hoje = new Date();

  switch (nome) {
    case "listar_casos_ativos": {
      let q = admin
        .from("processos")
        .select(`
          id, numero_cnj, area_direito, status, fase_atual, vara, comarca, criado_em,
          cliente:clientes(nome, cpf_cnpj)
        `)
        .order("criado_em", { ascending: false })
        .limit(args?.limite ?? 20);
      q = aplicarFiltroAtivo(q);
      if (args?.area) q = q.ilike("area_direito", `%${args.area}%`);
      const { data, error } = await q;
      if (error) throw error;
      return { total: data?.length ?? 0, casos: data ?? [] };
    }

    case "prazos_urgentes": {
      const dias = args?.dias ?? 7;
      const hojeISO = hoje.toISOString();
      const limiteISO = new Date(hoje.getTime() + dias * 86400000).toISOString();
      const { data, error } = await admin
        .from("controladoria_itens")
        .select(`
          id, titulo, tipo, prioridade, status, data_vencimento,
          processo:processos(numero_cnj, area_direito),
          cliente:clientes(nome)
        `)
        .in("status", STATUS_PRAZO_PENDENTE)
        .lte("data_vencimento", limiteISO)
        .order("data_vencimento", { ascending: true })
        .limit(100);
      if (error) throw error;
      const classificados = (data ?? []).map((p: any) => {
        const dr = Math.ceil((new Date(p.data_vencimento).getTime() - hoje.getTime()) / 86400000);
        return {
          ...p,
          dias_restantes: dr,
          urgencia: dr < 0 ? "ATRASADO" : dr === 0 ? "HOJE" : dr === 1 ? "AMANHÃ" : dr <= 3 ? "CRÍTICO" : "URGENTE",
        };
      });
      return { total: classificados.length, prazos: classificados };
    }

    case "resumo_dashboard": {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
      const em7 = new Date(hoje.getTime() + 7 * 86400000).toISOString();
      const [{ count: ativos }, { data: prazos }, { data: receitas }] = await Promise.all([
        aplicarFiltroAtivo(admin.from("processos").select("id", { count: "exact", head: true })),
        admin
          .from("controladoria_itens")
          .select("titulo, data_vencimento, prioridade, processo:processos(numero_cnj), cliente:clientes(nome)")
          .in("status", STATUS_PRAZO_PENDENTE)
          .lte("data_vencimento", em7)
          .order("data_vencimento"),
        admin.from("honorarios_pagamentos").select("valor_recebido").gte("data_pagamento", inicioMes),
      ]);
      const totalReceita = (receitas ?? []).reduce((s: number, r: any) => s + Number(r.valor_recebido ?? 0), 0);
      return {
        data: hoje.toLocaleDateString("pt-BR"),
        casos_ativos: ativos ?? 0,
        prazos_urgentes_7dias: prazos?.length ?? 0,
        prazos: prazos ?? [],
        receita_mes: `R$ ${totalReceita.toFixed(2)}`,
      };
    }

    case "resumo_financeiro": {
      const mes = (args?.mes ?? hoje.getMonth() + 1) - 1;
      const ano = args?.ano ?? hoje.getFullYear();
      const inicio = new Date(ano, mes, 1).toISOString().split("T")[0];
      const fim = new Date(ano, mes + 1, 0).toISOString().split("T")[0];
      const [{ data: pagos }, { data: parcelas }] = await Promise.all([
        admin.from("honorarios_pagamentos").select("valor_recebido, tipo_pagamento")
          .gte("data_pagamento", inicio).lte("data_pagamento", fim),
        admin.from("honorarios_parcelas").select("valor, status")
          .gte("data_vencimento", inicio).lte("data_vencimento", fim),
      ]);
      const recebido = (pagos ?? []).reduce((s: number, p: any) => s + Number(p.valor_recebido ?? 0), 0);
      const pendente = (parcelas ?? []).filter((p: any) => p.status === "pendente").reduce((s: number, p: any) => s + Number(p.valor ?? 0), 0);
      const atrasado = (parcelas ?? []).filter((p: any) => p.status === "atrasado").reduce((s: number, p: any) => s + Number(p.valor ?? 0), 0);
      return {
        periodo: `${String(mes + 1).padStart(2, "0")}/${ano}`,
        recebido: `R$ ${recebido.toFixed(2)}`,
        pendente: `R$ ${pendente.toFixed(2)}`,
        atrasado: `R$ ${atrasado.toFixed(2)}`,
        qtd_pagamentos: pagos?.length ?? 0,
      };
    }

    case "buscar_caso": {
      const busca = String(args?.busca ?? "").trim();
      if (!busca) return { encontrado: false, total: 0, casos: [] };
      const numero = busca.replace(/\D/g, "");

      // Busca por número CNJ
      let casosPorNumero: any[] = [];
      if (numero.length >= 4) {
        const { data } = await admin
          .from("processos")
          .select(`*, cliente:clientes(id, nome, cpf_cnpj, whatsapp, email)`)
          .ilike("numero_cnj", `%${numero}%`)
          .limit(5);
        casosPorNumero = data ?? [];
      }

      // Busca por nome do cliente
      const { data: clientesMatch } = await admin
        .from("clientes")
        .select("id")
        .ilike("nome", `%${busca}%`)
        .limit(20);
      const clienteIds = (clientesMatch ?? []).map((c: any) => c.id);
      let casosPorCliente: any[] = [];
      if (clienteIds.length > 0) {
        const { data } = await admin
          .from("processos")
          .select(`*, cliente:clientes(id, nome, cpf_cnpj, whatsapp, email)`)
          .in("cliente_id", clienteIds)
          .limit(10);
        casosPorCliente = data ?? [];
      }

      const map = new Map<string, any>();
      [...casosPorNumero, ...casosPorCliente].forEach((c) => map.set(c.id, c));
      const casos = Array.from(map.values());
      return { encontrado: casos.length > 0, total: casos.length, casos };
    }

    // ============ ESCRITA ============
    case "criar_cliente": {
      const v = validar<{ nome: string; cpf_cnpj?: string; telefone?: string; email?: string; endereco?: string; observacoes?: string }>(args, {
        nome: { tipo: "string", obrigatorio: true, min: 2, max: 200 },
        cpf_cnpj: { tipo: "string", max: 20 },
        telefone: { tipo: "string", max: 20 },
        email: { tipo: "string", max: 255 },
        endereco: { tipo: "string", max: 500 },
        observacoes: { tipo: "string", max: 2000 },
      });
      const cpfCnpjLimpo = v.cpf_cnpj?.replace(/\D/g, "");
      const payload: any = {
        nome: v.nome,
        tipo_pessoa: cpfCnpjLimpo && cpfCnpjLimpo.length > 11 ? "juridica" : "fisica",
      };
      if (cpfCnpjLimpo) payload.cpf_cnpj = cpfCnpjLimpo;
      if (v.telefone) { payload.whatsapp = v.telefone; payload.telefones = [v.telefone]; }
      if (v.email) payload.email = v.email;
      if (v.endereco) payload.endereco = v.endereco;
      if (v.observacoes) payload.observacoes = v.observacoes;
      const { data, error } = await admin.from("clientes").insert(payload).select("id, nome").single();
      if (error) throw error;
      return { success: true, id: data.id, mensagem: `Cliente '${data.nome}' criado com sucesso` };
    }

    case "criar_processo": {
      const v = validar<{ cliente_id: string; numero_cnj?: string; area_direito: string; status: string; vara?: string; comarca?: string; descricao?: string; valor_causa?: number }>(args, {
        cliente_id: { tipo: "uuid", obrigatorio: true },
        numero_cnj: { tipo: "string", max: 50 },
        area_direito: { tipo: "string", obrigatorio: true, max: 100 },
        status: { tipo: "string", obrigatorio: true, max: 100 },
        vara: { tipo: "string", max: 200 },
        comarca: { tipo: "string", max: 200 },
        descricao: { tipo: "string", max: 5000 },
        valor_causa: { tipo: "number", min: 0 },
      });
      const payload: any = { cliente_id: v.cliente_id, area_direito: v.area_direito, status: v.status, tipo: "judicial" };
      if (v.numero_cnj) { payload.numero_cnj = v.numero_cnj; payload.numero_cnj_limpo = v.numero_cnj.replace(/\D/g, ""); }
      if (v.vara) payload.vara = v.vara;
      if (v.comarca) payload.comarca = v.comarca;
      if (v.descricao) payload.observacoes_internas = v.descricao;
      if (v.valor_causa != null) payload.valor_causa = v.valor_causa;
      const { data, error } = await admin.from("processos").insert(payload).select("id").single();
      if (error) throw error;
      return { success: true, id: data.id, mensagem: "Processo criado com sucesso" };
    }

    case "atualizar_status_processo": {
      const v = validar<{ processo_id: string; status: string; fase_atual?: string; observacao?: string }>(args, {
        processo_id: { tipo: "uuid", obrigatorio: true },
        status: { tipo: "string", obrigatorio: true, max: 100 },
        fase_atual: { tipo: "string", max: 200 },
        observacao: { tipo: "string", max: 2000 },
      });
      const upd: any = { status: v.status, atualizado_em: new Date().toISOString() };
      if (v.fase_atual) upd.fase_atual = v.fase_atual;
      const { error } = await admin.from("processos").update(upd).eq("id", v.processo_id);
      if (error) throw error;
      const desc = `Status atualizado para "${v.status}"` + (v.fase_atual ? ` (fase: ${v.fase_atual})` : "") + (v.observacao ? ` — ${v.observacao}` : "");
      await admin.from("andamentos").insert({
        processo_id: v.processo_id,
        data: new Date().toISOString().split("T")[0],
        descricao: desc,
        fonte: "manual",
      });
      return { success: true, id: v.processo_id, mensagem: "Status atualizado e andamento registrado" };
    }

    case "criar_tarefa": {
      const v = validar<{ processo_id: string; titulo: string; descricao?: string; responsavel?: string; prazo?: string; prioridade?: string }>(args, {
        processo_id: { tipo: "uuid", obrigatorio: true },
        titulo: { tipo: "string", obrigatorio: true, min: 2, max: 200 },
        descricao: { tipo: "string", max: 5000 },
        responsavel: { tipo: "string", max: 200 },
        prazo: { tipo: "date" },
        prioridade: { tipo: "enum", enum: ["baixa", "media", "alta", "urgente"] },
      });
      const prazo = v.prazo ? new Date(v.prazo).toISOString() : new Date(hoje.getTime() + 7 * 86400000).toISOString();
      const payload: any = {
        tipo: "tarefa",
        titulo: v.titulo,
        processo_id: v.processo_id,
        data_vencimento: prazo,
        prioridade: v.prioridade ?? "media",
        origem: "controladoria",
      };
      if (v.descricao) payload.descricao = v.descricao;
      if (v.responsavel) {
        payload.descricao = (payload.descricao ? payload.descricao + "\n" : "") + `Responsável sugerido: ${v.responsavel}`;
      }
      const { data, error } = await admin.from("controladoria_itens").insert(payload).select("id").single();
      if (error) throw error;
      return { success: true, id: data.id, mensagem: "Tarefa criada com sucesso" };
    }

    case "lancar_financeiro": {
      const v = validar<{ processo_id?: string; cliente_id?: string; tipo: string; descricao: string; valor: number; data_vencimento: string; status_pagamento: string; data_pagamento?: string }>(args, {
        processo_id: { tipo: "uuid" },
        cliente_id: { tipo: "uuid" },
        tipo: { tipo: "enum", obrigatorio: true, enum: ["honorario", "parcela", "despesa", "reembolso"] },
        descricao: { tipo: "string", obrigatorio: true, min: 2, max: 500 },
        valor: { tipo: "number", obrigatorio: true, min: 0 },
        data_vencimento: { tipo: "date", obrigatorio: true },
        status_pagamento: { tipo: "enum", obrigatorio: true, enum: ["pendente", "pago", "atrasado"] },
        data_pagamento: { tipo: "date" },
      });
      if (!v.cliente_id && !v.processo_id) throw new ErroValidacao("Informe cliente_id ou processo_id", "cliente_id");
      let clienteId = v.cliente_id;
      if (!clienteId && v.processo_id) {
        const { data: p } = await admin.from("processos").select("cliente_id").eq("id", v.processo_id).maybeSingle();
        clienteId = p?.cliente_id;
      }
      if (!clienteId) throw new ErroValidacao("processo_id não encontrado ou sem cliente vinculado", "processo_id");
      let qContrato = admin.from("honorarios_contratos").select("id").eq("cliente_id", clienteId).eq("status", "ativo").limit(1);
      if (v.processo_id) qContrato = qContrato.eq("processo_id", v.processo_id);
      const { data: contratos } = await qContrato;
      let contratoId: string | null = contratos?.[0]?.id ?? null;
      if (!contratoId) {
        const novoContrato: any = {
          cliente_id: clienteId, tipo: "fixo", valor_fixo: v.valor, total_parcelas: 1, status: "ativo",
          observacoes: `Contrato criado automaticamente via MCP — ${v.descricao}`,
        };
        if (v.processo_id) novoContrato.processo_id = v.processo_id;
        const { data: c, error: ec } = await admin.from("honorarios_contratos").insert(novoContrato).select("id").single();
        if (ec) throw ec;
        contratoId = c.id;
      }
      const { data: nParc } = await admin.from("honorarios_parcelas").select("numero_parcela").eq("contrato_id", contratoId).order("numero_parcela", { ascending: false }).limit(1);
      const proxNum = (nParc?.[0]?.numero_parcela ?? 0) + 1;
      const { data: parc, error: ep } = await admin.from("honorarios_parcelas").insert({
        contrato_id: contratoId, numero_parcela: proxNum, valor: v.valor, data_vencimento: v.data_vencimento, status: v.status_pagamento,
      }).select("id").single();
      if (ep) throw ep;
      if (v.status_pagamento === "pago") {
        await admin.from("honorarios_pagamentos").insert({
          contrato_id: contratoId, parcela_id: parc.id, cliente_id: clienteId,
          data_pagamento: v.data_pagamento ?? new Date().toISOString().split("T")[0],
          valor_recebido: v.valor, forma_pagamento: "outro",
          tipo_pagamento: v.tipo === "honorario" ? "exito" : "regular",
          observacao: v.descricao,
        });
      }
      return { success: true, id: parc.id, contrato_id: contratoId, mensagem: `Lançamento '${v.tipo}' registrado` };
    }

    case "atualizar_pagamento": {
      const v = validar<{ lancamento_id: string; data_pagamento: string; observacao?: string }>(args, {
        lancamento_id: { tipo: "uuid", obrigatorio: true },
        data_pagamento: { tipo: "date", obrigatorio: true },
        observacao: { tipo: "string", max: 2000 },
      });
      const { data: parc, error: epe } = await admin.from("honorarios_parcelas").select("id, contrato_id, valor").eq("id", v.lancamento_id).maybeSingle();
      if (epe) throw epe;
      if (!parc) throw new ErroValidacao("Parcela não encontrada", "lancamento_id");
      const { error: eu } = await admin.from("honorarios_parcelas").update({ status: "pago" }).eq("id", parc.id);
      if (eu) throw eu;
      const { data: c } = await admin.from("honorarios_contratos").select("cliente_id").eq("id", parc.contrato_id).maybeSingle();
      if (c?.cliente_id) {
        await admin.from("honorarios_pagamentos").insert({
          contrato_id: parc.contrato_id, parcela_id: parc.id, cliente_id: c.cliente_id,
          data_pagamento: v.data_pagamento, valor_recebido: parc.valor,
          forma_pagamento: "outro", tipo_pagamento: "regular", observacao: v.observacao ?? null,
        });
      }
      return { success: true, id: parc.id, mensagem: "Pagamento registrado" };
    }

    case "adicionar_documento": {
      const v = validar<{ processo_id?: string; cliente_id?: string; nome_documento: string; tipo_documento: string; observacao?: string }>(args, {
        processo_id: { tipo: "uuid" },
        cliente_id: { tipo: "uuid" },
        nome_documento: { tipo: "string", obrigatorio: true, min: 1, max: 300 },
        tipo_documento: { tipo: "string", obrigatorio: true, max: 100 },
        observacao: { tipo: "string", max: 2000 },
      });
      if (!v.processo_id && !v.cliente_id) throw new ErroValidacao("Informe processo_id ou cliente_id", "processo_id");
      const payload: any = { nome: v.nome_documento, categoria: v.tipo_documento, url: "mcp://placeholder" };
      if (v.processo_id) payload.processo_id = v.processo_id;
      if (v.cliente_id) payload.cliente_id = v.cliente_id;
      const { data, error } = await admin.from("documentos").insert(payload).select("id").single();
      if (error) throw error;
      return { success: true, id: data.id, mensagem: "Documento registrado (metadado)" };
    }

    case "registrar_movimentacao": {
      const v = validar<{ processo_id: string; tipo_movimentacao: string; descricao: string; data_movimentacao: string; prazo_resposta?: string }>(args, {
        processo_id: { tipo: "uuid", obrigatorio: true },
        tipo_movimentacao: { tipo: "string", obrigatorio: true, max: 100 },
        descricao: { tipo: "string", obrigatorio: true, min: 2, max: 5000 },
        data_movimentacao: { tipo: "date", obrigatorio: true },
        prazo_resposta: { tipo: "date" },
      });
      const { data: and, error } = await admin.from("andamentos").insert({
        processo_id: v.processo_id, data: v.data_movimentacao,
        descricao: `[${v.tipo_movimentacao}] ${v.descricao}`, fonte: "manual",
      }).select("id").single();
      if (error) throw error;
      await admin.from("processos").update({ atualizado_em: new Date().toISOString() }).eq("id", v.processo_id);
      let prazoItemId: string | null = null;
      if (v.prazo_resposta) {
        const { data: item } = await admin.from("controladoria_itens").insert({
          tipo: "prazo_processual",
          titulo: `${v.tipo_movimentacao} — ${v.descricao}`.slice(0, 200),
          processo_id: v.processo_id,
          data_vencimento: new Date(v.prazo_resposta).toISOString(),
          prioridade: "alta",
          origem: "perfil_processo",
        }).select("id").single();
        prazoItemId = item?.id ?? null;
      }
      return { success: true, id: and.id, prazo_item_id: prazoItemId, mensagem: "Movimentação registrada" };
    }
  }
  throw new Error(`Ferramenta desconhecida: ${nome}`);
}

// =============== Autenticação por token MCP ===============
async function autenticar(req: Request, admin: any) {
  let token = "";
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    token = auth.slice(7).trim();
  }
  // Fallback: token na query string (?token=...) — Claude.ai custom connectors
  // não enviam Bearer; usuário pode colar URL com ?token=mcp_xxx
  if (!token) {
    const url = new URL(req.url);
    token = url.searchParams.get("token") ?? "";
  }
  if (!token) return null;
  const hash = await sha256(token);
  const { data } = await admin
    .from("mcp_tokens")
    .select("id, ativo, expira_em")
    .eq("token_hash", hash)
    .eq("ativo", true)
    .maybeSingle();
  if (!data) return null;
  if (data.expira_em && new Date(data.expira_em) < new Date()) return null;
  await admin.from("mcp_tokens").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", data.id);
  return data.id as string;
}

// =============== Servidor JSON-RPC ===============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rid = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  const log = (lvl: "info" | "warn" | "error", msg: string, extra?: any) => {
    const line = `[mcp ${rid}] ${msg}` + (extra !== undefined ? ` ${JSON.stringify(extra)}` : "");
    if (lvl === "error") console.error(line);
    else if (lvl === "warn") console.warn(line);
    else console.log(line);
  };

  log("info", `→ ${req.method} ${new URL(req.url).pathname}`);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (req.method === "GET") {
    log("warn", "GET recebido — respondendo 405");
    return new Response(JSON.stringify({
      jsonrpc: "2.0", id: null,
      error: { code: -32000, message: "Method Not Allowed: este servidor não mantém stream SSE persistente" },
    }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json", "Allow": "POST, OPTIONS" } });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Auth obrigatória — bloqueia chamadas sem token válido
  const tokenId = await autenticar(req, admin);
  if (!tokenId) {
    log("warn", "auth ausente ou inválida — rejeitando");
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  log("info", `auth ok token=${tokenId.slice(0, 8)}`);

  let body: any;
  try { body = await req.json(); }
  catch (e: any) {
    log("error", "json invalido", { err: String(e?.message ?? e) });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { id = null, method, params } = body ?? {};
  log("info", `rpc method=${method}`, { id, params });

  const reply = (result: any) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const fail = (code: number, message: string) => new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (method === "initialize") {
      return reply({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "legisflow-mcp", version: "1.0.0" },
      });
    }
    if (method === "tools/list") {
      log("info", `tools/list → ${TOOLS.length} ferramentas`);
      return reply({ tools: TOOLS });
    }
    if (method === "tools/call") {
      const inicio = Date.now();
      const nome = params?.name;
      const args = params?.arguments ?? {};
      log("info", `tools/call ferramenta=${nome}`, { args });
      try {
        const data = await executar(admin, nome, args);
        const dur = Date.now() - inicio;
        const preview = (() => {
          const s = JSON.stringify(data);
          return s.length > 300 ? s.slice(0, 300) + "…" : s;
        })();
        log("info", `tools/call ok ferramenta=${nome} ${dur}ms`, { preview });
        await admin.from("mcp_chamadas_log").insert({
          token_id: tokenId === "anonimo-teste" ? null : tokenId, ferramenta: nome, args, sucesso: true, duracao_ms: dur,
        });
        return reply({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (e: any) {
        const dur = Date.now() - inicio;
        // Erros do PostgREST trazem code/details/hint úteis
        const detalhes = {
          message: e?.message ?? String(e),
          code: e?.code,
          details: e?.details,
          hint: e?.hint,
          status: e?.status,
        };
        log("error", `tools/call FALHOU ferramenta=${nome} ${dur}ms`, detalhes);
        await admin.from("mcp_chamadas_log").insert({
          token_id: tokenId === "anonimo-teste" ? null : tokenId, ferramenta: nome, args,
          sucesso: false, erro: JSON.stringify(detalhes), duracao_ms: dur,
        });
        // Ferramentas de escrita: resposta padronizada { success:false, erro, codigo }
        if (FERRAMENTAS_ESCRITA.has(nome)) {
          const padronizado = formatarErro(e);
          return reply({ content: [{ type: "text", text: JSON.stringify(padronizado, null, 2) }], isError: true });
        }
        // Ferramentas de leitura: mensagem livre (formato anterior)
        const msg = `Erro em ${nome}: ${detalhes.message}`
          + (detalhes.code ? ` (code=${detalhes.code})` : "")
          + (detalhes.details ? ` — ${detalhes.details}` : "")
          + (detalhes.hint ? ` [hint: ${detalhes.hint}]` : "");
        return reply({ content: [{ type: "text", text: msg }], isError: true });
      }
    }
    if (method === "ping" || method === "notifications/initialized") {
      return reply({});
    }
    log("warn", `metodo nao suportado: ${method}`);
    return fail(-32601, `Método não suportado: ${method}`);
  } catch (e: any) {
    log("error", "erro interno", { err: String(e?.message ?? e), stack: e?.stack });
    return fail(-32603, String(e?.message ?? e));
  } finally {
    log("info", `← concluido ${Date.now() - t0}ms`);
  }
});
