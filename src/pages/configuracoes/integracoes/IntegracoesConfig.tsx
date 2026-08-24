import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, HardDrive, Database, Calendar, Save, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

/**
 * CONFIGURAÇÕES → Integrações.
 * SMTP, backup automático, DataJud e Google Calendar.
 */
export default function IntegracoesConfig() {
  const { config, loading, salvando, salvar } = useConfiguracoes("integracoes");
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    if (loading) return;
    setForm({
      smtp_host: String(config.smtp_host ?? ""),
      smtp_porta: String(config.smtp_porta ?? 587),
      smtp_usuario: String(config.smtp_usuario ?? ""),
      smtp_senha: String(config.smtp_senha ?? ""),
      smtp_email_remetente: String(config.smtp_email_remetente ?? ""),
      smtp_nome_remetente: String(config.smtp_nome_remetente ?? ""),
      backup_automatico_ativo: Boolean(config.backup_automatico_ativo),
      backup_frequencia: String(config.backup_frequencia ?? "semanal"),
      backup_dia_semana: String(config.backup_dia_semana ?? "domingo"),
      backup_horario: String(config.backup_horario ?? "03:00"),
      backup_retencao_dias: String(config.backup_retencao_dias ?? 30),
      datajud_horario_job: String(config.datajud_horario_job ?? "06:00"),
      datajud_delay_ms: String(config.datajud_delay_ms ?? 500),
      gcal_horizonte_dias: String(config.gcal_horizonte_dias ?? 90),
    });
  }, [loading, config]);

  function set(chave: string, valor: string | boolean) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-gold" />
            E-mail (SMTP)
          </CardTitle>
          <CardDescription>Servidor de envio para notificações e propostas.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Campo label="Servidor SMTP" chave="smtp_host" form={form} set={set} placeholder="smtp.gmail.com" />
          <Campo label="Porta" chave="smtp_porta" form={form} set={set} type="number" />
          <Campo label="Usuário" chave="smtp_usuario" form={form} set={set} />
          <Campo label="Senha" chave="smtp_senha" form={form} set={set} type="password" />
          <Campo label="E-mail remetente" chave="smtp_email_remetente" form={form} set={set} type="email" />
          <Campo label="Nome do remetente" chave="smtp_nome_remetente" form={form} set={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-gold" />
            Backup automático
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="font-medium">Realizar backup automaticamente</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Snapshot completo do banco no horário definido.
              </p>
            </div>
            <Switch
              checked={Boolean(form.backup_automatico_ativo)}
              onCheckedChange={(v) => set("backup_automatico_ativo", v)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo label="Frequência" chave="backup_frequencia" form={form} set={set} placeholder="diario | semanal | mensal" />
            <Campo label="Dia da semana (se semanal)" chave="backup_dia_semana" form={form} set={set} />
            <Campo label="Horário" chave="backup_horario" form={form} set={set} type="time" />
            <Campo label="Retenção (dias)" chave="backup_retencao_dias" form={form} set={set} type="number" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-gold" />
            DataJud (CNJ)
          </CardTitle>
          <CardDescription>Sincronização automática de andamentos processuais.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo label="Horário do job diário" chave="datajud_horario_job" form={form} set={set} type="time" />
            <Campo label="Delay entre requisições (ms)" chave="datajud_delay_ms" form={form} set={set} type="number" />
          </div>
          <Link
            to="/configuracoes/datajud"
            className="flex items-center justify-between rounded-md border p-3 hover:bg-muted transition-colors"
          >
            <div>
              <div className="font-medium text-sm">Regras DataJud → Ação</div>
              <div className="text-xs text-muted-foreground">
                Mapear códigos de movimento para tarefas/prazos automáticos
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gold" />
            Google Calendar
          </CardTitle>
          <CardDescription>Sincroniza prazos e audiências para a agenda Google.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Campo
              label="Horizonte de sincronização (dias)"
              chave="gcal_horizonte_dias"
              form={form}
              set={set}
              type="number"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4 bg-background/80 backdrop-blur p-2 rounded-lg border">
        <Button onClick={() => salvar(form)} disabled={salvando}>
          <Save className="w-4 h-4 mr-2" />
          {salvando ? "Salvando…" : "Salvar todas as integrações"}
        </Button>
      </div>
    </div>
  );
}

function Campo({
  label,
  chave,
  form,
  set,
  type = "text",
  placeholder,
}: {
  label: string;
  chave: string;
  form: Record<string, string | boolean>;
  set: (k: string, v: string | boolean) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={chave}>{label}</Label>
      <Input
        id={chave}
        type={type}
        placeholder={placeholder}
        value={String(form[chave] ?? "")}
        onChange={(e) => set(chave, e.target.value)}
      />
    </div>
  );
}
