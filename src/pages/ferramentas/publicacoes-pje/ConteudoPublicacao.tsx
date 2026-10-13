import {createElement, type ReactNode} from 'react';
const descartados=new Set(['script','style','iframe','object','embed','svg','math','form','input','button','template','noscript']);
const permitidos=new Set(['p','br','strong','b','em','i','u','s','ul','ol','li','blockquote','h1','h2','h3','h4','table','thead','tbody','tr','td','th','hr','pre','code','div','span']);
function documento(texto:string){
 // Alguns registros contêm HTML escapado; decodifica uma vez antes da leitura.
 if(!/<[a-z][\s>]/i.test(texto)&&/&lt;\/?[a-z]/i.test(texto))texto=new DOMParser().parseFromString(texto,'text/html').body.textContent??texto;
 return new DOMParser().parseFromString(texto,'text/html');
}
export function textoPublicacao(texto:string|null|undefined){
 if(!texto)return '';
 const doc=documento(texto);doc.querySelectorAll([...descartados].join(',')).forEach(n=>n.remove());
 doc.querySelectorAll('p,div,li,tr,blockquote,h1,h2,h3,h4,br').forEach(n=>n.append('\n'));
 return (doc.body.textContent??'').replace(/\n{3,}/g,'\n\n').trim();
}
export function ConteudoPublicacao({texto}:{texto:string|null|undefined}){
 if(!texto)return <span>—</span>;
 const doc=documento(texto);
 const render=(node:Node,key:number):ReactNode=>{
  if(node.nodeType===Node.TEXT_NODE)return node.textContent;
  if(node.nodeType!==Node.ELEMENT_NODE)return null;
  const element=node as Element,tag=element.tagName.toLowerCase();if(descartados.has(tag))return null;
  const children=Array.from(node.childNodes).map(render);
  // Só tags de texto/tabela; nenhum atributo, estilo, evento, imagem ou URL externa.
  return permitidos.has(tag)?createElement(tag,{key},children):createElement('span',{key},children);
 };
 return <div className="break-words [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_pre]:whitespace-pre-wrap">{Array.from(doc.body.childNodes).map(render)}</div>;
}
