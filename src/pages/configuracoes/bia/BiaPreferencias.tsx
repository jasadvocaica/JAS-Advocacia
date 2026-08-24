import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TipoItem = "geral" | "publicacao" | "item_controladoria" | "processo";

interface Pref {
  id?: string;
  tipo_item: TipoItem;
  nivel_autonomia: "sugerir" | "sugerir_confirmar" | "aplicar_auto";
  estilo: "objetivo" | "detalhado" | "formal" | "direto";
  tom: "neutro" | "tecnico" | "didatico";
  prioridade_padrao: "urgente" | "alta" | "media" | "baixa" | "";
  prazo_padrao_dias: number | "";
  instrucoes_extras: string;
}

const TIPOS: { id: TipoItem; label: string; hint: string }[] = [
  { id: "geral", label: "Geral", hint: "Padrão aplicado quando não houver regra específica" },
  { id: "publicacao", label: "Publicações", hint: "Intimações, despachos, decisões do PJe/DJe" },
  { id: "item_controladoria", label: "Controladoria", hint: "Prazos, diligências e tarefas" },
  { id: "processo", label: "Processos", hint: "Análises e checklist de processos" },
];

function vazio(tipo: TipoItem): Pref {
  return {
    tipo_item: tipo,
    nivel_autonomia: "sugerir_confirmar",
    estilo: "objetivo",
    tom: "neutro",
    prioridade_padrao: "",
    prazo_padrao_dias: "",
    instrucoes_extras: "",
  };
}

export default function BiaPreferencias() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<TipoItem | null>(null);
  const [prefs, setPrefs] = useState<Record<TipoItem, Pref>>({
    geral: vazio("geral"),
    publicacao: vazio("publicacao"),
    item_controladoria: vazio("item_controladoria"),
    processo: vazio("processo"),
  });

  useEffect(() => {
    void carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("bia_preferencias")
        .select("*");
      if (error) throw error;
      const map = {
        geral: vazio("geral"),
        publicacao: vazio("publicacao"),
        item_controladoria: vazio("item_controladoria"),
        processo: vazio("processo"),
      } as Record<TipoItem, Pref>;
      (data ?? []).forEach((row: any) => {
        map[row.tipo_item as TipoItem] = {
          id: row.id,
          tipo_item: row.tipo_item,
          nivel_autonomia: row.nivel_autonomia,
          estilo: row.estilo,
          tom: row.tom,
          prioridade_padrao: row.prioridade_padrao ?? "",
          prazo_padrao_dias: row.prazo_padrao_dias ?? "",
          instrucoes_extras: row.instrucoes_extras ?? "",
        };
      });
      setPrefs(map);
    } catch (err) {
      toast({
        title: "Erro ao carregar preferências",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }

  function atualizar<K extends keyof Pref>(tipo: TipoItem, campo: K, valor: Pref[K]) {
    setPrefs((p) => ({ ...p, [tipo]: { ...p[tipo], [campo]: valor } }));
  }

  async function salvar(tipo: TipoItem) {
    setSalvando(tipo);
    try {
      const { data: ud } = await supabase.auth.getUser();
      if (!ud?.user) throw new Error("Sessão expirada");
      const p = prefs[tipo];
      const payload: any = {
        user_id: ud.user.id,
        tipo_item: tipo,
        nivel_autonomia: p.nivel_autonomia,
        estilo: p.estilo,
        tom: p.tom,
        prioridade_padrao: p.prioridade_padrao || null,
        prazo_padrao_dias:
          p.prazo_padrao_dias === "" ? null : Number(p.prazo_padrao_dias),
        instrucoes_extras: p.instrucoes_extras?.trim() || null,
      };
      const { error } = await supabase
        .from("bia_preferencias")
        .upsert(payload, { onConflict: "user_id,tipo_item" });
      if (error) throw error;
      toast({ title: "Preferências salvas", description: `Aplicado a "${TIPOS.find((t) => t.id === tipo)?.label}"` });
      await carregar();
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSalvando(null);
    }
  }

  async function limpar(tipo: TipoItem) {
    if (!prefs[tipo].id) {
      setPrefs((s) => ({ ...s, [tipo]: vazio(tipo) }));
      return;
    }
    try {
      const { error } = await supabase
        .from("bia_preferencias")
        .delete()
        .eq("id", prefs[tipo].id!);
      if (error) throw error;
      toast({ title: "Preferência removida" });
      await carregar();
    } catch (err) {
      toast({
        title: "Falha ao remover",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando preferências…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-primary/10">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display tracking-tight">Preferências da Bia</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Defina como a IA deve sugerir ações para cada tipo de item. As preferências
            são pessoais e usadas em todas as análises (publicações, controladoria,
            processos).
          </p>
        </div>
      </div>

      <Tabs defaultValue="geral">
        <TabsList>
          {TIPOS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TIPOS.map((t) => {
          const p = prefs[t.id];
          return (
            <TabsContent key={t.id} value={t.id}>
              <Card className="p-6 space-y-5">
                <p className="text-xs text-muted-foreground">{t.hint}</p>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nível de autonomia</Label>
                    <Select
                      value={p.nivel_autonomia}
                      onValueChange={(v) => atualizar(t.id, "nivel_autonomia", v as any)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sugerir">Apenas sugerir</SelectItem>
                        <SelectItem value="sugerir_confirmar">Sugerir e pedir confirmação</SelectItem>
                        <SelectItem value="aplicar_auto">Aplicar automaticamente (com confirmação em lote)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Estilo de recomendação</Label>
                    <Select
                      value={p.estilo}
                      onValueChange={(v) => atualizar(t.id, "estilo", v as any)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="objetivo">Objetivo (curto e direto)</SelectItem>
                        <SelectItem value="detalhado">Detalhado (com contexto e base legal)</SelectItem>
                        <SelectItem value="formal">Formal (linguagem jurídica)</SelectItem>
                        <SelectItem value="direto">Direto (sem rodeios)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Tom</Label>
                    <Select
                      value={p.tom}
                      onValueChange={(v) => atualizar(t.id, "tom", v as any)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="neutro">Neutro</SelectItem>
                        <SelectItem value="tecnico">Técnico</SelectItem>
                        <SelectItem value="didatico">Didático (explicativo)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Prioridade padrão</Label>
                    <Select
                      value={p.prioridade_padrao || "auto"}
                      onValueChange={(v) =>
                        atualizar(t.id, "prioridade_padrao", (v === "auto" ? "" : v) as any)
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automática (a IA decide)</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="baixa">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Prazo padrão (dias úteis)</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="Em branco = a IA calcula"
                      value={p.prazo_padrao_dias}
                      onChange={(e) =>
                        atualizar(
                          t.id,
                          "prazo_padrao_dias",
                          e.target.value === "" ? "" : Number(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Instruções extras para a Bia</Label>
                  <Textarea
                    rows={4}
                    placeholder="Ex.: Sempre incluir nome do responsável. Para INSS, lembrar do prazo de 30 dias. Não criar tarefa para publicações de mero expediente."
                    value={p.instrucoes_extras}
                    onChange={(e) => atualizar(t.id, "instrucoes_extras", e.target.value)}
                  />
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => limpar(t.id)}
                    disabled={salvando !== null}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Restaurar padrão
                  </Button>
                  <Button onClick={() => salvar(t.id)} disabled={salvando !== null}>
                    {salvando === t.id ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar preferências
                  </Button>
                </div>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
