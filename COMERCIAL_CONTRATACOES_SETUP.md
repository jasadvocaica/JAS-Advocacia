# Comercial — contratações

Acesso: **Comercial → Contratações** (`/comercial/contratacoes`). Configurações: **Modelos e regras** (`/comercial/modelos`), conforme as permissões. Clientes continuam no cadastro central independente. As rotas antigas do CRM foram preservadas.

## Uso

1. Nova contratação: localizar cliente existente ou salvar seus dados no cadastro central; selecionar serviço e pacote aprovado.
2. Preencher objeto, dados exigidos, signatários e honorários. O rascunho salva automaticamente; aguardar a indicação de salvo antes de fechar.
3. Visualizar os arquivos, baixar a prévia DOCX, conferir dados e confirmar a conferência.
4. Somente **Confirmar e enviar para assinatura** cria documentos externos. Copiar os links para envio manual. Não há integração com WhatsApp.
5. Consultar/reconciliar assinaturas. Falhas parciais recuperam apenas arquivos faltantes; respostas incertas bloqueiam novas criações até reconciliação.
6. Todos os arquivos e signatários obrigatórios devem concluir para formalizar. O ambiente sandbox termina como teste, sem gerar trabalho real.
7. Formalização real cria uma tarefa operacional e, com honorários iniciais, uma tarefa para o financeiro preparar a cobrança. Falhas ficam pendentes para nova tentativa, sem duplicação. Nenhuma conta a receber, comissão ou recebimento é lançado automaticamente.

## Banco e função

Migração aplicada: `20261030020720_comercial_contratacoes.sql`. Novas estruturas guardam contratações, versões de pacotes, snapshots de documentos, permissões, condições de comissão e histórico. Reutilizam clientes, usuários, corpos de modelos `doc_modelos`, tarefas da Controladoria e referências financeiras existentes. PDFs assinados ficam no bucket privado `contratacoes`, com acesso por autorização e URLs temporárias.

Edge Function: `comercial-zapsign`; autenticação de usuário validada no handler e segredo separado para webhook. O envio inicia desabilitado, em sandbox. A gestora deve definir permissões, responsáveis operacional/financeiro, prazo interno, checklist e ciclo de documentos.

## Secrets exclusivamente no Supabase

- `ZAPSIGN_SANDBOX_TOKEN`
- `ZAPSIGN_WEBHOOK_SECRET_SANDBOX`
- `ZAPSIGN_PRODUCTION_TOKEN`
- `ZAPSIGN_WEBHOOK_SECRET_PRODUCTION`
- `ZAPSIGN_PRODUCTION_ENABLED=true`: liberação adicional de produção, apenas após validação.
- `ZAPSIGN_REGION=global` (padrão) ou `br`, conforme a conta.

Não adicionar tokens a variáveis VITE, navegador, logs ou repositório. As credenciais internas padrão da Edge Function são fornecidas pelo Supabase.

## Webhook

Configurar no ZapSign, separadamente por ambiente:

`https://mzwnljgujheumdslkloc.supabase.co/functions/v1/comercial-zapsign?webhook=1&ambiente=sandbox`

Para produção, trocar por `ambiente=producao`. Adicionar o header personalizado `X-JAS-ZapSign-Secret` com o segredo correspondente. O handler exige esse segredo e consulta o documento canônico no provedor; não confia no status recebido no corpo. Depois de um teste sandbox autorizado, verificar os estados individuais, PDF assinado e histórico. A consulta manual recupera eventos perdidos. Um documento ainda não encontrado na listagem do provedor não autoriza recriação: a listagem pode estar em cache.

## Pendências para ativação

A Juliana deve fornecer/aprovar os modelos atuais: contrato em um arquivo e procuração com declaração apenas quando aplicável em outro. Configurar campos obrigatórios e signatários por arquivo. Exemplos identificados como teste não podem ser enviados em produção. Modelos aprovados são versionados e seus snapshots preservados.

Confirmar conta, região, plano, capacidade DOCX, webhook e regra efetiva de consumo com o ZapSign. Não foi possível validar a conta/credenciais reais. O contador local é parcial, considera documentos criados pela integração e não comprova consumo do provedor nem inclui arquivos externos. Valores iniciais configuráveis: limite 20, alerta 16. Nenhum upgrade automático.

Formalização manual autorizada exige integração desabilitada, conferência e PDFs assinados de todos os arquivos obrigatórios, com identificação do conferente. Cancelamentos de documentos externos devem ser realizados no provedor e acompanhados por consulta; o sistema cancela diretamente apenas contratações sem envio.

Comissão: estimativa prevista sobre valor fixo conhecido, sem liberação/pagamento. Apuração permanece dependente de recebimentos efetivos no financeiro. Indicadores usam a coorte do período de criação, explicitada na tela; não representam conversão de atendimentos WhatsApp nem faturamento recebido.

## Validação

440 testes Vitest passaram (32 arquivos), incluindo centavos, parcelas, comissão prevista, signatários, respostas incertas, reconciliação sem recriação e salvamento concorrente. Build de produção validado. Edge validada com Deno. `tests/comercial/fluxos.sql` executado em PostgreSQL local isolado, com dados fictícios e rollback, verifica duplicidades, formalização, tarefas, permissões e filtros. A execução integral desse teste na produção não foi concluída pela ferramenta de confirmação; não tratar os testes locais como validação integral do ambiente real. Nenhuma solicitação real de assinatura foi feita e nenhuma franquia de produção foi utilizada.
