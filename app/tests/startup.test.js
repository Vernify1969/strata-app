import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

test("npm start answers on PORT within a few seconds without loading OCR", async () => {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "strata-start-"));
  const started = Date.now();
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.js"], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DEMO_MODE: "1",
      DATABASE_PATH: path.join(dir, "strata.db"),
      DOCUMENTS_PATH: path.join(dir, "documents")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    const deadline = Date.now() + 5000;
    let body = null;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) {
          body = await res.json();
          break;
        }
      } catch { /* not listening yet */ }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    const elapsed = Date.now() - started;
    assert.equal(body?.ok, true, `health did not answer within 5s\n${output}`);
    assert.ok(elapsed < 4000, `server took ${elapsed}ms to answer on PORT`);
    const status = fs.readFileSync(`/proc/${child.pid}/status`, "utf8");
    const rss = Number(status.match(/VmRSS:\s+(\d+)/)[1]);
    assert.ok(rss < 180000, `startup RSS ${rss} KB is too high for a 512 MB instance`);
    const maps = fs.readFileSync(`/proc/${child.pid}/maps`, "utf8");
    assert.equal(/tesseract|libheif|heic-convert|mammoth/.test(maps), false);
    assert.match(output, new RegExp(`port ${port}`));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
