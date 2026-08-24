import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search, Users, Briefcase, ClipboardCheck, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ResultadoBusca {
  id: string;
  titulo: string;
  subtitulo?: string;
  rota: string;
}

interface ResultadosAgrupados {
  clientes: ResultadoBusca[];
  processos: ResultadoBusca[];
  tarefas: ResultadoBusca[];
  documentos: ResultadoBusca[];
}

const VAZIO: ResultadosAgrupados = {
  clientes: [],
  processos: [],
  tarefas: [],
  documentos: [],
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [resultados, setResultados] = useState<ResultadosAgrupados>(VAZIO);
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  // Atalho Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Limpa ao fechar
  useEffect(() => {
    if (!open) {
      setTermo("");
      setResultados(VAZIO);
    }
  }, [open]);

  // Busca com debounce
  useEffect(() => {
    const q = termo.trim();
    if (q.length < 2) {
      setResultados(VAZIO);
      setCarregando(false);
      return;
    }

    setCarregando(true);
    const timer = setTimeout(async () => {
      const podeClientes = hasPermission("clientes", "visualizar");
      const podeProcessos = hasPermission("processos", "visualizar");
      const podeControladoria = hasPermission("controladoria", "visualizar");
      const podeDocumentos = hasPermission("documentos", "visualizar");

      const ilike = `%${q}%`;
      const promessas = await Promise.all([
        podeClientes
          ? supabase
              .from("clientes")
              .select("id, nome, cpf_cnpj")
              .or(`nome.ilike.${ilike},cpf_cnpj.ilike.${ilike}`)
              .limit(6)
          : Promise.resolve({ data: [] as any[] }),
        podeProcessos
          ? supabase
              .from("processos")
              .select("id, numero_cnj, tipo_acao, vara")
              .or(`numero_cnj.ilike.${ilike},tipo_acao.ilike.${ilike},vara.ilike.${ilike}`)
              .limit(6)
          : Promise.resolve({ data: [] as any[] }),
        podeControladoria
          ? supabase
              .from("controladoria_itens")
              .select("id, titulo, tipo")
              .ilike("titulo", ilike)
              .limit(6)
          : Promise.resolve({ data: [] as any[] }),
        podeDocumentos
          ? supabase
              .from("doc_pecas")
              .select("id, titulo, categoria, cliente_id")
              .ilike("titulo", ilike)
              .limit(6)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const [resClientes, resProcessos, resTarefas, resDocs] = promessas;

      setResultados({
        clientes: (resClientes.data ?? []).map((c: any) => ({
          id: c.id,
          titulo: c.nome,
          subtitulo: c.cpf_cnpj ?? undefined,
          rota: `/clientes/${c.id}`,
        })),
        processos: (resProcessos.data ?? []).map((p: any) => ({
          id: p.id,
          titulo: p.numero_cnj || "Processo sem número",
          subtitulo: [p.tipo_acao, p.vara].filter(Boolean).join(" • ") || undefined,
          rota: `/processos/${p.id}`,
        })),
        tarefas: (resTarefas.data ?? []).map((t: any) => ({
          id: t.id,
          titulo: t.titulo,
          subtitulo: t.tipo,
          rota: `/controladoria?item=${t.id}`,
        })),
        documentos: (resDocs.data ?? []).map((d: any) => ({
          id: d.id,
          titulo: d.titulo,
          subtitulo: d.categoria,
          rota: `/documentos/pecas/${d.id}`,
        })),
      });
      setCarregando(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [termo, hasPermission]);

  const irPara = useCallback(
    (rota: string) => {
      setOpen(false);
      navigate(rota);
    },
    [navigate]
  );

  const totalResultados =
    resultados.clientes.length +
    resultados.processos.length +
    resultados.tarefas.length +
    resultados.documentos.length;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground hover:text-foreground"
      >
        <Search className="w-4 h-4" />
        <span className="hidden sm:inline">Buscar...</span>
        <kbd className="hidden md:inline-flex pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Buscar clientes, processos, tarefas, documentos..."
          value={termo}
          onValueChange={setTermo}
        />
        <CommandList>
          {termo.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Digite pelo menos 2 caracteres para buscar.
            </div>
          )}
          {termo.length >= 2 && carregando && (
            <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando...
            </div>
          )}
          {termo.length >= 2 && !carregando && totalResultados === 0 && (
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          )}

          {resultados.clientes.length > 0 && (
            <CommandGroup heading="Clientes">
              {resultados.clientes.map((r) => (
                <CommandItem
                  key={`cli-${r.id}`}
                  value={`cliente-${r.id}-${r.titulo}`}
                  onSelect={() => irPara(r.rota)}
                >
                  <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{r.titulo}</div>
                    {r.subtitulo && (
                      <div className="text-xs text-muted-foreground truncate">{r.subtitulo}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {resultados.processos.length > 0 && (
            <>
              {resultados.clientes.length > 0 && <CommandSeparator />}
              <CommandGroup heading="Processos">
                {resultados.processos.map((r) => (
                  <CommandItem
                    key={`proc-${r.id}`}
                    value={`processo-${r.id}-${r.titulo}`}
                    onSelect={() => irPara(r.rota)}
                  >
                    <Briefcase className="w-4 h-4 mr-2 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-mono text-xs">{r.titulo}</div>
                      {r.subtitulo && (
                        <div className="text-xs text-muted-foreground truncate">{r.subtitulo}</div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {resultados.tarefas.length > 0 && (
            <>
              {(resultados.clientes.length > 0 || resultados.processos.length > 0) && (
                <CommandSeparator />
              )}
              <CommandGroup heading="Tarefas / Controladoria">
                {resultados.tarefas.map((r) => (
                  <CommandItem
                    key={`tar-${r.id}`}
                    value={`tarefa-${r.id}-${r.titulo}`}
                    onSelect={() => irPara(r.rota)}
                  >
                    <ClipboardCheck className="w-4 h-4 mr-2 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.titulo}</div>
                      {r.subtitulo && (
                        <div className="text-xs text-muted-foreground truncate capitalize">
                          {r.subtitulo}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {resultados.documentos.length > 0 && (
            <>
              {(resultados.clientes.length > 0 ||
                resultados.processos.length > 0 ||
                resultados.tarefas.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Documentos / Peças">
                {resultados.documentos.map((r) => (
                  <CommandItem
                    key={`doc-${r.id}`}
                    value={`documento-${r.id}-${r.titulo}`}
                    onSelect={() => irPara(r.rota)}
                  >
                    <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.titulo}</div>
                      {r.subtitulo && (
                        <div className="text-xs text-muted-foreground truncate capitalize">
                          {r.subtitulo}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
