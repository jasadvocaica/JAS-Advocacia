import {useCallback,useEffect,useRef,useState} from 'react';
import {operar} from './api';
export function useDraft(initial:any,onPersisted:(c:any)=>void){
 const [form,setForm]=useState(initial);const ref=useRef(initial);const revision=useRef({id:initial.id,versao:initial.versao});const tick=useRef(0),saved=useRef(0);const running=useRef<Promise<any>|null>(null);const active=useRef(true);const persisted=useRef(onPersisted);persisted.current=onPersisted;
 const [changed,setChanged]=useState(0);const [state,setState]=useState(initial.id?'salvo':'novo');const [error,setError]=useState('');
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const update=useCallback((patch:any)=>{ref.current={...ref.current,...patch};tick.current++;setChanged(tick.current);setForm(ref.current);setState('pendente');setError('');},[]);
 const save=useCallback(async():Promise<any>=>{
  if(running.current){await running.current;if(saved.current<tick.current)return save();return ref.current;}
  if(saved.current===tick.current&&revision.current.id)return ref.current;
  const currentTick=tick.current;const payload={...ref.current,...revision.current};if(active.current)setState('salvando');
  const request=operar('salvar',payload);running.current=request;
  try{const result=await request;revision.current={id:result.id,versao:result.versao};saved.current=currentTick;ref.current={...ref.current,id:result.id,versao:result.versao,status:result.status,conferida_versao:null};if(active.current){setForm(ref.current);setState(saved.current===tick.current?'salvo':'pendente');persisted.current(result);}return ref.current;}
  catch(e){if(active.current){setState('erro');setError((e as Error).message);}throw e;}
  finally{running.current=null;}
 },[]);
 useEffect(()=>{if(!changed)return;const timer=setTimeout(()=>void save().catch(()=>{}),900);return()=>clearTimeout(timer);},[changed,save]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(saved.current<tick.current||running.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 const acknowledge=useCallback((patch:any)=>{if(patch.versao)revision.current.versao=patch.versao;if(patch.id)revision.current.id=patch.id;ref.current={...ref.current,...patch};setForm(ref.current);},[]);
 return {form,update,save,acknowledge,state,error,dirty:saved.current<tick.current};
}
