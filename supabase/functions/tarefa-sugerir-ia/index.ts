// Sugere campos estruturados para criar uma tarefa, a partir de descrição livre.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ReqBody {
  intencao: string;
  cliente?: { id: string; nome: string } | null;
  equipe?: { id: string; nome: string }[];
  hoje?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const body = (await req.json()) as ReqBody;
    if (!body.intencao || body.intencao.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Descreva o que precisa fazer" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hoje = body.hoje ?? new Date().toISOString().slice(0, 10);
    const equipeStr = (body.equipe ?? []).map((p) => `- ${p.nome} (id: ${p.id})`).join("\n") || "(nenhum)";
    const clienteStr = body.cliente ? `Cliente em foco: ${body.cliente.nome} (id ${body.cliente.id}).` : "Sem cliente específico.";

    const sys = `Você é a Bia, assistente do escritório Juliana Araújo Advocacia.
Sua tarefa é transformar uma frase em uma TAREFA estruturada para o sistema interno.
Hoje: ${hoje}.
${clienteStr}
Equipe disponível:
${equipeStr}

Regras:
- titulo: imperativo curto (até 60 chars), começando com verbo.
- tipo: um de "tarefa","prazo_fatal","prazo_processual","diligencia","reuniao". Use "prazo_fatal" só se a frase mencionar perda de direito/decadência.
- prioridade: "baixa","media","alta","urgente". Use "alta" para coisas com cliente esperando, "urgente" quando explicitamente urgente.
- data_vencimento: ISO date (YYYY-MM-DD). Se a pessoa não disser, use 7 dias a partir de hoje. Nunca antes de hoje.
- responsavel_id: id da pessoa da equipe que melhor combina (ou null). Se a frase citar um nome, escolha pelo match do primeiro nome.
- descricao: passos práticos para executar (3-6 bullets em markdown).`;

    const tools = [{
      type: "function",
      function: {
        name: "criar_tarefa",
        description: "Retorna uma tarefa estruturada",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            tipo: { type: "string", enum: ["tarefa","prazo_fatal","prazo_processual","diligencia","reuniao"] },
            prioridade: { type: "string", enum: ["baixa","media","alta","urgente"] },
            data_vencimento: { type: "string" },
            responsavel_id: { type: ["string","null"] },
            descricao: { type: "string" },
          },
          required: ["titulo","tipo","prioridade","data_vencimento","descricao"],
          additionalProperties: false,
        },
      },
    }];

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: body.intencao }],
        tools,
        tool_choice: { type: "function", function: { name: "criar_tarefa" } },
      }),
    });

    if (r.status === 429) return new Response(JSON.stringify({ error: "Limite atingido, tente em instantes." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text();
      console.error("AI error", r.status, t);
      return new Response(JSON.stringify({ error: "Falha na IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await r.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return new Response(JSON.stringify({ error: "Sem resposta da IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const parsed = JSON.parse(args);
    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
