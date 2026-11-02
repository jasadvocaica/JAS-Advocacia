import {beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {BibliotecaJuridica} from "./BibliotecaJuridica";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:(...a:unknown[])=>mocks.rpc(...a),functions:{invoke:(...a:unknown[])=>mocks.invoke(...a)}}}));
const fonte={id:"b".repeat(64),norma_id:"cpc",titulo:"Código de Processo Civil",artigo:"Art. 300",trecho:"A tutela de urgência será concedida quando houver elementos que evidenciem a probabilidade do direito.",fonte_oficial:"https://www.planalto.gov.br/cpc",fonte_repositorio:"https://github.com/ctresb/leis/blob/abc/cpc.md",versao_sha:"c".repeat(64),versao_texto:"compilada",capturado_em:"2026-10-13",notas:"",commit:"a".repeat(40),importado_em:"2026-11-02T12:00:00Z"};
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.rpc.mockImplementation(async(nome)=>({data:nome==="jur_estado"?{normas:30,dispositivos:6000,escopo:"Cobertura parcial",catalogo:[]}:[fonte],error:null}));});
describe("biblioteca — pesquisa com fonte e cobertura",()=>{
 it("apresenta a cobertura real e permite selecionar um artigo com fonte",async()=>{
  const adicionar=vi.fn();render(<BibliotecaJuridica gestor={false} readOnly={false} selecionados={[]} onPesquisar={vi.fn()} onAdicionar={adicionar}/>);
  await screen.findByText(/30 normas importadas/);
  fireEvent.change(screen.getByLabelText("Pesquisar fundamentos"),{target:{value:"tutela de urgência"}});fireEvent.click(screen.getByRole("button",{name:"Pesquisar no acervo"}));
  await screen.findByText("Art. 300");expect(screen.getByRole("link",{name:"Fonte oficial"})).toHaveAttribute("href",fonte.fonte_oficial);
  fireEvent.click(screen.getByRole("button",{name:"Usar no contexto"}));expect(adicionar).toHaveBeenCalledWith(expect.objectContaining({versao_sha:fonte.versao_sha,trecho:fonte.trecho}));
  expect(screen.queryByText("Importar outra norma do repositório")).not.toBeInTheDocument();
 });
 it("não interpreta pesquisa vazia como inexistência de direito",async()=>{
  mocks.rpc.mockResolvedValue({data:[],error:null});render(<BibliotecaJuridica gestor={false} readOnly={false} selecionados={[]} onPesquisar={vi.fn()} onAdicionar={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText("Pesquisar fundamentos"),{target:{value:"outra matéria"}});fireEvent.click(screen.getByRole("button",{name:"Pesquisar no acervo"}));
  await waitFor(()=>expect(screen.getByText(/isso não significa ausência de fundamento/)).toBeInTheDocument());
 });
});
