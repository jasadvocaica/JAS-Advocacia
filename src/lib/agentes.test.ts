import { describe, expect, it } from "vitest";
import { agenteNativo, destinoN8n, permissaoAgente } from "../../supabase/functions/_shared/agentes";

describe("fronteiras de execução dos agentes", () => {
  it("executa os dois agentes DJEN sem exigir um serviço externo", () => {
    expect(agenteNativo("monitor-djen")).toBe(true);
    expect(agenteNativo("monitor-prazos")).toBe(true);
    expect(agenteNativo("minuta-pecas")).toBe(false);
  });
  it("exige edição para decidir ou cancelar e rejeita ação desconhecida", () => {
    expect(permissaoAgente("disparar")).toBe("criar");
    expect(permissaoAgente("decidir")).toBe("editar");
    expect(permissaoAgente("cancelar")).toBe("editar");
    expect(permissaoAgente("executar_sql")).toBeNull();
  });
  it.each(["https://outro.exemplo/webhook", "//outro.exemplo/webhook", "http://n8n.exemplo/webhook", "https://usuario:senha@n8n.exemplo/webhook"])(
    "impede envio do token para destino não autorizado: %s", (url) => {
      expect(() => destinoN8n(url, "https://n8n.exemplo")).toThrow();
    },
  );
  it("aceita caminho relativo no servidor configurado", () => {
    expect(destinoN8n("/webhook/prazos", "https://n8n.exemplo")).toBe("https://n8n.exemplo/webhook/prazos");
    expect(() => destinoN8n("/webhook/prazos", "")).toThrow();
  });
});
