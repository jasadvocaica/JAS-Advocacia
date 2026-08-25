import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReqBody {
  modo?: "agendado" | "manual";
  mes?: number;
  ano?: number;
  apenas?: "desempenho" | "folha" | "ambos";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: ehGestor, error: roleError } = await supabase.rpc("has_role", {
    _user_id: authData.user.id,
    _role: "gestor",
  });
  if (roleError || !ehGestor) {
    return new Response(JSON.stringify({ error: "Apenas gestores podem executar o fechamento mensal" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ReqBody = {};
  try { body = await req.json(); } catch { /* sem body */ }

  // Calcula período: mês anterior ao atual (ou param explícito)
  const hoje = new Date();
  const mesAtual = hoje.getUTCMonth() + 1;
  const anoAtual = hoje.getUTCFullYear();
  const mes = body.mes ?? (mesAtual === 1 ? 12 : mesAtual - 1);
  const ano = body.ano ?? (mesAtual === 1 ? anoAtual - 1 : anoAtual);
  const apenas = body.apenas ?? "ambos";

  const inicioStr = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fimStr = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  console.log(`[equipe-job] modo=${body.modo ?? "manual"} apenas=${apenas} periodo=${mes}/${ano}`);

  const t0 = Date.now();
  let totalDesempenho = 0;
  let totalFolha = 0;
  const erros: any[] = [];

  // ======= Membros ativos =======
  const { data: membros, error: errMembros } = await supabase
    .from("equipe_membros")
    .select("id, user_id, nome")
    .eq("status", "ativo");
  if (errMembros) {
    return new Response(JSON.stringify({ error: errMembros.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ======= APURAR DESEMPENHO =======
  if (apenas === "desempenho" || apenas === "ambos") {
    for (const m of membros ?? []) {
      try {
        // Tarefas concluídas no período
        const { data: tarefas } = await supabase
          .from("controladoria_itens")
          .select("id, status, data_vencimento, concluido_em")
          .eq("status", "concluido")
          .gte("concluido_em", `${inicioStr}T00:00:00Z`)
          .lte("concluido_em", `${fimStr}T23:59:59Z`)
          .in("id", (await supabase
            .from("controladoria_responsaveis")
            .select("item_id")
            .eq("user_id", m.user_id)).data?.map((r: any) => r.item_id) ?? ["00000000-0000-0000-0000-000000000000"]);

        const concluidas = tarefas?.length ?? 0;
        const noPrazo = tarefas?.filter((t: any) =>
          t.concluido_em && t.data_vencimento && new Date(t.concluido_em) <= new Date(t.data_vencimento + "T23:59:59Z")
        ).length ?? 0;
        const foraPrazo = concluidas - noPrazo;

        // Prazos perdidos (prazo_fatal/prazo_processual vencidos sem conclusão no período)
        const { data: prazosPerdidos } = await supabase
          .from("controladoria_itens")
          .select("id")
          .in("tipo", ["prazo_fatal", "prazo_processual"])
          .neq("status", "concluido")
          .gte("data_vencimento", `${inicioStr}T00:00:00Z`)
          .lte("data_vencimento", `${fimStr}T23:59:59Z`);

        // Processos abertos / fechados sob responsabilidade
        const { count: processosAbertos } = await supabase
          .from("processos")
          .select("id", { count: "exact", head: true })
          .eq("responsavel_id", m.user_id)
          .gte("criado_em", `${inicioStr}T00:00:00Z`)
          .lte("criado_em", `${fimStr}T23:59:59Z`);

        const { count: processosFechados } = await supabase
          .from("processos")
          .select("id", { count: "exact", head: true })
          .eq("responsavel_id", m.user_id)
          .not("data_encerramento", "is", null)
          .gte("data_encerramento", inicioStr)
          .lte("data_encerramento", fimStr);

        // Receita: pagamentos de contratos cujos processos têm responsavel = membro
        const { data: contratosResp } = await supabase
          .from("honorarios_contratos")
          .select("id, processo_id")
          .not("processo_id", "is", null);
        const processosDoMembro = new Set<string>();
        const { data: psResp } = await supabase
          .from("processos").select("id").eq("responsavel_id", m.user_id);
        psResp?.forEach((p: any) => processosDoMembro.add(p.id));
        const contratoIds = (contratosResp ?? [])
          .filter((c: any) => c.processo_id && processosDoMembro.has(c.processo_id))
          .map((c: any) => c.id);

        let receita = 0;
        if (contratoIds.length > 0) {
          const { data: pgs } = await supabase
            .from("honorarios_pagamentos")
            .select("valor_recebido")
            .in("contrato_id", contratoIds)
            .gte("data_pagamento", inicioStr)
            .lte("data_pagamento", fimStr);
          receita = (pgs ?? []).reduce((acc: number, p: any) => acc + Number(p.valor_recebido ?? 0), 0);
        }

        // Meta do período
        const { data: meta } = await supabase
          .from("equipe_metas")
          .select("*")
          .eq("membro_id", m.id).eq("mes", mes).eq("ano", ano).maybeSingle();

        let atingimento: number | null = null;
        if (meta) {
          const ind: number[] = [];
          if (meta.meta_tarefas_concluidas)
            ind.push(Math.min(100, (concluidas / meta.meta_tarefas_concluidas) * 100));
          if (meta.meta_tarefas_no_prazo_pct && concluidas > 0)
            ind.push(Math.min(100, ((noPrazo / concluidas * 100) / meta.meta_tarefas_no_prazo_pct) * 100));
          if (meta.meta_processos_abertos)
            ind.push(Math.min(100, ((processosAbertos ?? 0) / meta.meta_processos_abertos) * 100));
          if (meta.meta_processos_fechados)
            ind.push(Math.min(100, ((processosFechados ?? 0) / meta.meta_processos_fechados) * 100));
          if (meta.meta_receita_gerada)
            ind.push(Math.min(100, (receita / Number(meta.meta_receita_gerada)) * 100));
          if (ind.length > 0) atingimento = ind.reduce((a, b) => a + b, 0) / ind.length;
        }

        await supabase.from("equipe_desempenho").upsert({
          membro_id: m.id,
          meta_id: meta?.id ?? null,
          mes, ano,
          tarefas_concluidas: concluidas,
          tarefas_no_prazo: noPrazo,
          tarefas_fora_prazo: foraPrazo,
          tarefas_no_prazo_pct: concluidas > 0 ? Number((noPrazo / concluidas * 100).toFixed(2)) : 0,
          prazos_perdidos: prazosPerdidos?.length ?? 0,
          processos_abertos: processosAbertos ?? 0,
          processos_fechados: processosFechados ?? 0,
          receita_gerada: receita,
          atingimento_geral_pct: atingimento != null ? Number(atingimento.toFixed(2)) : null,
        }, { onConflict: "membro_id,mes,ano" });

        totalDesempenho++;
      } catch (e: any) {
        console.error(`[desempenho] membro=${m.id}`, e?.message);
        erros.push({ etapa: "desempenho", membro_id: m.id, erro: e?.message ?? String(e) });
      }
    }
  }

  // ======= GERAR FOLHA =======
  if (apenas === "folha" || apenas === "ambos") {
    for (const m of membros ?? []) {
      try {
        // Remuneração vigente
        const { data: rems } = await supabase
          .from("equipe_remuneracao")
          .select("*")
          .eq("membro_id", m.id)
          .lte("data_inicio", fimStr)
          .or(`data_fim.is.null,data_fim.gte.${inicioStr}`)
          .order("data_inicio", { ascending: false })
          .limit(1);
        const remuneracao = rems?.[0];
        if (!remuneracao) continue;

        let valorFixo = 0, valorExito = 0, valorProducao = 0;

        if (["fixo", "misto"].includes(remuneracao.tipo)) {
          valorFixo = Number(remuneracao.valor_fixo ?? 0);
        }

        // Comissões de êxito do período não incluídas
        if (["comissao", "misto"].includes(remuneracao.tipo)) {
          const { data: cms } = await supabase
            .from("equipe_comissoes_exito")
            .select("id, valor_comissao")
            .eq("membro_id", m.id)
            .eq("mes_referencia", mes)
            .eq("ano_referencia", ano)
            .eq("incluida_folha", false);
          valorExito = (cms ?? []).reduce((a: number, c: any) => a + Number(c.valor_comissao), 0);

          if ((cms?.length ?? 0) > 0) {
            // Marca como incluídas após upsert da folha (ver abaixo)
          }
        }

        if (remuneracao.tipo === "producao") {
          const { data: desp } = await supabase
            .from("equipe_desempenho")
            .select("tarefas_concluidas")
            .eq("membro_id", m.id).eq("mes", mes).eq("ano", ano).maybeSingle();
          valorProducao = (desp?.tarefas_concluidas ?? 0) * Number(remuneracao.valor_por_tarefa ?? 0);
        }

        // ===== Benefícios vigentes no período =====
        const { data: beneficios } = await supabase
          .from("equipe_beneficios")
          .select("tipo, descricao, valor_mensal, natureza, data_inicio, data_fim")
          .eq("membro_id", m.id)
          .lte("data_inicio", fimStr)
          .or(`data_fim.is.null,data_fim.gte.${inicioStr}`);

        let beneficiosCredito = 0;
        let beneficiosDebito = 0;
        const detalhesBeneficios: string[] = [];
        for (const b of beneficios ?? []) {
          const v = Number(b.valor_mensal ?? 0);
          if (v <= 0) continue;
          if (b.natureza === "credito") {
            beneficiosCredito += v;
            detalhesBeneficios.push(`+ ${b.descricao ?? b.tipo}: R$ ${v.toFixed(2)}`);
          } else {
            beneficiosDebito += v;
            detalhesBeneficios.push(`- ${b.descricao ?? b.tipo}: R$ ${v.toFixed(2)}`);
          }
        }

        // ===== Lançamentos avulsos do mês ainda não aplicados =====
        const { data: lancamentos } = await supabase
          .from("equipe_lancamentos_folha")
          .select("id, natureza, motivo, valor")
          .eq("membro_id", m.id)
          .eq("mes", mes)
          .eq("ano", ano)
          .eq("aplicado_folha", false);

        let bonusAvulsos = 0;
        let descontosAvulsos = 0;
        const idsLancamentos: string[] = [];
        const detalhesLancamentos: string[] = [];
        for (const l of lancamentos ?? []) {
          const v = Number(l.valor ?? 0);
          if (v <= 0) continue;
          idsLancamentos.push(l.id);
          if (l.natureza === "bonus") {
            bonusAvulsos += v;
            detalhesLancamentos.push(`+ ${l.motivo}: R$ ${v.toFixed(2)}`);
          } else {
            descontosAvulsos += v;
            detalhesLancamentos.push(`- ${l.motivo}: R$ ${v.toFixed(2)}`);
          }
        }

        const bonusTotal = beneficiosCredito + bonusAvulsos;
        const descontoTotal = beneficiosDebito + descontosAvulsos;

        const observacaoLinhas: string[] = [];
        if (detalhesBeneficios.length) {
          observacaoLinhas.push("Benefícios vigentes:");
          observacaoLinhas.push(...detalhesBeneficios);
        }
        if (detalhesLancamentos.length) {
          if (observacaoLinhas.length) observacaoLinhas.push("");
          observacaoLinhas.push("Lançamentos avulsos:");
          observacaoLinhas.push(...detalhesLancamentos);
        }
        const observacaoCalculada = observacaoLinhas.length
          ? `[Calculado automaticamente em ${new Date().toISOString().slice(0, 10)}]\n${observacaoLinhas.join("\n")}`
          : null;

        // Não sobrescreve folhas já revisadas/pagas: protege ajustes manuais
        const { data: existente } = await supabase
          .from("equipe_folha_pagamento")
          .select("id, status")
          .eq("membro_id", m.id).eq("mes", mes).eq("ano", ano).maybeSingle();

        if (existente && existente.status !== "pendente") {
          // Pula recálculo — ainda incrementa contador? Não, marca como skipped via erros[]
          erros.push({
            etapa: "folha",
            membro_id: m.id,
            erro: `Folha já está com status "${existente.status}" — não foi recalculada para preservar ajustes manuais.`,
          });
          continue;
        }

        // Upsert folha
        const { data: folhaUp } = await supabase
          .from("equipe_folha_pagamento")
          .upsert({
            membro_id: m.id, mes, ano,
            valor_fixo: valorFixo,
            valor_comissao_exito: valorExito,
            valor_comissao_producao: valorProducao,
            bonus_manual: bonusTotal,
            desconto_manual: descontoTotal,
            observacao_ajuste: observacaoCalculada,
            status: "pendente",
          }, { onConflict: "membro_id,mes,ano" })
          .select("id").single();

        // Marca comissões como incluídas
        if (folhaUp?.id && valorExito > 0) {
          await supabase
            .from("equipe_comissoes_exito")
            .update({ incluida_folha: true, folha_id: folhaUp.id })
            .eq("membro_id", m.id)
            .eq("mes_referencia", mes)
            .eq("ano_referencia", ano)
            .eq("incluida_folha", false);
        }

        // Marca lançamentos avulsos como aplicados
        if (folhaUp?.id && idsLancamentos.length > 0) {
          await supabase
            .from("equipe_lancamentos_folha")
            .update({ aplicado_folha: true, folha_id: folhaUp.id })
            .in("id", idsLancamentos);
        }

        totalFolha++;
      } catch (e: any) {
        console.error(`[folha] membro=${m.id}`, e?.message);
        erros.push({ etapa: "folha", membro_id: m.id, erro: e?.message ?? String(e) });
      }
    }
  }

  const duracao = Date.now() - t0;
  const result = {
    ok: true,
    periodo: `${mes}/${ano}`,
    desempenho_apurado: totalDesempenho,
    folhas_geradas: totalFolha,
    erros: erros.length,
    duracao_ms: duracao,
    detalhes_erros: erros,
  };
  console.log(`[equipe-job] OK`, result);

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
