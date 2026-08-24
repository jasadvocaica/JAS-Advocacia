import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

// Cobre as 9 subseções do módulo Configurações.
const SUBROTAS = [
  "escritorio",
  "usuarios",
  "portais",
  "processos",
  "controladoria",
  "financeiro",
  "documentos",
  "integracoes",
  "sistema",
];

let mockAuth: {
  user: { id: string } | null;
  loading: boolean;
  profile: { ativo: boolean } | null;
  isGestor: boolean;
  hasPermission: () => boolean;
} = {
  user: { id: "u1" },
  loading: false,
  profile: { ativo: true },
  isGestor: false,
  hasPermission: () => false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/contexts/PreviewModeContext", () => ({
  usePreviewMode: () => ({ preview: null, setPreview: () => {}, clearPreview: () => {} }),
}));

function renderRota(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/configuracoes/*"
          element={
            <ProtectedRoute requireGestor>
              <div>CONTEUDO_CONFIGURACOES</div>
            </ProtectedRoute>
          }
        />
        <Route path="/sem-permissao" element={<div>PAGINA_SEM_PERMISSAO</div>} />
        <Route path="/login" element={<div>PAGINA_LOGIN</div>} />
        <Route path="/conta-inativa" element={<div>PAGINA_CONTA_INATIVA</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute — módulo Configurações", () => {
  beforeEach(() => {
    mockAuth = {
      user: { id: "u1" },
      loading: false,
      profile: { ativo: true },
      isGestor: false,
      hasPermission: () => false,
    };
  });

  describe.each(SUBROTAS)("subseção /configuracoes/%s", (sub) => {
    it("redireciona não-gestor para /sem-permissao", () => {
      mockAuth.isGestor = false;
      renderRota(`/configuracoes/${sub}`);
      expect(screen.getByText("PAGINA_SEM_PERMISSAO")).toBeInTheDocument();
      expect(screen.queryByText("CONTEUDO_CONFIGURACOES")).not.toBeInTheDocument();
    });

    it("redireciona usuário não autenticado para /login", () => {
      mockAuth.user = null;
      mockAuth.isGestor = false;
      renderRota(`/configuracoes/${sub}`);
      expect(screen.getByText("PAGINA_LOGIN")).toBeInTheDocument();
    });

    it("redireciona conta inativa para /conta-inativa", () => {
      mockAuth.profile = { ativo: false };
      mockAuth.isGestor = true; // mesmo gestor inativo é bloqueado
      renderRota(`/configuracoes/${sub}`);
      expect(screen.getByText("PAGINA_CONTA_INATIVA")).toBeInTheDocument();
    });

    it("permite acesso quando o usuário é gestor ativo", () => {
      mockAuth.isGestor = true;
      renderRota(`/configuracoes/${sub}`);
      expect(screen.getByText("CONTEUDO_CONFIGURACOES")).toBeInTheDocument();
    });
  });
});
