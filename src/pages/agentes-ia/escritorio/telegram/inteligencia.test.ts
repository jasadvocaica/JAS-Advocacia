import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {consultaDireta,pedidoInterpretacao,validarDecisao,textoAndamento} from '../../../../../supabase/functions/telegram/inteligencia';
import {validarAudio,caminhoAudio,lerAudioLimitado,MAX_AUDIO_BYTES} from '../../../../../supabase/functions/telegram/audio';
import {interpretarPedido,processarPedidos,transcreverPedido} from '../../../../../supabase/functions/telegram/pedidos';
import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
const agentes=[{id:'manu',nome:'Manu',sala:'diretoria'},{id:'bia',nome:'Bia',sala:'marketing'},{id:'camila',nome:'Camila',sala:'marketing'}];
const entrada={id:'pedido',reserva:'lease',usuario_id:'dona',chat_id:123,tipo:'texto',texto:'Pesquise pejotização e prepare uma pauta',audio:null};
const plano={tipo:'marketing',titulo:'Pejotização',objetivo:'Pesquisar e preparar uma pauta original',agentes:['bia','camila'],resposta:''};
beforeEach(()=>vi.stubGlobal('AbortSignal',{timeout:()=>new AbortController().signal}));
afterEach(()=>vi.unstubAllGlobals());
describe('conversa natural e áudio',()=>{
 it('valida a equipe real e impede tarefas de outro usuário ou sem redação',()=>{
  expect(validarDecisao(plano,agentes).agentes).toEqual(['bia','camila']);
  expect(()=>validarDecisao({...plano,agentes:['desconhecido']},agentes)).toThrow();
  expect(()=>validarDecisao({...plano,agentes:['bia']},agentes)).toThrow('marketing_sem_redacao');
  expect(()=>validarDecisao({...plano,agentes:['camila','camila']},agentes)).toThrow();
 });
 it('mantém contexto para uma confirmação, sem dar ao modelo ferramenta de execução',()=>{
  const p=pedidoInterpretacao('Pode fazer',{agentes,dialogo:[{texto:'Quero uma pauta sobre pejotização',resposta:'Vou preparar uma pauta.'}]},'modelo');
  expect(JSON.stringify(p.input)).toContain('pejotização');expect(p).not.toHaveProperty('tools');expect(p.instructions).toContain('Publicações'.toLowerCase().slice(0,6));
 });
 it('consulta números e andamento sem inventar métricas ou usar IA',()=>{
  expect(consultaDireta('Quantos leads temos hoje?')).toBe('resumo');expect(consultaDireta('Como está meu pedido?')).toBe('andamento');
  expect(consultaDireta('Crie uma pauta sobre pejotização')).toBeNull();
  expect(textoAndamento([{titulo:'Pauta',estado:'aberta',etapas:[{agente:'Bia',estado:'executando'}],materiais:0}])).toContain('Bia: em execução');
 });
 it('reserva e confirma o custo antes de interpretar a resposta da IA',async()=>{
  const rpc=vi.fn(async(nome:string)=>({data:nome==='ia_reservar'?{ok:true}:true,error:null}));
  const fetcher=vi.fn(async(url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify(String(url).endsWith('input_tokens')?{input_tokens:150}:{usage:{input_tokens:150,output_tokens:80},output:[{content:[{type:'output_text',text:JSON.stringify(plano)}]}]})));
  expect((await interpretarPedido({rpc} as unknown as SupabaseClient,entrada,agentes,[],'modelo','fixture',fetcher)).tipo).toBe('marketing');
  expect(rpc).toHaveBeenCalledWith('ia_confirmar',expect.objectContaining({_entrada:150,_saida:80}));
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body??'{}')).store).toBe(false);
 });
 it('não chama geração quando o orçamento recusa',async()=>{
  const rpc=vi.fn(async()=>({data:{ok:false},error:null}));const f=vi.fn(async()=>new Response('{"input_tokens":150}'));
  await expect(interpretarPedido({rpc} as unknown as SupabaseClient,entrada,agentes,[],'modelo','fixture',f)).rejects.toThrow('orcamento_indisponivel');expect(f).toHaveBeenCalledTimes(1);
 });
 it('valida áudio antes de baixar e bloqueia caminhos ou tamanhos arbitrários',async()=>{
  expect(()=>validarAudio({file_id:'a',duration:181,file_size:100})).toThrow();expect(()=>caminhoAudio('../secreto.wav')).toThrow();expect(()=>caminhoAudio('https://externo/audio.wav')).toThrow();
  await expect(lerAudioLimitado(new Response('a',{headers:{'content-length':String(MAX_AUDIO_BYTES+1)}}))).rejects.toThrow('audio_limite');
 });
 it('transcreve OGG com extensão reconhecível e contabiliza segundos reais',async()=>{
  const rpc=vi.fn(async(nome:string)=>({data:nome==='ia_reservar'?{ok:true}:true,error:null}));
  const fetcher=vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>String(url).includes('/file/bot')?new Response(new Uint8Array([1,2,3])):new Response(JSON.stringify({text:'Prepare uma pauta sobre pejotização',duration:12.1})));
  const texto=await transcreverPedido({rpc} as unknown as SupabaseClient,{...entrada,tipo:'audio',audio:{file_id:'arquivo',duration:13,file_size:3}},'manu',{key:()=> 'fixture',token:()=> 'fixture',telegram:async()=>({file_path:'voice/audio.oga'}),fetcher});
  expect(texto).toContain('pejotização');expect(rpc).toHaveBeenCalledWith('ia_reservar',expect.objectContaining({_modelo:'whisper-1',_entrada:23}));expect(rpc).toHaveBeenCalledWith('ia_confirmar',expect.objectContaining({_entrada:13,_saida:0}));
  const form=fetcher.mock.calls[1][1]?.body as FormData;expect((form.get('file') as File).name).toBe('audio.ogg');
 });
 it('não envia outra mensagem quando a resposta tem resultado de transporte incerto',async()=>{
  let reservou=false;const rpc=vi.fn(async(nome:string)=>({data:nome==='telegram_reservar_pedido'?(reservou?null:(reservou=true,{...entrada,texto:'Como está meu pedido?'})):nome==='telegram_contexto_pedido'?{agentes,dialogo:[]}:nome==='telegram_andamento'?[]:nome==='telegram_concluir_pedido'?{resposta:'Sem missões'}:nome==='telegram_usuario'?'dona':true,error:null}));
  const enviar=vi.fn(async()=>{throw Error('transporte');});await processarPedidos({rpc} as unknown as SupabaseClient,{key:()=>'',token:()=>'',telegram:enviar});expect(enviar).toHaveBeenCalledTimes(1);
 });
});
