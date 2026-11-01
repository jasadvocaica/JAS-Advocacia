import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, Server, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
interface Worker {
  id: string;
  nome: string;
  ativo: boolean;
  ultimo_sinal: string | null;
  versao: string | null;
}
async function call(body: Record<string, unknown>) {
  const r = await supabase.functions.invoke("escritorio-vps", { body });
  if (r.error || r.data?.error)
    throw new Error(r.data?.error ?? "Não foi possível consultar a conexão.");
  return r.data;
}
export default function VpsConnector() {
  const [workers, setWorkers] = useState<Worker[]>([]),
    [name, setName] = useState("HostGator · EasyPanel"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [secret, setSecret] = useState<{ id: string; token: string } | null>(null),
    [copied, setCopied] = useState(false),
    [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    try {
      const r = await call({ acao: "listar" });
      setWorkers(r.workers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na conexão.");
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) void load();
    }, 15000);
    return () => clearInterval(t);
  }, [load]);
  async function create() {
    setBusy(true);
    try {
      const r = await call({ acao: "criar", nome: name });
      setSecret({ id: r.id, token: r.token });
      setCopied(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await call({ acao: "revogar", worker_id: id });
      if (secret?.id === id) setSecret(null);
      await load();
    } catch {
      setError("Não foi possível revogar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="op-panel space-y-5" aria-label="Conectar VPS">
      <div className="flex items-start gap-3">
        <Server size={22} className="text-primary" />
        <div>
          <h2 className="font-semibold">VPS e execução contínua</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Conecte um serviço no EasyPanel pelo GitHub. O worker despacha as
            rotinas autorizadas; a IA e o orçamento continuam no Supabase.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 text-xs">
          Nome da conexão
          <Input
            className="mt-2"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <Button onClick={() => void create()} disabled={busy || !name.trim()}>
          <Link2 size={14} />
          Criar conexão EasyPanel
        </Button>
      </div>
      {secret && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <h3 className="text-sm font-medium">Instalar no projeto 3D</h3>
          <ol className="list-decimal pl-4 text-xs leading-7 text-muted-foreground">
            <li>
              No EasyPanel, crie um Aplicativo chamado{" "}
              <strong>jas-worker</strong>.
            </li>
            <li>
              Fonte GitHub: <strong>jasadvocaica/JAS-Advocacia</strong>, branch{" "}
              <strong>main</strong>.
            </li>
            <li>
              Dockerfile: <code>deploy/vps/Dockerfile</code>, contexto raiz.
            </li>
            <li>Cole as variáveis abaixo no ambiente do serviço e publique.</li>
          </ol>
          <label className="block text-xs">
            Credencial desta conexão — exibida somente nesta sessão
            <Input
              type="password"
              readOnly
              value={secret.token}
              className="mt-2"
              autoComplete="off"
            />
          </label>
          <Button
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  `JAS_WORKER_ID=${secret.id}\nJAS_WORKER_TOKEN=${secret.token}`,
                )
                .then(() => setCopied(true))
                .catch(() =>
                  setError(
                    "Não foi possível copiar. Autorize a área de transferência do navegador.",
                  ),
                )
            }
          >
            <Copy size={14} />
            {copied
              ? "Variáveis copiadas"
              : "Copiar variáveis para o EasyPanel"}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Mantenha esses valores nas variáveis do serviço. Não envie a
            credencial ao chat. Se fechar esta tela antes de copiar, revogue a
            conexão e crie outra.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {!workers.length && (
          <p className="py-3 text-xs text-muted-foreground">
            Nenhum worker conectado. Criar a conexão não instala um serviço na
            VPS.
          </p>
        )}
        {workers.map((w) => {
          const connected =
            w.ativo &&
            w.ultimo_sinal &&
            now - Date.parse(w.ultimo_sinal) < 180000;
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-xs"
              key={w.id}
            >
              <div>
                <strong>{w.nome}</strong>
                <p className="mt-1 text-muted-foreground">
                  {!w.ativo
                    ? "Revogado"
                    : connected
                      ? "Conexão confirmada pelo servidor"
                      : w.ultimo_sinal
                        ? "Sem sinal recente"
                        : "Aguardando instalação no EasyPanel"}
                </p>
                {w.ultimo_sinal && (
                  <time className="mt-1 block text-[10px] text-muted-foreground">
                    Último sinal:{" "}
                    {new Date(w.ultimo_sinal).toLocaleString("pt-BR", {
                      timeZone: "America/Cuiaba",
                    })}
                  </time>
                )}
              </div>
              {w.ativo && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void revoke(w.id)}
                >
                  Revogar conexão
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p className="flex gap-2 text-[10px] leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="shrink-0" />O serviço não recebe senha
        de root ou chaves de OpenAI/Supabase. A conexão só é confirmada após um
        sinal autenticado da VPS.
      </p>
    </section>
  );
}
