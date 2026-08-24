// Gera o DOCX da proposta de honorários e devolve em base64.
// Usa a biblioteca docx via npm: specifier (mesma usada nos demais documentos jurídicos).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "npm:docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FONT = "Bookman Old Style";

function fmt(v: number | undefined | null): string {
  return (v ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function P(opts: { text: string; bold?: boolean; size?: number; italics?: boolean; align?: any; color?: string }) {
  return new Paragraph({
    alignment: opts.align,
    children: [
      new TextRun({
        text: opts.text,
        bold: opts.bold,
        italics: opts.italics,
        size: opts.size ?? 22,
        font: FONT,
        color: opts.color,
      }),
    ],
  });
}

function blank() {
  return new Paragraph({ children: [new TextRun({ text: " ", size: 24, font: FONT })] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { inputs, resultado, cliente_nome, processo_numero } = body as {
      inputs: any;
      resultado: any;
      cliente_nome?: string;
      processo_numero?: string;
    };

    if (!inputs || !resultado) {
      return new Response(JSON.stringify({ error: "inputs e resultado são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tipo: string = inputs.tipo ?? "fixo";
    const totalFixo = Number(resultado.totalFixo ?? 0);
    const totalExito = Number(resultado.totalExito ?? 0);
    const totalGeral = Number(resultado.totalGeral ?? totalFixo + totalExito);
    const parcelas = Number(inputs.parcelamento ?? 1);
    const ano = inputs.anoTabela ?? new Date().getFullYear();
    const seccional = inputs.estado ? `OAB/${inputs.estado}` : "OAB";

    const dataExtenso = new Date().toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const children: Paragraph[] = [
      P({ text: "JAS ADVOCACIA", bold: true, size: 28, align: AlignmentType.CENTER }),
      P({ text: "Dra. Juliana Araújo da Silva — OAB/MT 34.182", align: AlignmentType.CENTER }),
      blank(),
      P({ text: "PROPOSTA DE HONORÁRIOS ADVOCATÍCIOS", bold: true, size: 24, align: AlignmentType.CENTER }),
      blank(),
      P({ text: `Primavera do Leste/MT, ${dataExtenso}`, align: AlignmentType.RIGHT }),
      blank(),
    ];

    if (cliente_nome) children.push(P({ text: `Cliente: ${cliente_nome}` }));
    if (processo_numero) children.push(P({ text: `Processo / Referência: ${processo_numero}` }));
    if (cliente_nome || processo_numero) children.push(blank());

    children.push(
      P({ text: "Apresentamos nossa proposta para prestação de serviços advocatícios:" }),
      blank(),
    );

    if (tipo === "fixo" || tipo === "misto") {
      children.push(P({ text: `Honorários fixos: R$ ${fmt(totalFixo)}`, bold: true }));
      if (parcelas > 1) {
        children.push(
          P({ text: `Parcelamento: ${parcelas}x de R$ ${fmt(totalFixo / parcelas)}` }),
        );
      } else {
        children.push(P({ text: "Pagamento à vista até a assinatura do contrato." }));
      }
      children.push(blank());
    }

    if (tipo === "exito" || tipo === "misto") {
      const perc = inputs.percentualExito ?? 0;
      children.push(
        P({ text: `Honorários de êxito: ${perc}% sobre o proveito econômico`, bold: true }),
        P({ text: `(estimativa: R$ ${fmt(totalExito)})`, italics: true }),
        P({ text: "Devidos somente em caso de resultado favorável." }),
        blank(),
      );
    }

    if (tipo === "mensalidade") {
      const meses = parcelas;
      children.push(
        P({ text: `Honorários mensais: R$ ${fmt(totalFixo)}`, bold: true }),
        P({ text: `Duração estimada: ${meses} meses` }),
        P({ text: `Total estimado no período: R$ ${fmt(totalFixo * meses)}`, italics: true }),
        blank(),
      );
    }

    children.push(
      P({ text: `TOTAL ESTIMADO: R$ ${fmt(totalGeral)}`, bold: true, size: 26 }),
      blank(),
      P({ text: "Esta proposta tem validade de 15 (quinze) dias.", italics: true }),
      blank(),
      blank(),
      P({ text: "___________________________________", align: AlignmentType.CENTER }),
      P({ text: "Juliana Araújo da Silva", bold: true, align: AlignmentType.CENTER }),
      P({ text: "OAB/MT 34.182", align: AlignmentType.CENTER }),
      blank(),
      P({
        text: `Valores calculados com base na Tabela de Honorários da ${seccional} — ${ano}.`,
        italics: true,
        size: 18,
        align: AlignmentType.CENTER,
        color: "666666",
      }),
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 },
            },
          },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    // Buffer -> base64
    const arr = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < arr.length; i += chunk) {
      binary += String.fromCharCode(...arr.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    return new Response(
      JSON.stringify({
        docx_base64: base64,
        filename: `proposta-honorarios-${Date.now()}.docx`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("gerar-proposta error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
