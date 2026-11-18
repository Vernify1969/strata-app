import { Worker } from "node:worker_threads";

const HEADER = 16;

function openPostgres(url) {
  const sab = new SharedArrayBuffer(1024 * 1024);
  const flag = new Int32Array(sab, 0, 1);
  const len = new Int32Array(sab, 4, 1);
  const bytes = new Uint8Array(sab, HEADER);
  const worker = new Worker(new URL("./pg-worker.js", import.meta.url), { workerData: { url, sab } });
  const ready = Atomics.wait(flag, 0, 0, 8000);
  const state = Atomics.load(flag, 0);
  if (ready === "timed-out" || state === 0) {
    worker.terminate();
    throw new Error("PostgreSQL did not connect. Check DATABASE_URL.");
  }
  if (state === 3) {
    const message = read(bytes, len[0]);
    worker.terminate();
    throw new Error(message.error || "PostgreSQL did not connect.");
  }

  function call(sql, params = []) {
    const encoded = Buffer.from(JSON.stringify({ sql, params }));
    if (encoded.length > bytes.length) throw new Error("That database request is too large.");
    bytes.set(encoded);
    len[0] = encoded.length;
    Atomics.store(flag, 0, 2);
    Atomics.notify(flag, 0);
    Atomics.wait(flag, 0, 2, 8000);
    const reply = read(bytes, len[0]);
    Atomics.store(flag, 0, 1);
    if (reply.error) throw new Error(reply.error);
    return reply;
  }

  return {
    prepare(sql) {
      return {
        get(...params) {
          const reply = call(sql, params);
          return reply.rows[0];
        },
        all(...params) {
          return call(sql, params).rows;
        },
        run(...params) {
          const reply = call(sql, params);
          return { changes: reply.count };
        }
      };
    },
    exec(sql) {
      call(sql, []);
    },
    close() {
      try { call("close-marker", []); } catch { /* the worker ends */ }
      worker.terminate();
    }
  };
}

function read(bytes, length) {
  return JSON.parse(Buffer.from(bytes.slice(0, length)).toString("utf8"));
}

export { openPostgres };
