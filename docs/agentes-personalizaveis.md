# Agentes personalizáveis e conexão EasyPanel

## O que foi entregue
Escritório → Contratar agente abre um editor próprio em `/escritorio/equipe/novo`. A equipe e os detalhes dos analistas têm acesso à edição em `/escritorio/equipe/:id/editar`. Perfil, cargo, missão, prompt base, tom, sala, base de conhecimento, ferramentas de leitura e rotina são usados pelo executor real `analista_operacional`.

Novos agentes começam pausados e em execução manual. Salvar perfil ou importar fontes não gera IA. Ativar e escolher uma rotina permite execução paga, respeitando o teto global existente de 50 mil tokens/dia e a revisão humana obrigatória. Os agentes nativos de DJEN/Controladoria e o fluxo Clara continuam separados; o editor não transforma um prompt em autorização de escrita ou habilitação de novas APIs.

Base: até dez fontes TXT/Markdown ou texto colado, 20 mil caracteres por fonte, 60 mil no total; prompt até seis mil caracteres. Busca lexical local seleciona até seis trechos de 1.200 caracteres, sem embeddings pagos. O modelo recebe os trechos como dados não confiáveis, com orientação para citar os identificadores. Não há leitura de PDF, OCR ou navegação por URLs nessa versão.

## Versões, propriedade e segurança
As configurações e o histórico ficam em `escritorio_privado`, sem grants a anon/authenticated, com RLS. RPCs são SECURITY INVOKER, com search_path fixo e EXECUTE exclusivo de service_role. A Edge Function valida a sessão, gestor interno ativo e a supervisora vinculada ao agente.

Salvar exige a revisão atual e preserva as versões anteriores. Alterações de sala e ativação também incrementam a revisão quando há perfil configurado. Em conflito, a tela preserva a edição local até a usuária escolher descartá-la e recarregar. A execução carrega uma configuração uma única vez e registra sua revisão e os identificadores/posições das fontes em entrada; logs não copiam os documentos.

A revisão automática inicialmente recusou o deploy porque o código antigo de mover/alternar não explicitava propriedade. O caminho seguro foi implementado em `escritorio_alterar_agente`, testado com duas supervisoras e então publicado. Execução e conversa também filtram supervisor_id pelo usuário autenticado. Mover agentes nativos não é permitido pelo editor.

## Evidência real
Agente de validação: `8fb69f6f-3f9c-400a-b9c1-7714aa10ce8f`, nome “Modelo · Analista personalizado (validação)”. Execução: `623abdc4-5e9c-468d-8caf-3fdf1bc17624`.

A configuração v1 tinha somente a ferramenta de base de conhecimento habilitada. Uma referência explicitamente fictícia continha o código JAS-PERFIL-2026; o prompt pedia o código presente na fonte sem revelar seu valor. A resposta real incluiu o código e a citação `[manual-validacao]`, distinguindo orientação fictícia de ocorrência real. Consumo confirmado: 363 tokens de entrada + 74 de saída = 437; custo estimado US$ 0,0002636. O relatório ficou aguardando aprovação; não houve aprovação automática ou alteração de clientes, processos, agenda e financeiro. O agente foi pausado após o teste; a configuração atual é v2. Ele permanece como exemplo auditável e editável, sem rotina agendada.

## Conectar a VPS sem SSH
O atalho **Conectar VPS** abre `/escritorio/operacao#conectar-vps`. A supervisora cria uma conexão e copia duas variáveis uma única vez para um Aplicativo do EasyPanel, no projeto `3D`, usando GitHub/main e Dockerfile `deploy/vps/Dockerfile`. O passo a passo fica na própria tela e em `deploy/vps/README.md`.

O token exclusivo do worker é gerado no servidor e aparece apenas na sessão de criação; o banco guarda somente SHA-256. A listagem nunca devolve o hash ou token. Revogar bloqueia novos pulsos. O worker não recebe senha de root, OpenAI, service_role ou segredo cron. Não é proxy de rede, túnel SSH ou acesso administrativo ao servidor.

A cada minuto o serviço envia um pulso autenticado e solicita despacho de até três analistas elegíveis da própria supervisora. A IA roda no Supabase. A reserva existente impede geração duplicada e novas gerações com entrega aguardando revisão. Locks e avanço da próxima execução impedem despacho duplicado junto ao cron nativo, que permanece como contingência. Worker não coleta DJEN nem executa agenda. O job HTTP djen-agenda permanece inativo.

Antes de receber um pulso real, a tela mostra “Aguardando instalação”. Depois de três minutos sem sinal recente, deixa de mostrar conexão confirmada. O healthcheck do contêiner retorna 200 somente depois de pulso confirmado; caso contrário retorna 503. Criar a conexão não instala nem confirma um serviço na VPS.

O acesso SSH foi preparado inicialmente, mas a usuária preferiu um caminho mais simples. Nenhuma autenticação ou instalação foi feita na VPS pelas ferramentas desta conversa. A publicação do serviço no EasyPanel continua pendente; não se afirma que o worker já está funcionando na VPS.

## Verificação
- PostgreSQL descartável: configuração pausada, versões, recusa de revisão antiga, isolamento entre supervisoras, ferramentas permitidas, token incorreto/revogado, segredo ausente da listagem e despacho restrito à supervisora.
- Três sessões concorrentes reais (dois workers e cron) resultaram em um único despacho HTTP elegível.
- Worker Node: healthcheck confirmado/recusado e ausência de credencial nos logs/saúde; imagem Docker construída localmente.
- Navegador com respostas locais: criação de perfil, prompt e fonte, salvar pausado sem geração, temas claro/escuro, celular sem overflow, instalação guiada aguardando pulso e planta com madeira, vidro e avatares distintos. Essas fixtures não são prova de uso de IA; a prova real está na execução acima.
- Migrations alinhadas ao histórico instalado: 20261101201119, 20261101201329 e 20261101201654. Os avisos INFO de RLS sem políticas nas tabelas privadas são intencionais: acesso somente pelo servidor.

Publicação do frontend continua pelo fluxo da usuária: integrar no Git e atualizar a hospedagem. Nada neste PR migra automaticamente a hospedagem atual para a VPS.
