# Conectar o projeto EasyPanel ao JAS

Este serviço envia sinais de funcionamento e despacha somente analistas agendados da supervisora que criou a conexão. A execução de IA e o orçamento continuam no Supabase. Não é um túnel SSH nem concede administração da VPS ao Codex.

1. No JAS, abra Escritório → Relatórios e Indicadores → Conectar VPS. Crie a conexão e copie as duas variáveis exibidas uma única vez. Não envie os valores ao chat nem os coloque no Git.
2. No projeto `3D` do EasyPanel, crie um serviço **Aplicativo** chamado `jas-worker`. Fonte GitHub: repositório `jasadvocaica/JAS-Advocacia`, branch `main`, contexto raiz, Dockerfile `deploy/vps/Dockerfile`.
3. Cole as variáveis no campo de ambiente do serviço, mantenha o reinício automático e publique. Porta interna 3000 para o healthcheck; não precisa de domínio público.
4. Volte ao JAS. A conexão só aparece confirmada após receber um pulso autenticado. Sem pulso nos últimos três minutos, o sistema mostra ausência de sinal recente. Antes do primeiro pulso, o estado é aguardando instalação.

A credencial própria do worker fica apenas nas variáveis da VPS; o banco guarda SHA-256. O worker não recebe chaves OpenAI, Supabase service_role ou segredo cron. Revogar pelo JAS interrompe novos despachos desse worker. As rotinas nativas existentes permanecem como contingência: ambos os despachantes usam locks e avançam proxima_execucao antes de liberar os registros. A reserva do executor impede geração duplicada ou nova geração enquanto houver entrega para revisão. DJEN e agenda não são despachados pelo worker.

Não há instalação automática na VPS por este PR. A confirmação depende do pulso do serviço publicado. Logs registram apenas saúde e quantidade de despachos, nunca tokens de conexão ou documentos.
