import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { chamarEscritorio } from "../../hooks/useAgentesIA";
import type { ConfigAgente } from "../../../../../supabase/functions/_shared/agentes-config";

export interface Sugestao {
  nome: string;
  cargo: string;
  sala: string;
  tom: ConfigAgente["tom"];
  missao: string;
  prompt_base: string;
  usa_base_conhecimento: boolean;
  ferramentas_motor: string[];
  motivo_ferramentas: string;
  perguntas: string[];
}

/** Nome amigável das ferramentas do motor (o servidor confere o catálogo). */
export const NOME_FERRAMENTA: Record<string, string> = {
  consultar_indicadores: "Indicadores da Controladoria",
  listar_itens_controladoria: "Itens da Controladoria",
  buscar_processo: "Buscar processo",
  consultar_processo_completo: "Ficha do processo",
  consultar_publicacoes_djen: "Publicações do DJEN",
  buscar_cliente: "Buscar cliente",
  historico_cliente: "Histórico do cliente",
  consultar_agenda: "Agenda",
  listar_diligencias: "Diligências",
  consultar_financeiro: "Resumo financeiro",
  consultar_comercial: "Funil comercial",
  pesquisar_fontes_oficiais: "Pesquisa em fontes oficiais",
  zernio_indicadores: "Instagram: indicadores",
  zernio_publicacoes: "Instagram: publicações",
  zernio_comentarios: "Instagram: comentários",
  zernio_conversas: "Instagram: direct",
  zernio_anuncios: "Anúncios (Meta Ads)",
  zernio_saude: "Situação do Zernio",
  criar_item_controladoria: "Criar item na Controladoria (com aprovação)",
  atualizar_item_controladoria: "Atualizar item da Controladoria (com aprovação)",
  criar_compromisso_agenda: "Criar compromisso na agenda (com aprovação)",
  criar_diligencia: "Criar diligência (com aprovação)",
  criar_minuta: "Salvar minuta como rascunho (com aprovação)",
  zernio_responder_comentario: "Responder comentário (com aprovação)",
  zernio_publicar_post: "Publicar post (com aprovação)",
};

export function configDaSugestao(s: Sugestao, atual: ConfigAgente): ConfigAgente {
  return {
    ...atual,
    nome: s.nome,
    cargo: s.cargo,
    sala: s.sala,
    tom: s.tom,
    missao: s.missao,
    prompt_base: s.prompt_base,
    ferramentas: s.usa_base_conhecimento ? ["indicadores_operacionais", "base_conhecimento"] : ["indicadores_operacionais"],
  };
}

/**
 * "Criar com IA": a pessoa descreve o agente em poucas palavras e a IA preenche o rascunho (perfil, instruções)
 * e sugere as ferramentas. Nada é salvo aqui; a pessoa revisa e salva no editor.
 */
export default function CriarComIA({
  config,
  aplicar,
  ferramentas,
  setFerramentas,
}: {
  config: ConfigAgente;
  aplicar: (c: ConfigAgente) => void;
  ferramentas: string[];
  setFerramentas: (f: string[]) => void;
}) {
  const [relato, setRelato] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);

  async function sugerir() {
    setCarregando(true);
    setErro(null);
    try {
      const r = (await chamarEscritorio({ acao: "sugerir_agente", relato: relato.trim() })) as { sugestao: Sugestao };
      setSugestao(r.sugestao);
      setFerramentas(r.sugestao.ferramentas_motor);
      aplicar(configDaSugestao(r.sugestao, config));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível sugerir o agente.");
    } finally {
      setCarregando(false);
    }
  }
  const alternar = (slug: string) =>
    setFerramentas(ferramentas.includes(slug) ? ferramentas.filter((f) => f !== slug) : [...ferramentas, slug]);

  return (
    <div className="ae-ia" aria-label="Criar agente com IA">
      <label htmlFor="ae-ia-relato">
        <Wand2 size={15} aria-hidden /> Descreva o agente em poucas palavras e a IA monta o rascunho
      </label>
      <Textarea
        id="ae-ia-relato"
        value={relato}
        onChange={(e) => setRelato(e.target.value)}
        maxLength={3000}
        rows={3}
        placeholder="Ex.: Quero uma assistente que todo dia confira as publicações do DJEN dos processos previdenciários, resuma o que o INSS pediu e proponha a tarefa na Controladoria."
        disabled={carregando}
      />
      <div className="ae-ia-acoes">
        <Button type="button" onClick={() => void sugerir()} disabled={carregando || relato.trim().length < 15}>
          {carregando ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          {carregando ? "Montando o agente…" : "Criar com IA"}
        </Button>
        <small>Usa o orçamento de IA (poucos centavos). Você revisa tudo antes de salvar.</small>
      </div>
      {erro && <p className="ae-ia-erro" role="alert">{erro}</p>}
      {sugestao && (
        <div className="ae-ia-resultado" role="status">
          <p>
            <strong>Rascunho pronto:</strong> {sugestao.nome} · {sugestao.cargo}. Confira as abas Perfil e Instruções.
          </p>
          <fieldset>
            <legend>Ferramentas que serão liberadas ao salvar</legend>
            {sugestao.motivo_ferramentas && <small>{sugestao.motivo_ferramentas}</small>}
            {Object.keys(NOME_FERRAMENTA).filter((s) => sugestao.ferramentas_motor.includes(s) || ferramentas.includes(s)).map((slug) => (
              <label key={slug}>
                <input type="checkbox" checked={ferramentas.includes(slug)} onChange={() => alternar(slug)} />
                {NOME_FERRAMENTA[slug]}
              </label>
            ))}
            {sugestao.ferramentas_motor.length === 0 && <small>Nenhuma ferramenta sugerida.</small>}
          </fieldset>
          {sugestao.perguntas.length > 0 && (
            <div>
              <strong>Para melhorar este agente, responda nas instruções:</strong>
              <ul>{sugestao.perguntas.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
