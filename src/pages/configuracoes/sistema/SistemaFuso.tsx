import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Save } from "lucide-react";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

const FUSOS = [
  "America/Cuiaba",
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Rio_Branco",
  "America/Belem",
  "America/Recife",
  "America/Fortaleza",
];

const FORMATOS_DATA = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY"];

export default function SistemaFuso() {
  const { config, loading, salvando, salvar } = useConfiguracoes("sistema");
  const [form, setForm] = useState<Record<string, string>>({});
  const [avisoFuso, setAvisoFuso] = useState(false);

  useEffect(() => {
    if (!loading) {
      setForm({
        fuso_horario: String(config.fuso_horario ?? "America/Cuiaba"),
        idioma: String(config.idioma ?? "pt-BR"),
        formato_data: String(config.formato_data ?? "DD/MM/YYYY"),
        formato_moeda: String(config.formato_moeda ?? "BRL"),
        separador_decimal: String(config.separador_decimal ?? ","),
        separador_milhar: String(config.separador_milhar ?? "."),
      });
    }
  }, [loading, config]);

  function handleChange(chave: string, valor: string) {
    if (chave === "fuso_horario" && valor !== String(config.fuso_horario)) {
      setAvisoFuso(true);
    }
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  async function handleSalvar() {
    const ok = await salvar(form);
    if (ok) setAvisoFuso(false);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fuso horário e localização</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {avisoFuso && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Alterar o fuso horário pode impactar os horários exibidos em prazos e agendamentos.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fuso">Fuso horário</Label>
            <Select value={form.fuso_horario ?? ""} onValueChange={(v) => handleChange("fuso_horario", v)}>
              <SelectTrigger id="fuso"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FUSOS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idioma">Idioma</Label>
            <Input id="idioma" value={form.idioma ?? ""} onChange={(e) => handleChange("idioma", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fdata">Formato de data</Label>
            <Select value={form.formato_data ?? ""} onValueChange={(v) => handleChange("formato_data", v)}>
              <SelectTrigger id="fdata"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMATOS_DATA.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fmoeda">Moeda</Label>
            <Input id="fmoeda" value={form.formato_moeda ?? ""} onChange={(e) => handleChange("formato_moeda", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dec">Separador decimal</Label>
            <Input id="dec" maxLength={1} value={form.separador_decimal ?? ""} onChange={(e) => handleChange("separador_decimal", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mil">Separador de milhar</Label>
            <Input id="mil" maxLength={1} value={form.separador_milhar ?? ""} onChange={(e) => handleChange("separador_milhar", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSalvar} disabled={salvando}>
            <Save className="w-4 h-4 mr-2" />
            {salvando ? "Salvando…" : "Salvar alterações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
