# M0 — Auditoria inicial do escritório inteligente

Referência: Especificação Mestra v1.0 de 01/11/2026, aceita por Juliana nesta conversa. Inspeção feita em 01/11/2026. Base do repositório: `882a9fa3727714e4c79c54b52d9730b3fd970d5d`.

## Inventário com evidências

| Área | Existe | Funciona | Estado e evidência |
|---|---|---|---|
| Sistema jurídico | Sim | Sim, com módulos existentes | React/Vite + Supabase; formulários, tabelas e validações de clientes/processos já existem. Nenhuma recriação proposta. |
| OpenAI | Sim | Sim | `assistente_config` habilitada, modelo `gpt-4.1-mini-2025-04-14`; diagnóstico autenticado via endpoint existente confirmou disponibilidade do modelo, HTTP 200, sem gerar texto nem exportar segredo. |
| Orçamento | Sim | Sim | 50.000 tokens/dia, incluindo reservas, no fuso Cuiabá; `respostaComLimite` conta entrada, reserva atomicamente e confirma consumo. Limites financeiros e por usuário permanecem. |
| DJEN e Controladoria | Sim | Sim | Jobs `djen-diario` e `djen-triagem` ativos a cada cinco minutos; últimas execuções observadas com `succeeded`. Fontes e deduplicação existentes preservadas. |
| Agenda | Sim | Sim, conector separado | Job HTTP `djen-agenda` continua pausado; conector Google existente é o executor. Não duplicar coleta ou sincronização. |
| Analista Sofia | Sim | Sim para escopo limitado | `agentes-escritorio`: indicadores agregados → relatório sujeito a revisão; chat consulta sem ferramentas de escrita. Não equivale a um supervisor multiagente. |
| Catálogo de agentes | Sim | Parcial | Cinco registros; Monitor DJEN/Controladoria têm executores nativos, Sofia usa analista operacional. Minutas e relatório diário sem executor configurado não devem ser apresentados como funcionando. |
| Ferramentas de clientes | Sim no formulário | Parcial para agentes | `ClienteForm` já valida CPF, contato, menor e duplicidade; a criação atual parte do formulário. O assistente só oferece `buscar_clientes` e `consultar_cliente`; não existe ferramenta de criação por IA pronta. |
| Central de Comando/Alex | Não no escopo completo | Não | Chat anterior exige analista para perguntas. Roteamento livre, decomposição e delegação automática ainda faltam. M1 adiciona somente a capacidade fixa de cadastro fictício por TXT. |
| Clara/Pia | Não como executores completos | Não | M1 é a primeira fatia da Clara. PDF/DOCX/OCR, importação em lote e consulta pela Pia ficam para M2/M3. |
| Workflows | Sim | Parcial | Templates e etapas ordenadas em `src/pages/fluxos`; não equivalem ao editor por nós com versões imutáveis, fan-out/fan-in e retomada multiagente exigido no documento. |
| Escritório visual | Sim | Sim, como visualização | `/escritorio`, mapa por salas, chat, equipe, revisões e diagnósticos. Estados vêm dos registros. Não prova capacidade de executar uma tarefa nova. |
| Homologação separada | Não confirmada | Não | `list_projects` retornou somente JAS `mzwnljgujheumdslkloc`, ativo e saudável. `list_branches` retornou apenas `main`, com metadado `MIGRATIONS_FAILED` desde 11/10/2026; isso não significa que o banco atual esteja fora do ar. Não criar branch paga nem tentar resetar migrations. |
| VPS | Informada pela usuária | Não verificada | Ambiente acessível não fornece identidade SSH/VPS, host nem serviços verificáveis. Não foi presumida conexão, backup ou deploy de workers. |
| Skills de terceiros | Não como gerenciador | Não | Não foram instalados nem executados pacotes do documento ou do repositório de referência. |

## Segurança observada

- Advisors: tabela de reserva de tokens com RLS sem política, intencional para uso exclusivo do backend. Diversos avisos de visibilidade de schema GraphQL autenticado não comprovam vazamento de linhas; autorizações/RLS precisam ser avaliadas por módulo.
- O advisor aponta `comercial_responsaveis_autorizados()` como chamável por `anon` e `SECURITY DEFINER`. A definição foi lida: contém filtro `is_interno_ativo(auth.uid())`. Não foi constatada leitura anônima de perfis por essa inspeção. Recomenda-se revisar o grant em uma alteração própria, sem mudar permissões de módulos durante M1. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Proteção de senha vazada está desativada segundo advisor; alteração de Auth não foi feita neste marco. Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Índice único `clientes_cpf_cnpj_unico_idx` existe no cadastro de produção. M1 deve manter prevenção de duplicidade também sob concorrência e respeitar revisão de divergências.

## Sequência mínima

1. M1: TXT fictício → tarefa persistente → Clara → evidências e validações → prévia → aprovação → cadastro isolado. Nada de clientes reais ou escrita em `public.clientes`.
2. Habilitar a chamada real de IA somente no ambiente de homologação aprovado, usando o mesmo teto global. Não chamar um mock de teste real.
3. M2: documentos e divergências entre arquivos; M3: importação/consulta com fontes oficiais e revisão; M4: Alex e roteamento amplo; M5: orquestração versionada; M6: VPS após acesso verificado; M7/M8: expansão e UI.

## Limite de implantação adotado

A seção 20 da especificação determina: “Não avance para mudanças destrutivas ou produção sem aprovação.” Por isso, a migração M1 e o novo executor são preparados e testados localmente antes de qualquer instalação no projeto ativo. A alternativa revisável é um schema `homologacao`, sem exposição na API pública e sem dados copiados, mais uma função dedicada que usa a OpenAI já configurada no servidor. Sua instalação precisa de confirmação do ambiente, pois o único projeto disponível é o JAS de produção.

Nenhuma tabela de clientes de produção foi alterada durante esta auditoria. Não foram lidos, exportados ou solicitados valores de chaves, tokens ou senhas.

## Atualização após autorização de homologação

Após a auditoria, Juliana autorizou explicitamente instalar o schema privado de homologação e o executor Clara no projeto JAS. A instalação e o teste real foram concluídos, com 503 tokens e um cadastro fictício, sem mudança na contagem de clientes de produção. A ausência de projeto Supabase separado e de acesso verificado à VPS continua registrada; a alternativa isolada no JAS foi escolhida pela usuária. Evidências completas: `docs/clara-m1-operacao.md`, seção de homologação real.
