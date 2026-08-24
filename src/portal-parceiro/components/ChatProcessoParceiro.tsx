import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { registrarAcaoParceiro } from "../auditLog";

interface Props {
  processoId: string;
  clienteId: string;
  parceiroId: string;
}

interface Mensagem {
  id: string;
  texto: string;
  remetente_tipo: string;
  remetente_id: string | null;
  criado_em: string;
}

/**
 * Reusa cliente_portal_mensagens para chat parceiro<>escritório associado a um processo.
 * Como não há tabela específica para parceiro, usamos remetente_tipo='escritorio'/'cliente'
 * e armazenamos o cliente_id do processo para escopo. (Trabalhar como histórico legível.)
 */
export function ChatProcessoParceiro({ processoId, clienteId, parceiroId }: Props) {
  const { user } = useAuth();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cliente_portal_mensagens")
      .select("id, texto, remetente_tipo, remetente_id, criado_em")
      .eq("processo_id", processoId)
      .order("criado_em", { ascending: true })
      .limit(200);
    setMensagens((data as any[]) ?? []);
    setLoading(false);
    setTimeout(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  useEffect(() => { load(); }, [processoId]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !user) return;
    setEnviando(true);
    const { data: novo, error } = await supabase.from("cliente_portal_mensagens").insert({
      processo_id: processoId,
      cliente_id: clienteId,
      texto: t,
      remetente_tipo: "escritorio", // parceiro envia como "escritorio" (terceiro autorizado)
      remetente_id: user.id,
    }).select("id").maybeSingle();
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    void registrarAcaoParceiro({
      parceiroId,
      acao: "enviou_mensagem",
      recursoTipo: "mensagem",
      recursoId: (novo as any)?.id ?? null,
      descricao: `Mensagem em processo (${t.length} caracteres)`,
      contexto: { processo_id: processoId },
    });
    setTexto("");
    load();
  };

  return (
    <Card className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : mensagens.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma mensagem ainda.</p>
        ) : mensagens.map((m) => {
          const minha = m.remetente_id === user?.id;
          return (
            <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 ${minha ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className="text-sm whitespace-pre-wrap">{m.texto}</p>
                <p className={`text-[10px] mt-1 ${minha ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {new Date(m.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>
      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva uma mensagem..."
          rows={2}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <Button onClick={enviar} disabled={enviando || !texto.trim()} className="self-end">
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </Card>
  );
}
