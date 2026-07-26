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

test("lang auto detects Chinese instead of forcing English", async () => {
  const response = await fetch(`${baseUrl}/api/before/ape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "限时空投，请连接钱包授权后领取。", lang: "auto" })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.language, "zh");
  assert.match(result.cardText, /网页报告:/);
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
    assert.ok(result.cardText.includes(`Web report: ${result.reportUrl}`));

    const reportPath = `${new URL(result.reportUrl).pathname}`;
    const report = await fetch(`${baseUrl}${reportPath}`);
    assert.equal(report.status, 200);
    assert.match(report.headers.get("content-type"), /text\/html/);
    assert.match(report.headers.get("content-security-policy"), /default-src 'none'/);
    assert.match(report.headers.get("x-robots-tag"), /noindex/);
    const html = await report.text();
    assert.match(html, new RegExp(`Before ${service[0].toUpperCase()}${service.slice(1)}`, "i"));
    assert.doesNotMatch(html, /data-copy-link|navigator\.clipboard/);
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
  assert.match(body.paymentFlow, /Collect the required content first/);
  assert.equal(response.headers.get("payment-required"), null);
});

test("empty and malformed requests return bounded errors", async () => {
  const empty = await fetch(`${baseUrl}/api/before/shill?lang=en`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "" })
  });
  assert.equal(empty.status, 400);
  const emptyBody = await empty.json();
  assert.equal(emptyBody.error.code, "INPUT_REQUIRED");
  assert.equal(emptyBody.paymentStarted, false);
  assert.deepEqual(emptyBody.requiredInput.schema.required, ["content"]);
  assert.match(emptyBody.nextAction, /Do not initiate or confirm payment/);

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

test("service invocation boilerplate is rejected before payment", async () => {
  const invocation = [
    "我想使用 Agent 6656 提供的服务：",
    "服务名称：Before Ape 冲前风险检查卡",
    "服务类型：A2MCP",
    `接口地址：${baseUrl}/api/before/ape`,
    "请使用 OKX Agent Payments Protocol 向该接口发送请求。"
  ].join("\n");
  const response = await fetch(`${baseUrl}/api/before/ape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: invocation, lang: "zh" })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("payment-required"), null);
  assert.equal(body.paymentStarted, false);
  assert.equal(body.error.code, "INPUT_REQUIRED");
  assert.match(body.requiredInput.prompt, /请先粘贴/);

  const placeholderResponse = await fetch(`${baseUrl}/api/before/ape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `${invocation}\n检查内容：<粘贴项目介绍、推文或活动规则>`, lang: "zh" })
  });
  assert.equal(placeholderResponse.status, 400);
  assert.equal((await placeholderResponse.json()).paymentStarted, false);

  const actualContentResponse = await fetch(`${baseUrl}/api/before/ape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: `${invocation}\n检查内容：限时空投要求连接钱包并进行无限额度授权。`, lang: "zh" })
  });
  assert.equal(actualContentResponse.status, 200);
  assert.equal((await actualContentResponse.json()).service, "before-ape");
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
  assert.ok(body.result.tools.every((tool) => tool.inputSchema.required.includes("content")));
  assert.ok(body.result.tools.every((tool) => /do not initiate payment/i.test(tool.description)));
});

test("MCP refuses to build a paid call until actual content exists", async () => {
  const missing = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "before_ape", arguments: {} } })
  });
  const missingBody = await missing.json();
  assert.equal(missingBody.error.code, -32602);
  assert.equal(missingBody.error.data.paymentStarted, false);
  assert.deepEqual(missingBody.error.data.required, ["content"]);

  const valid = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "before_ape", arguments: { content: "Airdrop requires wallet approval.", lang: "en" } }
    })
  });
  const validBody = await valid.json();
  const descriptor = JSON.parse(validBody.result.content[0].text);
  assert.equal(descriptor.body.content, "Airdrop requires wallet approval.");
  assert.match(descriptor.instruction, /required content is present/i);
});
