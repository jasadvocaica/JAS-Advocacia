import {render,screen} from '@testing-library/react';
import {describe,it,expect} from 'vitest';
import {ConteudoPublicacao,textoPublicacao} from './ConteudoPublicacao';
describe('leitura das intimações',()=>{
 it('mostra parágrafos e destaque sem código HTML',()=>{const {container}=render(<ConteudoPublicacao texto='<p>Intimação <strong>prazo de 15 dias</strong></p><p>Segundo parágrafo.</p>'/>);expect(container.querySelectorAll('p').length).toBe(2);expect(screen.getByText('prazo de 15 dias').tagName).toBe('STRONG');expect(container.textContent).not.toContain('<p>');});
 it('decodifica HTML escapado',()=>{render(<ConteudoPublicacao texto='&lt;p&gt;Intimação &amp; ciência&lt;/p&gt;'/>);expect(screen.getByText('Intimação & ciência').tagName).toBe('P');});
 it('descarta conteúdo ativo, atributos e URLs',()=>{const {container}=render(<ConteudoPublicacao texto='<script>roubar()</script><p onclick="roubar()" style="display:none">Ciência</p><img src="https://evil.invalid/x" onerror="roubar()"><a href="javascript:roubar()">link</a><iframe src="https://evil.invalid"></iframe>'/>);expect(container.querySelector('script,img,iframe,a,[onclick],[style]')).toBe(null);expect(container.textContent).not.toContain('roubar');expect(screen.getByText('Ciência')).toBeTruthy();});
 it('preserva texto simples e limpa HTML em resumos e tarefas',()=>{expect(textoPublicacao('<p>Prazo <b>15 dias</b></p><script>codigo</script><p>Conferir.</p>')).toBe('Prazo 15 dias\nConferir.');expect(textoPublicacao('Prazo de 15 dias.')).toBe('Prazo de 15 dias.');});
});
