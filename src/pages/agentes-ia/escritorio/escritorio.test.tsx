import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlantaEscritorio from './PlantaEscritorio';
import ChatEscritorio from './ChatEscritorio';
import { salaAgente, SALAS, aparencia } from './salas';
import { chamarEscritorio, type AgenteIA } from '../hooks/useAgentesIA';
vi.mock('../hooks/useAgentesIA',()=>({chamarEscritorio:vi.fn()}));
const a:AgenteIA={id:'analista-1',slug:'analista-sofia',nome:'Sofia',descricao:'Operações',area:'gestao',executor:'analista_operacional',sala:'diretoria',webhook_url:null,ativo:true,exige_aprovacao:true,ordem:0};
describe('Escritório por salas',()=>{
 it('tem as seis salas solicitadas e destino seguro para agente sem sala',()=>{expect(SALAS).toHaveLength(6);expect(salaAgente({...a,sala:undefined})).toBe('diretoria');expect(salaAgente({...a,sala:'invalida',area:'juridico'})).toBe('operacional');});
 it('mantém as características do personagem estáveis',()=>expect(aparencia(a.id)).toEqual(aparencia(a.id)));
 it('permite entrar em sala com teclado e abrir o agente',()=>{const sala=vi.fn(),agente=vi.fn();render(<PlantaEscritorio agentes={[a]} execucoes={[]} sala="diretoria" selecionarSala={sala} selecionarAgente={agente}/>);fireEvent.keyDown(screen.getByRole('button',{name:'Entrar em Marketing'}),{key:'Enter'});expect(sala).toHaveBeenCalledWith('marketing');fireEvent.click(screen.getByRole('button',{name:'Abrir agente Sofia'}));expect(agente).toHaveBeenCalledWith(a);});
});
describe('Canal real',()=>{
 it('envia a mensagem ao executor e atualiza o histórico',async()=>{vi.mocked(chamarEscritorio).mockResolvedValue({ok:true});const reload=vi.fn().mockResolvedValue(undefined);render(<ChatEscritorio agentes={[a]} execucoes={[]} mensagens={[]} recarregar={reload}/>);fireEvent.change(screen.getByLabelText('Sua mensagem ao agente'),{target:{value:'O que precisa da minha atenção?'}});fireEvent.click(screen.getByRole('button',{name:'Enviar'}));await waitFor(()=>expect(chamarEscritorio).toHaveBeenCalledWith({acao:'conversar',agente_id:a.id,texto:'O que precisa da minha atenção?'}));await waitFor(()=>expect(reload).toHaveBeenCalled());});
 it('identifica registros automáticos e não interpreta HTML da mensagem',()=>{render(<ChatEscritorio agentes={[a]} execucoes={[]} mensagens={[{id:'1',agente_id:a.id,destinatario_id:null,usuario_id:null,execucao_id:null,origem:'sistema',texto:'<script>instrução não confiável</script>',criado_em:'2026-11-01T16:00:00Z'}]} recarregar={vi.fn()}/>);expect(screen.getByText('Registro automático da execução')).toBeInTheDocument();expect(screen.getByText('<script>instrução não confiável</script>')).toBeInTheDocument();expect(document.querySelector('script')).toBeNull();});
});

describe('Canais individuais',()=>{
 it('mostra apenas registros ao selecionar uma rotina nativa',()=>{
  render(<ChatEscritorio agentes={[a,{...a,id:'monitor',nome:'Monitor DJEN',slug:'monitor-djen',executor:null}]} execucoes={[]} mensagens={[]} recarregar={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:/Monitor DJEN/}));
  expect(screen.queryByLabelText('Sua mensagem ao agente')).not.toBeInTheDocument();
  expect(screen.getByText(/Este canal mostra os registros da rotina automática/)).toBeInTheDocument();
 });
 it('não direciona a pergunta de um agente pausado para outro analista',()=>{
  render(<ChatEscritorio agentes={[a,{...a,id:'pausado',nome:'Analista pausado',ativo:false}]} execucoes={[]} mensagens={[]} recarregar={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:/Analista pausado/}));
  expect(screen.queryByRole('button',{name:'Enviar'})).not.toBeInTheDocument();
 });
});
