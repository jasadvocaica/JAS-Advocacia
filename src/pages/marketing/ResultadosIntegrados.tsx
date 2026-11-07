import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ErroMarketing,
  lerResultados,
  type PainelResultados,
} from "./operacao-api";
import {
  filtrosIniciais,
  chaveResultados,
  dinheiro,
  numero,
  situacaoFonte,
  somarAds,
  type FiltrosResultados,
} from "./resultados";
const quando = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })
    : "Nunca";
const campo = "rounded-md border bg-background p-2 min-w-0 w-full";
export function DadosResultados({
  data,
  filtros,
}: {
  data: PainelResultados;
  filtros: FiltrosResultados;
}) {
  const totais = somarAds(data.diario, filtros.conta);
  const registros = data.diario.length + data.publicacoes.length;
  const atrasado =
    !data.conexao.ultima_sync_ok_em ||
    Date.now() - Date.parse(data.conexao.ultima_sync_ok_em) >
      data.conexao.intervalo_minutos * 120000;
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2 text-sm" aria-live="polite">
        <p>
          <strong>
            {situacaoFonte(data.conexao, !!data.job_ativo, registros)}
          </strong>{" "}
          · Fonte: cache Zernio do JAS · {filtros.de} a {filtros.ate}
        </p>
        <p>
          Última sincronização válida: {quando(data.conexao.ultima_sync_ok_em)}{" "}
          · America/Cuiaba
        </p>
        {(data.parcial || atrasado) && (
          <p className="text-amber-700">
            {data.parcial
              ? "Sincronização parcial ou com falha. "
              : "Dados desatualizados. "}
            Os últimos dados válidos foram preservados.
          </p>
        )}
        {data.contas.some(
          (c) =>
            c.precisa_reconectar &&
            (!filtros.conta || c.externo_id === filtros.conta),
        ) && (
          <p>
            Há conta que precisa ser reconectada em Configurações → Integrações.
          </p>
        )}
        {filtros.teste && (
          <p className="font-semibold">
            Ambiente de teste: leads sintéticos. Gastos da Meta continuam sendo
            dados reais; custos por lead de teste não são calculados.
          </p>
        )}
      </Card>
      <section aria-label="Instagram orgânico" className="space-y-3">
        <h2 className="font-semibold text-lg">Instagram orgânico</h2>
        <p className="text-sm text-muted-foreground">
          {data.publicacoes.length} publicações na coorte de publicação.
          Métricas são o último retrato de cada conteúdo; alcance único entre
          conteúdos não é somado.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          {data.publicacoes.map((p) => {
            const m = p.metricas as Record<string, number | null> | null;
            return (
              <Card
                key={String(p.id)}
                className="p-4 space-y-2 min-w-0 break-words"
              >
                <p>{String(p.conteudo ?? "Sem legenda")}</p>
                <p className="text-sm">
                  Impressões: {numero(m?.impressoes)} · Alcance deste conteúdo:{" "}
                  {numero(m?.alcance)} · Curtidas: {numero(m?.curtidas)} ·
                  Salvamentos: {numero(m?.salvamentos)}
                </p>
                {typeof p.url === "string" && /^https:\/\//.test(p.url) && (
                  <a
                    href={p.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="underline"
                  >
                    Ver publicação
                  </a>
                )}
              </Card>
            );
          })}
        </div>
        {!data.publicacoes.length && (
          <p className="text-sm">
            Nenhum registro de publicação para estes filtros.
          </p>
        )}
      </section>
      <section aria-label="Meta Ads" className="space-y-3">
        <h2 className="font-semibold text-lg">Meta Ads</h2>
        <p className="text-sm text-muted-foreground">
          Série diária de conta; campanhas, conjuntos e anúncios não são somados
          ao gasto. Alcance único do período: indisponível.
        </p>
        {filtros.campanha && (
          <p>
            Série diária por campanha indisponível no cache atual. Consulte o
            retrato da campanha abaixo, com seu próprio período.
          </p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {totais.map((t) => (
            <Card key={t.moeda} className="p-4 space-y-2">
              <h3 className="font-semibold">{t.moeda}</h3>
              <p>Gasto: {dinheiro(t.gasto, t.moeda)}</p>
              <p>Impressões: {numero(t.impressoes)}</p>
              <p>Cliques: {numero(t.cliques)}</p>
              <p>Resultados informados pela Meta: {numero(t.resultados)}</p>
            </Card>
          ))}
        </div>
        {!totais.length && (
          <p className="text-sm">
            Nenhuma série diária disponível para estes filtros.
          </p>
        )}
        {data.campanhas.map((c) => (
          <details
            key={String(c.externo_id)}
            className="border rounded-md p-3 break-words"
          >
            <summary className="cursor-pointer">
              {String(c.nome)} · entrega Meta:{" "}
              {String(c.estado ?? "indisponível")}
            </summary>
            <p className="text-sm my-2">
              Retrato do provedor: {String(c.periodo_de ?? "?")} a{" "}
              {String(c.periodo_ate ?? "?")}. Conta:{" "}
              {String(c.conta_externa_id)}. Este retrato pode ter período
              diferente do filtro.
            </p>
            <p className="text-sm">
              Gasto neste retrato:{" "}
              {dinheiro(
                (c.metricas as Record<string, number | null> | null)?.spend,
                String(c.moeda ?? ""),
              )}{" "}
              · Impressões:{" "}
              {numero(
                (c.metricas as Record<string, number | null> | null)
                  ?.impressions,
              )}{" "}
              · Cliques:{" "}
              {numero(
                (c.metricas as Record<string, number | null> | null)?.clicks,
              )}
            </p>
            {data.crm && typeof c.campanha_interna_id === "string" && (
              <Link
                className="text-sm underline"
                to={`/comercial/crm?campanha=${encodeURIComponent(c.campanha_interna_id)}`}
              >
                Ver leads vinculados no CRM
              </Link>
            )}
            <p className="text-sm">Conjuntos</p>
            {data.conjuntos
              .filter((s) => s.campanha_externa_id === c.externo_id)
              .map((s) => (
                <p key={String(s.externo_id)} className="text-sm">
                  {String(s.nome)} · {String(s.estado)}
                </p>
              ))}
            <p className="text-sm mt-2">Anúncios</p>
            {data.anuncios
              .filter((a) => a.campanha_externa_id === c.externo_id)
              .map((a) => (
                <p key={String(a.externo_id)} className="text-sm">
                  {String(a.nome)} · {String(a.estado)}
                </p>
              ))}
          </details>
        ))}
      </section>
      <section aria-label="CRM" className="space-y-3">
        <h2 className="font-semibold text-lg">CRM · coorte de aquisição</h2>
        {data.crm ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Leads únicos registrados", data.crm.leads],
                [
                  "Qualificados (em atendimento, proposta ou convertidos)",
                  data.crm.qualificados,
                ],
                ["Contratos formalizados com evidência", data.crm.contratos],
                ["Sem atribuição de campanha", data.crm.sem_atribuicao],
              ].map(([l, v]) => (
                <Card className="p-4" key={String(l)}>
                  <p className="text-sm">{l}</p>
                  <strong className="text-2xl">{numero(Number(v))}</strong>
                </Card>
              ))}
            </div>
            <p className="text-sm">
              Contratos apurados até {quando(data.apurado_em)} para leads
              adquiridos entre {filtros.de} e {filtros.ate}. Qualificação é
              operacional, não uma conclusão jurídica.
            </p>
            <p className="text-sm">
              Custo por lead do CRM (gasto ÷ leads únicos atribuídos) e custo
              por contrato (gasto ÷ contratos confirmados atribuídos):
              indisponíveis enquanto a série de gasto não tiver atribuição e
              cobertura compatíveis com a coorte.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Campanha</th>
                    <th>Leads da coorte</th>
                    <th>Contratos confirmados</th>
                    <th>Conversão da coorte</th>
                  </tr>
                </thead>
                <tbody>
                  {data.crm.campanhas.map((c) => (
                    <tr key={c.campanha_id ?? "sem"}>
                      <td className="py-2">{c.nome}</td>
                      <td className="text-center">{c.leads}</td>
                      <td className="text-center">{c.contratos}</td>
                      <td className="text-center">
                        {c.leads
                          ? `${((100 * c.contratos) / c.leads).toFixed(1)}%`
                          : "Indisponível"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button asChild variant="outline">
              <Link to="/comercial/crm">Abrir rotina do CRM</Link>
            </Button>
          </>
        ) : (
          <p>
            Sem permissão para consultar indicadores do CRM. O acesso ao
            Marketing não concede acesso ao Comercial.
          </p>
        )}
      </section>
    </div>
  );
}
export default function ResultadosIntegrados() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [f, setF] = useState(() => {
    const inicial = filtrosIniciais();
    return {
      ...inicial,
      de: params.get("de") || inicial.de,
      ate: params.get("ate") || inicial.ate,
      conta: params.get("conta") || "",
      campanha: params.get("campanha") || "",
    };
  });
  const q = useQuery({
    queryKey: chaveResultados(user?.id, f),
    queryFn: () => lerResultados(f),
    enabled: !!user,
    retry: false,
  });
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-xl">Resultados integrados</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <label className="text-sm">
          De
          <input
            type="date"
            className={campo}
            value={f.de}
            onChange={(e) => setF({ ...f, de: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Até
          <input
            type="date"
            className={campo}
            value={f.ate}
            onChange={(e) => setF({ ...f, ate: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Conta
          <select
            className={campo}
            value={f.conta}
            onChange={(e) =>
              setF({ ...f, conta: e.target.value, campanha: "" })
            }
          >
            <option value="">Todas as selecionadas</option>
            {q.data?.contas.map((c) => (
              <option key={c.externo_id} value={c.externo_id}>
                {c.nome} · {c.plataforma}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Campanha
          <select
            className={campo}
            value={f.campanha}
            onChange={(e) => setF({ ...f, campanha: e.target.value })}
          >
            <option value="">Todas / sem atribuição</option>
            {q.data?.campanhas.map((c) => (
              <option key={String(c.externo_id)} value={String(c.externo_id)}>
                {String(c.nome)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Canal
          <select
            className={campo}
            value={f.canal}
            onChange={(e) => setF({ ...f, canal: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="instagram_organico">Instagram orgânico</option>
            <option value="whatsapp_direto">WhatsApp direto</option>
            <option value="outro">Outro / a confirmar</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-4 items-center">
        <label className="text-sm">
          <input
            type="checkbox"
            checked={f.teste}
            onChange={(e) => setF({ ...f, teste: e.target.checked })}
          />{" "}
          Somente leads de teste
        </label>
        <Button
          variant="outline"
          disabled={q.isFetching}
          onClick={() => q.refetch()}
        >
          Atualizar leitura do cache
        </Button>
      </div>
      {q.isPending && <p role="status">Consultando estes filtros…</p>}
      {q.error && (
        <p role="alert" className="text-destructive">
          {q.error.message}.{" "}
          {q.data &&
          !(q.error instanceof ErroMarketing && q.error.codigo === "42501")
            ? "Exibindo a última leitura válida destes filtros."
            : "Nenhum dado foi carregado para estes filtros."}
        </p>
      )}
      {q.data &&
        !(q.error instanceof ErroMarketing && q.error.codigo === "42501") && (
          <DadosResultados data={q.data} filtros={f} />
        )}
    </div>
  );
}
