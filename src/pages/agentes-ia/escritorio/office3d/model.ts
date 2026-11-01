export type Point = { x: number; z: number };
export const DEPARTAMENTOS = [
  ["recepcao", "Recepção"],
  ["diretoria", "Diretoria"],
  ["comando", "Central de Comando"],
  ["operacional", "Operacional"],
  ["controladoria", "Controladoria"],
  ["processos", "Processos"],
  ["diligencias", "Diligências"],
  ["comercial", "Comercial"],
  ["marketing", "Marketing"],
  ["financeiro", "Financeiro"],
  ["reuniao", "Sala de Reuniões"],
  ["copa", "Copa"],
].map(([id, nome], i) => ({
  id,
  nome,
  x: (i % 4) * 10,
  z: Math.floor(i / 4) * 10,
}));
export interface ClaraTask {
  id: string;
  estado: string;
  criado_em: string;
  atualizado_em: string;
  tokens_entrada: number;
  tokens_saida: number;
  custo_estimado_usd: number;
  tentativas: number;
  pendencias_total: number;
  possui_erro: boolean;
  cadastro_confirmado: boolean;
  eventos: { id: string; estado: string; criado_em: string }[];
}
export interface ClaraSnapshot {
  agente_id: "clara-txt-v1";
  habilitado: boolean;
  servidor_em: string;
  revisao: string;
  tarefas: ClaraTask[];
}
export const STATUS: Record<string, string> = {
  received: "TXT recebido",
  classified: "Cadastro TXT identificado",
  planned: "Demanda recebida",
  routed: "Encaminhada para Clara",
  queued: "Na fila",
  running: "Extraindo e validando TXT",
  awaiting_input: "Precisa de informação",
  awaiting_approval: "Aguardando sua aprovação",
  completed: "Concluída na homologação",
  failed: "Falha registrada",
  cancelled: "Cancelada",
};
export const CLARA_STATION = { x: 35.5, z: 3.5 };
export const CLARA_APPROVAL = { x: 25.5, z: 4.5 };
export function destination(state?: string): Point {
  return state === "awaiting_approval" || state === "awaiting_input"
    ? CLARA_APPROVAL
    : state === "queued"
      ? { x: 5.5, z: 4.5 }
      : CLARA_STATION;
}
export function currentTask(tasks: ClaraTask[]) {
  return (
    tasks
      .filter((t) =>
        ["running", "queued", "awaiting_approval", "awaiting_input"].includes(
          t.estado,
        ),
      )
      .sort(
        (a, b) => Date.parse(b.atualizado_em) - Date.parse(a.atualizado_em),
      )[0] ?? tasks[0]
  );
}
export function acceptSnapshot(
  prev: ClaraSnapshot | null,
  next: ClaraSnapshot,
) {
  if (
    next.agente_id !== "clara-txt-v1" ||
    !/^\d+$/.test(next.revisao) ||
    !Array.isArray(next.tarefas) ||
    !Number.isFinite(Date.parse(next.servidor_em))
  )
    return prev;
  if (
    prev &&
    (BigInt(next.revisao) < BigInt(prev.revisao) ||
      Date.parse(next.servidor_em) < Date.parse(prev.servidor_em))
  )
    return prev;
  return next;
}
// Same obstacles drive rendering and routing. Doorways face the shared corridor.
export const OBSTACLES = DEPARTAMENTOS.flatMap((r) => [
  { x: r.x, z: r.z, w: 8, d: 0.4 },
  { x: r.x, z: r.z, w: 0.4, d: 6 },
  { x: r.x + 7.6, z: r.z, w: 0.4, d: 6 },
  { x: r.x, z: r.z + 5.6, w: 3, d: 0.4 },
  { x: r.x + 5, z: r.z + 5.6, w: 3, d: 0.4 },
  { x: r.x + 1, z: r.z + 1.5, w: 2.5, d: 1.5 },
]);
OBSTACLES.push({ x: 34.5, z: 1.5, w: 2, d: 1 });
export function walkable(p: Point) {
  return (
    p.x >= 0.5 &&
    p.x <= 38 &&
    p.z >= 0.5 &&
    p.z <= 28 &&
    !OBSTACLES.some(
      (o) =>
        p.x > o.x - 0.3 &&
        p.x < o.x + o.w + 0.3 &&
        p.z > o.z - 0.3 &&
        p.z < o.z + o.d + 0.3,
    )
  );
}
export function route(from: Point, to: Point, others: Point[] = []): Point[] {
  const key = (p: Point) => `${Math.round(p.x * 2)},${Math.round(p.z * 2)}`;
  const snap = (p: Point) => ({
    x: Math.round(p.x * 2) / 2,
    z: Math.round(p.z * 2) / 2,
  });
  const start = snap(from),
    end = snap(to);
  if (!walkable(start) || !walkable(end)) return [];
  const queue = [start],
    seen = new Map<string, Point | null>([[key(start), null]]);
  let found = false;
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (key(p) === key(end)) {
      found = true;
      break;
    }
    for (const [dx, dz] of [
      [0.5, 0],
      [-0.5, 0],
      [0, 0.5],
      [0, -0.5],
    ]) {
      const n = { x: p.x + dx, z: p.z + dz };
      if (
        walkable(n) &&
        others.every((o) => Math.hypot(o.x - n.x, o.z - n.z) > 0.7) &&
        !seen.has(key(n))
      ) {
        seen.set(key(n), p);
        queue.push(n);
      }
    }
  }
  if (!found) return [];
  const out: Point[] = [];
  let p: Point | null = end;
  while (p) {
    out.push(p);
    p = seen.get(key(p)) ?? null;
  }
  return out.reverse();
}
