import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  OFFICE_NAV,
  OFFICE_SECONDARY,
  normalizarMenu,
  type SecaoOffice,
} from "./navigation";
export default function OfficeSidebar({
  secao,
  collapsed,
  toggle,
  contratar,
  onNavigate,
}: {
  secao: SecaoOffice;
  collapsed: boolean;
  toggle: () => void;
  contratar: () => void;
  onNavigate?: () => void;
}) {
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState(""),
    [fechados, setFechados] = useState<Record<string, boolean>>({}),
    [submenu, setSubmenu] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);
  const q = normalizarMenu(query);
  const groups = OFFICE_NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.modulo || hasPermission(i.modulo, "visualizar")) &&
        (!q ||
          normalizarMenu(
            i.label +
              " " +
              g.label +
              " " +
              (i.children ?? []).map((c) => c.label).join(" "),
          ).includes(q)),
    ),
  })).filter((g) => g.items.length);
  return (
    <div className="op-sidebar" data-collapsed={collapsed}>
      <Link
        to="/escritorio"
        className="op-brand"
        aria-label="Juliana Araújo Advocacia — Central de Comando"
        onClick={onNavigate}
      >
        <svg
          viewBox="640 440 380 440"
          role="img"
          aria-label="Monograma Juliana Araújo"
        >
          <image href="/logo-juliana-araujo.png" width="1600" height="1600" />
        </svg>
        {!collapsed && (
          <span>
            <strong>Juliana Araújo</strong>
            <small>ADVOCACIA</small>
            <em>Escritório Inteligente</em>
          </span>
        )}
      </Link>
      <div className="op-nav-search">
        {collapsed ? (
          <button
            type="button"
            aria-label="Expandir e pesquisar menu"
            onClick={() => {
              toggle();
              requestAnimationFrame(() => input.current?.focus());
            }}
          >
            <Search size={18} />
          </button>
        ) : (
          <label>
            <Search size={15} />
            <input
              ref={input}
              aria-label="Pesquisar menu"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar no menu"
            />
            {query && (
              <button
                aria-label="Limpar pesquisa do menu"
                onClick={() => setQuery("")}
              >
                <X size={12} />
              </button>
            )}
          </label>
        )}
      </div>
      <nav
        className="op-navigation"
        aria-label="Menu do escritório inteligente"
      >
        {groups.length === 0 && (
          <p className="op-nav-empty">Nenhum módulo encontrado.</p>
        )}
        {groups.map((g) => (
          <section key={g.label}>
            <button
              className="op-nav-group"
              aria-label={g.label}
              aria-expanded={!fechados[g.label] || !!q || collapsed}
              onClick={() =>
                setFechados((v) => ({ ...v, [g.label]: !v[g.label] }))
              }
            >
              {!collapsed && (
                <>
                  <span>{g.label}</span>
                  <ChevronDown
                    size={12}
                    className={
                      fechados[g.label] && !q ? "op-chevron-closed" : ""
                    }
                  />
                </>
              )}
            </button>
            {(!fechados[g.label] || q || collapsed) &&
              g.items.map((i) =>
                i.children && !collapsed ? (
                  <div key={i.label}>
                    <button
                      className="op-nav-item"
                      aria-expanded={!!submenu[i.label] || !!q}
                      onClick={() =>
                        setSubmenu((v) => ({ ...v, [i.label]: !v[i.label] }))
                      }
                    >
                      <i.icon size={18} />
                      <span>{i.label}</span>
                      <ChevronDown size={12} />
                    </button>
                    {(submenu[i.label] || q) && (
                      <div className="op-nav-submenu">
                        {i.children.map((c) => (
                          <Link key={c.to} to={c.to} onClick={onNavigate}>
                            {c.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={i.label}
                    to={i.to}
                    title={collapsed ? i.label : i.hint}
                    className={`op-nav-item ${i.section === secao ? "op-nav-selected" : ""}`}
                    aria-label={i.label}
                    aria-current={i.section === secao ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <i.icon size={18} />
                    {!collapsed && <span>{i.label}</span>}
                  </Link>
                ),
              )}
          </section>
        ))}
      </nav>
      <div className="op-sidebar-tools">
        {OFFICE_SECONDARY.map((i) => (
          <Link
            key={i.to}
            className={`op-nav-item ${secao === i.section ? "op-nav-selected" : ""}`}
            to={i.to}
            aria-label={i.label}
            title={collapsed ? i.label : undefined}
            onClick={onNavigate}
          >
            <i.icon size={17} />
            {!collapsed && <span>{i.label}</span>}
          </Link>
        ))}
        <button
          className="op-hire"
          aria-label="Contratar agente"
          title={collapsed ? "Contratar agente" : undefined}
          onClick={() => {
            contratar();
            onNavigate?.();
          }}
        >
          <Plus size={17} />
          {!collapsed && <span>Contratar agente</span>}
        </button>
        <div className="op-sidebar-bottom">
          <Link
            to="/"
            aria-label="Voltar ao sistema JAS"
            title="Voltar ao JAS"
            onClick={onNavigate}
          >
            <ArrowLeft size={16} />
            {!collapsed && <span>Voltar ao JAS</span>}
          </Link>
          <button
            aria-label={
              collapsed ? "Expandir menu lateral" : "Recolher menu lateral"
            }
            onClick={toggle}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
