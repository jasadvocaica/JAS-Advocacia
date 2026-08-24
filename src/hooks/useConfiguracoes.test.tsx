import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConfiguracoes } from "./useConfiguracoes";

// ---- Mocks ----------------------------------------------------------------

const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastWarning = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  // Cadeia .from(...).select(...).eq(...).order(...) e .from(...).update(...).eq(...).eq(...)
  const chain = () => ({
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return {
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      };
    },
  });
  return {
    supabase: {
      from: () => chain(),
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: "user-1" } } }),
      },
    },
  };
});

let mockAuthState: {
  isGestor: boolean;
  loading: boolean;
  user: { id: string } | null;
} = { isGestor: false, loading: false, user: { id: "user-1" } };

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

// ---- 9 seções do módulo Configurações ------------------------------------

const SECOES = [
  "escritorio",
  "usuarios",
  "portais",
  "processos",
  "controladoria",
  "financeiro",
  "documentos",
  "integracoes",
  "sistema",
] as const;

// ---- Tests ---------------------------------------------------------------

describe("useConfiguracoes — proteção por papel (gestor)", () => {
  beforeEach(() => {
    mockSelect.mockClear();
    mockUpdate.mockClear();
    mockToastError.mockClear();
    mockToastSuccess.mockClear();
    mockToastWarning.mockClear();
  });

  describe.each(SECOES)("seção %s", (secao) => {
    it("não-gestor NÃO consegue LER configurações", async () => {
      mockAuthState = { isGestor: false, loading: false, user: { id: "u1" } };

      const { result } = renderHook(() => useConfiguracoes(secao));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockSelect).not.toHaveBeenCalled();
      expect(result.current.config).toEqual({});
      expect(result.current.erro).toBe("Acesso restrito a gestores");
    });

    it("não-gestor NÃO consegue SALVAR uma chave", async () => {
      mockAuthState = { isGestor: false, loading: false, user: { id: "u1" } };

      const { result } = renderHook(() => useConfiguracoes(secao));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.salvarChave("qualquer", "valor");
      });

      expect(ok).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith(
        "Apenas gestores podem alterar configurações do sistema",
      );
    });

    it("não-gestor NÃO consegue SALVAR em lote", async () => {
      mockAuthState = { isGestor: false, loading: false, user: { id: "u1" } };

      const { result } = renderHook(() => useConfiguracoes(secao));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.salvar({ a: "1", b: "2" });
      });

      expect(ok).toBe(false);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockToastError).toHaveBeenCalledWith(
        "Apenas gestores podem alterar configurações do sistema",
      );
    });

    it("usuário não autenticado também é bloqueado", async () => {
      mockAuthState = { isGestor: false, loading: false, user: null };

      const { result } = renderHook(() => useConfiguracoes(secao));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mockSelect).not.toHaveBeenCalled();
      expect(result.current.erro).toBe("Acesso restrito a gestores");
    });
  });

  it("gestor CONSEGUE disparar a leitura (sanity check)", async () => {
    mockAuthState = { isGestor: true, loading: false, user: { id: "gestor-1" } };

    const { result } = renderHook(() => useConfiguracoes("escritorio"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockSelect).toHaveBeenCalled();
    expect(result.current.erro).toBeNull();
  });
});
