import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {toast} from '@/hooks/use-toast';
export interface AssistenteMensagem {role:'user'|'assistant';content:string;criado_em:string;fontes?:{titulo:string;rota:string;ferramenta:string;consultado_em:string}[];incompleta?:boolean}
export interface AssistenteConversa {id:string;titulo:string|null;mensagens:AssistenteMensagem[];arquivada:boolean;criado_em:string;atualizado_em:string}
const URL_CHAT=`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistente-chat`;
export function useAssistenteChat(){
 const {user,session}=useAuth();const [conversas,setConversas]=useState<AssistenteConversa[]>([]);const [conversaAtual,setConversaAtual]=useState<AssistenteConversa|null>(null);const [carregandoLista,setCarregandoLista]=useState(false);const [enviando,setEnviando]=useState(false);
 const abortRef=useRef<AbortController|null>(null);const requestRef=useRef<string|null>(null);const generation=useRef(0);
 useEffect(()=>{generation.current++;abortRef.current?.abort();setConversas([]);setConversaAtual(null);setEnviando(false);return()=>{generation.current++;abortRef.current?.abort();};},[user?.id]);
 const carregarConversas=useCallback(async()=>{if(!user)return;const g=generation.current;setCarregandoLista(true);const {data,error}=await supabase.from('assistente_conversas').select('id,titulo,mensagens,arquivada,criado_em,atualizado_em').eq('user_id',user.id).eq('arquivada',false).order('atualizado_em',{ascending:false}).limit(50);if(g!==generation.current)return;if(!error)setConversas((data??[]) as unknown as AssistenteConversa[]);setCarregandoLista(false);},[user?.id]);
 useEffect(()=>{void carregarConversas();},[carregarConversas]);
 const novaConversa=useCallback(()=>{if(enviando)return;setConversaAtual({id:'',titulo:null,mensagens:[],arquivada:false,criado_em:new Date().toISOString(),atualizado_em:new Date().toISOString()});},[enviando]);
 const abrirConversa=useCallback(async(c:AssistenteConversa)=>{if(enviando||!user)return;const g=generation.current;const {data,error}=await supabase.from('assistente_conversas').select('id,titulo,mensagens,arquivada,criado_em,atualizado_em').eq('id',c.id).eq('user_id',user.id).maybeSingle();if(g!==generation.current)return;if(error||!data){toast({title:'Conversa indisponível para as permissões atuais',variant:'destructive'});return;}setConversaAtual(data as unknown as AssistenteConversa);},[enviando,user?.id]);
 const arquivar=useCallback(async(id:string)=>{if(!user||enviando)return;const {error}=await supabase.from('assistente_conversas').delete().eq('id',id).eq('user_id',user.id);if(error){toast({title:'Não foi possível excluir a conversa',variant:'destructive'});return;}setConversas(v=>v.filter(c=>c.id!==id));if(conversaAtual?.id===id)setConversaAtual(null);},[user?.id,enviando,conversaAtual?.id]);
 const enviar=useCallback(async(texto:string,_contextoRota?:unknown)=>{if(!user||!session||abortRef.current||!texto.trim())return;
  const controller=new AbortController();abortRef.current=controller;const id=crypto.randomUUID();requestRef.current=id;const g=generation.current;setEnviando(true);
  const base=conversaAtual;setConversaAtual(v=>({...v,id:v?.id??'',titulo:v?.titulo??null,arquivada:false,criado_em:v?.criado_em??new Date().toISOString(),atualizado_em:new Date().toISOString(),mensagens:[...(v?.mensagens??[]),{role:'user',content:texto,criado_em:new Date().toISOString()}]}));
  try{const resp=await fetch(URL_CHAT,{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({texto,request_id:id,conversa_id:base?.id||null})});const result=await resp.json();if(!resp.ok)throw new Error(result.error??'Falha na integração');if(g!==generation.current)return;setConversaAtual(result.conversa);await carregarConversas();}
  catch(e){if(g!==generation.current)return;const cancel=(e as Error).name==='AbortError';setConversaAtual(v=>v?{...v,mensagens:[...v.mensagens,{role:'assistant',content:cancel?'Geração interrompida. A resposta não foi concluída.':'Não foi possível concluir esta resposta. '+(e as Error).message,criado_em:new Date().toISOString(),incompleta:true}]}:v);if(!cancel)toast({title:'Erro no assistente',description:(e as Error).message,variant:'destructive'});}
  finally{if(g===generation.current){setEnviando(false);abortRef.current=null;requestRef.current=null;}}
 },[user?.id,session,conversaAtual,carregarConversas]);
 const cancelar=useCallback(()=>{if(requestRef.current&&session)void fetch(URL_CHAT,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({acao:'cancelar',request_id:requestRef.current})});abortRef.current?.abort();},[session]);
 return {conversas,conversaAtual,carregandoLista,enviando,novaConversa,abrirConversa,enviar,cancelar,arquivar,recarregar:carregarConversas};
}
