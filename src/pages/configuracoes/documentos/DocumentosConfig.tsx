import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Save, FileText, Tags, ArrowRight, Type } from "lucide-react";
import { Link } from "react-router-dom";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

interface Categoria { id: string; nome: string; ativo: boolean; ordem: number }

/**
 * CONFIGURAÇÕES → Documentos.
 * Formatação padrão (fonte, margens) e listagem de categorias.
 */
export default function DocumentosConfig() {
  const { config, loading, salvando, salvar } = useConfiguracoes("documentos");
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (loading) return;
    setForm({
      fonte_padrao: String(config.fonte_padrao ?? "Bookman Old Style"),
      tamanho_fonte: String(config.tamanho_fonte ?? 12),
      espacamento_linhas: String(config.espacamento_linhas ?? 1.5),
      margem_superior: String(config.margem_superior ?? 1440),
      margem_inferior: String(config.margem_inferior ?? 1440),
      margem_esquerda: String(config.margem_esquerda ?? 1800),
      margem_direita: String(config.margem_direita ?? 1080),
      recuo_paragrafo: String(config.recuo_paragrafo ?? 720),
    });
  }, [loading, config]);

  const categorias = (config.categorias as Categoria[] | undefined) ?? [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5 text-gold" />
            Formatação padrão
          </CardTitle>
          <CardDescription>
            Aplicada a novos modelos e peças. Pode ser sobrescrita em cada documento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Campo label="Fonte" chave="fonte_padrao" form={form} setForm={setForm} />
          <Campo label="Tamanho (pt)" chave="tamanho_fonte" form={form} setForm={setForm} type="number" />
          <Campo label="Espaçamento entre linhas" chave="espacamento_linhas" form={form} setForm={setForm} type="number" step="0.1" />
          <Campo label="Recuo de parágrafo (twips)" chave="recuo_paragrafo" form={form} setForm={setForm} type="number" />
          <Campo label="Margem superior (twips)" chave="margem_superior" form={form} setForm={setForm} type="number" />
          <Campo label="Margem inferior (twips)" chave="margem_inferior" form={form} setForm={setForm} type="number" />
          <Campo label="Margem esquerda (twips)" chave="margem_esquerda" form={form} setForm={setForm} type="number" />
          <Campo label="Margem direita (twips)" chave="margem_direita" form={form} setForm={setForm} type="number" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-gold" />
            Categorias de documentos
          </CardTitle>
          <CardDescription>Usadas para organizar peças e modelos.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {categorias.map((c) => (
              <Badge key={c.id} variant={c.ativo ? "secondary" : "outline"}>
                {c.nome}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Edição completa de categorias virá em uma próxima iteração — hoje são gerenciadas pelo banco.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold" />
            Modelos e variáveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            to="/documentos/modelos"
            className="flex items-center justify-between rounded-md border p-3 hover:bg-muted transition-colors"
          >
            <div>
              <div className="font-medium text-sm">Modelos de petição</div>
              <div className="text-xs text-muted-foreground">Crie e edite os templates reutilizáveis</div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => salvar(form)} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" />
          {salvando ? "Salvando…" : "Salvar formatação"}
        </Button>
      </div>
    </div>
  );
}

function Campo({
  label,
  chave,
  form,
  setForm,
  type = "text",
  step,
}: {
  label: string;
  chave: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  type?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={chave}>{label}</Label>
      <Input
        id={chave}
        type={type}
        step={step}
        value={form[chave] ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
      />
    </div>
  );
}
