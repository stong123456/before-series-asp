import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../src/server.mjs";

let baseUrl;
let server;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health and root expose three independent services", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const root = await fetch(`${baseUrl}/`);
  const body = await root.json();
  assert.deepEqual(Object.keys(body.endpoints), ["ape", "sign", "shill"]);
  assert.equal(body.price, "0.01 USD₮0 per call");
});

test("JSON and plain-text requests return exactly one card", async () => {
  const jsonResponse = await fetch(`${baseUrl}/api/before/ape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "限时空投，连接钱包领取。", lang: "zh" })
  });
  assert.equal(jsonResponse.status, 200);
  const json = await jsonResponse.json();
  assert.equal(json.service, "before-ape");
  assert.equal(typeof json.cardText, "string");

  const textResponse = await fetch(`${baseUrl}/api/before/sign?lang=en`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "setApprovalForAll operator 0x1111111111111111111111111111111111111111"
  });
  assert.equal(textResponse.status, 200);
  const text = await textResponse.json();
  assert.equal(text.service, "before-sign");
  assert.equal(text.language, "en");
});

test("empty and malformed requests return bounded errors", async () => {
  const empty = await fetch(`${baseUrl}/api/before/shill?lang=en`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "" })
  });
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).error.code, "INPUT_REQUIRED");

  const malformed = await fetch(`${baseUrl}/api/before/shill?lang=en`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "INVALID_JSON");

  const languageOnly = await fetch(`${baseUrl}/api/before/ape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang: "en" })
  });
  assert.equal(languageOnly.status, 400);
  assert.equal((await languageOnly.json()).error.code, "INPUT_REQUIRED");
});

test("MCP discovery returns descriptors, not free paid results", async () => {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
  });
  const body = await response.json();
  assert.deepEqual(body.result.tools.map((tool) => tool.name), ["before_ape", "before_sign", "before_shill"]);
  assert.ok(body.result.tools.every((tool) => tool._meta.price === "0.01 USD₮0"));
});
