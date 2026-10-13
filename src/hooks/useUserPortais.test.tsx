import {useState} from 'react';
import {render,screen,waitFor,fireEvent} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({auth:{user:{id:'u1',email:'teste@exemplo.com'},profile:{ativo:true},roles:['gestor'],loading:false},requests:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>mock.auth}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{mock.requests();const q:any={};for(const k of ['select','eq'])q[k]=()=>q;q.maybeSingle=async()=>({data:null,error:null});return q;}}}));
import {useUserPortais} from './useUserPortais';
function Form(){const [value,setValue]=useState('');return <input aria-label="Cadastro em andamento" value={value} onChange={e=>setValue(e.target.value)}/>;}
function Route(){const {loading}=useUserPortais();return loading?<p>Carregando portal</p>:<Form/>;}
beforeEach(()=>{mock.requests.mockClear();mock.auth={user:{id:'u1',email:'teste@exemplo.com'},profile:{ativo:true},roles:['gestor'],loading:false};});
describe('retorno à aba sem perda de cadastro',()=>{
 it('mantém formulário montado após renovação com novas referências da mesma conta',async()=>{const {rerender}=render(<Route/>);await screen.findByLabelText('Cadastro em andamento');fireEvent.change(screen.getByLabelText('Cadastro em andamento'),{target:{value:'Dados ainda não salvos'}});const count=mock.requests.mock.calls.length;mock.auth={...mock.auth,user:{...mock.auth.user},profile:{...mock.auth.profile},roles:[...mock.auth.roles]};rerender(<Route/>);expect(screen.queryByText('Carregando portal')).toBe(null);expect((screen.getByLabelText('Cadastro em andamento') as HTMLInputElement).value).toBe('Dados ainda não salvos');expect(mock.requests.mock.calls.length).toBe(count);});
 it('revalida quando a conta realmente muda',async()=>{const {rerender}=render(<Route/>);await screen.findByLabelText('Cadastro em andamento');const count=mock.requests.mock.calls.length;mock.auth={...mock.auth,user:{id:'u2',email:'outro@exemplo.com'}};rerender(<Route/>);await waitFor(()=>expect(mock.requests.mock.calls.length).toBeGreaterThan(count));});
 it('revalida quando o perfil perde autorização',async()=>{const {rerender}=render(<Route/>);await screen.findByLabelText('Cadastro em andamento');const count=mock.requests.mock.calls.length;mock.auth={...mock.auth,profile:{ativo:false}};rerender(<Route/>);await waitFor(()=>expect(mock.requests.mock.calls.length).toBeGreaterThan(count));});
});
