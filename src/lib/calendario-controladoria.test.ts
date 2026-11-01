import { describe, expect, it, vi } from "vitest";
import { horarioEvento, salvarEventoGoogle } from "../../supabase/functions/_shared/calendario-controladoria";

const id = "00000000-0000-0000-0000-000000000001";
const item = { id, tipo: "intimacao", origem: "pje_publicacao", data_vencimento: "2026-11-03T18:00:00-04:00" };

describe("agenda de publicações", () => {
  it("identifica triagem como compromisso interno", () => {
    const evento = horarioEvento(item);
    expect(evento.prefixo).toBe("[TRIAGEM INTERNA] ");
    expect(evento.start).toEqual({ dateTime: "2026-11-03T22:00:00.000Z", timeZone: "America/Cuiaba" });
  });
  it("não anuncia como definitivo um prazo ainda não conferido", () => {
    const evento = horarioEvento({ ...item, data_prazo_judicial: "2026-11-10", prazo_conferido: false });
    expect(evento.prefixo).toBe("[CONFERIR PRAZO] ");
    expect(evento.start).toHaveProperty("dateTime");
  });
  it("usa o dia judicial confirmado, mesmo quando a meta interna é anterior", () => {
    const evento = horarioEvento({ ...item, data_prazo_judicial: "2026-12-31", prazo_conferido: true });
    expect(evento.start).toEqual({ date: "2026-12-31" });
    expect(evento.end).toEqual({ date: "2027-01-01" });
  });
  it("rejeita uma data impossível", () => {
    expect(() => horarioEvento({ ...item, data_prazo_judicial: "2026-02-30", prazo_conferido: true })).toThrow();
  });
  it("recupera criação anterior sem duplicar após falha de gravação local", async () => {
    const api = vi.fn().mockRejectedValueOnce(Object.assign(new Error("Já existe"), { status: 409 }))
      .mockResolvedValueOnce({ id: "jas00000000000000000000000000000001" });
    const evento = await salvarEventoGoogle(api, "juridico", id, { summary: "Triagem" });
    expect(api.mock.calls.map((c) => c[1].method)).toEqual(["POST", "PATCH"]);
    expect(JSON.parse(api.mock.calls[0][1].body).id).toBe(evento);
  });
  it("não tenta criar outro evento quando há falha de autorização", async () => {
    const api = vi.fn().mockRejectedValue(Object.assign(new Error("Sem acesso"), { status: 403 }));
    await expect(salvarEventoGoogle(api, "juridico", id, {}, "existente")).rejects.toThrow("Sem acesso");
    expect(api).toHaveBeenCalledTimes(1);
  });
});
