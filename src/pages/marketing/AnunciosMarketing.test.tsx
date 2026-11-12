import {beforeEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import AnunciosMarketing from './AnunciosMarketing';
import type {Item} from './model';
const m=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn(),gestor:true}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'gestora'},isGestor:m.gestor})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:m.rpc,functions:{invoke:m.invoke}}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const ideia={id:'ideia',titulo:'Proposta PJ',status:'aguardando_aprovacao',dados:{tipo_peca:'rascunho_anuncio',titulo_anuncio:'Documentos do contrato',texto:'Texto educativo',criativo_proposto:'Imagem de documentos organizados',orcamento_sugerido:'120'}} as unknown as Item;
function abrir(){render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><AnunciosMarketing itens={[ideia]}/></QueryClientProvider></MemoryRouter>);}
beforeEach(()=>{cleanup();m.gestor=true;m.rpc.mockReset();m.invoke.mockReset();m.rpc.mockResolvedValue({data:{planos:[],operacoes:[]},error:null});m.invoke.mockResolvedValue({data:{contas:[],escrita_habilitada:true},error:null});});
it('torna propostas existentes visíveis e preenche o plano sem enviar à Meta',async()=>{abrir();await screen.findByText('Documentos do contrato');expect(screen.getByText('Imagem de documentos organizados')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Montar campanha com esta ideia'}));expect(screen.getByLabelText('Título do anúncio')).toHaveValue('Documentos do contrato');expect(screen.getByLabelText(/Orçamento TOTAL/)).toHaveValue(120);expect(screen.getByRole('button',{name:'Revisar envio pausado'})).toBeDisabled();expect(m.invoke.mock.calls.every(c=>c[1].body.acao==='ads_contexto')).toBe(true);});
it('salva um rascunho incompleto sem tratar como campanha criada',async()=>{m.rpc.mockImplementation(async(a,p)=>({data:p?._acao==='salvar'?{id:'plano',versao:1,dados:p._payload.dados}:{planos:[],operacoes:[]},error:null}));abrir();fireEvent.click(await screen.findByRole('button',{name:'Montar campanha com esta ideia'}));fireEvent.click(screen.getByRole('button',{name:'Salvar plano interno'}));await waitFor(()=>expect(m.rpc).toHaveBeenCalledWith('mkt_ads',expect.objectContaining({_acao:'salvar'})));expect(m.invoke.mock.calls.every(c=>c[1].body.acao==='ads_contexto')).toBe(true);});
it('lista exige declarações antes de permitir carregar CSV',async()=>{abrir();fireEvent.click(screen.getByRole('button',{name:'Públicos e listas'}));expect(screen.getByLabelText('Lista de contatos CSV')).toBeDisabled();expect(screen.getByRole('button',{name:'Revisar criação e envio da lista'})).toBeDisabled();});
it('não consulta dados nem mostra controles para outro perfil',()=>{m.gestor=false;abrir();expect(screen.getByText(/restritos à gestora/)).toBeInTheDocument();expect(m.rpc).not.toHaveBeenCalled();expect(m.invoke).not.toHaveBeenCalled();});
