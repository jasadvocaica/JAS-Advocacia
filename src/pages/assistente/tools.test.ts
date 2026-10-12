import {describe,it,expect} from 'vitest';
import {ferramentas,validar,consultar} from '../../../supabase/functions/assistente-chat/tools';
const equipe={uid:'11111111-1111-4111-8111-111111111111',gestor:false,modulos:new Set(['clientes','processos','controladoria']),escopo:'teste'};
describe('ferramentas do assistente',()=>{
 it('não oferece financeiro ou escrita à equipe',()=>{const nomes=ferramentas(equipe).map(t=>t.name);expect(nomes).toContain('consultar_processo');expect(nomes).not.toContain('resumo_financeiro');expect(nomes.some(n=>/criar|excluir|editar|pagar/.test(n))).toBe(false);});
 it('bloqueia financeiro mesmo quando o modelo força a chamada',async()=>{await expect(consultar({},equipe,'resumo_financeiro',{})).rejects.toThrow('não autorizada');});
 it('bloqueia ferramentas arbitrárias de escrita',async()=>{await expect(consultar({},equipe,'executar_sql',{sql:'delete'})).rejects.toThrow('não autorizada');});
 it('rejeita ID manipulado e parâmetros extras',()=>{expect(()=>validar({id:'x) or true'})).toThrow();expect(()=>validar({sql:'select *'})).toThrow();});
 it('valida datas e limita períodos',()=>{expect(()=>validar({inicio:'2026-01-01',fim:'2026-12-01'})).toThrow();expect(()=>validar({inicio:'2026-02-30'})).toThrow();expect(validar({inicio:'2026-10-01',fim:'2026-10-12'}).fim).toBe('2026-10-12');});
 it('força consultas de equipe ao próprio usuário',async()=>{await expect(consultar({from:()=>({select:()=>({order:()=>({limit:()=>({})})})})},equipe,'listar_atividades',{responsavel_id:'22222222-2222-4222-8222-222222222222'})).rejects.toThrow('restrita à gestão');});
 it('gestora com autorização financeira recebe as ferramentas',()=>{expect(ferramentas({...equipe,gestor:true,modulos:new Set(['financeiro'])}).map(t=>t.name)).toContain('comparar_periodos_financeiros');});
});
describe('consultas mínimas e fontes',()=>{
 const consultas:Record<string,string>={};
 const db={from:(t:string)=>{const q:any={};for(const m of ['eq','neq','in','not','or','gte','lte','lt','order','limit','ilike'])q[m]=()=>q;q.select=(s:string)=>{consultas[t]=s;return q;};q.then=(resolve:any)=>resolve({data:[{id:'33333333-3333-4333-8333-333333333333',nome:'Registro sintético',titulo:'Atividade sintética',valor_recebido:10,valor:5,status:'pendente'}],error:null});return q;},rpc:async()=>({data:true,error:null})};
 for(const [nome,modulo,p] of [['buscar_clientes','clientes',{}],['consultar_processo','processos',{id:'33333333-3333-4333-8333-333333333333'}],['listar_prazos','controladoria',{}],['listar_diligencias','diligencias',{}],['resumo_produtividade','controladoria',{}],['resumo_financeiro','financeiro',{inicio:'2026-10-01',fim:'2026-10-12'}]] as const){
  it(`consulta ${nome} com fonte interna`,async()=>{const r=await consultar(db,{...equipe,gestor:true,modulos:new Set([modulo])},nome,p);expect(r.fontes.length).toBeGreaterThan(0);expect(r.fontes[0].rota).toMatch(/^\//);expect(Object.values(consultas).join(' ')).not.toMatch(/cpf|salario|observacoes|\*/);});
 }
});
