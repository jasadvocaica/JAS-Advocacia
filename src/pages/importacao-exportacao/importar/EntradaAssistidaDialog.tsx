import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/**
 * Cadastro guiado de processos com busca DataJud. STUB.
 */
export function EntradaAssistidaDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastro assistido de processo</DialogTitle>
          <DialogDescription>
            Em breve: digite CNJ ou NB → o sistema busca dados no DataJud → você complementa
            os campos faltantes (cliente, área, valor) e cadastra.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
