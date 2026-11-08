import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import InteligenciaMarketing from './InteligenciaMarketing';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'gestora-teste'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
const abrir=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><InteligenciaMarketing/></MemoryRouter></QueryClientProvider>);
beforeEach(()=>{cleanup();mock.rpc.mockReset();});
describe('painel de inteligência',()=>{
 it('mostra primeira coleta pendente sem inventar números',async()=>{mock.rpc.mockResolvedValue({data:{pesquisas:[],estrategias:[],referencias:[]},error:null});abrir();expect(await screen.findByText(/Aguardando a primeira coleta/)).toBeInTheDocument();expect(screen.queryByText(/Volume mensal: 0/)).not.toBeInTheDocument();});
 it('separa termos sugeridos de tendência e sinaliza cobertura parcial',async()=>{mock.rpc.mockResolvedValue({data:{pesquisas:[{item_id:'pesquisa',dados:{consultado_em:'2026-11-08T13:00:00Z',disponivel:false,palavras_semente:[{termo:'conta bloqueada',tema:'Plataformas'}],noticias_recentes:[],temas_em_alta_confirmados:[],fontes:[{tipo:'google_trends',url:'https://trends.google.com/',status:'indisponivel'}]}}],referencias:[],estrategias:[{planejamento_id:'plano',anuncio_id:'ad',artigo_id:null,tiktok_id:null,titulo:'Estratégia · Plataformas',erro:null}]},error:null});abrir();expect(await screen.findByText('conta bloqueada')).toBeInTheDocument();expect(screen.getByText(/fontes públicas ficaram indisponíveis/)).toBeInTheDocument();expect(screen.getByRole('link',{name:'Rascunho do anúncio'})).toHaveAttribute('href','/marketing?item=ad');});
 it('trata resposta inválida como falha, preservando a diferença de ausência de pesquisa',async()=>{mock.rpc.mockResolvedValue({data:{},error:null});abrir();expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível');expect(screen.queryByText(/Aguardando a primeira coleta/)).not.toBeInTheDocument();});
});
