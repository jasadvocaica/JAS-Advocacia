# Auditoria de RLS — Supabase

Última revisão: 2026-05-14

## Estado geral

- **Todas as tabelas em `public` têm RLS habilitada e ao menos uma policy.**
- **Nenhuma policy `USING(true)` ou `WITH CHECK(true)` em INSERT/UPDATE/DELETE.**
- **Nenhuma função `SECURITY DEFINER` em `public` é executável por `anon`.**

## Políticas `USING(true)` restantes (intencionais)

Todas restritas ao role **`authenticated`** e **somente SELECT** sobre dados de
referência compartilhados pela equipe — não contêm PII.

| Tabela | Conteúdo | Justificativa |
|---|---|---|
| `checklist_diligencias` | Itens do checklist por diligência | Compartilhado entre toda a equipe interna |
| `datajud_regras_acao` | Regras de classificação Datajud | Tabela de configuração lida em todas as telas |
| `doc_variaveis_customizadas` | Variáveis para templates de documentos | Lista compartilhada de variáveis |
| `equipe_metas_padrao` | Metas-padrão da equipe | **Antes era `public` → corrigido p/ `authenticated`** |
| `feriados` | Feriados nacionais/locais | Calendário público |
| `fluxo_etapas_template` | Etapas dos templates de fluxo | Lida ao instanciar fluxos |
| `processo_status` / `status_processo` | Enum legível de status | Reference data |
| `processos_tags` / `tags` | Tags livres para processos | Compartilhadas pela equipe |
| `tipos_prazo` | Tipos de prazo do controle | Reference data |

## Caso especial — `auth_login_eventos`

INSERT permitido para `anon` + `authenticated`, mas com `WITH CHECK` validando
combinação de `auth.uid()` × `user_id`. **Intencional**: precisa registrar
tentativas de login com falha (sem sessão) para auditoria.

## Funções `SECURITY DEFINER`

- `EXECUTE` revogado de `anon` e `public` em **todas** (~70 funções).
- Mantido para `authenticated`. Cada função valida internamente `auth.uid()`,
  `is_gestor()` e/ou `has_permission(...)`.
- Trigger functions não dependem de grant — executadas pelo dono da função.

## Pontos não tratados (aceitos por contexto de produto)

- **Buckets públicos com listing**: `avatars` e similares — necessário para
  exibir imagens em portais externos.
- **OTP expiry / Password HIBP**: configuração de Auth, não de RLS. Pode ser
  ativada em **Cloud → Users → Auth Settings** quando desejado.

## Como reauditar

```sql
-- 1. Tabelas sem RLS ou sem policies
SELECT 'RLS_OFF', tablename FROM pg_tables t WHERE schemaname='public'
  AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE n.nspname='public' AND c.relname=t.tablename AND c.relrowsecurity)
UNION ALL
SELECT 'NO_POLICIES', c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname);

-- 2. Policies permissivas em mutações
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND cmd IN ('UPDATE','DELETE','INSERT','ALL')
  AND (qual='true' OR with_check='true');

-- 3. Funções SECURITY DEFINER expostas a anon
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE');
```
