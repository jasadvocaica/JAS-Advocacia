# Entregas automáticas de Marketing

As conclusões das rotinas `auto-mkt:` passam a gerar registros no Marketing, em vez de permanecerem apenas no histórico técnico. O executor compartilhado não é substituído por esta alteração.

- Camila: pauta aguardando aprovação, com legenda, roteiro e brief; conteúdo vinculado em revisão, sem checklist humano preenchido pela IA.
- Vinícius: brief textual como Roteiro de produção, ligado ao conteúdo da Camila. O registro não comprova geração de vídeo ou imagem.
- Theo e Alex: relatório de análise/diagnóstico em Pesquisas, para revisão. Registrar a análise não declara que os ajustes foram executados.
- Bia: somente registra pesquisa se a tarefa comprovar uso da ferramenta de pesquisa pública. A coleta de comentários de concorrentes continua sem integração homologada.

A pauta gera uma tarefa administrativa de revisão na Controladoria. Sua aprovação encaminha produção/revisão. A aprovação humana final, registrada para a versão exata, encaminha uma tarefa manual de publicação. Nenhum desses gatilhos publica nas redes. Edição cancela execução pendente da versão anterior; edição da pauta suspende produção pendente originada dela. Metas administrativas são descritas como tais e não usam prazos judiciais.

`marketing_privado.ia_entregas` mantém a correspondência por tarefa, evita duplicação e registra códigos sanitizados para entregas inválidas. Não altera a resposta original do agente. O leitor aceita JSON normal ou uma camada adicional de escape. Funções privadas não ficam disponíveis a usuários anônimos/autenticados; as permissões de aprovação existentes permanecem necessárias.

As seis migrações `20261108121026`, `20261108121446`, `20261108121629`, `20261108122201`, `20261108122440` e `20261108122902` foram instaladas em produção. A configuração operacional da rotina original foi atualizada para temas jurídicos por dia útil e entrega editorial estruturada. O agendamento existente permanece responsável pela execução; não houve disparo manual do motor global.

Validação: `node tests/marketing/entregas-ia-sql.mjs`, testes de integração e rotinas existentes, TypeScript. Homologação real da Camila confirmou pauta, conteúdo e tarefa de revisão. Publicação automática, campanha, orçamento, formulário Meta e lead de teste não foram habilitados.
