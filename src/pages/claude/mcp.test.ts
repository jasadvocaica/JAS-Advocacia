import {describe,it,expect} from 'vitest';
import {responderMCP} from '../../../supabase/functions/claude-mcp/protocol';
import {callbackClaude} from './OAuthConsent';
const equipe={uid:'11111111-1111-4111-8111-111111111111',gestor:false,modulos:new Set(['clientes','processos']),escopo:''};
describe('MCP Claude',()=>{
 it('negocia versão e informa ferramentas de leitura',async()=>{const r:any=await responderMCP({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}},{},equipe);expect(r.result.protocolVersion).toBe('2025-06-18');expect(r.result.capabilities.tools).toBeDefined();});
 it('lista somente ferramentas permitidas e nenhuma escrita',async()=>{const r:any=await responderMCP({jsonrpc:'2.0',id:2,method:'tools/list'},{},equipe);expect(r.result.tools.every((t:any)=>t.annotations.readOnlyHint)).toBe(true);expect(r.result.tools.some((t:any)=>t.name==='resumo_financeiro'||t.name==='criar_cliente')).toBe(false);});
 it('bloqueia tentativa de escrita e financeiro sem permissão',async()=>{for(const name of ['criar_cliente','resumo_financeiro','executar_sql']){const r:any=await responderMCP({jsonrpc:'2.0',id:3,method:'tools/call',params:{name,arguments:{}}},{},equipe);expect(r.result.isError).toBe(true);}});
 it('aceita notificações sem inventar uma resposta JSON-RPC',async()=>{expect(await responderMCP({jsonrpc:'2.0',method:'notifications/initialized'},{},equipe)).toBe(null);});
 it('rejeita lote e métodos desconhecidos',async()=>{expect((await responderMCP([],{},equipe) as any).error.code).toBe(-32600);expect((await responderMCP({jsonrpc:'2.0',id:4,method:'db/write'},{},equipe) as any).error.code).toBe(-32601);});
 it('permite retorno somente ao callback oficial Claude',()=>{expect(callbackClaude('https://claude.ai/api/mcp/auth_callback?code=x&state=y')).toBe(true);for(const u of ['http://claude.ai/api/mcp/auth_callback','https://claude.ai.evil.invalid/api/mcp/auth_callback','javascript:alert(1)','https://evil.invalid/','https://user:pass@claude.ai/api/mcp/auth_callback'])expect(callbackClaude(u)).toBe(false);});
});
