import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { get } from "node:http";
const fixture = "a".repeat(64);
async function run(ok) {
  const preload =
    "globalThis.fetch=async()=>({ok:" +
    ok +
    ",json:async()=>({ok:true,despachos_enviados:0})})";
  const child = spawn(
    process.execPath,
    [
      "--import",
      "data:text/javascript," + encodeURIComponent(preload),
      "deploy/vps/worker.mjs",
    ],
    {
      env: {
        ...process.env,
        JAS_WORKER_ID: "11111111-1111-4111-8111-111111111111",
        JAS_WORKER_TOKEN: fixture,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Worker não iniciou")),
      8000,
    );
    const data = (b) => {
      output += b.toString();
      if (
        output.includes("worker_started") &&
        output.includes(ok ? "heartbeat_confirmed" : "heartbeat_failed")
      ) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", data);
    child.stderr.on("data", data);
    child.on("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          "Worker encerrou antes do healthcheck: " +
            code +
            " " +
            output.replaceAll(fixture, "[fixture]"),
        ),
      );
    });
  });
  try {
    await ready;
    const health = await new Promise((resolve, reject) =>
      get("http://127.0.0.1:3000", (res) => {
        let body = "";
        res.on("data", (b) => (body += b));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: JSON.parse(body) }),
        );
      }).on("error", reject),
    );
    assert.equal(health.status, ok ? 200 : 503);
    assert.equal(health.body.ok, ok);
    assert.equal(output.includes(fixture), false);
    assert.equal(JSON.stringify(health).includes(fixture), false);
  } finally {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGTERM");
    await exited;
  }
}
test("worker só fica pronto após pulso confirmado e não expõe credencial", () =>
  run(true));
test("worker com pulso recusado sinaliza indisponibilidade", () => run(false));
