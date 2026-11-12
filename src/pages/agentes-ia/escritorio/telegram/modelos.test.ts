import {describe,expect,it,vi} from 'vitest';
import {formatarDocumento,modeloRoteiro,modeloTexto,modeloCategoria,modeloOperacional,STATUS_MANU,formatoRoteiro} from '../../../../../supabase/functions/telegram/modelos';
import {enviarDocumento} from '../../../../../supabase/functions/telegram/entregas';
import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {lerEntrega} from '../../../../../supabase/functions/_shared/motor';
describe('padrão oficial Manu',()=>{
 it('preserva entrega estruturada sem transformá-la em object Object',()=>{const r=lerEntrega(JSON.stringify({resumo:'Roteiro',entrega:{titulo:'Documentos',texto_falado:'Texto completo',legenda:'Legenda pronta'},pendencias:[]}));expect(JSON.parse(r.entrega)).toEqual({titulo:'Documentos',texto_falado:'Texto completo',legenda:'Legenda pronta'});});
 it('preserva também o conteúdo editorial retornado diretamente pelo modelo',()=>{const original={titulo:'Tema',roteiro:'Fala integral',legenda:'Legenda pronta'};expect(JSON.parse(lerEntrega(JSON.stringify(original)).entrega)).toEqual(original);});
 it('mantém os seis blocos do roteiro, com fala integral e legenda pronta',()=>{
  const fala='Você está organizando seus documentos? Comece pelo contrato e pelos registros que já possui.';
  const d=modeloRoteiro({titulo:'Documentos',objetivo:'Orientar organização',publico:'Trabalhadores',duracao:'30 segundos — estimativa',gancho:'Guarde estes documentos.',texto_falado:fala,cta:'Salve para consultar depois.',orientacoes_gravacao:'Grave em ambiente silencioso.',legenda:'Organização ajuda na análise individual.',revisao_necessaria:'Conferência jurídica pendente.'});
  const texto=formatarDocumento(d).join('\n');expect(texto).toContain(fala);expect(texto).toContain('6. Legenda pronta');expect(texto).toContain('🟡 Pendente');expect(texto).toContain('<b>');
 });
 it('exige e mostra tela, estratégia e verificação sem presumir pesquisa',()=>{const schema=formatoRoteiro().schema.properties.entrega;for(const campo of ['texto_na_tela','estrategia_comunicacao','verificacao_juridica'])expect(schema.required).toContain(campo);const t=formatarDocumento(modeloRoteiro({texto_na_tela:'Confira seus documentos',estrategia_comunicacao:'Situação concreta para identificação.',verificacao_juridica:'Fonte ainda não consultada; revisão humana pendente.'})).join('');expect(t).toContain('Confira seus documentos');expect(t).toContain('Situação concreta');expect(t).toContain('Fonte ainda não consultada');});
 it('não inventa dado ausente nem confirma prazo informado só pela IA',()=>{
  const d=modeloCategoria('juridico',{prazos_conferidos:'Prazo X',confirmacao_sistema:false});
  expect(formatarDocumento(d).join('')).toContain('Conferência não confirmada');expect(formatarDocumento(modeloRoteiro({})).join('')).toContain('Não informado');
  expect(Object.values(STATUS_MANU)).toEqual(['🟢 Concluído','🟡 Pendente','🔴 Urgente','🔵 Em andamento','⚪ Não verificado']);
 });
 it('separa recebido, previsto, vencido e despesa sem presumir zero',()=>{
  const t=formatarDocumento(modeloCategoria('financeiro',{recebidos:'R$ 100 confirmados na fonte'})).join('');expect(t).toContain('recebidos');expect(t).toContain('previstos');expect(t).toContain('vencidos');expect(t).toContain('despesas');expect(t).toContain('Não informado');
 });
 it('divide texto longo sem cortar HTML, entidade ou emoji, preservando tudo',()=>{
  const original=('Texto <sigiloso> & 🎬\n').repeat(1200);const paginas=formatarDocumento(modeloTexto(original));
  expect(paginas.length).toBeGreaterThan(1);for(const p of paginas){expect(p.length).toBeLessThan(4096);expect(p.match(/<b>/g)?.length).toBe(p.match(/<\/b>/g)?.length);expect(p).not.toContain('<sigiloso>');expect(p).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);}
  expect(paginas.join('').match(/Texto/g)?.length).toBe(1200);
 });
 it('mostra responsáveis e valores reais sem converter indisponibilidade em zero',()=>{const t=formatarDocumento(modeloOperacional({apurado_em:'2026-11-09T14:00:00Z',leads_total:2,responsaveis_tarefas:[{nome:'Equipe',quantidade:3}]})).join('');expect(t).toContain('Equipe: 3');expect(t).toContain('Não disponível');});
 it('envia somente partes ainda não confirmadas e põe botões na última',async()=>{
  const rpc=vi.fn(async(nome:string,args:Record<string,unknown>)=>({data:nome==='telegram_manu_registrar'?'entrega':args._estado?{estado:args._estado}:Number(args._numero)===0?{estado:'enviada',mensagem_id:10}:{estado:'reservada',reserva:'lease'},error:null}));
  const api=vi.fn(async(_metodo:string,_corpo:Record<string,unknown>)=>({message_id:20}));await enviarDocumento({rpc} as unknown as SupabaseClient,api,111,modeloTexto('x'.repeat(8000)),'teste');
  expect(api).toHaveBeenCalled();expect(api.mock.calls.at(-1)?.[1]).toMatchObject({parse_mode:'HTML',reply_markup:{inline_keyboard:expect.any(Array)}});expect(rpc).toHaveBeenCalledWith('telegram_manu_parte',expect.objectContaining({_estado:'enviada',_mensagem:20}));
 });
});
