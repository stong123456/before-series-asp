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
  assert(Array.isArray(challenge.accepts) && challenge.accepts.length > 0, `${service.key} has no payment option.`);
  const option = challenge.accepts[0];
  assert(option.scheme === "exact", `${service.key} scheme must be exact.`);
  assert(option.network === "eip155:196", `${service.key} network must be X Layer mainnet.`);
  assert(option.amount === "10000", `${service.key} amount must be 10000 base units (0.01 USD₮0).`);
  assert(/^0x[a-fA-F0-9]{40}$/.test(option.payTo || ""), `${service.key} payTo is invalid.`);
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
  assert(tools.some((tool) => tool.name === name), `MCP discovery is missing ${name}.`);
}

console.log(`Verified ${baseUrl}: health, three standard 0.01 USD₮0 x402 challenges, and MCP discovery are valid.`);

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
