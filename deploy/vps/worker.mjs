import { createServer } from "node:http";
const workerId = process.env.JAS_WORKER_ID,
  token = process.env.JAS_WORKER_TOKEN;
const endpoint =
  "https://mzwnljgujheumdslkloc.supabase.co/functions/v1/escritorio-vps";
if (
  !/^[0-9a-f-]{36}$/i.test(workerId ?? "") ||
  !/^[0-9a-f]{64}$/.test(token ?? "")
) {
  console.error(
    "Defina JAS_WORKER_ID e JAS_WORKER_TOKEN no EasyPanel. Não publique credenciais nos logs.",
  );
  process.exit(1);
}
let lastSuccess = 0,
  failures = 0,
  stopped = false,
  timer;
const server = createServer((_req, res) => {
  const ok = Date.now() - lastSuccess < 180000;
  res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok,
      version: "jas-worker-1",
      last_success: lastSuccess ? new Date(lastSuccess).toISOString() : null,
    }),
  );
});
server.listen(3000, "0.0.0.0", () =>
  console.log(JSON.stringify({ event: "worker_started" })),
);
async function tick() {
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-jas-worker-token": token,
      },
      body: JSON.stringify({ acao: "pulso", worker_id: workerId }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("pulso recusado");
    const result = await r.json();
    if (result.ok !== true) throw new Error("pulso não confirmado");
    lastSuccess = Date.now();
    failures = 0;
    console.log(
      JSON.stringify({
        event: "heartbeat_confirmed",
        dispatches: result.despachos_enviados ?? 0,
      }),
    );
  } catch {
    failures++;
    console.error(
      JSON.stringify({ event: "heartbeat_failed", attempt: failures }),
    );
  } finally {
    if (!stopped)
      timer = setTimeout(
        tick,
        Math.min(300000, 60000 * 2 ** Math.min(failures, 3)),
      );
  }
}
void tick();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
    clearTimeout(timer);
    server.close(() => process.exit(0));
  });
