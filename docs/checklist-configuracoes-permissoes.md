# Checklist manual — Permissões do módulo Configurações

Validação guiada de que **apenas gestores** conseguem ler e salvar nas 9 seções.

## Pré-requisitos

Você precisa de **dois** usuários cadastrados no sistema:

| Usuário | Papel | Como criar |
|---------|-------|------------|
| `gestor@teste.com` | `gestor` | Já existe (`ju.contatoaraujo@gmail.com`) ou via tabela `user_roles` |
| `comum@teste.com` | qualquer outro (`advogado`, `estagiario`, …) — **sem** `gestor` | Criar pela tela `/configuracoes/usuarios` |

Confirme os papéis no banco:

```sql
select p.email, ur.role
from profiles p
left join user_roles ur on ur.user_id = p.id
where p.email in ('gestor@teste.com','comum@teste.com');
```

## Seções a validar (9)

1. `/configuracoes/escritorio`
2. `/configuracoes/usuarios`
3. `/configuracoes/portais`
4. `/configuracoes/processos`
5. `/configuracoes/controladoria`
6. `/configuracoes/financeiro`
7. `/configuracoes/documentos`
8. `/configuracoes/integracoes`
9. `/configuracoes/sistema`

---

## Roteiro 1 — Não-gestor NÃO acessa pela UI

Logado como `comum@teste.com`, para **cada** uma das 9 URLs acima:

- [ ] Cole a URL na barra de endereços e tecle Enter.
- [ ] **Esperado:** redireciona para `/sem-permissao` (mensagem "Sem permissão").
- [ ] **Não esperado:** ver formulário, ou tela em branco, ou erro 500.

> Cobre a **Camada 1** (`ProtectedRoute requireGestor`).

## Roteiro 2 — Não-gestor NÃO lê pelo banco

Ainda logado como `comum@teste.com`, abra o DevTools → Console e rode:

```js
const { data, error } = await window.supabase
  .from("configuracoes_sistema")
  .select("secao,chave,valor");
console.log({ count: data?.length, error });
```

- [ ] **Esperado:** `count` igual a 0 e/ou apenas linhas com `publica = true`. Nenhuma chave editável de gestor deve aparecer.
- [ ] Repita filtrando por cada uma das 9 seções:

```js
for (const s of ["escritorio","usuarios","portais","processos","controladoria","financeiro","documentos","integracoes","sistema"]) {
  const { data } = await window.supabase
    .from("configuracoes_sistema").select("chave").eq("secao", s);
  console.log(s, data?.length ?? 0);
}
```

> Cobre a **Camada 2** (RLS no Postgres).

## Roteiro 3 — Não-gestor NÃO grava pelo banco

Ainda como `comum@teste.com`, no console:

```js
const { error } = await window.supabase
  .from("configuracoes_sistema")
  .update({ valor: "hack" })
  .eq("secao", "escritorio")
  .eq("chave", "nome_fantasia"); // qualquer chave existente
console.log(error);
```

- [ ] **Esperado:** `error` não nulo, com mensagem do tipo `new row violates row-level security policy` ou `permission denied`.
- [ ] Repita trocando `secao` para cada uma das 9 seções.

## Roteiro 4 — Gestor consegue normalmente

Faça logout, entre como `gestor@teste.com` e para cada seção:

- [ ] A página carrega sem redirecionamento.
- [ ] Os campos vêm preenchidos.
- [ ] Alterar um valor + clicar **Salvar** mostra toast de sucesso.
- [ ] Recarregar a página mantém o valor alterado.

## Roteiro 5 — Telemetria não dispara falsos positivos

- [ ] No `user_log_atividade`, verifique que tentativas do Roteiro 3 **não** geram registro de `editou_configuracao` (já que o RLS bloqueou antes do trigger).
- [ ] Em `ui_error_logs` (telemetria), as visitas do Roteiro 1 não devem gerar erros 5xx — apenas redirecionamentos 200.

```sql
select tipo, status_http, mensagem, criado_em
from ui_error_logs
order by criado_em desc
limit 20;
```

---

## Cobertura automatizada equivalente

Os mesmos cenários estão cobertos por:

- `src/components/ProtectedRoute.test.tsx` — Roteiro 1 (todas as 9 subrotas).
- `src/hooks/useConfiguracoes.test.tsx` — Roteiros 2 e 3 (todas as 9 seções, lado cliente).

Rode com:

```bash
npx vitest run src/components/ProtectedRoute.test.tsx src/hooks/useConfiguracoes.test.tsx
```
