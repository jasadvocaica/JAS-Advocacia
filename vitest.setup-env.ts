/**
 * Variáveis de ambiente mínimas para os testes.
 *
 * O client do Supabase (`src/integrations/supabase/client.ts`) é criado no
 * momento do import e lança `supabaseUrl is required` quando as variáveis
 * VITE_SUPABASE_* não existem. Sem isso, qualquer suíte que importe algo que
 * chegue no client quebra **antes** de rodar qualquer teste.
 *
 * Estes valores são fictícios: os testes não fazem chamadas de rede reais
 * (quando precisam, mockam `supabase.from` / `supabase.auth`).
 * NÃO usar em produção — em produção as variáveis vêm do `.env` / host.
 */
const TEST_SUPABASE_URL = "https://test-project.supabase.co";
const TEST_SUPABASE_KEY = "test-anon-key";

process.env.VITE_SUPABASE_URL ||= TEST_SUPABASE_URL;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= TEST_SUPABASE_KEY;
