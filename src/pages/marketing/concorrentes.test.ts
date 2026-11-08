import { describe, expect, it, vi } from "vitest";
import { prepararFontesPublicas } from "../../../supabase/functions/_shared/marketing-pesquisa";
import { readFileSync } from "node:fs";
import ts from "typescript";
const fonte = readFileSync("supabase/functions/motor-missoes/ferramentas-amplas.ts", "utf8").replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm, "");
const codigo = ts.transpileModule(fonte, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const consultarAmplo = new Function("exports", "DOMINIOS_OFICIAIS", "prepararFontesPublicas", codigo + "\nreturn exports.consultarAmplo;")({}, ["gov.br"], prepararFontesPublicas) as (db: unknown, slug: string, p: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>;
describe("pesquisa pública de concorrentes", () => {
 it("normaliza fontes públicas e recusa credenciais, rede interna e parâmetros", () => {
  expect(prepararFontesPublicas(["https://www.instagram.com/referencia/", "https://www.instagram.com/referencia/"])).toEqual({urls:["https://www.instagram.com/referencia/"],dominios:["instagram.com"]});
  for(const s of ["http://example.org/","https://127.0.0.1/","https://usuario:senha@example.org/","https://site.local/","https://example.org/?token=teste"]) expect(()=>prepararFontesPublicas([s])).toThrow();
 });
 it("monta a busca apenas com fontes configuradas, aplica orçamento e limita uma consulta por tarefa", async () => {
  const chamadas: {url: string; body: Record<string,unknown>}[]=[];
  const fetcher=vi.fn(async (url: string, init: RequestInit)=>{const body=JSON.parse(String(init.body));chamadas.push({url,body});return new Response(JSON.stringify(url.endsWith('/input_tokens')?{input_tokens:10}:{usage:{input_tokens:50,output_tokens:30},output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Evidência com limite de cobertura',annotations:[{type:'url_citation',url:'https://www.instagram.com/p/abc/',title:'Post público'}]}]}]}),{status:200});});
  fetcher.mockImplementationOnce(async () => new Response('{}',{status:400}));
  vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal});
  const rpc=vi.fn(async (acao: string)=>({data:acao==='mkt_concorrentes_fontes'?['https://www.instagram.com/referencia/']:acao==='ia_confirmar'?true:{ok:true},error:null}));
  const ctx={key:'fixture-sem-acesso',modelo:'gpt-4.1-mini-2025-04-14',execucao_id:'exec-teste',agente_id:'agente-teste',tarefa_id:'tarefa-teste',proximaRodada:()=>4};
  try{
   const r=await consultarAmplo({rpc} as never,'pesquisar_concorrentes_publicos',{pergunta:'Contato privado que deve ser ignorado'},ctx);
   expect(JSON.stringify(chamadas)).not.toContain('Contato privado');
   expect(chamadas[1].body).toMatchObject({store:false,tool_choice:'auto',max_tool_calls:1,tools:[{type:'web_search',search_context_size:'low'}]});
   expect(rpc).toHaveBeenCalledWith('ia_reservar',expect.objectContaining({_entrada:100000}));
   expect(rpc).toHaveBeenCalledWith('ia_confirmar',expect.objectContaining({_entrada:33010}));
   expect(r).toMatchObject({cobertura:expect.stringContaining('não é varredura completa')});
   await expect(consultarAmplo({rpc} as never,'pesquisar_concorrentes_publicos',{},ctx)).rejects.toThrow('Uma consulta');
  }finally{vi.unstubAllGlobals();}
 });
 it("não faz pesquisa paga quando a cota existente recusa a reserva", async () => {
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({input_tokens:10}),{status:200}));
  vi.stubGlobal('fetch',fetcher);vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal});
  const rpc=vi.fn(async(a: string)=>({data:a==='mkt_concorrentes_fontes'?['https://example.org/']:{ok:false,motivo:'agente'},error:null}));
  try { await expect(consultarAmplo({rpc},'pesquisar_concorrentes_publicos',{}, {key:'fixture',modelo:'gpt-4.1-mini-2025-04-14',execucao_id:'x',agente_id:'a',tarefa_id:'t',proximaRodada:()=>4})).rejects.toThrow('pesquisa_publica_sem_orcamento'); expect(fetcher).toHaveBeenCalledTimes(1); }
  finally { vi.unstubAllGlobals(); }
 });

 it("aceita fontes da ação de busca e exclui domínios não configurados", async () => {
  const fetcher=vi.fn(async(url: string)=>new Response(JSON.stringify(url.endsWith('/input_tokens')?{input_tokens:10}:{status:'completed',usage:{input_tokens:50,output_tokens:30},output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://example.org/post-confirmado/'},{url:'https://outra-fonte.net/'}]}},{content:[{type:'output_text',text:'Resumo original com limitação de cobertura',annotations:[]}]}]}),{status:200}));
  vi.stubGlobal('fetch',fetcher);vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal});
  const rpc=vi.fn(async(a: string)=>({data:a==='mkt_concorrentes_fontes'?['https://example.org/']:a==='ia_confirmar'?true:{ok:true},error:null}));
  try { const r=await consultarAmplo({rpc},'pesquisar_concorrentes_publicos',{}, {key:'fixture',modelo:'gpt-4.1-mini-2025-04-14',execucao_id:'x',agente_id:'a',tarefa_id:'t',proximaRodada:()=>4}) as {fontes:{url:string}[]}; expect(r.fontes.map(f=>f.url)).toEqual(['https://example.org/post-confirmado/']); }
  finally { vi.unstubAllGlobals(); }
 });

});
