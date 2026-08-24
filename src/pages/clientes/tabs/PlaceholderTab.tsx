import { Lock, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  titulo: string;
  descricao: string;
  fase: string;
  icon?: any;
}

export default function PlaceholderTab({ titulo, descricao, fase, icon: Icon = Wrench }: Props) {
  return (
    <Card className="p-12 text-center space-y-3">
      <div className="w-14 h-14 mx-auto rounded-full bg-gold/10 flex items-center justify-center">
        <Icon className="w-7 h-7 text-gold" />
      </div>
      <h3 className="font-display text-2xl">{titulo}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{descricao}</p>
      <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
        Em construção · {fase}
      </Badge>
    </Card>
  );
}
