import { parentPort, workerData } from "node:worker_threads";
import { translatePlaceholders } from "./sql.js";
import { POSTGRES_SCHEMA } from "./pg-schema.js";

const { url, sab } = workerData;
const flag = new Int32Array(sab, 0, 1);
const len = new Int32Array(sab, 4, 1);
const bytes = new Uint8Array(sab, 16);

function writeMessage(message) {
  const encoded = Buffer.from(JSON.stringify(message));
  if (encoded.length > bytes.length) {
    const small = Buffer.from(JSON.stringify({ error: "The database reply was too large." }));
    bytes.set(small);
    len[0] = small.length;
  } else {
    bytes.set(encoded);
    len[0] = encoded.length;
  }
  Atomics.store(flag, 0, 3);
  Atomics.notify(flag, 0);
}

const pg = await import("pg");
const pool = new pg.default.Pool({ connectionString: url, max: 1 });
try {
  const client = await pool.connect();
  for (const statement of POSTGRES_SCHEMA.split(";").map(part => part.trim()).filter(Boolean)) {
    await client.query(statement);
  }
  await client.query("INSERT INTO schema_migrations (version) VALUES (9) ON CONFLICT DO NOTHING");
  client.release();
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
} catch (err) {
  writeMessage({ error: err instanceof Error ? err.message : "PostgreSQL did not connect." });
  process.exit(1);
}

while (true) {
  let state = Atomics.load(flag, 0);
  while (state !== 2) {
    Atomics.wait(flag, 0, state);
    state = Atomics.load(flag, 0);
  }
  const request = JSON.parse(Buffer.from(bytes.slice(0, len[0])).toString("utf8"));
  try {
    if (request.op === "close") {
      await pool.end();
      writeMessage({ ok: true });
      break;
    }
    const translated = translatePlaceholders(request.sql);
    const result = await pool.query(translated.text, request.params || []);
    writeMessage({ rows: result.rows || [], count: result.rowCount || 0 });
  } catch (err) {
    writeMessage({ error: err instanceof Error ? err.message : "The database query failed." });
  }
}
