import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers.js";

test("the server serves the existing front end and the account script", async () => {
  const server = await startApp();
  try {
    const page = await fetch(server.base + "/");
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Plus Jakarta Sans/);
    assert.match(html, /New request/);
    assert.match(html, /Notices and comments/);
    assert.match(html, /src="\/wire\.js"/);
    assert.match(html, /Strata App does not hold the money/);
    const wire = await fetch(server.base + "/wire.js");
    assert.equal(wire.status, 200);
    assert.match(await wire.text(), /\/api\/register/);
  } finally {
    await server.close();
  }
});
