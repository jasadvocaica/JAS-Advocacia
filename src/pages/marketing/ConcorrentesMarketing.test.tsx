import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import ConcorrentesMarketing,{normalizarConcorrente} from './ConcorrentesMarketing';
const mock=vi.hoisted(()=>({rpc:vi.fn(),gestor:true,sucesso:vi.fn(),erro:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'gestora-teste'},isGestor:mock.gestor})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('sonner',()=>({toast:{success:mock.sucesso,error:mock.erro}}));
const fontes=['https://www.instagram.com/referencia/','https://example.org/'];
function abrir(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ConcorrentesMarketing/></QueryClientProvider>);}
beforeEach(()=>{cleanup();mock.gestor=true;mock.rpc.mockReset();mock.erro.mockReset();mock.sucesso.mockReset();mock.rpc.mockImplementation(async(_:string,p?:{_fontes:string[]})=>({data:{fontes:p?._fontes??fontes,pode_configurar:true},error:null}));});
describe('cadastro de concorrentes',()=>{
 it('mostra as fontes já usadas pela Bia e permite localizar um perfil',async()=>{abrir();expect(await screen.findByText('@referencia')).toBeInTheDocument();expect(screen.getByText('2 de 40 fontes cadastradas')).toBeInTheDocument();fireEvent.change(screen.getByLabelText('Buscar concorrente'),{target:{value:'example'}});expect(screen.queryByText('@referencia')).not.toBeInTheDocument();expect(screen.getByText('example.org')).toBeInTheDocument();});
 it('cadastra um novo perfil preservando as fontes atuais da pesquisa',async()=>{abrir();fireEvent.click(await screen.findByRole('button',{name:'Novo concorrente'}));fireEvent.change(screen.getByLabelText('Perfil ou site público'),{target:{value:'@novo.perfil'}});fireEvent.click(screen.getByRole('button',{name:'Cadastrar concorrente'}));await waitFor(()=>expect(mock.sucesso).toHaveBeenCalled());expect(mock.rpc).toHaveBeenCalledWith('mkt_rotinas_ia',{_fontes:[...fontes,'https://www.instagram.com/novo.perfil/']});expect(await screen.findByText('@novo.perfil')).toBeInTheDocument();});
 it('impede perfil duplicado mesmo sem www e com grafia diferente',async()=>{abrir();fireEvent.click(await screen.findByRole('button',{name:'Novo concorrente'}));fireEvent.change(screen.getByLabelText('Perfil ou site público'),{target:{value:'https://instagram.com/REFERENCIA'}});fireEvent.click(screen.getByRole('button',{name:'Cadastrar concorrente'}));await waitFor(()=>expect(mock.erro).toHaveBeenCalledWith('Esse perfil ou site já está cadastrado.'));expect(mock.rpc.mock.calls.every(c=>c[1]===undefined)).toBe(true);});
 it('mantém cadastro restrito à gestora',async()=>{mock.gestor=false;abrir();await screen.findByText('@referencia');expect(screen.queryByRole('button',{name:'Novo concorrente'})).not.toBeInTheDocument();});
 it('exibe falha sem afirmar que a lista está vazia',async()=>{mock.rpc.mockResolvedValue({data:null,error:new Error('Sem permissão')});abrir();expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');expect(screen.queryByText(/Nenhum concorrente cadastrado/)).not.toBeInTheDocument();});
 it('normaliza perfis e rejeita fontes privadas, credenciais e parâmetros',()=>{expect(normalizarConcorrente('@Novo.Perfil')).toBe('https://www.instagram.com/novo.perfil/');for(const fonte of ['http://example.org/','https://127.0.0.1/','https://login:senha@example.org/','https://exemplo.local/','https://example.org/?token=teste','https://instagram.com/'])expect(()=>normalizarConcorrente(fonte)).toThrow();});
});
