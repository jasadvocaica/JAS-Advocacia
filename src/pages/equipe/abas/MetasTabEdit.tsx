import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MESES, type Meta } from "../types";
import { formatBRL } from "@/lib/format";

interface Props { membroId: string; cargo: string; }

const ANOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);

const CAMPOS = [
  { key: "meta_tarefas_concluidas", label: "Tarefas concluídas", tipo: "int" },
  { key: "meta_tarefas_no_prazo_pct", label: "% no prazo", tipo: "pct" },
  { key: "meta_prazos_perdidos", label: "Máx. prazos perdidos", tipo: "int" },
  { key: "meta_atendimentos", label: "Atendimentos", tipo: "int" },
  { key: "meta_processos_abertos", label: "Processos abertos", tipo: "int" },
  { key: "meta_processos_fechados", label: "Processos fechados", tipo: "int" },
  { key: "meta_pecas_elaboradas", label: "Peças elaboradas", tipo: "int" },
  { key: "meta_receita_gerada", label: "Receita gerada (R$)", tipo: "money" },
  { key: "meta_nota_minima", label: "Nota mínima (1 a 5)", tipo: "decimal" },
] as const;

export function MetasTabEdit({ membroId, cargo }: Props) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [valores, setValores] = useState<Record<string, string>>({});
  const [metaId, setMetaId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historico, setHistorico] = useState<Meta[]>([]);

  const carregar = async () => {
    setLoading(true);
    const [{ data: meta }, { data: padrao }, { data: hist }] = await Promise.all([
      supabase.from("equipe_metas").select("*").eq("membro_id", membroId).eq("mes", mes).eq("ano", ano).maybeSingle(),
      supabase.from("equipe_metas_padrao").select("*").eq("cargo", cargo as any).maybeSingle(),
      supabase.from("equipe_metas").select("*").eq("membro_id", membroId).order("ano", { ascending: false }).order("mes", { ascending: false }).limit(12),
    ]);
    const base: any = meta ?? padrao ?? {};
    const novo: Record<string, string> = {};
    CAMPOS.forEach((c) => { novo[c.key] = base[c.key] != null ? String(base[c.key]) : ""; });
    setValores(novo);
    setMetaId((meta as any)?.id ?? null);
    setObservacao((meta as any)?.observacao ?? "");
    setHistorico((hist ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [membroId, mes, ano]);

  const salvar = async () => {
    setSaving(true);
    const num = (s: string) => s === "" ? null : Number(s.replace(",", "."));
    const payload: any = { membro_id: membroId, mes, ano, observacao: observacao || null };
    CAMPOS.forEach((c) => { payload[c.key] = num(valores[c.key] ?? ""); });
    let error: any;
    if (metaId) {
      ({ error } = await supabase.from("equipe_metas").update(payload).eq("id", metaId));
    } else {
      ({ error } = await supabase.from("equipe_metas").insert(payload));
    }
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else { toast.success("Metas salvas"); carregar(); }
  };

  const usarPadrao = async () => {
    const { data } = await supabase.from("equipe_metas_padrao").select("*").eq("cargo", cargo as any).maybeSingle();
    if (!data) { toast.info("Nenhuma meta padrão definida para este cargo"); return; }
    const novo: Record<string, string> = {};
    CAMPOS.forEach((c) => { novo[c.key] = (data as any)[c.key] != null ? String((data as any)[c.key]) : ""; });
    setValores(novo);
    toast.success("Valores carregados do padrão do cargo");
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" onClick={usarPadrao}>Usar padrão do cargo</Button>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
          <>
            <div className="grid md:grid-cols-2 gap-3">
              {CAMPOS.map((c) => (
                <div key={c.key}>
                  <Label className="text-xs">{c.label}</Label>
                  <Input
                    inputMode="decimal"
                    value={valores[c.key] ?? ""}
                    onChange={(e) => setValores({ ...valores, [c.key]: e.target.value })}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
            <div>
              <Label className="text-xs">Observação</Label>
              <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Notas, contexto, ajustes do mês..." />
            </div>
            <div className="flex justify-end">
              <Button variant="gold" size="sm" onClick={salvar} disabled={saving}>{saving ? "Salvando..." : (metaId ? "Atualizar metas" : "Salvar metas")}</Button>
            </div>
          </>
        )}
      </CardContent></Card>

      {historico.length > 0 && (
        <Card><CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">Histórico recente</p>
          <div className="space-y-1.5 text-sm">
            {historico.map((h) => (
              <button
                key={h.id}
                className="w-full flex justify-between items-center py-1.5 px-2 rounded hover:bg-muted transition-colors text-left"
                onClick={() => { setMes(h.mes); setAno(h.ano); }}
              >
                <span className="font-medium">{String(h.mes).padStart(2, "0")}/{h.ano}</span>
                <span className="text-xs text-muted-foreground">
                  {h.meta_tarefas_concluidas ?? "—"} tarefas · {h.meta_receita_gerada != null ? formatBRL(h.meta_receita_gerada) : "—"}
                </span>
              </button>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}
