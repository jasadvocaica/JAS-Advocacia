import { useEffect, useRef, useState } from "react";
import { BookOpen, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  consultarBiblioteca,
  prepararConsulta,
  type EstadoBiblioteca,
  type FonteLegal,
} from "@/lib/biblioteca-juridica";
import { supabase } from "@/integrations/supabase/client";
import { urlFonteSegura } from "../workspace";

export function FonteLegalCard({
  fonte,
  usada = false,
  adicionar,
  disabled = false,
}: {
  fonte: FonteLegal;
  usada?: boolean;
  adicionar?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline">{fonte.artigo}</Badge>
        {usada && <Badge variant="secondary">Citada na sugestão</Badge>}
      </div>
      <p className="font-medium">{fonte.titulo}</p>
      <p className="text-xs text-muted-foreground">{fonte.versao_texto}</p>
      <details>
        <summary className="cursor-pointer text-xs text-primary">
          Conferir texto recuperado
        </summary>
        <p className="whitespace-pre-wrap text-xs mt-2 max-h-64 overflow-y-auto">
          {fonte.trecho}
        </p>
        {fonte.notas && (
          <p className="mt-2 text-xs text-amber-700 whitespace-pre-wrap">
            {fonte.notas}
          </p>
        )}
      </details>
      <div className="flex flex-wrap gap-3 text-xs">
        {urlFonteSegura(fonte.fonte_oficial) && (
          <a
            href={fonte.fonte_oficial}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex gap-1 text-primary items-center"
          >
            Fonte oficial
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {urlFonteSegura(fonte.fonte_repositorio) && (
          <a
            href={fonte.fonte_repositorio}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground"
          >
            Versão consultada
          </a>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Captura da origem:{" "}
        {fonte.capturado_em
          ? new Date(fonte.capturado_em + "T12:00:00").toLocaleDateString(
              "pt-BR",
            )
          : "não informada"}{" "}
        · versão {fonte.versao_sha.slice(0, 10)}
      </p>
      {adicionar && (
        <Button
          size="sm"
          variant="outline"
          onClick={adicionar}
          disabled={disabled}
        >
          <Plus className="h-3 w-3 mr-1" />
          Usar no contexto
        </Button>
      )}
    </div>
  );
}

interface Props {
  gestor: boolean;
  readOnly: boolean;
  consultaInicial?: string;
  normaInicial?: string;
  selecionados: string[];
  onPesquisar: (q: string, norma: string) => void;
  onAdicionar: (f: FonteLegal) => void;
}
export function BibliotecaJuridica(props: Props) {
  const [estado, setEstado] = useState<EstadoBiblioteca | null>(null);
  const [consulta, setConsulta] = useState(props.consultaInicial ?? "");
  const [norma, setNorma] = useState(props.normaInicial ?? "");
  const [fontes, setFontes] = useState<FonteLegal[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [executou, setExecutou] = useState(false);
  const [link, setLink] = useState("");
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState("");
  const buscaId = useRef(0);
  const montado = useRef(true);
  useEffect(() => {
    let ativo = true;
    montado.current = true;
    void consultarBiblioteca<EstadoBiblioteca>("jur_estado")
      .then((r) => {
        if (ativo && r && typeof r.normas === "number") setEstado(r);
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      });
    return () => {
      ativo = false;
      montado.current = false;
    };
  }, []);
  async function pesquisar() {
    if (consulta.trim().length < 2 || buscando) return;
    const atual = ++buscaId.current;
    setBuscando(true);
    setErro("");
    setExecutou(true);
    props.onPesquisar(consulta.trim(), norma);
    try {
      const r = await consultarBiblioteca<FonteLegal[]>("jur_pesquisar", {
        p_consulta: prepararConsulta(consulta.trim()),
        p_norma_id: norma || null,
        p_limite: 12,
      });
      if (montado.current && atual === buscaId.current)
        setFontes(Array.isArray(r) ? r : []);
    } catch (e) {
      if (montado.current && atual === buscaId.current)
        setErro(e instanceof Error ? e.message : "Falha na pesquisa.");
    } finally {
      if (montado.current && atual === buscaId.current) setBuscando(false);
    }
  }
  async function importar() {
    if (!link.trim() || importando) return;
    setImportando(true);
    setErro("");
    setAviso("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "biblioteca-juridica",
        { body: { acao: "importar", caminho: link.trim() } },
      );
      if (error) {
        const d =
          error.context instanceof Response
            ? await error.context.json().catch(() => null)
            : null;
        throw new Error(d?.error || "Não foi possível importar a norma.");
      }
      if (!data?.ok)
        throw new Error(data?.error || "Importação não confirmada.");
      setAviso(
        data.resultado?.status === "sem_alteracao"
          ? "Norma conferida: a versão já estava no acervo."
          : "Norma importada e disponível para pesquisa.",
      );
      setEstado(await consultarBiblioteca<EstadoBiblioteca>("jur_estado"));
      setLink("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setImportando(false);
    }
  }
  return (
    <div className="space-y-4 p-1">
      <div className="rounded-lg bg-muted p-3 text-xs space-y-2">
        <p className="flex items-center gap-2 font-medium">
          <BookOpen className="h-4 w-4" />
          Biblioteca de legislação
        </p>
        {estado ? (
          <>
            <p>
              {estado.normas} normas importadas · {estado.dispositivos}{" "}
              dispositivos pesquisáveis
            </p>
            <p>{estado.escopo}</p>
            {estado.ultima_verificacao && (
              <p>
                Última conferência registrada em{" "}
                {new Date(estado.ultima_verificacao).toLocaleString("pt-BR")}.
              </p>
            )}
          </>
        ) : (
          <p>Consultando a cobertura do acervo…</p>
        )}
        <p>
          A importação não certifica vigência. Textos revogados identificados
          são excluídos da pesquisa.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="consulta-legislacao">Pesquisar fundamentos</Label>
        <Input
          id="consulta-legislacao"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void pesquisar();
          }}
          placeholder="Ex.: tutela de urgência, BPC ou CPC art. 300"
        />
        <Select
          value={norma || "__todas__"}
          onValueChange={(v) => setNorma(v === "__todas__" ? "" : v)}
        >
          <SelectTrigger aria-label="Filtrar por norma">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas__">
              Todas as normas importadas
            </SelectItem>
            {estado?.catalogo?.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="w-full"
          onClick={pesquisar}
          disabled={buscando || consulta.trim().length < 2}
        >
          {buscando ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Search className="h-4 w-4 mr-2" />
          )}
          Pesquisar no acervo
        </Button>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="text-sm text-emerald-700">
          {aviso}
        </p>
      )}
      {executou && !buscando && !erro && !fontes.length && (
        <p className="text-xs text-muted-foreground">
          Nenhum dispositivo encontrado no acervo importado. Amplie os termos ou
          importe a norma necessária; isso não significa ausência de fundamento
          legal.
        </p>
      )}
      {fontes.map((f) => (
        <FonteLegalCard
          key={f.id}
          fonte={f}
          adicionar={() => props.onAdicionar(f)}
          disabled={props.readOnly || props.selecionados.includes(f.id)}
        />
      ))}
      {props.gestor && (
        <details className="border-t pt-3">
          <summary className="text-sm cursor-pointer font-medium">
            Importar outra norma do repositório
          </summary>
          <div className="space-y-2 mt-3">
            <p className="text-xs text-muted-foreground">
              Cole o link do arquivo da norma em github.com/ctresb/leis. A
              importação identifica a origem declarada, verifica o formato e
              registra a versão; a comparação com a publicação oficial continua
              na revisão jurídica.
            </p>
            <Input
              aria-label="Link da norma no repositório"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://github.com/ctresb/leis/blob/main/…"
            />
            <Button
              size="sm"
              onClick={importar}
              disabled={importando || !link.trim()}
            >
              {importando ? "Importando…" : "Importar norma"}
            </Button>
          </div>
        </details>
      )}
    </div>
  );
}
