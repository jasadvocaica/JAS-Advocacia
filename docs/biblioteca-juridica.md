# Biblioteca de legislação da produção jurídica

A produção pesquisa dispositivos antes de consultar o GPT. O acervo inicial é definido em `scripts/legislacao/catalogo.json`: 30 normas federais, incluindo Constituição, CPC, Código Civil, CDC, CLT, LOAS, benefícios/custeio previdenciários e RPS. Esse catálogo não representa todas as normas do repositório nem todas as leis brasileiras.

## Utilização

Na lateral do editor, **Legislação** mostra a cobertura efetivamente importada. Pesquise por tema ou referência, por exemplo `LOAS art. 20`, `Lei 8.213 art. 86` ou `tutela de urgência`. O filtro permite limitar a uma norma. Cada resultado identifica artigo, fonte oficial declarada, versão do texto, data de captura e hash.

**Usar no contexto** seleciona o dispositivo para a produção. Seu conteúdo é conferido novamente no banco antes de ser enviado ao modelo; o servidor não confia em texto de biblioteca enviado pelo navegador. Se uma fonte selecionada deixou a versão ativa, a geração registra a pendência. Na ausência de seleção, o assistente pesquisa pelo objetivo, pedido e contexto jurídico informado.

A sugestão mostra separadamente as fontes consultadas e aquelas que o modelo declarou utilizar. Referências devolvidas pela IA precisam corresponder a dispositivos efetivamente recuperados; referências inexistentes são recusadas. Textos e versões consultados são salvos com a sugestão e com o histórico da peça. Isso facilita a revisão, mas não comprova por si só correção de cada afirmação do modelo.

## Origem e limitações

- Origem: [ctresb/leis](https://github.com/ctresb/leis), em uma revisão Git identificada. A fonte oficial vem do cabeçalho de cada norma. A Constituição tem tratamento próprio para a nota de origem do Planalto.
- A importação valida domínio oficial brasileiro, formato, limite de tamanho e artigos identificáveis. Não compara automaticamente toda a transcrição com o Diário Oficial. Conversões/OCR podem conter erros.
- Redações tachadas são omitidas da pesquisa; o original permanece preservado. Normas e dispositivos identificados como revogados ou vetados são excluídos da busca ativa.
- A pesquisa usa os textos da versão ativa importada. Não reconstrói automaticamente o direito vigente na data dos fatos. Textos originais e leis de alteração exigem atenção às modificações posteriores.
- Fragmentos longos mantêm artigo e número da parte. A fonte oficial permite conferir a íntegra. Anexos e tabelas não são certificados como integralmente convertidos por este indexador.
- A captura da fonte, a conferência no repositório e a vigência/eficácia jurídica são informações diferentes. A revisão pelo advogado continua necessária.
- A legislação pública fica separada de clientes/processos. A sincronização não envia documentos do escritório ao GitHub. A produção envia ao GPT o contexto autorizado e os dispositivos selecionados/recuperados.

## Atualização e ampliação

O workflow **Atualizar biblioteca jurídica** executa diariamente às **05h23 de Cuiabá**, pode ser disparado pela interface do GitHub e também executa quando o catálogo ou o próprio workflow muda em `main`. Ele verifica as normas do catálogo e as já cadastradas na biblioteca. Conteúdo inalterado não gera outra cópia; alterações criam uma versão imutável e atualizam a pesquisa ativa. Revisões do indexador reprocessam os artigos sem duplicar o texto original; a pesquisa utiliza apenas a revisão ativa.

A gestão pode importar outras normas pela aba Legislação, colando o link do arquivo Markdown em `github.com/ctresb/leis`. O importador restringe URLs/caminhos à origem esperada. Documentos incompatíveis ou sem origem/artigos identificáveis são recusados para conferência. Para ampliar a carga inicial programaticamente, acrescente entradas ao catálogo.

O agendamento usa uma identidade OIDC efêmera do GitHub Actions, validada por assinatura, emissor, audiência, repositório, branch e caminho do workflow. Não existe chave privilegiada do Supabase no GitHub. A função de sincronização usa a credencial de servidor somente depois dessa validação e opera apenas na biblioteca. A importação pela interface exige gestor e mantém RLS do usuário.

## Estrutura

- `jur_normas`: identidade, edição ativa, origem e última conferência.
- `jur_normas_versoes`: texto original e metadados de cada conteúdo SHA-256.
- `jur_dispositivos`: fragmentos por artigo, versão e índice de pesquisa em português.
- `jur_importar_norma`: importação transacional com serialização por norma.
- `jur_pesquisar` e `jur_estado`: leitura sob RLS e permissão de visualizar documentos.
- `biblioteca-juridica`: importação autenticada pela gestão.
- `biblioteca-juridica-sync`: sincronização exclusiva do workflow autorizado.
- `documentos-assistente`: recuperação, instruções de fundamentação e validação das referências declaradas.

Não são gerados embeddings nem contratado outro serviço. A consulta usa pesquisa textual em português e expansão de alguns termos jurídicos; ela pode não encontrar um fundamento descrito de outra forma. A ausência de resultado não significa inexistência de direito ou de norma.

## Validação

```bash
npm run test:legislacao
npm run test:documentos:edge
npx vitest run src/pages/documentos/PecaForm.test.tsx
npm run build
```

Os testes isolam banco, Auth, OIDC e provedores. A implantação ainda deve conferir a carga real e pesquisas como CPC art. 300, LOAS art. 20, CLT art. 818 e Lei 8.213 art. 86. Nenhum teste precisa criar caso de cliente nem deixar documento fictício no banco de produção.

Os atos oficiais são reproduzidos conforme a indicação do próprio projeto (art. 8º, I, da Lei nº 9.610/98). Consulte a [licença e os avisos da origem](https://github.com/ctresb/leis/blob/main/LICENSE). O código deste indexador é próprio; não executa os scripts do repositório de legislação.

## Repositório ativo

A integração pertence a `jasadvocaica/JAS-Advocacia`. A sincronização aceita exclusivamente o workflow desse repositório em `main`; a identidade do repositório antigo não é aceita. As migrações transferidas já foram aplicadas ao mesmo projeto Supabase e não devem ser reaplicadas manualmente.
