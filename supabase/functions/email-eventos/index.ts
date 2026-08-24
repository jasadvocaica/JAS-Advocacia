// Edge function disparada por database webhooks (pg_net) e cron jobs.
// Recebe { evento, record?, old_record? } e orquestra os emails chamando
// a edge function `send-email` que já trata Resend + log + config.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://app.julianaaraujoadvocacia.com";

// Mapa hardcoded da equipe (fallback quando email não está em profiles)
const EMAILS_EQUIPE: Record<string, string> = {
  juliana: "contato@julianaaraujoadvogada.com",
  valeska: "valeska@julianaaraujoadvocacia.com",
  esther: "esther@julianaaraujoadvocacia.com",
  lana: "lanapriscila@julianaaraujoadvocacia.com",
  lana_priscila: "lanapriscila@julianaaraujoadvocacia.com",
};
const EMAIL_JULIANA_DEFAULT = "contato@julianaaraujoadvogada.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- helpers ----------
async function buscarEmailPorProfileId(userId: string | null): Promise<{ email: string | null; nome: string | null }> {
  if (!userId) return { email: null, nome: null };
  const { data } = await supabase
    .from("profiles")
    .select("email, nome")
    .eq("id", userId)
    .maybeSingle();
  if (data?.email) return { email: data.email, nome: data.nome ?? null };
  if (data?.nome) {
    const k = data.nome.toLowerCase().split(" ")[0];
    return { email: EMAILS_EQUIPE[k] ?? null, nome: data.nome };
  }
  return { email: null, nome: null };
}

async function emailDraJuliana(): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", (await supabase.from("user_roles").select("user_id").eq("role", "gestor").maybeSingle()).data?.user_id ?? "")
    .maybeSingle();
  return data?.email ?? EMAIL_JULIANA_DEFAULT;
}

async function buscarEmailEquipeMembro(membroId: string): Promise<string | null> {
  const { data } = await supabase
    .from("equipe_membros")
    .select("user_id, nome, email_pessoal")
    .eq("id", membroId)
    .maybeSingle();
  if (!data) return null;
  if (data.user_id) {
    const { email } = await buscarEmailPorProfileId(data.user_id);
    if (email) return email;
  }
  if (data.email_pessoal) return data.email_pessoal;
  if (data.nome) {
    const k = data.nome.toLowerCase().split(" ")[0];
    return EMAILS_EQUIPE[k] ?? null;
  }
  return null;
}

async function vinculoCliProcesso(item: any): Promise<string> {
  if (item.cliente_id) {
    const { data } = await supabase.from("clientes").select("nome").eq("id", item.cliente_id).maybeSingle();
    if (data?.nome) return data.nome;
  }
  if (item.processo_id) {
    const { data } = await supabase
      .from("processos")
      .select("numero_cnj, cliente:clientes(nome)")
      .eq("id", item.processo_id)
      .maybeSingle();
    return (data as any)?.cliente?.nome ?? data?.numero_cnj ?? "";
  }
  return "";
}

