import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tipos de uma configuração armazenada em `configuracoes_sistema`.
 */
export type ConfigTipo = "texto" | "numero" | "booleano" | "json" | "cor" | "arquivo";

export interface ConfiguracaoItem {
  chave: string;
  valor: string | null;
  valor_json: unknown;
  tipo: ConfigTipo;
  descricao: string | null;
  editavel_por: "gestor" | "sistema";
  publica: boolean;
}

/** Mapa { chave: valor já tipado } pronto para consumo. */
export type ConfigMap = Record<string, string | number | boolean | unknown>;

function tipar(item: ConfiguracaoItem): string | number | boolean | unknown {
  if (item.tipo === "json") return item.valor_json ?? null;
  if (item.valor === null || item.valor === undefined) return "";
  switch (item.tipo) {
    case "numero":
      return Number(item.valor);
    case "booleano":
      return item.valor === "true";
    default:
      return item.valor;
  }
}

/**
 * Hook para ler/gravar configurações de uma seção do sistema.
 *
 * Camadas de proteção:
 *  1. Rota `/configuracoes/*` protegida por `requireGestor` (front).
 *  2. RLS no banco: apenas `is_gestor(auth.uid())` pode escrever, e leitura
 *     ampla também só é liberada para gestores (públicas para autenticados).
 *  3. Este hook trava read/write no cliente: se o usuário não for gestor,
 *     nem dispara as queries — evita chamadas acidentais e mensagens de erro
 *     do RLS em telas que reutilizem o hook fora do módulo Configurações.
 */
export function useConfiguracoes(secao: string) {
  const { isGestor, loading: authLoading, user } = useAuth();
  const [config, setConfig] = useState<ConfigMap>({});
  const [meta, setMeta] = useState<Record<string, ConfiguracaoItem>>({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    // Só carrega quando temos certeza do estado de auth e o usuário é gestor.
    if (authLoading) return;
    if (!user || !isGestor) {
      setConfig({});
      setMeta({});
      setErro("Acesso restrito a gestores");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErro(null);
    const { data, error } = await supabase
      .from("configuracoes_sistema")
      .select("chave, valor, valor_json, tipo, descricao, editavel_por, publica")
      .eq("secao", secao)
      .order("chave");

    if (error) {
      setErro(error.message);
      setLoading(false);
      return;
    }

    const valores: ConfigMap = {};
    const metaMap: Record<string, ConfiguracaoItem> = {};
    (data ?? []).forEach((item) => {
      const it = item as ConfiguracaoItem;
      valores[it.chave] = tipar(it);
      metaMap[it.chave] = it;
    });
    setConfig(valores);
    setMeta(metaMap);
    setLoading(false);
  }, [secao, authLoading, user, isGestor]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Atualiza uma única chave. */
  const salvarChave = useCallback(
    async (chave: string, valor: unknown) => {
      // Defesa em profundidade: bloqueia salvamento client-side se não for gestor.
      if (!isGestor) {
        toast.error("Apenas gestores podem alterar configurações do sistema");
        return false;
      }

      const item = meta[chave];
      if (!item) {
        toast.error(`Configuração ${secao}.${chave} não encontrada`);
        return false;
      }
      if (item.editavel_por === "sistema") {
        toast.error("Esta configuração não pode ser editada");
        return false;
      }

      setSalvando(true);
      const isJson = item.tipo === "json";
      const { data: auth } = await supabase.auth.getUser();
      const update: Record<string, unknown> = {};
      if (auth.user) update.atualizado_por = auth.user.id;

      if (isJson) {
        update.valor_json = valor as never;
        update.valor = null;
      } else {
        update.valor = valor === null || valor === undefined ? null : String(valor);
        update.valor_json = null;
      }

      const { error } = await supabase
        .from("configuracoes_sistema")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(update as any)
        .eq("secao", secao)
        .eq("chave", chave);

      setSalvando(false);
      if (error) {
        toast.error(`Erro ao salvar: ${error.message}`);
        return false;
      }
      await carregar();
      return true;
    },
    [meta, secao, carregar, isGestor],
  );

  /** Atualiza várias chaves de uma vez. Continua mesmo se algum item falhar. */
  const salvar = useCallback(
    async (updates: Record<string, unknown>) => {
      if (!isGestor) {
        toast.error("Apenas gestores podem alterar configurações do sistema");
        return false;
      }

      setSalvando(true);
      let okCount = 0;
      let errCount = 0;
      for (const [chave, valor] of Object.entries(updates)) {
        const ok = await salvarChave(chave, valor);
        if (ok) okCount++;
        else errCount++;
      }
      setSalvando(false);
      if (errCount === 0) toast.success(`${okCount} configurações salvas`);
      else toast.warning(`${okCount} salvas, ${errCount} com erro`);
      return errCount === 0;
    },
    [salvarChave, isGestor],
  );

  return {
    config,
    meta,
    loading: loading || authLoading,
    salvando,
    erro,
    isGestor,
    salvar,
    salvarChave,
    recarregar: carregar,
  };
}
