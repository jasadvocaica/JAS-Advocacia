import { describe, expect, it } from 'vitest';
import { estadoMesa } from './EscritorioVisual';
import type { AgenteIA, ExecucaoAgente } from './hooks/useAgentesIA';
const agente:AgenteIA={id:'1',slug:'monitor-djen',nome:'Monitor',descricao:null,area:'djen',webhook_url:null,exige_aprovacao:false,ativo:true,ordem:0};
const exec=(status:ExecucaoAgente['status'],inicio=new Date().toISOString())=>({status,iniciado_em:inicio} as ExecucaoAgente);
describe('Estado real da mesa',()=>{
 it('não simula trabalho sem execução',()=>expect(estadoMesa(agente)).toBe('Disponível'));
 it('mostra trabalho somente durante execução registrada',()=>expect(estadoMesa(agente,exec('executando'))).toBe('Trabalhando'));
 it('não mantém execução antiga como trabalho ao vivo',()=>expect(estadoMesa(agente,exec('executando','2020-01-01'))).toBe('Execução sem confirmação'));
 it('mostra agente sem integração como configuração pendente',()=>expect(estadoMesa({...agente,slug:'minuta-pecas'})).toBe('Precisa configurar'));
 it('prioriza pausa sobre execução anterior',()=>expect(estadoMesa({...agente,ativo:false},exec('executando'))).toBe('Pausado'));
 it('exibe revisão humana pendente',()=>expect(estadoMesa(agente,exec('aguardando_aprovacao'))).toBe('Aguarda sua revisão'));
});
