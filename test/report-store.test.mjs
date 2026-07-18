import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReportStore } from "../src/reports/store.mjs";

test("production report store encrypts payloads and expires bearer links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "before-reports-"));
  let now = Date.UTC(2026, 6, 17, 8, 0, 0);
  try {
    const store = await createReportStore({
      production: true,
      directory,
      encryptionKey: Buffer.alloc(32, 7).toString("base64"),
      ttlMs: 60_000,
      now: () => now
    });
    const metadata = await store.create({ primary: { marker: "classified-report-value" }, variants: {} });
    assert.match(metadata.id, /^[A-Za-z0-9_-]{32}$/);
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    const ciphertext = await readFile(join(directory, files[0]), "utf8");
    assert.doesNotMatch(ciphertext, /classified-report-value/);
    assert.equal((await store.get(metadata.id)).payload.primary.marker, "classified-report-value");

    now += 60_001;
    assert.equal(await store.get(metadata.id), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production report store rejects missing or weak encryption configuration", async () => {
  await assert.rejects(() => createReportStore({ production: true, directory: "relative", encryptionKey: "weak" }), /absolute directory/);
  await assert.rejects(() => createReportStore({ production: true, directory: tmpdir(), encryptionKey: "weak" }), /32 bytes/);
});
