import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserPlus, Save } from "lucide-react";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

/**
 * CONFIGURAÇÕES → Portais.
 * Mensagens e flags do portal do cliente e do parceiro.
 */
export default function PortaisForm() {
  const { config, loading, salvando, salvar } = useConfiguracoes("portais");
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (loading) return;
    setForm({
      cliente_mensagem_boas_vindas: String(config.cliente_mensagem_boas_vindas ?? ""),
      cliente_termos_uso: String(config.cliente_termos_uso ?? ""),
      cliente_mostrar_financeiro: Boolean(config.cliente_mostrar_financeiro),
      parceiro_mensagem_boas_vindas: String(config.parceiro_mensagem_boas_vindas ?? ""),
    });
  }, [loading, config]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gold" />
            Portal do Cliente
          </CardTitle>
          <CardDescription>O que o cliente vê e pode acessar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mensagem de boas-vindas</Label>
            <Textarea
              rows={3}
              value={String(form.cliente_mensagem_boas_vindas ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, cliente_mensagem_boas_vindas: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Termos de uso</Label>
            <Textarea
              rows={5}
              value={String(form.cliente_termos_uso ?? "")}
              onChange={(e) => setForm((f) => ({ ...f, cliente_termos_uso: e.target.value }))}
              placeholder="Texto exibido no primeiro acesso do cliente"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="font-medium">Exibir financeiro por padrão</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pode ser sobrescrito caso a caso na ficha do cliente.
              </p>
            </div>
            <Switch
              checked={Boolean(form.cliente_mostrar_financeiro)}
              onCheckedChange={(v) => setForm((f) => ({ ...f, cliente_mostrar_financeiro: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-gold" />
            Portal do Parceiro
          </CardTitle>
          <CardDescription>Mensagem exibida ao parceiro no primeiro acesso.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={String(form.parceiro_mensagem_boas_vindas ?? "")}
            onChange={(e) => setForm((f) => ({ ...f, parceiro_mensagem_boas_vindas: e.target.value }))}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => salvar(form)} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" />
          {salvando ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
