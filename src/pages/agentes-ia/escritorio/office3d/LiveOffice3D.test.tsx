import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import LiveOffice3D from './LiveOffice3D';
import {useClaraLive} from './useClaraLive';
vi.mock('./engine',()=>({buildOffice:()=>{throw new Error('WebGL indisponível no teste');}}));
vi.mock('./useClaraLive',()=>({useClaraLive:vi.fn()}));
const fixture={agente_id:'clara-txt-v1' as const,habilitado:true,revisao:'1',servidor_em:new Date().toISOString(),tarefas:[{id:'11111111-1111-4111-8111-111111111111',estado:'awaiting_approval',criado_em:new Date().toISOString(),atualizado_em:new Date().toISOString(),tokens_entrada:100,tokens_saida:50,custo_estimado_usd:.0001,tentativas:1,pendencias_total:1,possui_erro:false,cadastro_confirmado:false,eventos:[]}]};
const abrir=()=>render(<MemoryRouter><LiveOffice3D agentes={[]} execucoes={[]} sala="operacional" selecionarSala={vi.fn()} selecionarAgente={vi.fn()}/></MemoryRouter>);
beforeEach(()=>{localStorage.clear();vi.mocked(useClaraLive).mockReturnValue({snapshot:fixture,error:null,updated:Date.now()});});
describe('Avatar conectado e alternativa sem WebGL',()=>{
 it('mantém o acompanhamento e abre a tarefa para revisão sem aprovar pela cena',()=>{
  abrir();expect(screen.getByText(/Visualização econômica 2D/)).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Abrir agente Clara'}));
  expect(screen.getByText('150')).toBeInTheDocument();expect(screen.getByText('Aguardando sua aprovação · 1 pendência(s)')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Acompanhar avatar'})).toBeDisabled();expect(screen.queryByRole('button',{name:/Aprovar/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link',{name:/Abrir tarefa e revisão/}));expect(localStorage.getItem('jas_clara_m1_tarefa')).toBe(fixture.tarefas[0].id);
 });
 it('sinaliza perda de confirmação em vez de mostrar trabalho como atual',()=>{
  vi.mocked(useClaraLive).mockReturnValue({snapshot:fixture,error:'Sem conexão com o servidor.',updated:Date.now()-20000});abrir();fireEvent.click(screen.getByRole('button',{name:'Abrir agente Clara'}));
  expect(screen.getByText('Acompanhamento indisponível')).toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('animações de trabalho ficam suspensas');
 });
 it('mostra o erro registrado pelo executor sem inventar causa ou conclusão',()=>{
  vi.mocked(useClaraLive).mockReturnValue({snapshot:{...fixture,tarefas:[{...fixture.tarefas[0],estado:'failed',possui_erro:true}]},error:null,updated:Date.now()});abrir();fireEvent.click(screen.getByRole('button',{name:'Abrir agente Clara'}));
  expect(screen.getByText(/O executor registrou um erro/)).toBeInTheDocument();expect(screen.queryByText(/Cadastro confirmado pelo backend/)).not.toBeInTheDocument();
 });
});
