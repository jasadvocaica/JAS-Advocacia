// Testes automatizados da constraint `controladoria_itens_origem_check`.
//
// Garante que TODOS os 8 valores de `origem` aceitos pelo schema continuam
// válidos para inserção, simulando o fluxo "Criar atividade na Controladoria"
// usado pelos botões da Bia, da Análise de Publicações com IA e dos demais
// pontos do app.
//
// Estratégia: insere 1 item de teste por valor de `origem` usando service role
// (bypassa RLS), valida que o INSERT teve sucesso e remove ao final.
//
// Pré-requisitos de ambiente (definidos pelo runner de testes do Lovable):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
// Sem essas variáveis, o teste é pulado (não falha o suite).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const ORIGENS_VALIDAS = [
  "controladoria",
  "perfil_cliente",
  "perfil_processo",
  "fluxo_automatico",
  "datajud",
  "dje_ia",
  "pje_publicacao",
  "bia",
] as const;

const TITULO_TESTE = "[teste-constraint-origem]";

function adminOrSkip() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

Deno.test({ name: "constraint: as 8 origens válidas devem aceitar INSERT", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const admin = adminOrSkip();
  if (!admin) {
    console.warn("[skip] SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
    return;
  }

  // Limpa eventuais resíduos antes de começar
  await admin.from("controladoria_itens").delete().eq("titulo", TITULO_TESTE);

  const falhas: string[] = [];
  const idsCriados: string[] = [];

  for (const origem of ORIGENS_VALIDAS) {
    const { data, error } = await admin
      .from("controladoria_itens")
      .insert({
        tipo: "diligencia",
        titulo: TITULO_TESTE,
        descricao: `Teste automatizado de origem='${origem}'`,
        prioridade: "media",
        data_vencimento: new Date(Date.now() + 86400000).toISOString(),
        origem,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      falhas.push(`${origem}: ${error.message}`);
    } else if (data?.id) {
      idsCriados.push(data.id);
    }
  }

  // Cleanup garantido (independente de assert)
  if (idsCriados.length > 0) {
    await admin.from("controladoria_itens").delete().in("id", idsCriados);
  }
  // Defesa em profundidade: remove qualquer outro com o mesmo título
  await admin.from("controladoria_itens").delete().eq("titulo", TITULO_TESTE);

  assertEquals(
    falhas.length,
    0,
    `Falharam INSERTs para origens: ${falhas.join(" | ")}`,
  );
  assertEquals(
    idsCriados.length,
    ORIGENS_VALIDAS.length,
    `Esperado ${ORIGENS_VALIDAS.length} INSERTs, criados ${idsCriados.length}`,
  );
} });

Deno.test({ name: "constraint: origens INVÁLIDAS devem ser rejeitadas", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const admin = adminOrSkip();
  if (!admin) {
    console.warn("[skip] SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
    return;
  }

  const invalidas = ["foo", "", "DJE_IA", "publicacao_pje"];
  for (const origem of invalidas) {
    const { data, error } = await admin
      .from("controladoria_itens")
      .insert({
        tipo: "diligencia",
        titulo: TITULO_TESTE,
        descricao: "Teste de origem inválida",
        prioridade: "media",
        data_vencimento: new Date(Date.now() + 86400000).toISOString(),
        origem,
      })
      .select("id")
      .maybeSingle();

    if (!error && data?.id) {
      // Limpa o que vazou
      await admin.from("controladoria_itens").delete().eq("id", data.id);
    }
    assert(
      error !== null,
      `Origem inválida '${origem}' deveria ter sido rejeitada pela constraint`,
    );
  }

  // Garantia extra
  await admin.from("controladoria_itens").delete().eq("titulo", TITULO_TESTE);
} });

Deno.test({ name: "simulação: payload do botão 'Criar atividade na Controladoria' (Bia + Análise IA)", sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const admin = adminOrSkip();
  if (!admin) {
    console.warn("[skip] SUPABASE_URL/SERVICE_ROLE_KEY ausentes");
    return;
  }

  // Reproduz o INSERT real feito pelos componentes BiaAcoesButton,
  // BiaCentralInline e RevisarAnaliseSheet.
  const cenarios = [
    { origem: "controladoria", componente: "BiaAcoesButton/BiaCentralInline" },
    { origem: "dje_ia", componente: "RevisarAnaliseSheet (Análise IA)" },
    { origem: "pje_publicacao", componente: "Triagem direta de publicação" },
    { origem: "bia", componente: "Sugestão direta da Bia" },
  ] as const;

  const idsCriados: string[] = [];
  const falhas: string[] = [];

  for (const c of cenarios) {
    const { data, error } = await admin
      .from("controladoria_itens")
      .insert({
        tipo: "diligencia",
        titulo: `${TITULO_TESTE} ${c.componente}`,
        descricao: `Diligência - revisar publicação (${c.componente})`,
        prioridade: "alta",
        data_vencimento: new Date(Date.now() + 86400000 * 3).toISOString(),
        processo_id: null,
        cliente_id: null,
        origem: c.origem,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      falhas.push(`${c.componente} (${c.origem}): ${error.message}`);
    } else if (data?.id) {
      idsCriados.push(data.id);
    }
  }

  if (idsCriados.length > 0) {
    await admin.from("controladoria_itens").delete().in("id", idsCriados);
  }
  await admin
    .from("controladoria_itens")
    .delete()
    .like("titulo", `${TITULO_TESTE}%`);

  assertEquals(
    falhas.length,
    0,
    `Falhou em algum cenário do botão: ${falhas.join(" | ")}`,
  );
} });
