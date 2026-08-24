import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TipoItem } from "./types";

export interface MembroEquipe {
  id: string;
  nome: string;
  email: string | null;
  /** Primeiro role interno encontrado (gestor, advogado, estagiario, suporte). */
  role: string | null;
}

/** Inicial / 2 letras a partir do nome para uso em avatares. */
export function iniciaisDe(nome: string | null | undefined): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Cor estável (hash) para o avatar de cada membro. */
export function corAvatar(id: string): string {
  // Paleta limitada — combina com tokens da marca.
  const cores = [
    "bg-primary/15 text-primary",
    "bg-gold/20 text-gold-dark",
    "bg-success/15 text-success",
    "bg-warning/15 text-warning",
    "bg-destructive/10 text-destructive",
    "bg-accent text-accent-foreground",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return cores[Math.abs(h) % cores.length];
}

/**
 * Resolve o responsável padrão para um tipo de item, com base nos perfis cadastrados.
 * Tenta casar pelo nome (Lana / Esther / Valeska / Juliana). Se não encontrar,
 * cai para o primeiro membro com o role esperado, ou null.
 */
export function responsavelPadrao(tipo: TipoItem, equipe: MembroEquipe[]): string | null {
  if (equipe.length === 0) return null;
  const por = (substr: string) =>
    equipe.find((m) => m.nome.toLowerCase().includes(substr.toLowerCase()))?.id ?? null;
  const primeiroDoRole = (role: string) =>
    equipe.find((m) => m.role === role)?.id ?? null;

  switch (tipo) {
    case "prazo_processual":
    case "prazo_fatal":
      return por("lana") ?? primeiroDoRole("estagiario") ?? primeiroDoRole("advogado");
    case "tarefa":
      return por("esther") ?? primeiroDoRole("estagiario");
    case "audiencia":
      return por("valeska") ?? primeiroDoRole("estagiario");
    case "pericia":
      return por("valeska") ?? primeiroDoRole("estagiario");
    case "conciliacao":
      return por("valeska") ?? primeiroDoRole("estagiario");
    case "diligencia":
      return por("valeska") ?? primeiroDoRole("estagiario");
    case "reuniao":
      return por("valeska") ?? primeiroDoRole("estagiario");
    default:
      return null;
  }
}

/** Carrega membros internos da equipe (qualquer role exceto cliente/parceiro). */
export function useEquipeInterna() {
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["gestor", "advogado", "estagiario", "controladoria", "administrativo"]);
      if (cancel) return;
      if (error) {
        console.error("[useEquipeInterna]", error);
        setEquipe([]);
        setLoading(false);
        return;
      }
      const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id).filter(Boolean)));
      let perfis: any[] = [];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nome, email, ativo")
          .in("id", userIds)
          .eq("ativo", true);
        perfis = profs ?? [];
      }
      const roleByUser = new Map<string, string>();
      (roles ?? []).forEach((r: any) => {
        if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
      });
      const seen = new Set<string>();
      const lista: MembroEquipe[] = [];
      perfis.forEach((p: any) => {
        if (!p?.id || seen.has(p.id)) return;
        seen.add(p.id);
        lista.push({
          id: p.id,
          nome: (p.nome ?? "").trim() || (p.email ?? "Sem nome"),
          email: p.email ?? null,
          role: roleByUser.get(p.id) ?? null,
        });
      });
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setEquipe(lista);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  return { equipe, loading };
}
