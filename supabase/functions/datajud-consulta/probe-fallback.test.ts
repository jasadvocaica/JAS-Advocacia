// Probe: descobre processos REAIS já indexados no DataJud em vários tribunais
// (via match_all + size:1), e em seguida valida que `consultarProcesso` retorna
// movimentos para esses CNJs reais. Confirma a integração ponta a ponta.

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  BASE_URL,
  buildDataJudAuthHeader,
  consultarProcesso,
  TRIBUNAL_ALIAS,
} from "./index.ts";

const apiKey = Deno.env.get("DATAJUD_API_KEY") ?? "";

const TRIBUNAIS_TESTAR = ["TJSP", "TJCE", "TJBA", "TRF1", "TST", "STJ"];

async function pegarUmCnjReal(tribunal: string): Promise<string | null> {
  const alias = TRIBUNAL_ALIAS[tribunal];
  if (!alias) return null;
  const endpoint = `${BASE_URL}/${alias}/_search`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: buildDataJudAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ size: 1, query: { match_all: {} } }),
  });
  if (!res.ok) {
    await res.text();
    return null;
  }
  const data = await res.json();
  const hit = data?.hits?.hits?.[0]?._source;
  return hit?.numeroProcesso ?? null;
}

Deno.test({
  name: "PROBE-FALLBACK: descobre CNJ real indexado e valida andamentos",
  ignore: !apiKey,
  async fn() {
    console.log("\n=== Probe DataJud — fallback com CNJ real ===");
    let algumOk = false;

    for (const tribunal of TRIBUNAIS_TESTAR) {
      const numero = await pegarUmCnjReal(tribunal);
      if (!numero) {
        console.log(`[${tribunal}] sem hits no índice (match_all)`);
        continue;
      }

      const src = await consultarProcesso(numero, tribunal, apiKey);
      const movs = (src as any)?.movimentos ?? [];
      const ult = movs[movs.length - 1];
      console.log(
        `[${tribunal}] CNJ=${numero} movimentos=${movs.length}` +
          (ult ? ` | último: ${ult.dataHora} — ${ult.nome ?? ult.codigo}` : ""),
      );
      if (movs.length > 0) algumOk = true;
    }

    console.log("==============================================\n");

    if (!algumOk) {
      throw new Error("Nenhum tribunal retornou movimentos — investigar conectividade");
    }
  },
});
