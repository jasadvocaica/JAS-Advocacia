import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { registrarEventoLogin } from "@/lib/auth-audit";
import { usePreviewMode } from "@/contexts/PreviewModeContext";
import { toast } from "sonner";

export type AppRole = "gestor" | "advogado" | "controladoria" | "administrativo" | "estagiario";
export type Modulo = "clientes" | "processos" | "controladoria" | "financeiro" | "documentos" | "relatorios" | "usuarios" | "parceiros" | "equipe";
export type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  oab: string | null;
  avatar_url: string | null;
  ativo: boolean;
  primeiro_acesso: boolean;
  tipo_portal: "interno" | "cliente" | "parceiro";
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  permissions: Set<string>;
  loading: boolean;
  isGestor: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  hasPermission: (modulo: Modulo, acao: Acao) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { preview } = usePreviewMode();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Em modo "visualizar como equipe", carregamos roles/permissões/perfil do
  // usuário simulado para que a navegação e menus reflitam o que ele veria.
  // Atenção: a sessão Supabase continua sendo a do gestor, então dados
  // protegidos por RLS ainda usam auth.uid() real.
  const [previewProfile, setPreviewProfile] = useState<Profile | null>(null);
  const [previewRoles, setPreviewRoles] = useState<AppRole[]>([]);
  const [previewPermissions, setPreviewPermissions] = useState<Set<string>>(new Set());

  const previewEquipeId = preview?.tipo === "estagiaria" ? preview.id : null;

  useEffect(() => {
    if (!previewEquipeId) {
      setPreviewProfile(null);
      setPreviewRoles([]);
      setPreviewPermissions(new Set());
      return;
    }
    (async () => {
      try {
        const [pRes, rRes, permRes] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", previewEquipeId).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", previewEquipeId),
          supabase
            .from("user_permissions")
            .select("modulo, acao, permitido")
            .eq("user_id", previewEquipeId)
            .eq("permitido", true),
        ]);
        setPreviewProfile((pRes?.data as Profile | null) ?? null);
        setPreviewRoles(((rRes?.data ?? []) as any[]).map((r) => r.role));
        const set = new Set<string>();
        ((permRes?.data ?? []) as any[]).forEach((p) => set.add(`${p.modulo}:${p.acao}`));
        setPreviewPermissions(set);
      } catch (err) {
        console.warn("[auth] Falha ao carregar preview do usuário:", err);
      }
    })();
  }, [previewEquipeId]);

  const loadUserData = async (userId: string) => {
    try {
      const [profileRes, rolesRes, permsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("user_permissions").select("modulo, acao, permitido").eq("user_id", userId).eq("permitido", true),
      ]);
      if (profileRes?.data) setProfile(profileRes.data as Profile | null);
      if (rolesRes?.data) setRoles((rolesRes.data ?? []).map((r: any) => r.role));
      if (permsRes?.data) {
        const permSet = new Set<string>();
        (permsRes.data ?? []).forEach((p: any) => permSet.add(`${p.modulo}:${p.acao}`));
        setPermissions(permSet);
      }
    } catch (err) {
      console.warn("[auth] Falha ao carregar permissões/perfil do usuário:", err);
    }
  };

  // Canal entre abas — sincroniza login/logout para evitar refresh-token "roubado"
  const bcRef = (typeof window !== "undefined" && "BroadcastChannel" in window)
    ? new BroadcastChannel("auth-sync")
    : null;

  const clearLocalAuthArtifacts = () => {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k);
      });
    } catch {}
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        setTimeout(() => loadUserData(newSession.user.id), 0);
        if (event === "SIGNED_IN" && bcRef) {
          bcRef.postMessage({ type: "signed-in", userId: newSession.user.id });
        }
      } else {
        setProfile(null);
        setRoles([]);
        setPermissions(new Set());

        // Sessão perdida (logout, token revogado/expirado sem refresh válido)
        if (event === "SIGNED_OUT") {
          clearLocalAuthArtifacts();
          if (bcRef) bcRef.postMessage({ type: "signed-out" });
          const path = window.location.pathname;
          const publicas = ["/login", "/esqueci-senha", "/reset-password", "/conta-inativa"];
          if (!publicas.some((p) => path.startsWith(p))) {
            window.location.href = `/login?redirect=${encodeURIComponent(path)}`;
          }
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      setSession(initial);
      setUser(initial?.user ?? null);
      if (initial?.user) {
        loadUserData(initial.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Sincronização entre abas — apenas quando aba envia sinal explícito
    const onBcMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "signed-in" && msg.userId) {
        // Outra aba logou com usuário diferente → conflito de sessão
        const current = (supabase.auth as any).currentUser?.id ?? null;
        if (current && current !== msg.userId) window.location.reload();
      }
      // Importante: NÃO reagir a "signed-out" — pode ser apenas refresh expirado
      // numa aba inativa. O usuário ativo não deve perder o trabalho.
    };
    bcRef?.addEventListener("message", onBcMessage);

    // Quando a aba volta a ficar visível, força refresh do token antes que o
    // usuário clique em salvar (evita falha por token expirado após minimizar).
    const onVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const expiresAt = (data.session.expires_at ?? 0) * 1000;
        // Se faltam menos de 60s ou já expirou, tenta renovar silenciosamente
        if (expiresAt - Date.now() < 60_000) {
          await supabase.auth.refreshSession();
        }
      } catch {
        // Falha silenciosa — não desloga; deixa a próxima requisição decidir
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    // Feedback discreto de conexão — evita confundir o usuário quando o erro
    // é apenas falta momentânea de internet.
    let offlineToastId: string | number | null = null;
    const onOffline = () => {
      offlineToastId = toast.warning("Sem conexão", {
        description: "Suas alterações serão salvas localmente até voltar.",
        duration: Infinity,
      });
    };
    const onOnline = () => {
      if (offlineToastId !== null) {
        toast.dismiss(offlineToastId);
        offlineToastId = null;
      }
      toast.success("Conexão restabelecida");
      // Renova sessão silenciosamente após reconectar
      supabase.auth.refreshSession().catch(() => {});
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      subscription.unsubscribe();
      bcRef?.removeEventListener("message", onBcMessage);
      bcRef?.close();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Valores efetivos: durante preview-equipe, usamos os do usuário simulado.
  const previewAtivo = !!previewEquipeId && roles.includes("gestor");
  const effectiveProfile = previewAtivo && previewProfile ? previewProfile : profile;
  const effectiveRoles = previewAtivo ? previewRoles : roles;
  const effectivePermissions = previewAtivo ? previewPermissions : permissions;
  const isGestor = effectiveRoles.includes("gestor");

  const hasPermission = (modulo: Modulo, acao: Acao) => {
    if (isGestor) return true;
    return effectivePermissions.has(`${modulo}:${acao}`);
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      void registrarEventoLogin({
        evento: "login_falha",
        email,
        motivo: error.message,
      });
    } else {
      void registrarEventoLogin({
        evento: "login_sucesso",
        email,
        userId: data.user?.id ?? null,
      });
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome },
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    const currentUserId = user?.id ?? null;
    const currentEmail = user?.email ?? null;
    await supabase.auth.signOut();
    clearLocalAuthArtifacts();
    void registrarEventoLogin({
      evento: "logout",
      email: currentEmail,
      userId: currentUserId,
    });
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  };

  const refresh = async () => {
    if (user) await loadUserData(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile: effectiveProfile,
        roles: effectiveRoles,
        permissions: effectivePermissions,
        loading,
        isGestor,
        signIn, signUp, signOut, resetPassword, updatePassword, hasPermission, refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
