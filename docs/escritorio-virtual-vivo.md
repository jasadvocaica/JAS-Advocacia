# Escritório virtual: operação visível e acesso aos agentes

A interface oferece **Criar agente** no cabeçalho de todas as áreas, além dos atalhos da equipe e da planta. Os cartões dos analistas personalizáveis oferecem **Editar agente**, e o mesmo acesso aparece no acompanhamento lateral e nos detalhes do personagem. O formulário existente continua responsável por salvar perfil, prompt, base de conhecimento, ferramentas e rotina com controle de revisão. Rotinas nativas, como DJEN, são identificadas separadamente e não ganham um prompt que seu executor não utiliza.

A planta e a operação ocupam áreas independentes. A coluna de acompanhamento mostra a equipe cadastrada, os estados das execuções, as entregas para revisão e os passos registrados. Em telas menores, essa coluna fica abaixo da planta; conversas e configuração continuam em suas áreas próprias. O menu claro acompanha o tema claro do escritório, preservando a escolha de tema da usuária.

A cena usa câmera ortográfica, acabamento por departamento, móveis, estantes, mesas individuais e sombras nas qualidades média/alta. O modo econômico continua disponível. Os analistas animam a digitação somente durante execução registrada e com confirmação recente dos dados. Cada estado visual expira após 35 segundos sem atualização ou após dez minutos da execução. Sem confirmação, a indicação de trabalho é suspensa. Movimentos ambientais são decorativos, identificados na interface e respeitam a preferência de reduzir animações. Clara conserva seu acompanhamento próprio de homologação e a alternativa 2D continua disponível quando WebGL não funciona.

Uma entrega pendente oferece revisão em vez de outro disparo, na equipe e na coluna da planta. Não há criação automática de novos agentes, nem ativação automática de modelos, nem aumento do teto de tokens. Este incremento não altera executores, cron, permissões, rotinas DJEN, sincronização da agenda ou configuração da VPS.

## Validação

- 551 testes em 49 arquivos passaram; TypeScript e build foram verificados. Lint dos arquivos alterados sem erros (avisos de Fast Refresh já existentes nos componentes que exportam auxiliares).
- Navegador local, com dados fictícios e conexões externas bloqueadas: cena WebGL carregada, criação por modelo, salvamento, reabertura da configuração após recarregar e edição de prompt confirmados. Desktop e celular sem transbordamento horizontal; sem erros JavaScript nem requisições externas. As capturas da prévia não são evidência de execução em produção.
- Supabase JAS: as funções existentes de criação, edição e leitura de configuração foram exercitadas dentro de uma transação com agente temporário pausado e sem agendamento. Revisões 1 e 2 e releitura do prompt confirmadas; a transação terminou em ROLLBACK. Consulta posterior confirmou zero agentes temporários restantes e os seis agentes originais. Nenhuma geração OpenAI foi executada.
- A validação transacional verifica a persistência no banco, mas não substitui o teste de sessão autenticada da usuária no site publicado. A instalação do frontend depende de publicar a nova `main` na hospedagem; atualizar o worker da VPS não publica o site.
