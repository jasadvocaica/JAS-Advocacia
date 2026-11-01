import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import VpsConnector from './VpsConnector';
import {supabase} from '@/integrations/supabase/client';
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:vi.fn()}}}));
beforeEach(()=>{vi.mocked(supabase.functions.invoke).mockReset();});
describe('Conexão VPS depende de sinal real',()=>{
 it('cria uma credencial sem declarar o worker instalado e permite revogar',async()=>{
  let created=false,active=true;vi.mocked(supabase.functions.invoke).mockImplementation(async(_fn,options)=>{const action=(options?.body as {acao:string}).acao;if(action==='criar'){created=true;return{data:{id:'worker-fixture',token:'0'.repeat(64)},error:null} as never;}if(action==='revogar')active=false;return{data:{workers:created?[{id:'worker-fixture',nome:'HostGator',ativo:active,ultimo_sinal:null,versao:null}]:[]},error:null} as never;});
  render(<VpsConnector/>);await screen.findByText(/Nenhum worker conectado/);fireEvent.click(screen.getByRole('button',{name:'Criar conexão EasyPanel'}));await screen.findByText('Aguardando instalação no EasyPanel');expect(screen.queryByText('Conexão confirmada pelo servidor')).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Revogar conexão'}));await screen.findByText('Revogado');expect(screen.queryByText('Instalar no projeto 3D')).not.toBeInTheDocument();
 });
 it('não considera conectado um worker com sinal antigo',async()=>{
  vi.mocked(supabase.functions.invoke).mockResolvedValue({data:{workers:[{id:'worker',nome:'VPS',ativo:true,ultimo_sinal:new Date(Date.now()-600000).toISOString(),versao:'v1'}]},error:null} as never);render(<VpsConnector/>);await screen.findByText('Sem sinal recente');expect(screen.queryByText('Conexão confirmada pelo servidor')).not.toBeInTheDocument();
 });
});
