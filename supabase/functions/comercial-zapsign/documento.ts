import {Document,Packer,Paragraph,TextRun} from 'npm:docx@9.6.1';
import {parseDocument} from 'npm:htmlparser2@10.0.0';
export async function gerarDocx(html:string){
 const raiz:any=parseDocument(html);const paragraphs:Paragraph[]=[];const ignorar=new Set(['script','style','iframe','object','embed','img','svg','math','template']);
 function runs(n:any,bold=false,italics=false):TextRun[]{if(n.type==='text')return [new TextRun({text:n.data,bold,italics,font:'Times New Roman',size:24})];if(ignorar.has(n.name))return [];if(n.name==='br')return [new TextRun({break:1})];return (n.children??[]).flatMap((x:any)=>runs(x,bold||['b','strong'].includes(n.name),italics||['i','em'].includes(n.name)));}
 function blocks(n:any){if(ignorar.has(n.name))return;if(['p','h1','h2','h3','li','tr','blockquote','pre'].includes(n.name)){paragraphs.push(new Paragraph({children:runs(n),spacing:{after:160,line:320}}));return;}if(n.type==='text'&&n.data.trim()){paragraphs.push(new Paragraph({children:runs(n)}));return;}if(n.name==='div'&&/page-break-before/i.test(n.attribs?.style??''))paragraphs.push(new Paragraph({pageBreakBefore:true,children:[]}));(n.children??[]).forEach(blocks);}
 blocks(raiz);if(!paragraphs.length)throw new Error('documento_vazio');
 const buffer=await Packer.toBuffer(new Document({sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1440,bottom:1440,left:1440,right:1440}}},children:paragraphs}]}));
 const bytes=new Uint8Array(buffer);let bin='';for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin);
}
