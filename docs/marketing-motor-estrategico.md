# Motor estratégico de Marketing

Juliana autorizou a instalação do ajuste na função compartilhada `motor-missoes` e a ampliação da pesquisa automática em 08/11/2026. A implantação preservou os arquivos em produção que não participavam da alteração. As mudanças novas atendem apenas ferramentas/rotinas de Marketing; não houve disparo manual do motor global nem mudança de orçamento.

## Rotina

- Alex: diagnóstico diário às 07:50.
- Theo: relatório de resultados às 08:00 nos dias úteis.
- Bia → Theo → Camila → Vinícius: pesquisa de referências, mercado, estratégia, conteúdo e brief às 08:30 nos dias úteis.
- Camila → Vinícius: produção editorial independente às 09:00 nos dias úteis. Continua ativa mesmo com falha nas fontes de pesquisa.

Horários de Cuiabá. O cron existente verifica a fila a cada cinco minutos. A ordem entre etapas e os limites de orçamento/tentativas existentes continuam aplicados.

## Pesquisa

`pesquisar_concorrentes_publicos` aceita somente as fontes públicas configuradas, mantém uma busca por tarefa e registra URLs efetivamente retornadas pela ferramenta. A pesquisa é indexada e parcial; não afirma ter coletado comentários do Instagram.

`pesquisar_tendencias_marketing` consulta o RSS público do Google Trends Brasil e três consultas temáticas do Google News. As sete áreas editoriais giram por data civil. Não recebe dados do CRM, URLs arbitrárias ou listas de pessoas. Aceita apenas feeds de até 300 KB, com timeout e sem redirecionamentos; links precisam ser HTTPS. Mantém até cinco notícias recentes por tema e prioriza fontes institucionais, sem chamar esse critério de popularidade.

Os dados distinguem:

- sementes editoriais e palavras sugeridas pelo Theo;
- notícias publicadas nos últimos sete dias;
- temas jurídicos presentes no RSS do Google Trends com data dos últimos dois dias e indicador aproximado original, quando houver.

Não há integração com Keyword Planner. Volume mensal, CPC e concorrência ficam indisponíveis. Notícias e sementes não comprovam crescimento de buscas. Cada fonte tem estado e data próprios; indisponibilidade não vira zero.

Referências: [Keyword Planning](https://developers.google.com/google-ads/api/docs/keyword-planning/overview), [Google Trends](https://developers.google.com/search/docs/monitor-debug/trends-start).

## Estratégia e aprovação

O Theo entrega hipótese de estratégia, palavras-chave, um anúncio proposto, estrutura de artigo e roteiro de vídeo curto. A materialização idempotente cadastra planejamento e ideia de anúncio para aprovação, artigo como pauta em rascunho e roteiro para revisão. Não declara ter produzido mídia ou artigo completo. O painel mostra os links desses registros.

O público proposto é amplo por região ainda a definir ou contexto da busca. Campos de listas e públicos enviados pelo modelo não são usados; nenhum identificador de audiência externa é criado. Não há leitura, exportação ou upload de leads. Dados de saúde, autismo, deficiência, benefício ou outras condições sensíveis não são usados para segmentação ou públicos semelhantes. Relações entre serviços podem orientar informação geral, sem presumir elegibilidade individual.

A aprovação editorial não cria campanha, não define verba nem ativa anúncios. WordPress e TikTok recebem propostas de peças; publicação depende de conexão e fluxo de aprovação próprios.

## Homologação

Confirmados em produção: Bia executando busca pública, Theo gerando estratégia estruturada, registros de planejamento/anúncio/artigo/roteiro e consulta pública de mercado com quatro feeds consultados. A primeira sondagem detectou um registro ausente no validador da nova ferramenta; a correção foi testada e a segunda tentativa concluiu pelo cron normal, preservando o limite existente. Nenhuma campanha, audiência externa, mensagem ou publicação foi criada.

Testes: pesquisa RSS com falha, datas, separação de notícias/tendência, protocolo de ferramentas, descarte de argumentos pessoais; SQL de materialização, idempotência e permissões; produção independente; painel e navegação no Chromium com APIs simuladas. As respostas originais dos agentes permanecem preservadas e seus relatórios exigem revisão humana.
