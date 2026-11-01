# Escritório virtual

Acesse `/agentes-ia` pelo menu **Escritório virtual**, com perfil gestor.

Cada mesa representa um agente cadastrado. “Trabalhando” requer execução registrada em andamento; após dez minutos sem confirmação, o painel mostra a interrupção. Os estados e resultados são consultados a cada 15 segundos (4 segundos durante execuções). Atualizar o painel não chama a OpenAI.

## Rotinas disponíveis

- Monitor DJEN: rotina existente, registrada automaticamente na mesa a partir de `pje_sync_log`. Sem nova coleta ou segundo job.
- Assistente de Controladoria: triagem existente, com histórico das publicações efetivamente processadas.
- Analista operacional: contratado no painel com nome, missão e rotina manual, horária, a cada quatro horas ou diária. Produz relatório dos indicadores agregados e exige revisão humana. Não altera tarefas, calcula prazos, envia mensagens ou protocola documentos.
- Agentes antigos sem executor/webhook aparecem como **Precisa configurar**.

A contratação identifica o gestor como supervisor. Somente gestores internos ativos podem contratar, executar ou pausar analistas. O servidor revalida o supervisor nas execuções automáticas. Uma entrega aguardando revisão bloqueia novas análises do mesmo agente. Aprovar ou rejeitar registra a decisão, sem ação externa.

## Execução e custos

`agentes-escritorio` autentica JWT para ações manuais e valida o segredo interno do cron para rotinas. O job `escritorio-analistas` despacha até três analistas vencidos a cada cinco minutos. A reserva da execução usa lock por agente. O worker grava passos, resultado, consumo e revisão nas tabelas existentes. Execuções interrompidas são sinalizadas após dez minutos; reservas financeiras incertas são preservadas.

A API usa `respostaComLimite`, a mesma proteção global do assistente: **50.000 tokens/dia**, incluindo entrada e saída e reservas em andamento; até 1.000 tokens de saída por chamada. Mantém também limites por usuário e financeiros existentes. Contratar mais agentes não aumenta o teto. Ao esgotar limites, a execução registra erro, sem contornar o bloqueio. Relatórios são rascunhos para revisão; interpretações do modelo precisam de conferência.

O contexto inclui somente contagens de tarefas por status e execuções das últimas 24 horas. Não inclui textos de publicações, documentos, nomes ou dados pessoais dos clientes. Missões personalizadas não habilitam ferramentas adicionais.

## Publicação e validação

Backend instalado no Supabase `mzwnljgujheumdslkloc`; frontend deve ser publicado da branch `main` na hospedagem habitual. A função utiliza autenticação própria (`verify_jwt=false`), inclusive para chamadas do cron. Não necessita de novos segredos: reutiliza OpenAI e a validação do cron já configuradas no servidor. O job HTTP `djen-agenda` permanece pausado; o conector Google existente segue como executor da agenda.

Testes: tipos TypeScript e Deno, build Vite, testes de interface e contratos transacionais em PostgreSQL 17. Teste real inicial: Sofia · Operações entregou relatório para revisão, com 420 tokens contabilizados.

## Planta isométrica e canal compartilhado

A interface possui seis salas navegáveis: Diretoria, Operacional, Comercial, Reuniões, Diligências e Marketing. A marca utiliza a logo existente do JAS, azul-marinho, dourado e tons claros. A implementação gráfica é própria; o repositório de referência é um aplicativo local, com licença que restringe redistribuição, e seu código não foi incorporado.

Cada agente possui sala persistida no catálogo. A diretoria pode mover um agente pela ficha, sem mudar habilidades, escopo ou permissões. As salas abrem os módulos reais correspondentes; a sala de reuniões encaminha às entregas para revisão. Salas sem equipe ficam disponíveis para contratação e organização, sem simular funcionários.

O **Canal do escritório** publica eventos reais de entrega, falha e revisão. Registros do Monitor DJEN têm a Controladoria como destinatária. Esses registros são identificados como automáticos; não são conversas inventadas pelo modelo. A instalação recupera os últimos 12 resultados existentes como histórico, preservando suas datas.

A diretoria também pode conversar com analistas ativos. O servidor consulta indicadores atuais e as seis últimas mensagens daquele analista; o histórico é compartilhado entre gestores, conforme indicação na interface. Mensagens da diretoria aceitam até 1.500 caracteres. A resposta é uma consulta sem ferramentas de escrita, limitada pelo mesmo orçamento OpenAI. Resposta e estado final são persistidos juntos em uma transação. Chats não bloqueiam a revisão pendente de relatórios, não adiam a rotina automática e não publicam duplicatas quando já finalizados.

A tabela de mensagens exige gestor interno ativo para leitura. Escritas do navegador são revogadas; apenas o executor grava identidades, destinatários e resultados. Mensagens são exibidas como texto, sem interpretar HTML. Não há integração de Telegram nesta entrega, por orientação de Juliana; a Manu permanece independente.

Validação adicional: navegação e seleção por teclado, envio de chat, apresentação segura de texto, testes PostgreSQL de permissões, encaminhamento e finalização idempotente. Conferência em Chromium nos tamanhos desktop e celular, sem erros de página ou transbordamento horizontal.