async function enviarEmail(payload: { para: string | string[]; assunto: string; conteudo?: string; corpo_html?: string; evento?: string }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[email-eventos] envio falhou: ${err}`);
  }
  return res.ok;
}

function fmtData(d: string | null | undefined): string {
  if (!d) return "Sem prazo definido";
  return new Date(d).toLocaleDateString("pt-BR");
}

// Substitui {{var}} no texto pelos valores em vars (string vazia se ausente)
function substituir(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

// Carrega template do banco e retorna {assunto, conteudo}; se não existir ou inativo, usa fallback
async function renderTemplate(
  chave: string,
  vars: Record<string, string | number | null | undefined>,
  fallback: { assunto: string; conteudo: string },
): Promise<{ assunto: string; conteudo: string }> {
  try {
    const { data } = await supabase
      .from("email_templates")
      .select("assunto, html, ativo")
      .eq("chave", chave)
      .maybeSingle();
    if (data && data.ativo) {
      return {
        assunto: substituir(data.assunto, vars),
        conteudo: substituir(data.html, vars),
      };
    }
  } catch (e) {
    console.error(`[email-eventos] erro ao carregar template ${chave}:`, e);
  }
  return fallback;
}

// ---------- handlers ----------
async function onTarefaAtribuida(record: any, old: any | null) {
  if (!record?.responsavel_id) return;
  // Só dispara se INSERT, ou se o responsavel_id mudou de fato
  const isInsert = !old;
  const responsavelMudou = !isInsert && old.responsavel_id !== record.responsavel_id;
  if (!isInsert && !responsavelMudou) return;

  const { email: emailResp, nome: nomeResp } = await buscarEmailPorProfileId(record.responsavel_id);
  if (!emailResp) return;

  const vinculo = await vinculoCliProcesso(record);
  const isUrgente = record.prioridade === "urgente";
  const tituloEmail = responsavelMudou ? "Tarefa transferida para você" : "Nova tarefa atribuída";

  const vars = {
    titulo: record.titulo,
    titulo_email: tituloEmail,
    saudacao_nome: nomeResp ? `, ${nomeResp.split(" ")[0]}` : "",
    verbo_atribuicao: responsavelMudou ? "recebeu" : "foi designada para",
    vinculo_sufixo: vinculo ? ` — ${vinculo}` : "",
    linha_vinculo: vinculo ? `Cliente/Processo: ${vinculo}<br>` : "",
    prazo: fmtData(record.data_vencimento),
    prioridade: record.prioridade ?? "media",
    bloco_descricao: record.descricao ? `<p>${record.descricao}</p>` : "",
    link: `${APP_URL}/controladoria/${record.id}`,
  };

  const fallbackAssunto = responsavelMudou
    ? `[LegisFlow] Tarefa transferida: ${record.titulo}`
    : `[LegisFlow] Nova tarefa: ${record.titulo}${vars.vinculo_sufixo}`;
  const fallbackConteudo = `
    <h2>${tituloEmail}</h2>
    <p>Olá${vars.saudacao_nome}! Você ${vars.verbo_atribuicao} esta tarefa no LegisFlow:</p>
    <div class="highlight">
      <strong>${record.titulo}</strong><br>
      ${vars.linha_vinculo}
      Prazo: ${vars.prazo}<br>
      Prioridade: ${vars.prioridade}
    </div>
    ${vars.bloco_descricao}
    <a href="${vars.link}" class="btn">Ver tarefa no LegisFlow</a>
  `;

  const { assunto, conteudo } = await renderTemplate("tarefa_atribuida", vars, {
    assunto: fallbackAssunto,
    conteudo: fallbackConteudo,
  });

  await enviarEmail({ para: emailResp, assunto, conteudo, evento: "tarefa_atribuida" });

  if (isUrgente) {
    const ej = await emailDraJuliana();
    if (ej && ej !== emailResp) {
      await enviarEmail({
        para: ej,
        assunto: `[URGENTE - cópia] ${assunto}`,
        conteudo,
        evento: "tarefa_atribuida_copia_urgente",
      });
    }
  }
}

async function onMudancaStatus(record: any, old: any | null) {
  if (!old) return;
  const statusAnt = old.status;
  const statusNov = record.status;
  if (statusAnt === statusNov) return;

  // Enviado para revisão
  if (statusNov === "aguardando" && statusAnt !== "aguardando") {
    const ej = await emailDraJuliana();
    const { nome: nomeRem } = await buscarEmailPorProfileId(record.criado_por);
    const vars = {
      nome_remetente: nomeRem ?? "A equipe",
      titulo: record.titulo,
      bloco_anotacoes: record.anotacoes_revisao ? `Anotações: ${record.anotacoes_revisao}` : "",
      link: `${APP_URL}/controladoria/${record.id}`,
    };
    const { assunto, conteudo } = await renderTemplate("revisao_solicitada", vars, {
      assunto: `[Revisão] ${vars.nome_remetente} enviou: ${record.titulo}`,
      conteudo: `
        <h2>Peça enviada para revisão</h2>
        <p><strong>${vars.nome_remetente}</strong> enviou uma peça para sua revisão:</p>
        <div class="highlight">
          <strong>${record.titulo}</strong><br>
          ${vars.bloco_anotacoes}
        </div>
        <a href="${vars.link}" class="btn">Revisar agora</a>
      `,
    });
    await enviarEmail({ para: ej, assunto, conteudo, evento: "revisao_solicitada" });
    return;
  }

  // Aprovado
  if (statusAnt === "aguardando" && (statusNov === "concluido" || (statusNov === "em_andamento" && !record.comentario_revisao))) {
    const { email: emailResp } = await buscarEmailPorProfileId(record.responsavel_id);
    if (!emailResp) return;
    const vars = {
      titulo: record.titulo,
      comentario: record.comentario_revisao ?? "",
      bloco_comentario: record.comentario_revisao
        ? `<p style="color:#633806"><strong>Comentário:</strong> "${record.comentario_revisao}"</p>`
        : "",
      link: `${APP_URL}/controladoria/${record.id}`,
    };
    const { assunto, conteudo } = await renderTemplate("revisao_aprovada", vars, {
      assunto: `[Aprovado] ${record.titulo}`,
      conteudo: `
        <h2>Peça aprovada — pode protocolar</h2>
        <p>Sua peça foi aprovada pela Dra. Juliana:</p>
        <div class="highlight"><strong>${record.titulo}</strong></div>
        ${vars.bloco_comentario}
        <a href="${vars.link}" class="btn">Ver no LegisFlow</a>
      `,
    });
    await enviarEmail({ para: emailResp, assunto, conteudo, evento: "revisao_aprovada" });
    return;
  }

  // Reprovado
  if (statusAnt === "aguardando" && (statusNov === "em_andamento" || statusNov === "pendente") && record.comentario_revisao) {
    const { email: emailResp } = await buscarEmailPorProfileId(record.responsavel_id);
    if (!emailResp) return;
    const vars = {
      titulo: record.titulo,
      comentario: record.comentario_revisao,
      link: `${APP_URL}/controladoria/${record.id}`,
    };
    const { assunto, conteudo } = await renderTemplate("revisao_reprovada", vars, {
      assunto: `[Correção] ${record.titulo}`,
      conteudo: `
        <h2>Peça devolvida para correção</h2>
        <p>A Dra. Juliana devolveu sua peça para correção:</p>
        <div class="highlight">
          <strong>${record.titulo}</strong><br><br>
          <strong>O que corrigir:</strong><br>
          ${record.comentario_revisao}
        </div>
        <a href="${vars.link}" class="btn">Corrigir agora</a>
      `,
    });
    await enviarEmail({ para: emailResp, assunto, conteudo, evento: "revisao_reprovada" });
  }
}

async function onAvisoUrgente(record: any) {
  if (record?.prioridade !== "urgente") return;

  let emails: string[] = [];
  if (Array.isArray(record.destinatarias) && record.destinatarias.length > 0) {
    for (const membroId of record.destinatarias) {
      const e = await buscarEmailEquipeMembro(membroId);
      if (e) emails.push(e);
    }
  } else {
    // Sem destinatárias = todas: usa o mapa fixo
    emails = [EMAILS_EQUIPE.valeska, EMAILS_EQUIPE.esther, EMAILS_EQUIPE.lana];
  }
  emails = Array.from(new Set(emails.filter(Boolean)));
  if (emails.length === 0) return;

  const vars = {
    titulo: record.titulo,
    conteudo: String(record.conteudo ?? "").replace(/\n/g, "<br>"),
    link: `${APP_URL}/mural-avisos`,
  };
  const { assunto, conteudo } = await renderTemplate("aviso_urgente", vars, {
    assunto: `[URGENTE] ${record.titulo}`,
    conteudo: `
      <h2>Aviso urgente: ${record.titulo}</h2>
      <p>A Dra. Juliana publicou um aviso urgente:</p>
      <div class="highlight">
        <strong>${record.titulo}</strong><br><br>
        ${vars.conteudo}
      </div>
      <a href="${vars.link}" class="btn">Ver no LegisFlow</a>
    `,
  });

  for (const email of emails) {
    await enviarEmail({ para: email, assunto, conteudo, evento: "aviso_urgente" });
  }
}

async function onVerificarPrazos() {
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const depois = new Date(hoje);
  depois.setUTCDate(depois.getUTCDate() + 2);

  // Vencendo em 24h
  const { data: vencendo24 } = await supabase
    .from("controladoria_itens")
    .select("*")
    .gte("data_vencimento", amanha.toISOString())
    .lt("data_vencimento", depois.toISOString())
    .not("status", "in", "(concluido,cancelado)");

  const ej = await emailDraJuliana();

  for (const item of vencendo24 ?? []) {
    const { email: emailResp } = await buscarEmailPorProfileId(item.responsavel_id);
    const vinculo = await vinculoCliProcesso(item);
    const vars = {
      titulo: item.titulo,
      vinculo_sufixo: vinculo ? ` — ${vinculo}` : "",
      linha_vinculo: vinculo ? `Cliente/Processo: ${vinculo}<br>` : "",
      prazo: fmtData(item.data_vencimento),
      link: `${APP_URL}/controladoria/${item.id}`,
    };
    const { assunto, conteudo } = await renderTemplate("prazo_24h", vars, {
      assunto: `[URGENTE] Prazo amanhã: ${item.titulo}${vars.vinculo_sufixo}`,
      conteudo: `
        <h2>Prazo vence amanhã</h2>
        <p>O seguinte item vence <strong>amanhã</strong>:</p>
        <div class="highlight">
          <strong>${item.titulo}</strong><br>
          ${vars.linha_vinculo}
          Prazo: ${vars.prazo}
        </div>
        <a href="${vars.link}" class="btn">Ver no LegisFlow</a>
      `,
    });
    if (emailResp) {
      await enviarEmail({ para: emailResp, assunto, conteudo, evento: "prazo_24h" });
    }
    await enviarEmail({ para: ej, assunto, conteudo, evento: "prazo_24h" });
  }

  // Atrasados (não enviados ainda)
  const { data: atrasados } = await supabase
    .from("controladoria_itens")
    .select("*")
    .lt("data_vencimento", hoje.toISOString())
    .not("status", "in", "(concluido,cancelado)")
    .eq("alerta_atraso_enviado", false);

  for (const item of atrasados ?? []) {
    const dias = Math.ceil((hoje.getTime() - new Date(item.data_vencimento).getTime()) / 86_400_000);
    const { email: emailResp } = await buscarEmailPorProfileId(item.responsavel_id);
    const vinculo = await vinculoCliProcesso(item);
    const vars = {
      titulo: item.titulo,
      vinculo_sufixo: vinculo ? ` — ${vinculo}` : "",
      linha_vinculo: vinculo ? `Cliente: ${vinculo}<br>` : "",
      prazo: fmtData(item.data_vencimento),
      dias_atraso: dias,
      link: `${APP_URL}/controladoria/${item.id}`,
    };
    const { assunto, conteudo } = await renderTemplate("prazo_atrasado", vars, {
      assunto: `[Atrasado] ${item.titulo}${vars.vinculo_sufixo} — ${dias} dias`,
      conteudo: `
        <h2>Item atrasado</h2>
        <p>O seguinte item está <strong>${dias} dia(s) atrasado</strong>:</p>
        <div class="highlight" style="border-color:#F09595;background:#FCEBEB;color:#7a1f1f;">
          <strong>${item.titulo}</strong><br>
          ${vars.linha_vinculo}
          Venceu em: ${vars.prazo}
        </div>
        <a href="${vars.link}" class="btn">Resolver agora</a>
      `,
    });
    if (emailResp) {
      await enviarEmail({ para: emailResp, assunto, conteudo, evento: "prazo_atrasado" });
    }
    await enviarEmail({ para: ej, assunto, conteudo, evento: "prazo_atrasado" });
    await supabase.from("controladoria_itens").update({ alerta_atraso_enviado: true }).eq("id", item.id);
  }
}

const TIPOS_EVENTO_ALERTA = ["audiencia", "pericia", "conciliacao", "reuniao"];
const TIPO_EVENTO_LABEL: Record<string, string> = {
  audiencia: "Audiência",
  pericia: "Perícia médica",
  conciliacao: "Conciliação",
  reuniao: "Reunião",
};

async function onVerificarEventos() {
  const agora = new Date();
  const ej = await emailDraJuliana();

  // Janela de 3 dias antes (entre 3d e 4d a partir de agora)
  const d3a = new Date(agora); d3a.setUTCDate(d3a.getUTCDate() + 3);
  const d3b = new Date(agora); d3b.setUTCDate(d3b.getUTCDate() + 4);
  const { data: eventos3d } = await supabase
    .from("controladoria_itens")
    .select("*")
    .in("tipo", TIPOS_EVENTO_ALERTA)
    .gte("data_vencimento", d3a.toISOString())
    .lt("data_vencimento", d3b.toISOString())
    .not("status", "in", "(concluido,cancelado)")
    .eq("alerta_3dias_enviado", false);

  for (const ev of eventos3d ?? []) {
    await dispararAlertaEvento(ev, "3d", ej);
    await supabase.from("controladoria_itens").update({ alerta_3dias_enviado: true }).eq("id", ev.id);
  }

  // Janela de 1 dia antes (entre 24h e 48h)
  const d1a = new Date(agora); d1a.setUTCDate(d1a.getUTCDate() + 1);
  const d1b = new Date(agora); d1b.setUTCDate(d1b.getUTCDate() + 2);
  const { data: eventos1d } = await supabase
    .from("controladoria_itens")
    .select("*")
    .in("tipo", TIPOS_EVENTO_ALERTA)
    .gte("data_vencimento", d1a.toISOString())
    .lt("data_vencimento", d1b.toISOString())
    .not("status", "in", "(concluido,cancelado)")
    .eq("alerta_1dia_enviado", false);

  for (const ev of eventos1d ?? []) {
    await dispararAlertaEvento(ev, "1d", ej);
    await supabase.from("controladoria_itens").update({ alerta_1dia_enviado: true }).eq("id", ev.id);
  }
}

async function dispararAlertaEvento(ev: any, janela: "3d" | "1d", emailGestora: string) {
  const { email: emailResp, nome: nomeResp } = await buscarEmailPorProfileId(ev.responsavel_id);
  const vinculo = await vinculoCliProcesso(ev);
  const tipoLabel = TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo;
  const quando = new Date(ev.data_vencimento).toLocaleString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
  });
  const prazoTxt = janela === "3d" ? "em 3 dias" : "amanhã";
  const tagPrazo = janela === "3d" ? "[Lembrete]" : "[URGENTE]";
  const clienteNaoConfirmou = ev.cliente_confirmado === false || ev.cliente_confirmado == null;

  const linhaConfirmacao = clienteNaoConfirmou
    ? `<p style="color:#7a1f1f"><strong>⚠ Cliente ainda não confirmou presença.</strong></p>`
    : `<p style="color:#1d6e3a"><strong>✓ Cliente confirmou presença.</strong></p>`;

  const corpo = `
    <h2>${tipoLabel} ${prazoTxt}</h2>
    <p>Olá${nomeResp ? `, ${nomeResp.split(" ")[0]}` : ""}! Lembrete de evento agendado:</p>
    <div class="highlight">
      <strong>${ev.titulo}</strong><br>
      ${vinculo ? `Cliente/Processo: ${vinculo}<br>` : ""}
      Quando: ${quando}<br>
      ${ev.local ? `Local: ${ev.local}<br>` : ""}
      ${ev.link_virtual ? `Link: <a href="${ev.link_virtual}">${ev.link_virtual}</a><br>` : ""}
    </div>
    ${linhaConfirmacao}
    ${ev.o_que_levar ? `<p><strong>O que levar:</strong><br>${String(ev.o_que_levar).replace(/\n/g, "<br>")}</p>` : ""}
    ${ev.orientacoes ? `<p><strong>Orientações:</strong><br>${String(ev.orientacoes).replace(/\n/g, "<br>")}</p>` : ""}
    <a href="${APP_URL}/controladoria/${ev.id}" class="btn">Ver no LegisFlow</a>
  `;
  const assunto = `${tagPrazo} ${tipoLabel} ${prazoTxt}: ${ev.titulo}${vinculo ? ` — ${vinculo}` : ""}`;

  if (emailResp) {
    await enviarEmail({ para: emailResp, assunto, conteudo: corpo, evento: `evento_alerta_${janela}` });
  }
  // Sempre copia gestora se cliente não confirmou OU na janela de 1 dia
  if (emailGestora && (clienteNaoConfirmou || janela === "1d") && emailGestora !== emailResp) {
    await enviarEmail({ para: emailGestora, assunto, conteudo: corpo, evento: `evento_alerta_${janela}_gestora` });
  }
}

async function onVerificarPonto() {
  const ontem = new Date();
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  const ontemStr = ontem.toISOString().split("T")[0];

  // Pega todos os membros ativos com cargo estagiario / advogado
  const { data: membros } = await supabase
    .from("equipe_membros")
    .select("id, user_id, nome, email_pessoal")
    .eq("status", "ativo");

  for (const m of membros ?? []) {
    const { data: ponto } = await supabase
      .from("gp_ponto_registros")
      .select("entrada, saida")
      .eq("membro_id", m.id)
      .eq("data", ontemStr)
      .maybeSingle();

    if (ponto && ponto.entrada && ponto.saida) continue;

    let email: string | null = null;
    if (m.user_id) {
      const r = await buscarEmailPorProfileId(m.user_id);
      email = r.email;
    }
    if (!email && m.email_pessoal) email = m.email_pessoal;
    if (!email && m.nome) email = EMAILS_EQUIPE[m.nome.toLowerCase().split(" ")[0]] ?? null;
    if (!email) continue;

    const dataExtensa = ontem.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const dataCurta = ontem.toLocaleDateString("pt-BR");
    const detalhe = !ponto
      ? "Nenhum registro encontrado para ontem."
      : `Entrada: ${ponto.entrada ?? "não registrada"}<br>Saída: ${ponto.saida ?? "não registrada"}`;
    const vars = {
      data_curta: dataCurta,
      data_extensa: dataExtensa,
      detalhe_ponto: detalhe,
      link: `${APP_URL}/ponto`,
    };
    const { assunto, conteudo } = await renderTemplate("ponto_incompleto", vars, {
      assunto: `[Ponto] Registro incompleto — ${dataCurta}`,
      conteudo: `
        <h2>Registro de ponto incompleto</h2>
        <p>Olá! Seu registro de ponto de <strong>${dataExtensa}</strong> está incompleto.</p>
        <div class="highlight">${detalhe}</div>
        <p>Acesse o sistema para corrigir ou fale com a Dra. Juliana.</p>
        <a href="${vars.link}" class="btn">Ver meu ponto</a>
      `,
    });
    await enviarEmail({ para: email, assunto, conteudo, evento: "ponto_incompleto" });
  }
}

// ---------- entry ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const evento: string =
      body.evento ?? // cron e chamadas diretas
      (body.type === "INSERT" && body.table === "controladoria_itens" ? "tarefa_atribuida" :
       body.type === "UPDATE" && body.table === "controladoria_itens" ? "controladoria_update" :
       body.type === "INSERT" && body.table === "mural_avisos" ? "aviso_urgente" :
       "");

    const record = body.record ?? null;
    const old = body.old_record ?? null;

    switch (evento) {
      case "tarefa_atribuida":
      case "tarefa_transferida":
        await onTarefaAtribuida(record, old);
        break;
      case "controladoria_update":
        // Pode ser mudança de responsável (transferência) e/ou mudança de status
        if (old && old.responsavel_id !== record.responsavel_id) {
          await onTarefaAtribuida(record, old);
        }
        if (old && old.status !== record.status) {
          await onMudancaStatus(record, old);
        }
        break;
      case "aviso_urgente":
        await onAvisoUrgente(record);
        break;
      case "verificar_prazos":
        await onVerificarPrazos();
        break;
      case "verificar_ponto":
        await onVerificarPonto();
        break;
      case "verificar_eventos":
        await onVerificarEventos();
        break;
      default:
        return new Response(JSON.stringify({ error: `Evento desconhecido: ${evento}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ ok: true, evento }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[email-eventos] erro:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
