import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
interface Painel { fontes: string[]; pode_configurar: boolean; rotinas: { slug: string; nome: string; ativa: boolean; hora: string; dias_uteis: boolean; exige_fontes: boolean; proxima_execucao: string | null; ultima_missao_estado: string | null }[]; }
async function consultar(fontes?: string[]) {
  const { data, error } = await supabase.rpc("mkt_rotinas_ia" as never, (fontes ? { _fontes: fontes } : {}) as never);
  if (error) throw error;
  return data as unknown as Painel;
}
export default function RotinasMarketing() {
  const { user, isGestor } = useAuth(); const qc = useQueryClient();
  const [texto, setTexto] = useState(""); const [editando, setEditando] = useState(false);
  const q = useQuery({ queryKey: ["mkt-rotinas-ia", user?.id], enabled: !!user, queryFn: () => consultar(), retry: false });
  useEffect(() => { if (q.data && !editando) setTexto(q.data.fontes.join("\n")); }, [q.data, editando]);
  const salvar = useMutation({ mutationFn: () => consultar([...new Set(texto.split(/\n/).map(s => s.trim()).filter(Boolean).map(s => s.startsWith("@") ? `https://www.instagram.com/${s.slice(1)}/` : s))]),
    onSuccess: () => { setEditando(false); qc.invalidateQueries({queryKey:["mkt-rotinas-ia"]}); toast.success("Fontes e sequência automática atualizadas"); },
    onError: (e: Error) => toast.error(e.message), });
  return <div className="border rounded-lg p-4 space-y-3">
    <h3 className="font-semibold">Rotinas automáticas do Marketing</h3>
    {q.error ? <p role="alert">Não foi possível consultar as rotinas. Confira seu acesso.</p> : <>
      <p className="text-sm text-muted-foreground">Horários de Cuiabá. A execução usa o orçamento de IA existente e pode aguardar saldo. As entregas são cadastradas no Marketing para revisão; as pautas também geram tarefas na Controladoria.</p>
      <ul className="space-y-2 text-sm">{q.data?.rotinas.map(r => <li key={r.slug}><strong>{r.nome}</strong> · {r.ativa ? `${r.dias_uteis ? "Segunda a sexta" : "Todos os dias"}, ${r.hora}` : r.exige_fontes && !q.data?.fontes.length ? "Aguardando fontes públicas" : "Pausada"}{r.ultima_missao_estado && ` · Última missão: ${r.ultima_missao_estado}`}</li>)}</ul>
      {isGestor && q.data?.pode_configurar && <div className="space-y-2">
        <label className="block text-sm">Perfis e sites públicos de referência<Textarea rows={5} maxLength={13000} disabled={salvar.isPending} value={texto} onChange={e => { setEditando(true); setTexto(e.target.value); }} placeholder="Um link HTTPS ou @perfil por linha" /></label>
        <p className="text-xs text-muted-foreground">Até 40 fontes, consultadas em grupos de até oito por rodada. A busca pública pode ter cobertura parcial; nomes, números e resultados exigem evidência. Sem fontes, a produção continua com dados do próprio JAS.</p>
        <Button disabled={salvar.isPending || !editando} onClick={() => salvar.mutate()}>{salvar.isPending ? "Salvando…" : "Salvar fontes e programação"}</Button>
      </div>}
    </>}
  </div>;
}
