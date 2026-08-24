import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { usePortalCliente } from "../usePortalCliente";

export default function MensagensCliente() {
  const { clienteId } = usePortalCliente();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => {
    const { data } = await supabase.from("cliente_portal_mensagens").select("*")
      .eq("cliente_id", clienteId).order("criado_em");
    setMsgs((data as any[]) ?? []);
    // marca como lidas
    await supabase.from("cliente_portal_mensagens").update({ lida: true, lida_em: new Date().toISOString() })
      .eq("cliente_id", clienteId).eq("remetente_tipo", "escritorio").eq("lida", false);
    setLoading(false);
  };
  useEffect(() => { carregar(); }, [clienteId]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    const { error } = await supabase.from("cliente_portal_mensagens")
      .insert({ cliente_id: clienteId, remetente_tipo: "cliente", texto: texto.trim() });
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    setTexto(""); carregar();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="max-w-3xl flex flex-col h-[calc(100vh-12rem)]">
      <h1 className="font-display text-2xl mb-4">Mensagens</h1>
      <Card className="flex-1 p-4 overflow-y-auto space-y-2 mb-3">
        {msgs.length === 0
          ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma mensagem ainda. Envie uma para iniciar.</p>
          : msgs.map(m => (
            <div key={m.id} className={`flex ${m.remetente_tipo === "cliente" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.remetente_tipo === "cliente" ? "bg-gold/10 text-foreground" : "bg-muted"}`}>
                <p className="whitespace-pre-wrap">{m.texto}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(m.criado_em).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          ))}
      </Card>
      <div className="flex gap-2">
        <Textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Digite sua mensagem..." rows={2} />
        <Button onClick={enviar} disabled={enviando || !texto.trim()} variant="gold"><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
