// Combobox para escolher um cliente. Garante que todo atendimento criado
// fora do perfil de um cliente seja vinculado ao cliente certo.
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ClienteLite {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

interface Props {
  value: string | null;
  onChange: (clienteId: string | null, cliente: ClienteLite | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ClientePicker({ value, onChange, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ClienteLite[]>([]);
  const [selected, setSelected] = useState<ClienteLite | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      let q = supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj")
        .order("nome", { ascending: true })
        .limit(30);
      if (query.trim()) q = q.or(`nome.ilike.%${query}%,cpf_cnpj.ilike.%${query}%`);
      const { data } = await q;
      if (!cancel) setItems((data ?? []) as ClienteLite[]);
    })();
    return () => { cancel = true; };
  }, [query]);

  useEffect(() => {
    if (!value) { setSelected(null); return; }
    if (selected?.id === value) return;
    (async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj")
        .eq("id", value)
        .maybeSingle();
      if (data) setSelected(data as ClienteLite);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            {selected ? selected.nome : (placeholder ?? "Selecionar cliente...")}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,90vw)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome ou CPF/CNPJ..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {items.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    setSelected(c);
                    onChange(c.id, c);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{c.nome}</span>
                    {c.cpf_cnpj && (
                      <span className="text-xs text-muted-foreground truncate">
                        {c.cpf_cnpj}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
