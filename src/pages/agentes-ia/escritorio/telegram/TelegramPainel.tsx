import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { OfficeStatus } from "../design/OfficeUI";
import Operacao24hPainel from './Operacao24hPainel';

interface Estado {
  configurado: boolean;
  bot: string | null;
  webhook: boolean;
  vinculos: { chat_id: number; nome: string | null; criado_em: string }[];
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("telegram", { body: corpo });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as { context?: { json: () => Promise<{ error?: string }> } }).context?.json();
      if (b?.error) msg = b.error;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(msg);
  }
  return data as T;
}

/** Vincula o Telegram da gestora: conversar com a Gestora, criar missões e aprovar pelo celular. */
export default function TelegramPainel() {
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEstado(await chamar<Estado>({ acao: "estado" }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Telegram indisponível.");
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  async function agir(corpo: Record<string, unknown>, ok?: string) {
    setOcupado(true);
    try {
      const r = await chamar<{ codigo?: string }>(corpo);
      if (r.codigo) setCodigo(r.codigo);
      if (ok) toast({ title: ok });
      await carregar();
    } catch (e) {
      toast({ title: "Não foi possível concluir", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="op-panel ga-gatilho" aria-label="Telegram">
      <h3><Send size={18} /> Telegram</h3>
      {erro && <p className="mi-aviso">{erro}</p>}
      {estado && !estado.configurado && (
        <p className="ga-nota">
          Falta criar o bot: no Telegram, fale com @BotFather, envie /newbot e guarde o token. Depois cadastre nos segredos
          das funções do Supabase <b>TELEGRAM_BOT_TOKEN</b> (o token) e <b>TELEGRAM_WEBHOOK_SECRET</b> (uma senha longa
          qualquer) e volte aqui.
        </p>
      )}
      {estado?.configurado && (
        <>
          <div className="ga-motor">
            <OfficeStatus tone={estado.webhook ? "success" : "warning"}>
              {estado.webhook ? `@${estado.bot} recebendo mensagens` : `@${estado.bot} ainda não recebe mensagens`}
            </OfficeStatus>
            {!estado.webhook && (
              <Button size="sm" disabled={ocupado} onClick={() => void agir({ acao: "configurar_webhook" }, "Bot ligado ao JAS")}>
                Ligar o bot
              </Button>
            )}
          </div>
          <p className="ga-nota">Converse por texto ou áudio de até 3 minutos e 5 MB. Pedidos claros viram missões para a equipe, com confirmação e aviso ao terminar. Use /andamento para acompanhar; publicações continuam exigindo aprovação específica.</p>
          {estado.vinculos.length > 0 ? (
            <ul className="ga-agentes">
              {estado.vinculos.map((v) => (
                <li key={v.chat_id}>
                  <span>{v.nome ?? "Telegram"} · vinculado em {new Date(v.criado_em).toLocaleDateString("pt-BR")}</span>
                  <Button size="sm" variant="outline" disabled={ocupado}
                    onClick={() => void agir({ acao: "desvincular", chat_id: v.chat_id }, "Telegram desvinculado")}>
                    Desvincular
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ga-nota">Nenhum Telegram vinculado ainda.</p>
          )}
          <Button size="sm" variant="outline" disabled={ocupado || !estado.webhook} onClick={() => void agir({ acao: "gerar_codigo" })}>
            Gerar código de vínculo
          </Button>
          {codigo && (
            <p className="ga-nota" role="status">
              Envie para <b>@{estado.bot}</b> no Telegram: <code>/vincular {codigo}</code> · vale 10 minutos e uma única vez.
            </p>
          )}
          <Operacao24hPainel />
        </>
      )}
    </div>
  );
}
