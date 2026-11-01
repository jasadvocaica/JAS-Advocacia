import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { respostaComLimite } from "../assistente-chat/limites.ts";
import {
  CLARA_EXEMPLO,
  EntradaClaraError,
  hashClara,
  promptClara,
  validarEntradaClara,
  validarExtracaoClara,
} from "../_shared/clara.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let tarefa: string | undefined,
    consumo: string | undefined,
    usuario: string | undefined;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 65536)
      return json({ error: "Solicitação muito grande." }, 413);
    let body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return json({ error: "Corpo JSON inválido." }, 400);
    const teste = body.acao === "teste_m1";
    if (teste) {
      const { data: autorizado, error } = await db.rpc(
        "validar_djen_cron_secret",
        { _secret: req.headers.get("x-djen-cron-secret") ?? "" },
      );
      if (error || autorizado !== true || !uuid(body.usuario_teste))
        return json({ error: "Teste de homologação não autorizado." }, 401);
      usuario = body.usuario_teste;
    } else {
      const { data: auth, error: authErro } = await db.auth.getUser(
        (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, ""),
      );
      if (authErro || !auth.user)
        return json({ error: "Sessão inválida." }, 401);
      usuario = auth.user.id;
    }
    const checks = await Promise.all([
      db.rpc("is_interno_ativo", { _user_id: usuario }),
      db.rpc("is_gestor", { _user_id: usuario }),
      db.rpc("has_permission", {
        _user_id: usuario,
        _modulo: "clientes",
        _acao: "criar",
      }),
    ]);
    if (checks.some((c) => c.error || c.data !== true))
      return json(
        {
          error:
            "Gestor ativo com permissão de cadastro de clientes necessário.",
        },
        403,
      );
    const rpc = async (name: string, args: Record<string, unknown> = {}) => {
      const { data, error } = await db.rpc(name, args);
      if (error) throw new Error(error.message);
      return data;
    };
    const cfg = await rpc("clara_m1_status");
    if (body.acao === "status")
      return json({
        ...cfg,
        capacidades: ["TXT → prévia → aprovação → cliente fictício"],
        roteamento: "regra_m1",
        alex_implementado: false,
      });
    if (
      !cfg?.habilitado &&
      !["consultar", "cancelar", "recuperar"].includes(body.acao)
    )
      return json(
        {
          error:
            "Homologação Clara ainda não habilitada. Nenhum cadastro foi alterado.",
        },
        409,
      );
    if (teste) {
      const entrada = validarEntradaClara({
        ambiente: "homologacao",
        dados_ficticios: true,
        texto: CLARA_EXEMPLO,
        comando: "Cadastre a cliente fictícia de teste.",
        arquivo: "clara-m1-ficticio.txt",
      });
      const id = await rpc("clara_m1_receber", {
        _usuario: usuario,
        _hash: await hashClara(entrada.texto),
        _comando: entrada.comando,
        _arquivo: entrada.arquivo,
        _texto: entrada.texto,
      });
      const atual = await rpc("clara_m1_consultar", {
        _usuario: usuario,
        _tarefa: id,
      });
      if (!["queued", "failed"].includes(atual.estado))
        return json({ ok: true, reutilizado: true, tarefa: atual });
      body = { acao: "executar", tarefa_id: id };
    }
    if (body.acao === "receber") {
      const entrada = validarEntradaClara(body);
      const id = await rpc("clara_m1_receber", {
        _usuario: usuario,
        _hash: await hashClara(entrada.texto),
        _comando: entrada.comando,
        _arquivo: entrada.arquivo,
        _texto: entrada.texto,
      });
      return json({
        ok: true,
        tarefa: await rpc("clara_m1_consultar", {
          _usuario: usuario,
          _tarefa: id,
        }),
      });
    }
    if (!uuid(body.tarefa_id))
      return json({ error: "Identificador de tarefa inválido." }, 400);
    tarefa = body.tarefa_id;
    if (body.acao === "consultar")
      return json({
        ok: true,
        tarefa: await rpc("clara_m1_consultar", {
          _usuario: usuario,
          _tarefa: tarefa,
        }),
      });
    if (body.acao === "aprovar") {
      const resultado = await rpc("clara_m1_aprovar", {
        _usuario: usuario,
        _tarefa: tarefa,
      });
      return json({
        ok: true,
        resultado,
        tarefa: await rpc("clara_m1_consultar", {
          _usuario: usuario,
          _tarefa: tarefa,
        }),
      });
    }
    if (body.acao === "recuperar")
      return json({
        ok: await rpc("clara_m1_recuperar", {
          _usuario: usuario,
          _tarefa: tarefa,
        }),
      });
    if (body.acao === "cancelar")
      return json({
        ok: await rpc("clara_m1_cancelar", {
          _usuario: usuario,
          _tarefa: tarefa,
        }),
      });
    if (body.acao !== "executar") return json({ error: "Ação inválida." }, 400);
    const { data: modelo, error: configErro } = await db
      .from("assistente_config")
      .select("modelo,habilitado")
      .single();
    if (configErro || !modelo?.habilitado)
      return json({ error: "OpenAI desativada." }, 409);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key)
      return json({ error: "OpenAI não configurada no servidor." }, 503);
    const trabalho = await rpc("clara_m1_reservar", {
      _usuario: usuario,
      _tarefa: tarefa,
    });
    if (!trabalho)
      return json(
        {
          error:
            "Tarefa em execução, já processada ou com tentativas esgotadas. Nenhuma chamada de IA repetida.",
        },
        409,
      );
    consumo = trabalho.consumo_id;
    if (!consumo) throw new Error("Reserva sem identificador de consumo.");
    const reservado = await rpc("assistente_reservar", {
      p_id: consumo,
      p_user: usuario,
      p_modelo: modelo.modelo,
    });
    if (reservado !== true)
      throw new Error("Orçamento ou frequência de chamadas indisponível.");
    const ai = await respostaComLimite({
      key,
      requestId: consumo,
      rodada: 0,
      rpc: (name, args) => db.rpc(name, args),
      signal: AbortSignal.timeout(60000),
      payload: { model: modelo.modelo, ...promptClara(trabalho.texto) },
    });
    const custo =
      (ai.usage.input_tokens * Number(trabalho.precificacao.entrada_usd_milhao) +
        ai.usage.output_tokens * Number(trabalho.precificacao.saida_usd_milhao)) /
      1e6;
    const { error: consumoErro } = await db
      .from("assistente_consumo")
      .update({
        status: "concluido",
        reserva_usd: 0,
        tokens_entrada: ai.usage.input_tokens,
        tokens_saida: ai.usage.output_tokens,
        custo_estimado_usd: custo,
        ferramentas: [
          { ferramenta: "clara_txt_homologacao", status: "extraido" },
        ],
      })
      .eq("id", consumo);
    if (consumoErro)
      throw new Error("Consumo não persistido. Cadastro bloqueado.");
    if (
      (await rpc("clara_m1_consumo", {
        _usuario: usuario,
        _tarefa: tarefa,
        _consumo: consumo,
        _entrada: ai.usage.input_tokens,
        _saida: ai.usage.output_tokens,
        _custo: custo,
      })) !== true
    )
      throw new Error("Consumo da tarefa não confirmado. Cadastro bloqueado.");
    const texto = ai.output
      ?.flatMap(
        (o: { content?: { type: string; text?: string }[] }) => o.content ?? [],
      )
      .filter((c: { type: string }) => c.type === "output_text")
      .map((c: { text: string }) => c.text)
      .join("");
    let rawExtracao: unknown;
    try {
      rawExtracao = JSON.parse(texto);
    } catch {
      throw new Error(
        "A IA não retornou JSON completo. Nenhum cadastro foi criado.",
      );
    }
    const previa = validarExtracaoClara(rawExtracao, trabalho.texto);
    if (
      (await rpc("clara_m1_previa", {
        _usuario: usuario,
        _tarefa: tarefa,
        _consumo: consumo,
        _candidato: previa.candidato,
        _evidencias: previa.evidencias,
        _pendencias: previa.pendencias,
        _cnj: previa.numero_cnj,
        _entrada: ai.usage.input_tokens,
        _saida: ai.usage.output_tokens,
        _custo: custo,
      })) !== true
    )
      throw new Error("A revisão da tarefa mudou. Resultado não confirmado.");
    return json({
      ok: true,
      tarefa: await rpc("clara_m1_consultar", {
        _usuario: usuario,
        _tarefa: tarefa,
      }),
    });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha no comando.";
    if (tarefa && consumo && usuario) {
      // Mantém as reservas de tokens incertas; não faz retry automático da API.
      await db.rpc("clara_m1_falhar", {
        _usuario: usuario,
        _tarefa: tarefa,
        _consumo: consumo,
        _erro: erro,
      });
      await db
        .from("assistente_consumo")
        .update({ status: "falha", erro_codigo: "clara_m1" })
        .eq("id", consumo)
        .eq("status", "reservado");
    }
    // Nunca devolve payload ou detalhes de credenciais do provedor.
    return json(
      {
        error: erro.includes("clara_m1_status")
          ? "Homologação Clara não instalada."
          : erro,
      },
      e instanceof EntradaClaraError || e instanceof SyntaxError ? 400 : 500,
    );
  }
});
