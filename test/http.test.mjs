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
  assert.match(json.reportUrl, /^http:\/\/127\.0\.0\.1:8790\/reports\/[A-Za-z0-9_-]{32}$/);
  assert.equal(json.report.url, json.reportUrl);

  const textResponse = await fetch(`${baseUrl}/api/before/sign?lang=en`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "setApprovalForAll operator 0x1111111111111111111111111111111111111111"
  });
  assert.equal(textResponse.status, 200);
  const text = await textResponse.json();
  assert.equal(text.service, "before-sign");
  assert.equal(text.language, "en");
  assert.match(text.reportUrl, /\/reports\/[A-Za-z0-9_-]{32}$/);
});

test("every successful check returns a bilingual temporary HTML report", async () => {
  for (const service of ["ape", "sign", "shill"]) {
    const response = await fetch(`${baseUrl}/api/before/${service}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Limited offer. Verify the official source before taking action.", lang: "en" })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.ok(result.reportUrl);

    const reportPath = `${new URL(result.reportUrl).pathname}`;
    const report = await fetch(`${baseUrl}${reportPath}`);
    assert.equal(report.status, 200);
    assert.match(report.headers.get("content-type"), /text\/html/);
    assert.match(report.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(report.headers.get("x-robots-tag"), /noindex/);
    const html = await report.text();
    assert.match(html, new RegExp(`Before ${service[0].toUpperCase()}${service.slice(1)}`, "i"));
    assert.match(html, /data-copy-link/);
    assert.match(html, /aria-label="Copy link"/);
    assert.match(html, /aria-label="Print"/);
    if (service === "shill") assert.match(html, /Overall score/);

    const chinese = await fetch(`${baseUrl}${reportPath}?lang=zh`);
    assert.equal(chinese.status, 200);
    assert.match(await chinese.text(), /判断置信度|报告编号/);
  }
});

test("report HTML escapes hostile content and expired-style links fail closed", async () => {
  const response = await fetch(`${baseUrl}/api/before/shill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "<script>alert(1)</script> Guaranteed profit.", lang: "en" })
  });
  const result = await response.json();
  const html = await (await fetch(`${baseUrl}${new URL(result.reportUrl).pathname}`)).text();
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/i);
  assert.match(html, /&lt;script&gt;/i);

  const missing = await fetch(`${baseUrl}/reports/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
  assert.equal(missing.status, 410);
  assert.match(await missing.text(), /报告不可用|Report unavailable/);
});

test("paid route aliases are rejected instead of bypassing exact path protection", async () => {
  const trailingSlash = await fetch(`${baseUrl}/api/before/ape/`);
  const mixedCase = await fetch(`${baseUrl}/API/BEFORE/APE`);
  assert.equal(trailingSlash.status, 404);
  assert.equal(mixedCase.status, 404);
});

test("GET never analyzes user content from a query string", async () => {
  const response = await fetch(`${baseUrl}/api/before/sign?lang=en&content=approve%20unlimited`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.method, "POST");
  assert.equal(body.card, undefined);
  assert.match(body.assessmentBoundary, /Static preliminary screening/);
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
