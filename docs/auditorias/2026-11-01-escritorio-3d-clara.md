# Escritório 3D vivo — primeiro agente real

## Auditoria e diagnóstico
React 18 / Vite 5 / TypeScript, React Router e componentes Radix. A planta anterior é SVG com projeção isométrica própria: não possui câmera tridimensional ou navegação espacial. Ela é mantida como alternativa econômica quando WebGL não estiver disponível.

No Supabase JAS, a leitura de 01/11/2026 encontrou cinco agentes no catálogo: Redator de minutas, Monitor DJEN, Assistente de Controladoria, Relatório diário e Sofia · Operações. Sofia usa o executor `analista_operacional`; DJEN e Controladoria têm rotinas nativas. O catálogo não representa executores habilitados para todas as missões. Nenhum deles foi excluído, renomeado ou reconfigurado nesta entrega.

Clara é um executor separado, versionado como `clara-txt-v1`, com tarefas/eventos no schema privado `homologacao`. A consulta real encontrou a tarefa `c8f7d8c0-60ef-40ef-a165-4b73d04a0453`, concluída, oito eventos e 320 tokens de entrada + 183 de saída. O resultado real desse teste anterior pode ser consultado no novo acompanhamento, sem gerar IA novamente.

As tabelas de agentes e homologação não estavam publicadas em `supabase_realtime`. A integração inicial usa snapshots autenticados a cada cinco segundos, com backoff em falhas, pausa em aba oculta e atualização ao retornar foco/conexão. Isso é consulta periódica, não WebSocket. Nenhuma tabela privada foi publicada para obter eventos.

Cron ativo: coleta e triagem DJEN a cada cinco minutos, escritório-analistas a cada cinco minutos, além das rotinas existentes de alertas, Datajud, marketing e retenção. `djen-agenda` HTTP permanece inativo; a agenda continua sob o conector existente. O teto global de 50 mil tokens/dia permanece intacto.

A usuária informou HostGator com EasyPanel. Foi informado o painel `wwtcfz.easypanel.host` e o projeto recém-criado `3D`, ainda sem serviço/worker informado. Uma tentativa HTTPS pública foi barrada pelo proxy do ambiente Codex (CONNECT 403), antes de alcançar o servidor. Não foram validados recursos, backups ou execução na VPS; é necessário permitir esse domínio na configuração de rede do ambiente antes de inspecionar o painel. O M1 da Clara continua exigindo disparo explícito; abrir a cena nunca inicia geração ou agenda um worker.

## Entrega inicial implementada
- Motor Three.js carregado apenas na rota da planta; geometria primitiva compartilhada, materiais reutilizados, sem assets 3D externos.
- Doze departamentos claros, divisórias de vidro, madeira, plantas, mesas e equipamentos. A planta antiga continua como fallback 2D.
- Câmera com órbita limitada, deslocamento, zoom, visão geral, foco por departamento e acompanhamento de Clara.
- Avatar da Clara vinculado ao identificador real do executor. Os agentes do catálogo permanecem visíveis e abrem seus detalhes/configurações existentes.
- Estado, tarefa, eventos, pendências, tokens e custo retornados pelo backend. Sem dados de cliente, porcentagens ou conversas inventadas.
- Mudanças confirmadas encaminham o avatar por uma grade navegável com portas, corredores, móveis e posições de outros personagens como obstáculos. O avatar nasce no destino coerente ao restaurar o snapshot; não reproduz eventos antigos.
- Trabalho: deslocamento e digitação durante `running`; espera em revisão; sinalização de conclusão/falha. A disponibilidade visual não significa worker 24h. Sem confirmação recente, ou execução sem avanço há dez minutos, o movimento de trabalho é suspenso.
- Movimento ambiental opcional, identificado e desligado por padrão. Não gera eventos, tokens ou tarefas. Redução de movimento respeita preferência do escritório e do sistema.
- Qualidade alta/média/econômica; pixel ratio limitado, 20/40 FPS máximos, pausa de renderização em aba oculta ou cena fora da tela e descarte de controles/observers/geometrias/materiais/texturas ao sair.

## Contrato de segurança
`clara-acompanhar`: POST com `getUser`, gestor interno ativo e permissão clientes/criar. O UUID da usuária vem exclusivamente da sessão. O corpo não seleciona proprietária. RPC `clara_m1_acompanhar` é SECURITY INVOKER, com search_path fixo e EXECUTE somente para service_role. O schema privado continua sem grants para navegador.

O snapshot retorna até 12 tarefas da própria usuária, estados e eventos (id/estado/horário), totais operacionais e confirmação booleana de cadastro. Não retorna comando, arquivo, texto, nome, CPF, evidências, cliente_id ou mensagem livre de erro. Nenhuma operação de negócio é acionada ao clicar, mover câmera ou seguir um avatar. Revisão continua no fluxo existente e exige aprovação explícita.

## Validação e limites da comprovação
- PostgreSQL descartável: grants, separação entre duas usuárias e ausência de campos pessoais no payload. Testes integrados ao CI junto do fluxo Clara anterior.
- Projeto real: RPC retornou a tarefa concluída anterior e os oito eventos; anon e authenticated sem acesso direto. Endpoint sem sessão retornou 401. Esta etapa não realizou nova geração paga nem novo cadastro.
- Navegador local com respostas controladas: WebGL, câmera, fila, execução, aprovação, conclusão, falha de consulta, restauração ao recarregar, layout móvel e qualidade econômica. Fixtures do navegador não comprovam execução de IA. A prova de execução real é a tarefa auditada acima; a sessão completa de usuária na nova UI deve ser conferida após publicar a hospedagem.
- Testes de caminhos asseguram transições fila/estação/revisão, desvio de personagem e recusa de destino em móvel. Testes de snapshots asseguram identidade, ordenação e reconstrução.

Não estão concluídos: supervisor Alex generalista, delegação Clara/Pia, novos executores para os nomes sugeridos, ingestão de PDF/planilhas, todas as animações humanas avançadas, navmesh com múltiplos agentes móveis, worker contínuo da Clara e validação da VPS. Não há testes de distribuição/colaboração real desses componentes ausentes. A expansão seguirá o primeiro agente funcional, conforme a orientação final do pedido.

## Publicação e operação
A migração de leitura e o endpoint foram instalados no projeto JAS autorizado. A atualização visual segue o fluxo habitual: integrar no Git e Juliana atualizar a hospedagem. Acessar `/escritorio/planta`, abrir Clara e conferir o histórico. Para nova demanda, abrir a Central e usar somente TXT fictício com aprovação, no escopo atual.

Próximo marco de infraestrutura: identificar no EasyPanel o serviço JAS, CPU/RAM, imagem, armazenamento persistente, rede, reinício, healthcheck, logs, scheduler, fila e backups. Não copiar segredos para o frontend. Não duplicar DJEN/agenda. O primeiro worker deverá consumir a fila com reserva atômica e idempotência existente antes de se anunciar execução contínua.

## Verificação final desta entrega
Build de produção e TypeScript aprovados; lint dos novos módulos 3D sem erros. PostgreSQL descartável aprovado. Chromium confirmou WebGL, os estados e a retomada com zero erros de página; largura móvel 390px sem overflow horizontal. O relatório final do CI identifica a suíte completa e os testes de banco/servidor.
