# Claude conectado ao JAS por MCP

## O que ficou pronto

Servidor remoto Streamable HTTP (JSON-RPC com respostas JSON), tela de autorização OAuth e página de conexão/revogação. Funciona como conector remoto no Claude pelo site ou aplicativo; não precisa de instalação local, chave Anthropic ou OPENAI_API_KEY. A conta/plano do Claude deve permitir conectores personalizados.

URL do novo servidor:

https://mzwnljgujheumdslkloc.supabase.co/functions/v1/claude-mcp

Página no sistema: https://app.julianaaraujoadvocacia.com/conectar-claude, também acessível a partir do assistente. A conexão usa a conta existente do escritório; não cria cadastros ou um novo mecanismo de login.

## Configuração ainda necessária no Supabase

Foi verificado que o OAuth Server do projeto JAS está **desativado**. O endpoint MCP está publicado, mas a conexão OAuth real depende desta configuração. Os conectores disponíveis neste ambiente não permitem editar essa configuração de Auth.

Em Supabase JAS → Authentication → OAuth Server:

1. Habilitar OAuth 2.1 Server.
2. Configurar Authorization Path como `/oauth/consent`.
3. Habilitar Dynamic Client Registration para o Claude registrar o cliente.
4. Conferir Site URL: `https://app.julianaaraujoadvocacia.com`. O Supabase combina Site URL e Authorization Path. Se a Site URL atual for diferente e outros fluxos de autenticação dependerem dela, verificar essas dependências antes de alterá-la.

A autenticação OAuth usa PKCE e o gerenciamento de tokens do próprio Supabase. Não colocar tokens em URLs, não fornecer chave administrativa ao Claude e não usar o servidor MCP administrativo do Supabase como conector dos usuários do escritório.

## Conectar no Claude

Configurações → Conectores → Adicionar conector personalizado:

- Nome: JAS Advocacia.
- URL: a URL `claude-mcp` acima.

Ao conectar, entrar no sistema com a conta do escritório, conferir a solicitação e clicar **Autorizar Claude**. A aplicação aceita retorno somente ao callback oficial `https://claude.ai/api/mcp/auth_callback`, evitando redirecionamento para terceiros. O identificador de autorização é preservado quando o login é necessário, sem modificar a página de login existente. Pode-se negar a solicitação ou revogar uma conexão em `/conectar-claude`.

O servidor MCP antigo `mcp-server` e os seus tokens foram preservados para não interromper integrações existentes. Esse servidor antigo oferece ferramentas de escrita e consultas administrativas; a nova conexão deve usar exclusivamente `claude-mcp` para obter o comportamento de leitura desta entrega.

## Permissões e dados

Ferramentas reutilizadas de `assistente-chat/tools.ts`: clientes, processos, prazos, atividades, agenda, diligências e consultas financeiras quando autorizadas. Cada chamada valida a sessão com `getUser`, perfil interno ativo e permissões atuais. Consultas usam o JWT do usuário, sujeitas às mesmas políticas RLS do sistema; não usam service role para consultar dados jurídicos ou financeiros. A service role é usada somente para auditoria mínima e controle operacional de chamadas.

O MCP não oferece operações de criar/editar/excluir/pagar, consulta SQL arbitrária, arquivos pessoais, salários ou conversas privadas. Schemas validam identificadores, filtros e períodos, com até 25 registros por lista e 500 por fonte nos resumos. Resultados contêm fontes internas e indicação de limitações. Os dados consultados são enviados ao Claude; avaliar condições de sigilo e retenção do provedor antes de autorizar.

O transporte MCP é somente de leitura. Os tokens OAuth são emitidos pelo Supabase e obedecem às permissões existentes da conta; não constituem um novo perfil de banco exclusivamente de leitura. A revogação OAuth impede novas renovações; tokens de acesso já emitidos podem permanecer válidos até expirar, conforme as configurações do Supabase.

Auditoria reutiliza `mcp_chamadas_log`: ferramenta admitida, usuário, origem, sucesso e duração; não registra parâmetros nem resultados pessoais desta conexão. Limitação operacional de 30 consultas por usuário por minuto, verificada por janela antes de registrar cada chamada; não é uma reserva transacional de orçamento. Não há custo OpenAI nesta conexão, mas continuam aplicáveis os custos do Claude e da infraestrutura Supabase.

## Segurança e protocolo

Endpoint protegido por bearer no cabeçalho, sem tokens na query string. Descoberta pública em `claude-mcp/.well-known/oauth-protected-resource`; respostas 401 anunciam essa URL em WWW-Authenticate. GET no endpoint MCP autenticado responde 405 porque não há stream de notificações. POST aceita JSON-RPC e retorna JSON; notificações retornam 202. Versões suportadas: 2025-03-26, 2025-06-18 e 2025-11-25. Origens permitidas: Claude e o domínio do escritório; chamadas sem Origin continuam exigindo autenticação. Prompts e resources não expõem dados adicionais.

## Arquivos e validação

Novos arquivos: supabase/functions/claude-mcp/{index,protocol}.ts; src/pages/claude/{OAuthConsent,ConectarClaude}.tsx; teste mcp.test.ts; este documento. Alterações: rotas em App.tsx, link em AssistenteIA.tsx e config.toml. O ponto compartilhado de ferramentas foi reutilizado. Nenhuma migration, novo cadastro ou alteração dos painéis.

Testes: negociação MCP, listagem por permissão, tentativas de escrita/SQL/financeiro negadas, notificações, JSON-RPC inválido e validação de callback. Deno e build validados. Endpoint publicado foi verificado: metadados públicos e rejeição de acesso sem sessão com desafio OAuth. Os dois diagnósticos completos de TypeScript já existentes em Controladoria e Financeiro permanecem documentados em ASSISTENTE_IA_SETUP.md; nenhum erro novo nas páginas Claude.

A autorização real no Claude ainda não foi validada: OAuth do projeto precisa ser habilitado e o usuário precisa aprovar a conexão em sua conta Claude. Publicar código não significa que esse vínculo já esteja estabelecido.

Referências oficiais:

- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://supabase.com/docs/guides/auth/oauth-server/getting-started
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
