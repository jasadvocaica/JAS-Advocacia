export const MAX_AUDIO_BYTES=5*1024*1024;
export function validarAudio(a:{file_id?:unknown;duration?:unknown;file_size?:unknown}){
 if(typeof a.file_id!=='string'||a.file_id.length<1||a.file_id.length>250||!Number.isSafeInteger(a.duration)||Number(a.duration)<1||Number(a.duration)>180||!Number.isSafeInteger(a.file_size)||Number(a.file_size)<1||Number(a.file_size)>MAX_AUDIO_BYTES)throw Error('audio_limite');
 return {file_id:a.file_id,duration:Number(a.duration),file_size:Number(a.file_size)};
}
export async function lerAudioLimitado(r:Response){
 if(!r.ok||!r.body)throw Error('audio_download');
 const tamanho=Number(r.headers.get('content-length')??0);if(tamanho>MAX_AUDIO_BYTES)throw Error('audio_limite');
 const leitor=r.body.getReader();const partes:Uint8Array[]=[];let total=0;
 while(true){const p=await leitor.read();if(p.done)break;total+=p.value.length;if(total>MAX_AUDIO_BYTES){await leitor.cancel();throw Error('audio_limite');}partes.push(p.value);}
 const bytes=new Uint8Array(total);let offset=0;for(const p of partes){bytes.set(p,offset);offset+=p.length;}return bytes;
}
export function caminhoAudio(caminho:unknown):string{
 if(typeof caminho!=='string'||!/^([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(oga|ogg|mp3|m4a|wav|webm|mp4|mpeg|mpga|flac)$/i.test(caminho)||caminho.includes('..'))throw Error('audio_caminho');return caminho;
}
