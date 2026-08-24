import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, RefreshCw, Bell, Lock, KeyRound } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Resumo {
  logins_falha_24h: number;
  logins_falha_7d: number;
  top_emails_falha_24h: { email: string; total: number }[];
  otp_bloqueados: number;
  otp_expirados_24h: number;
  otp_tentativas_24h: number;
  eventos_24h: number;
  eventos_por_tipo_24h: Record<string, number>;
  rls_negados_7d: number;
  gerado_em: string;
}

interface EventoSeguranca {
  id: string;
  tipo: string;
  email: string | null;
  recurso: string | null;
  rota: string | null;
  detalhe: string | null;
  criado_em: string;
}

interface LoginEvento {
  id: string;
  evento: string;
  email: string | null;
  motivo: string | null;
  portal: string | null;
  criado_em: string;
}

export default function MonitoramentoSeguranca() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [eventos, setEventos] = useState<EventoSeguranca[]>([]);
  const [logins, setLogins] = useState<LoginEvento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [verificando, setVerificando] = useState(false);

  async function carregar() {
    setCarregando(true);
    const [r, e, l] = await Promise.all([
      (supabase.rpc as any)("seguranca_resumo"),
      (supabase.from("seguranca_eventos") as any)
        .select("id,tipo,email,recurso,rota,detalhe,criado_em")
        .order("criado_em", { ascending: false })
        .limit(50),
      (supabase.from("auth_login_eventos") as any)
        .select("id,evento,email,motivo,portal,criado_em")
        .eq("evento", "login_falha")
        .order("criado_em", { ascending: false })
        .limit(20),
    ]);
    if (r.error) toast.error("Falha ao carregar resumo: " + r.error.message);
    else setResumo(r.data as Resumo);
    if (!e.error) setEventos((e.data as EventoSeguranca[]) ?? []);
    if (!l.error) setLogins((l.data as LoginEvento[]) ?? []);
    setCarregando(false);
  }

  async function verificarAlertas() {
    setVerificando(true);
    const { data, error } = await (supabase.rpc as any)("seguranca_verificar_alertas");
    setVerificando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const total = (data?.alertas as unknown[] | undefined)?.length ?? 0;
    if (total === 0) toast.success("Nenhum alerta no momento");
    else toast.warning(`${total} alerta(s) gerado(s) — gestores notificados.`);
    carregar();
  }

  useEffect(() => { carregar(); }, []);

  const formatar = (d: string) => format(new Date(d), "dd/MM HH:mm", { locale: ptBR });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display tracking-tight">Monitoramento de segurança</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tentativas de login falhas, bloqueios de OTP e ações negadas por RLS nas últimas horas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" onClick={verificarAlertas} disabled={verificando}>
            <Bell className="h-4 w-4 mr-2" />
            Verificar alertas
          </Button>
        </div>
      </div>

      {/* Cards de KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Lock className="h-4 w-4" />}
          titulo="Logins falhos (24h)"
          valor={resumo?.logins_falha_24h ?? 0}
          alerta={(resumo?.logins_falha_24h ?? 0) >= 10}
          subtitulo={`${resumo?.logins_falha_7d ?? 0} nos últimos 7 dias`}
        />
        <KpiCard
          icon={<KeyRound className="h-4 w-4" />}
          titulo="OTP bloqueados"
          valor={resumo?.otp_bloqueados ?? 0}
          alerta={(resumo?.otp_bloqueados ?? 0) >= 3}
          subtitulo={`${resumo?.otp_tentativas_24h ?? 0} tentativas em 24h`}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          titulo="Ações negadas (24h)"
          valor={resumo?.eventos_24h ?? 0}
          alerta={(resumo?.eventos_24h ?? 0) >= 10}
          subtitulo={`${resumo?.rls_negados_7d ?? 0} RLS/permissão em 7 dias`}
        />
        <KpiCard
          icon={<ShieldCheck className="h-4 w-4" />}
          titulo="OTP expirados (24h)"
          valor={resumo?.otp_expirados_24h ?? 0}
          alerta={false}
          subtitulo="tokens não utilizados"
        />
      </div>

      {/* Top e-mails com falha */}
      {resumo && resumo.top_emails_falha_24h.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">E-mails com mais falhas de login (24h)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {resumo.top_emails_falha_24h.map((t) => (
                <Badge key={t.email} variant={t.total >= 5 ? "destructive" : "secondary"}>
                  {t.email} · {t.total}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Últimas falhas de login</CardTitle></CardHeader>
          <CardContent>
            {logins.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem registros.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logins.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{formatar(l.criado_em)}</TableCell>
                      <TableCell className="text-xs">{l.email ?? "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.motivo ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Eventos de segurança recentes</CardTitle></CardHeader>
          <CardContent>
            {eventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Recurso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventos.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-xs">{formatar(ev.criado_em)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{ev.tipo}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ev.recurso ?? ev.rota ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon, titulo, valor, alerta, subtitulo,
}: { icon: React.ReactNode; titulo: string; valor: number; alerta: boolean; subtitulo?: string }) {
  return (
    <Card className={alerta ? "border-destructive/60" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          {icon} {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-display ${alerta ? "text-destructive" : ""}`}>{valor}</div>
        {subtitulo && <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>}
      </CardContent>
    </Card>
  );
}
