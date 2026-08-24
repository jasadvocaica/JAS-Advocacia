// Aviso de sincronização exibido no portal do cliente
// Aparece em todas as páginas durante os primeiros 7 dias após a liberação do acesso.
import { Clock } from "lucide-react";

interface Props {
  liberadoEm?: string | null;
}

export function AvisoSincronizacao({ liberadoEm }: Props) {
  // Mostra por 7 dias depois da liberação; depois some sozinho para não poluir.
  if (liberadoEm) {
    const dias = (Date.now() - new Date(liberadoEm).getTime()) / (1000 * 60 * 60 * 24);
    if (dias > 7) return null;
  }
  return (
    <div className="mb-4 rounded-md border border-gold/30 bg-gold/5 px-4 py-3 flex items-start gap-3">
      <Clock className="w-4 h-4 text-gold-dark mt-0.5 shrink-0" />
      <div className="text-sm leading-relaxed">
        <p className="font-medium text-gold-dark">Acesso liberado — estamos sincronizando suas informações</p>
        <p className="text-muted-foreground mt-0.5">
          Em até <strong>48 horas</strong> seus processos, documentos e dados financeiros estarão completos por aqui.
          Se algo ainda estiver faltando depois disso, fale com nossa equipe pela aba <strong>Mensagens</strong>.
        </p>
      </div>
    </div>
  );
}
