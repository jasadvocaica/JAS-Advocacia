import {describe,expect,it,vi} from 'vitest';
import {FalhaTelegram,enviarResumos,textoResumoOperacao} from '../../../../../supabase/functions/telegram/resumos';
import {executarRodadas,validarParametros} from '../../../../../supabase/functions/_shared/motor';
import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
function banco(valido=true){const rpc=vi.fn(async(nome:string)=>nome==='operacao24h_reservar_envios'?{data:[{id:'envio',reserva:'lease',chat_id:111,dados:{leads_total:2},tipo:'manual'}],error:null}:{data:valido,error:null});return {rpc,db:{rpc} as unknown as SupabaseClient};}
describe('resumos operacionais',()=>{
 it('usa somente contagens conhecidas e horário Cuiabá, sem exportar dados pessoais',()=>{
  const t=textoResumoOperacao({apurado_em:'2026-11-08T13:30:00Z',leads_total:2,nome:'NOME_PRIVADO',telefone:'TELEFONE_PRIVADO'});
  expect(t).toContain('09:30');expect(t).toContain('2 leads comerciais');expect(t).toContain('indisponível');expect(t).not.toMatch(/NOME_PRIVADO|TELEFONE_PRIVADO/);
 });
 it('não envia após revogação do vínculo',async()=>{const {db,rpc}=banco(false);const enviar=vi.fn();await enviarResumos(db,enviar);expect(enviar).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith('operacao24h_confirmar_envio',expect.objectContaining({_estado:'falhou',_erro:'destino_inativo'}));});
 it('registra resultado incerto sem repetir transporte desconhecido',async()=>{const {db,rpc}=banco();const enviar=vi.fn(async()=>{throw new Error('url sensível');});expect((await enviarResumos(db,enviar)).incertos).toBe(1);expect(enviar).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('operacao24h_confirmar_envio',expect.objectContaining({_estado:'incerto',_erro:'telegram_transporte_incerto'}));});
 it('só reagenda rejeição conhecida por limite',async()=>{const {db,rpc}=banco();await enviarResumos(db,async()=>{throw new FalhaTelegram('telegram_http_429',false,120);});expect(rpc).toHaveBeenCalledWith('operacao24h_confirmar_envio',expect.objectContaining({_estado:'pendente',_retry_after:120}));});
 it('confirma o ID real devolvido pelo Telegram',async()=>{const {db,rpc}=banco();expect((await enviarResumos(db,async()=>({message_id:4321}))).enviados).toBe(1);expect(rpc).toHaveBeenCalledWith('operacao24h_confirmar_envio',expect.objectContaining({_estado:'enviado',_mensagem:4321}));});
 it('executa consulta operacional pelo protocolo do motor, sem aceitar usuário arbitrário',async()=>{
  expect(validarParametros('consultar_operacao_continua',{usuario:'outro'})).toEqual({});
  const executar=vi.fn(async()=>({leads_total:2}));
  const r=await executarRodadas({entrada:{},concedidas:['consultar_operacao_continua'],chamarIA:async(rodada)=>rodada===0?{output:[{type:'function_call',call_id:'consulta',name:'consultar_operacao_continua',arguments:'{}'}]}:{output:[{type:'message',content:[{type:'output_text',text:'{"resumo":"Triagem","entrega":"Revisar pendências","pendencias":[]}'}]}]},executar});
  expect(r.ferramentasUsadas).toContain('consultar_operacao_continua');expect(executar).toHaveBeenCalledWith('consultar_operacao_continua',{});
 });
});
