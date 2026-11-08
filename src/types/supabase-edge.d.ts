// Os testes de código compartilhado com Edge Functions usam a mesma API de tipos
// do pacote local; Deno resolve a URL versionada no ambiente de servidor.
declare module 'https://esm.sh/@supabase/supabase-js@2.45.0' {
 export type {SupabaseClient} from '@supabase/supabase-js';
}
