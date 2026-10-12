import ReactMarkdown from 'react-markdown';
import {Link} from 'react-router-dom';
import type {AssistenteMensagem} from '@/pages/assistente/useAssistenteChat';
export function MensagemAssistente({mensagem}:{mensagem:AssistenteMensagem}){
 const fontes=mensagem.fontes??[];
 return <><ReactMarkdown components={{a:({href,children})=>fontes.some(f=>f.rota===href)?<Link to={href!}>{children}</Link>:<span>{children}</span>}}>{mensagem.content||'…'}</ReactMarkdown>
 {mensagem.incompleta&&<p className="text-xs text-amber-700 mt-2" role="status">Resposta incompleta — confira os dados antes de utilizá-la.</p>}
 {!!fontes.length&&<div className="border-t mt-3 pt-2 text-xs space-y-1"><p className="font-semibold">Fontes internas consultadas</p>{fontes.map((f,i)=><Link className="block underline" key={i} to={f.rota}>{f.titulo} · {new Date(f.consultado_em).toLocaleString('pt-BR')}</Link>)}</div>}</>;
}
