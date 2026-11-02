// Agendamento sem segredo compartilhado: apenas OIDC do workflow autorizado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { importarNorma } from "../_shared/importacao-legislacao.ts";
import { VERSAO_PARSER, type EntradaCatalogo } from "../_shared/legislacao.ts";

const jwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token)
      return json({ error: "Autenticação do agendamento necessária." }, 401);
    let payload;
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: "https://token.actions.githubusercontent.com",
        audience: "jas-legislacao-sync",
        algorithms: ["RS256"],
      }));
    } catch {
      return json({ error: "Credencial do agendamento inválida." }, 401);
    }
    if (
      payload.repository !== "jasadvocaica/JAS-Advocacia" ||
      payload.ref !== "refs/heads/main" ||
      payload.workflow_ref !==
        "jasadvocaica/JAS-Advocacia/.github/workflows/sync-legislacao.yml@refs/heads/main" ||
      !["push", "schedule", "workflow_dispatch"].includes(
        String(payload.event_name),
      )
    )
      return json({ error: "Workflow não autorizado." }, 403);
    const raw = await req.text();
    if (raw.length > 20_000) return json({ error: "Lote muito extenso." }, 413);
    const body = JSON.parse(raw);
    // A chave privilegiada só é usada depois da autenticação criptográfica do workflow.
    // Esta rotina não consulta clientes, processos ou documentos do escritório.
    const banco = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    if (body.acao === "catalogo") {
      const { data, error } = await banco
        .from("jur_normas")
        .select("id,apelidos,areas")
        .eq("ativo", true)
        .order("id");
      if (error)
        throw new Error("Não foi possível consultar as normas cadastradas.");
      return json({
        normas: (data ?? []).map((n) => ({
          path: n.id,
          apelidos: n.apelidos,
          areas: n.areas,
        })),
      });
    }
    if (
      body.parser_versao !== undefined &&
      body.parser_versao !== VERSAO_PARSER
    )
      return json(
        {
          error:
            "A versão do importador difere do catálogo. Atualize a função antes de sincronizar.",
        },
        409,
      );
    if (
      !/^[a-f0-9]{40}$/.test(body.commit ?? "") ||
      !Array.isArray(body.normas) ||
      body.normas.length < 1 ||
      body.normas.length > 3
    )
      return json({ error: "Lote ou versão inválidos." }, 400);
    const resultados = [];
    for (const entrada of body.normas as EntradaCatalogo[]) {
      try {
        resultados.push({
          path: entrada.path,
          ok: true,
          resultado: await importarNorma(banco, entrada, body.commit),
        });
      } catch (e) {
        resultados.push({
          path: entrada.path,
          ok: false,
          error: e instanceof Error ? e.message : "Falha ao importar.",
        });
      }
    }
    return json(
      { resultados, ok: resultados.every((r) => r.ok) },
      resultados.every((r) => r.ok) ? 200 : 207,
    );
  } catch {
    return json({ error: "Não foi possível executar a sincronização." }, 500);
  }
});
