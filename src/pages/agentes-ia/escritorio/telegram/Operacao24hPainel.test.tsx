import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const {rpc,invoke,toast}=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn(),toast:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,functions:{invoke}}}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast})}));
import Operacao24hPainel from './Operacao24hPainel';
const painel={config:{telegram_ativo:true,monitor_ativo:true,avisar_mudancas:true,horarios:['09:30','18:00'],ultima_checagem:null},telegram_vinculado:true,monitor_cron_ativo:true,dados:{},envios:[],entregas:[]};
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({data:painel,error:null});});
describe('painel automático',()=>{
 it('permite pausar resumos preservando as demais configurações',async()=>{render(<Operacao24hPainel/>);fireEvent.click(await screen.findByLabelText('Resumos automáticos no meu Telegram'));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('operacao24h_painel',{_dados:{telegram_ativo:false}}));});
 it('não anuncia entrega quando o resultado é incerto',async()=>{invoke.mockResolvedValue({data:{enviados:0,incertos:1,falhas:0},error:null});render(<Operacao24hPainel/>);fireEvent.click(await screen.findByRole('button',{name:'Enviar resumo agora'}));await waitFor(()=>expect(toast).toHaveBeenCalledWith({title:'Entrega sem confirmação; confira o Telegram'}));expect(invoke).toHaveBeenCalledWith('telegram',{body:{acao:'resumo_agora'}});});
 it('não permite enviar sem vínculo privado',async()=>{rpc.mockResolvedValue({data:{...painel,telegram_vinculado:false},error:null});render(<Operacao24hPainel/>);expect(await screen.findByRole('button',{name:'Enviar resumo agora'})).toBeDisabled();});
});
