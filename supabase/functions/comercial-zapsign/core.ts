export type Ambiente='sandbox'|'producao';
export const API_BASE={sandbox:'https://sandbox.api.zapsign.com.br/api/v1',producao:'https://api.zapsign.com.br/api/v1'};
export function statusDocumento(doc:any,esperados:any[]){
 if(doc.deleted||doc.status==='deleted')return 'cancelado';
 if(['refused','expired','canceled','cancelled'].includes(doc.status))return ({refused:'recusado',expired:'expirado',canceled:'cancelado',cancelled:'cancelado'} as any)[doc.status];
 const assinados=esperados.filter(e=>(doc.signers??[]).some((s:any)=>s.external_id===e.papel&&['signed','assinou'].includes(s.status)&&!!s.signed_at)).length;
 if(esperados.length>0&&assinados===esperados.length&&doc.status==='signed')return 'assinado';
 return assinados>0?'parcialmente_assinado':'criado';
}
export function payloadCriacao(d:any,base64:string){return {name:`${d.tipo==='contrato'?'Contrato de honorários':'Procuração e declaração'} — ${d.contratacao_id}`,base64_docx:base64,lang:'pt-br',external_id:d.id,disable_signer_emails:true,signers:d.signatarios.map((s:any)=>({name:s.nome,...(s.email?{email:s.email}:{}),...(s.telefone?{phone_country:'55',phone_number:String(s.telefone).replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'')}:{}),external_id:s.papel,auth_mode:'assinaturaTela',send_automatic_email:false,send_automatic_whatsapp:false,send_automatic_whatsapp_signed_file:false}))};}
export function tokenValido(v:unknown){return typeof v==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(v);}
export class ZapSign {
 constructor(private key:string,readonly ambiente:Ambiente,private http:typeof fetch=fetch,private region='global'){}
 private get base(){return this.ambiente==='producao'&&this.region==='br'?'https://br.api.zapsign.com.br/api/v1':API_BASE[this.ambiente];}
 async request(path:string,method='GET',body?:unknown){
  const r=await this.http(this.base+path,{method,headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000),redirect:'error'});
  if(!r.ok){const err:any=new Error(`zapsign_http_${r.status}`);err.confirmadamenteNaoCriado=method==='POST'&&[400,401,403,404,413,415,422].includes(r.status);throw err;}
  return await r.json();
 }
 criar(d:any,base64:string){return this.request('/docs/','POST',payloadCriacao(d,base64));}
 async detalhar(token:string){if(!tokenValido(token))throw new Error('token_invalido');return this.request(`/docs/${encodeURIComponent(token)}/`);}
 async reconciliar(externalId:string,desde:string){
  let parcial=false;for(let page=1;page<=50;page++){const r=await this.request(`/docs/?page=${page}&created_from=${encodeURIComponent(desde)}&include_signers=true&sort_order=desc`);const matches=(r.results??[]).filter((d:any)=>d.external_id===externalId);if(matches.length>1)throw new Error('duplicidade_externa_revisar');if(matches.length===1)return {documento:await this.detalhar(matches[0].token),parcial:false};if(!r.next)return {documento:null,parcial:false};parcial=!!r.next;}
  return {documento:null,parcial};
 }
}
export function segredoIgual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;}
export function arquivoPdfValido(bytes:Uint8Array){return bytes.length>5&&bytes.length<=10485760&&new TextDecoder().decode(bytes.slice(0,5))==='%PDF-';}
