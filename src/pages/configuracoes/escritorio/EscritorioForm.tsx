import { forwardRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Building2, Phone, Palette, FileSignature } from "lucide-react";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";
import { LogoUploader } from "./LogoUploader";
import { TimbradoUploader } from "./TimbradoUploader";
import { invalidarCacheTimbrado } from "@/hooks/useTimbrado";

const CAMPOS_DADOS = [
  "nome",
  "cpf_cnpj",
  "nome_advogado_principal",
  "oab",
  "endereco",
  "cidade",
  "estado",
  "cep",
] as const;

const CAMPOS_CONTATO = [
  "email",
  "site",
  "whatsapp_principal",
  "whatsapp_secundario",
  "instagram",
  "instagram_escritorio",
] as const;

const CAMPOS_MARCA = ["logo_url", "favicon_url", "cor_primaria", "cor_secundaria"] as const;
const CAMPOS_TIMBRADO = [
  "timbrado_ativo",
  "timbrado_modo",
  "timbrado_cabecalho_url",
  "timbrado_cabecalho_altura_mm",
  "timbrado_rodape_url",
  "timbrado_rodape_altura_mm",
  "timbrado_marca_dagua_url",
  "timbrado_marca_dagua_largura_mm",
  "timbrado_marca_dagua_opacidade",
  "timbrado_pagina_inteira_url",
  "timbrado_pagina_inteira_margem_topo_mm",
  "timbrado_pagina_inteira_margem_base_mm",
  "timbrado_pagina_inteira_margem_esq_mm",
  "timbrado_pagina_inteira_margem_dir_mm",
] as const;

/**
 * CONFIGURAÇÕES → Escritório.
 * Dados cadastrais, contatos, marca e assinatura padrão.
 */
export default function EscritorioForm() {
  const { config, loading, salvando, salvar } = useConfiguracoes("escritorio");
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (loading) return;
    const inicial: Record<string, string> = {};
    [...CAMPOS_DADOS, ...CAMPOS_CONTATO, ...CAMPOS_MARCA, ...CAMPOS_TIMBRADO, "assinatura_documento"].forEach(
      (c) => {
        inicial[c] = String(config[c] ?? "");
      },
    );
    setForm(inicial);
  }, [loading, config]);

  function set(chave: string, valor: string) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  async function handleSalvar() {
    const ok = await salvar(form);
    if (ok) invalidarCacheTimbrado();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" />
            Dados do escritório
          </CardTitle>
          <CardDescription>Aparecem em documentos, propostas e cabeçalhos.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Campo label="Nome do escritório" chave="nome" form={form} set={set} />
          <Campo label="CPF / CNPJ" chave="cpf_cnpj" form={form} set={set} />
          <Campo label="Advogado(a) principal" chave="nome_advogado_principal" form={form} set={set} />
          <Campo label="OAB" chave="oab" form={form} set={set} />
          <Campo label="Endereço" chave="endereco" form={form} set={set} className="md:col-span-2" />
          <Campo label="Cidade" chave="cidade" form={form} set={set} />
          <Campo label="Estado (UF)" chave="estado" form={form} set={set} maxLength={2} />
          <Campo label="CEP" chave="cep" form={form} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-gold" />
            Contatos
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Campo label="E-mail principal" chave="email" form={form} set={set} type="email" />
          <Campo label="Site" chave="site" form={form} set={set} />
          <Campo label="WhatsApp principal" chave="whatsapp_principal" form={form} set={set} />
          <Campo label="WhatsApp secundário" chave="whatsapp_secundario" form={form} set={set} />
          <Campo label="Instagram (advogado)" chave="instagram" form={form} set={set} />
          <Campo label="Instagram (escritório)" chave="instagram_escritorio" form={form} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-gold" />
            Identidade visual
          </CardTitle>
          <CardDescription>
            Envie o logotipo que aparece no topo do menu lateral. Você pode também colar uma URL externa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LogoUploader value={form.logo_url ?? ""} onChange={(v) => set("logo_url", v)} />
          <Campo label="URL do favicon" chave="favicon_url" form={form} set={set} className="md:col-span-2" />
          <div className="space-y-1.5">
            <Label htmlFor="cor_primaria">Cor primária</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cor_primaria"
                type="color"
                value={form.cor_primaria || "#010423"}
                onChange={(e) => set("cor_primaria", e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={form.cor_primaria ?? ""}
                onChange={(e) => set("cor_primaria", e.target.value)}
                placeholder="#010423"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cor_secundaria">Cor secundária</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cor_secundaria"
                type="color"
                value={form.cor_secundaria || "#BC943F"}
                onChange={(e) => set("cor_secundaria", e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={form.cor_secundaria ?? ""}
                onChange={(e) => set("cor_secundaria", e.target.value)}
                placeholder="#BC943F"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-gold" />
            Assinatura padrão de documentos
          </CardTitle>
          <CardDescription>
            Use variáveis como <code className="text-xs">{"{{cidade_escritorio}}"}</code>,{" "}
            <code className="text-xs">{"{{data_extenso}}"}</code>, <code className="text-xs">{"{{nome_advogado}}"}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={6}
            value={form.assinatura_documento ?? ""}
            onChange={(e) => set("assinatura_documento", e.target.value)}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      <TimbradoUploader
        ativo={form.timbrado_ativo === "true"}
        modo={form.timbrado_modo ?? "cabecalho_rodape"}
        cabecalhoUrl={form.timbrado_cabecalho_url ?? ""}
        cabecalhoAlturaMm={form.timbrado_cabecalho_altura_mm ?? "30"}
        rodapeUrl={form.timbrado_rodape_url ?? ""}
        rodapeAlturaMm={form.timbrado_rodape_altura_mm ?? "20"}
        marcaDaguaUrl={form.timbrado_marca_dagua_url ?? ""}
        marcaDaguaLarguraMm={form.timbrado_marca_dagua_largura_mm ?? "120"}
        marcaDaguaOpacidade={form.timbrado_marca_dagua_opacidade ?? "0.12"}
        paginaInteiraUrl={form.timbrado_pagina_inteira_url ?? ""}
        paginaInteiraMargemTopoMm={form.timbrado_pagina_inteira_margem_topo_mm ?? "40"}
        paginaInteiraMargemBaseMm={form.timbrado_pagina_inteira_margem_base_mm ?? "30"}
        paginaInteiraMargemEsqMm={form.timbrado_pagina_inteira_margem_esq_mm ?? "25"}
        paginaInteiraMargemDirMm={form.timbrado_pagina_inteira_margem_dir_mm ?? "25"}
        onChange={set}
      />

      <div className="flex justify-end sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button onClick={handleSalvar} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" />
          {salvando ? "Salvando…" : "Salvar todas as alterações"}
        </Button>
      </div>
    </div>
  );
}

type CampoProps = {
  label: string;
  chave: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  type?: string;
  maxLength?: number;
  className?: string;
};

const Campo = forwardRef<HTMLDivElement, CampoProps>(function Campo(
  { label, chave, form, set, type = "text", maxLength, className },
  ref,
) {
  return (
    <div ref={ref} className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={chave}>{label}</Label>
      <Input
        id={chave}
        type={type}
        maxLength={maxLength}
        value={form[chave] ?? ""}
        onChange={(e) => set(chave, e.target.value)}
      />
    </div>
  );
});
