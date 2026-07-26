const baseUrl = String(process.argv[2] || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
if (!/^https:\/\//i.test(baseUrl)) {
  console.error("Usage: npm run verify:public -- https://your-public-domain.example");
  process.exit(1);
}

const services = [
  { key: "ape", path: "/api/before/ape", content: "Limited-time airdrop. Connect wallet and approve to claim." },
  { key: "sign", path: "/api/before/sign", content: "Approve unlimited USDT allowance to spender 0x1111111111111111111111111111111111111111." },
  { key: "shill", path: "/api/before/shill", content: "Guaranteed 100x. Buy now before the last slots disappear!" }
];

const health = await fetchWithTimeout(`${baseUrl}/health`, {}, 12_000);
assert(health.status === 200, `Health expected 200, received ${health.status}.`);
const healthBody = await health.json();
assert(healthBody.ok === true, "Health body must report ok=true.");
assert(healthBody.payment === "ready", "Production health must report payment=ready.");
assert(healthBody.reports === "ready", "Production health must report reports=ready.");

const reportCss = await fetchWithTimeout(`${baseUrl}/report-assets/report.css`, {}, 12_000);
assert(reportCss.status === 200, `Report stylesheet expected 200, received ${reportCss.status}.`);
assert(/default-src 'none'/.test(reportCss.headers.get("content-security-policy") || ""), "Report assets must use the restrictive report CSP.");

for (const service of services) {
  const usage = await fetchWithTimeout(`${baseUrl}${service.path}?lang=en`, { method: "GET" }, 12_000);
  assert(usage.status === 200, `${service.key} GET usage expected 200, received ${usage.status}.`);
  assert(!usage.headers.get("payment-required"), `${service.key} GET usage must never request payment.`);
  const usageBody = await usage.json();
  assert(/Collect the required content first/.test(usageBody.paymentFlow || ""), `${service.key} GET usage is missing the content-first flow.`);

  const response = await fetchWithTimeout(`${baseUrl}${service.path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }, 12_000);
  assert(response.status === 400, `${service.key} invalid-input preflight expected 400, received ${response.status}.`);
  const body = await response.json();
  assert(body.error?.code === "INPUT_REQUIRED", `${service.key} invalid-input preflight must return INPUT_REQUIRED.`);
  assert(body.paymentStarted === false, `${service.key} invalid-input preflight must state paymentStarted=false.`);
  assert(body.requiredInput?.schema?.required?.includes("content"), `${service.key} must declare content as required before payment.`);
  assert(!response.headers.get("payment-required"), `${service.key} invalid-input preflight must not emit a payment challenge.`);
}

const invocationOnly = await fetchWithTimeout(`${baseUrl}/api/before/ape`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    content: `I would like to use the services of agent ID 6656\nService name: Before Ape\nService type: A2MCP\nEndpoint: ${baseUrl}/api/before/ape\nPlease use OKX Agent Payments Protocol.`,
    lang: "en"
  })
}, 12_000);
assert(invocationOnly.status === 400, `Invocation-only request expected 400, received ${invocationOnly.status}.`);
assert(!invocationOnly.headers.get("payment-required"), "Invocation-only request must not emit a payment challenge.");
assert((await invocationOnly.json()).paymentStarted === false, "Invocation-only request must state paymentStarted=false.");

for (const service of services) {
  const url = `${baseUrl}${service.path}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: service.content, lang: "en" })
  }, 12_000);
  assert(response.status === 402, `${service.key} expected 402, received ${response.status}.`);
  const rawChallenge = response.headers.get("payment-required");
  assert(rawChallenge, `${service.key} is missing PAYMENT-REQUIRED.`);
  const challenge = decodeBase64Json(rawChallenge);
  assert(challenge.x402Version === 2, `${service.key} must use x402 v2.`);
  assert(challenge.resource?.url === url, `${service.key} resource URL mismatch: ${challenge.resource?.url || "missing"}.`);
  const input = challenge.extensions?.bazaar?.info?.input;
  assert(input?.type === "http", `${service.key} challenge must declare an HTTP input.`);
  assert(input?.method === "POST", `${service.key} challenge must declare POST input.`);
  assert(input?.bodyType === "json", `${service.key} challenge must declare a JSON body.`);
  assert(typeof input?.body?.content === "string" && input.body.content.length > 0, `${service.key} challenge must include a valid content example.`);
  const bodySchema = challenge.extensions?.bazaar?.schema?.properties?.input?.properties?.body;
  assert(bodySchema?.required?.includes("content"), `${service.key} challenge must declare body.content as required.`);
  assert(Array.isArray(challenge.accepts) && challenge.accepts.length > 0, `${service.key} has no payment option.`);
  const option = challenge.accepts[0];
  assert(option.scheme === "exact", `${service.key} scheme must be exact.`);
  assert(option.network === "eip155:196", `${service.key} network must be X Layer mainnet.`);
  assert(option.amount === "10000", `${service.key} amount must be 10000 base units (0.01 USDt0).`);
  assert(/^0x[a-fA-F0-9]{40}$/.test(option.payTo || ""), `${service.key} payTo is invalid.`);
}

for (const alias of ["/api/before/ape/", "/API/BEFORE/APE"]) {
  const response = await fetchWithTimeout(`${baseUrl}${alias}`, { method: "POST" }, 12_000);
  assert(response.status === 404, `Non-canonical paid alias ${alias} must return 404, received ${response.status}.`);
}

const mcpResponse = await fetchWithTimeout(`${baseUrl}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
}, 12_000);
assert(mcpResponse.status === 200, `MCP tools/list expected 200, received ${mcpResponse.status}.`);
const mcp = await mcpResponse.json();
const tools = mcp.result?.tools || [];
for (const name of ["before_ape", "before_sign", "before_shill"]) {
  const tool = tools.find((item) => item.name === name);
  assert(tool, `MCP discovery is missing ${name}.`);
  assert(tool.inputSchema?.required?.includes("content"), `${name} must require content.`);
  assert(/do not initiate payment/i.test(tool.description || ""), `${name} must tell callers not to pay before content.`);
}

console.log(`Verified ${baseUrl}: free usage discovery, content-first preflight, invocation guard, strict POST-only paid routes, Bazaar input schemas, three 0.01 USDt0 x402 challenges, and MCP discovery are valid.`);

function decodeBase64Json(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch (error) {
    throw new Error(`PAYMENT-REQUIRED is not valid base64 JSON: ${error.message}`);
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
