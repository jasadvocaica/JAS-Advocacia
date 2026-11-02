import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import assert from "node:assert/strict";
const dir=new URL("../../supabase/functions/biblioteca-juridica-sync/",import.meta.url);
let source=await readFile(new URL("index.ts",dir),"utf8");
source=source.replace(/import\s*\{[^}]*\}\s*from\s*"https:[^"]+";/g,"");
const bundle=await build({stdin:{contents:source,loader:"ts",resolveDir:fileURLToPath(dir)},bundle:true,write:false,format:"cjs",platform:"node"});
let handler,bancos=0,importacoes=0;
let claims={repository:"jasadvocaica/JAS-Advocacia",ref:"refs/heads/main",workflow_ref:"jasadvocaica/JAS-Advocacia/.github/workflows/sync-legislacao.yml@refs/heads/main",event_name:"schedule"};
const norma='---\ntitulo: "Lei teste"\ntipo: "Lei"\nnumero: "1"\nfonte: "https://www.planalto.gov.br/teste"\nversao_texto: "compilada"\n---\n\n**Art. 1º** Texto normativo.';
const DenoMock={env:{get:(nome)=>nome==="SUPABASE_SERVICE_ROLE_KEY"?"chave-servidor":"https://example.supabase.co"},serve:(h)=>handler=h};
const client={from:(t)=>{assert.equal(t,"jur_normas");const q={select:()=>q,eq:()=>q,order:async()=>({data:[],error:null})};return q;},rpc:async(nome,args)=>{assert.equal(nome,"jur_importar_norma");assert.equal(args.p_norma.texto_original,norma);importacoes++;return {data:{status:"importada"},error:null};}};
new Function("createClient","createRemoteJWKSet","jwtVerify","Deno","fetch",bundle.outputFiles[0].text)(
 (_url,key)=>{assert.equal(key,"chave-servidor");bancos++;return client;},
 (url)=>{assert.equal(url.href,"https://token.actions.githubusercontent.com/.well-known/jwks");return "jwks";},
 async(token,_keys,opcoes)=>{assert.equal(opcoes.audience,"jas-legislacao-sync");assert.equal(opcoes.issuer,"https://token.actions.githubusercontent.com");if(token!=="token-assinado")throw new Error("assinatura inválida");return {payload:claims};},
 DenoMock,
 async(url)=>{assert.equal(url,`https://raw.githubusercontent.com/ctresb/leis/${"a".repeat(40)}/federal/lei-teste.md`);return new Response(norma);},
);
const chamar=(body,token="token-assinado")=>handler(new Request("https://example.supabase.co/functions/v1/biblioteca-juridica-sync",{method:"POST",headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)}));
assert.equal((await chamar({acao:"catalogo"},null)).status,401);
assert.equal((await chamar({acao:"catalogo"},"token-falso")).status,401);
const autorizado={...claims};
for(const invalido of [{repository:"jasadvocaica/sistema"},{repository:"outro/repo"},{ref:"refs/heads/outra"},{workflow_ref:"outro/workflow"},{event_name:"pull_request"}]){claims={...autorizado,...invalido};assert.equal((await chamar({acao:"catalogo"})).status,403);}
assert.equal(bancos,0,"credenciais inválidas não podem alcançar o cliente privilegiado");claims=autorizado;
assert.equal((await chamar({acao:"catalogo"})).status,200);
assert.equal((await chamar({commit:"inválido",normas:[]})).status,400);
const r=await chamar({commit:"a".repeat(40),normas:[{path:"federal/lei-teste.md"}]});assert.equal(r.status,200);assert.equal(importacoes,1);
const traversal=await chamar({commit:"a".repeat(40),normas:[{path:"federal/../segredo.md"}]});assert.equal(traversal.status,207);assert.equal(importacoes,1);
console.log("PASS: OIDC, emissor/audiência, repositório/workflow/ref, isolamento do importador e bloqueio de caminhos externos.");
