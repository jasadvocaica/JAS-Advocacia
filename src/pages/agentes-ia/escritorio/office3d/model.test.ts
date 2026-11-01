import { describe, it, expect } from "vitest";
import {
  acceptSnapshot,
  currentTask,
  destination,
  route,
  walkable,
  DEPARTAMENTOS,
  CLARA_STATION,
  CLARA_APPROVAL,
  type ClaraSnapshot,
  type ClaraTask,
} from "./model";
const snapshot = (
  revisao: string,
  servidor_em = "2026-11-01T20:00:00Z",
): ClaraSnapshot => ({
  agente_id: "clara-txt-v1",
  habilitado: true,
  servidor_em,
  revisao,
  tarefas: [],
});
describe("Estado do avatar recebe confirmação do servidor", () => {
  it("ignora revisões antigas mesmo quando chegam depois", () => {
    const p = snapshot("20");
    expect(acceptSnapshot(p, snapshot("19", "2026-11-01T20:01:00Z"))).toBe(p);
  });
  it("ignora snapshots anteriores e identidades inválidas", () => {
    const p = snapshot("20");
    expect(acceptSnapshot(p, snapshot("21", "2026-11-01T19:00:00Z"))).toBe(p);
    expect(
      acceptSnapshot(p, { ...snapshot("21"), agente_id: "outra" } as never),
    ).toBe(p);
  });
  it("permite recuperar o estado no primeiro acesso e aceitar duplicata sem criar eventos", () => {
    const p = snapshot("20");
    expect(acceptSnapshot(null, p)).toBe(p);
    expect(acceptSnapshot(p, p)?.tarefas).toHaveLength(0);
  });
  it("prioriza uma execução ativa sobre um resultado antigo", () => {
    const done = {
      id: "a",
      estado: "completed",
      atualizado_em: "2026-11-01T19:00:00Z",
    } as ClaraTask;
    const running = {
      ...done,
      id: "b",
      estado: "running",
      atualizado_em: "2026-11-01T20:00:00Z",
    };
    expect(currentTask([done, running])?.id).toBe("b");
    expect(currentTask([])).toBeUndefined();
  });
});
describe("Navegação física sem cruzar paredes ou móveis", () => {
  it("inclui os doze departamentos sem criar funcionários fictícios", () => {
    expect(DEPARTAMENTOS).toHaveLength(12);
    expect(new Set(DEPARTAMENTOS.map((d) => d.id)).size).toBe(12);
  });
  it.each([
    ["fila para trabalho", destination("queued"), CLARA_STATION],
    ["trabalho para revisão", CLARA_STATION, CLARA_APPROVAL],
    ["revisão para estação", CLARA_APPROVAL, CLARA_STATION],
  ] as const)("%s passa pelas portas e corredores", (_name, from, to) => {
    const path = route(from, to);
    expect(path.length).toBeGreaterThan(10);
    expect(path[path.length - 1]).toEqual(to);
    for (const p of path) expect(walkable(p)).toBe(true);
    for (let i = 1; i < path.length; i++)
      expect(
        Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z),
      ).toBeCloseTo(0.5);
  });
  it("desvia da posição de outro personagem no corredor", () => {
    const path = route({ x: 14, z: 8 }, { x: 18, z: 8 }, [{ x: 16, z: 8 }]);
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((p) => Math.hypot(p.x - 16, p.z - 8) > 0.7)).toBe(true);
  });
  it("recusa destino dentro de móvel em vez de atravessá-lo", () =>
    expect(route(CLARA_STATION, { x: 35.5, z: 2 })).toEqual([]));
});
