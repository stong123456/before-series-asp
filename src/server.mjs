import dotenv from "dotenv";
import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBeforeApe } from "./analyzers/ape.mjs";
import { ANALYSIS_VERSION, InputError, normalizeLang, prepareInput } from "./analyzers/common.mjs";
import { analyzeBeforeShill } from "./analyzers/shill.mjs";
import { analyzeBeforeSign } from "./analyzers/sign.mjs";
import { createContentInputSchema, isInvocationOnly } from "./contracts.mjs";
import { createPaymentLayer, isPaidPath, isProductionRuntime } from "./payment.mjs";
import { renderReportDocument, renderReportUnavailable } from "./reports/render.mjs";
import { createReportStore } from "./reports/store.mjs";

const sourceDir = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(sourceDir, "../.env"), quiet: true });

const app = express();
const port = positiveInteger(process.env.PORT, 8790);
const productionRuntime = isProductionRuntime();
if (productionRuntime && !String(process.env.PUBLIC_BASE_URL || "").trim()) {
  throw new Error("PUBLIC_BASE_URL is required in production.");
}
const publicBaseUrl = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`);
const SERVICE_VERSION = "2.1.0";
const reportStore = await createReportStore({ production: productionRuntime });
const reportAssetsDir = resolve(sourceDir, "reports/assets");
const phosphorAssetsDir = resolve(sourceDir, "../node_modules/@phosphor-icons/web/src/regular");
const SERVICES = [
  {
    key: "ape",
    name: { zh: "Before Ape", en: "Before Ape" },
    serviceName: { zh: "冲前风险检查卡", en: "Pre-Ape Risk Check Card" },
    path: "/api/before/ape",
    analyzer: analyzeBeforeApe,
    inputPrompt: {
      zh: "请先粘贴你准备参与的项目介绍、推文、活动规则、官网文案或合约地址；收到实际内容后才会进入付款确认。",
      en: "First paste the actual project post, activity rules, website copy, or contract address you want checked. Payment confirmation starts only after content is supplied."
    },
    inputDescription: {
      zh: "用户实际要检查的项目或活动内容。不得用 Agent 调用口令、服务名称或接口地址代替。",
      en: "The actual project or activity content to assess. Ask the user for it before payment; never substitute the Agent invocation, service name, or endpoint."
    },
    inputExample: "Limited-time airdrop: connect your wallet and approve the contract to claim.",
    paymentDescription: "Before Ape bilingual Web3 risk check. Requires the user's actual project or activity content in body.content before payment; ask for it first and never pay for an empty invocation."
  },
  {
    key: "sign",
    name: { zh: "Before Sign", en: "Before Sign" },
    serviceName: { zh: "钱包签名风险提醒", en: "Wallet Signature Risk Reminder" },
    path: "/api/before/sign",
    analyzer: analyzeBeforeSign,
    inputPrompt: {
      zh: "请先粘贴钱包弹窗、签名内容、授权页面或交易提示；请勿发送助记词、私钥或验证码。收到实际内容后才会进入付款确认。",
      en: "First paste the wallet prompt, signature text, approval page, or transaction notice. Never send a seed phrase, private key, or verification code. Payment confirmation starts only after content is supplied."
    },
    inputDescription: {
      zh: "用户实际看到的钱包签名、授权或交易提示。不得用 Agent 调用口令代替，且不得要求助记词、私钥或验证码。",
      en: "The actual wallet signature, approval, or transaction prompt. Ask for it before payment; never substitute the Agent invocation and never request seed phrases, private keys, or verification codes."
    },
    inputExample: "Approve unlimited USDt0 allowance to spender 0x1111111111111111111111111111111111111111.",
    paymentDescription: "Before Sign bilingual wallet interaction risk reminder. Requires the user's actual signature, approval, or transaction text in body.content before payment; ask for it first and never request secrets."
  },
  {
    key: "shill",
    name: { zh: "Before Shill", en: "Before Shill" },
    serviceName: { zh: "Web3 推文发布前检查", en: "Web3 Pre-Publish Copy Check" },
    path: "/api/before/shill",
    analyzer: analyzeBeforeShill,
    inputPrompt: {
      zh: "请先粘贴准备发布的推文、推广文案、活动介绍或合作内容；收到实际文案后才会进入付款确认。",
      en: "First paste the actual tweet, promotion copy, activity introduction, or collaboration content you plan to publish. Payment confirmation starts only after content is supplied."
    },
    inputDescription: {
      zh: "用户实际准备发布或合作审核的 Web3 文案。不得用 Agent 调用口令、服务名称或接口地址代替。",
      en: "The actual Web3 copy the user plans to publish or review. Ask for it before payment; never substitute the Agent invocation, service name, or endpoint."
    },
    inputExample: "Guaranteed 100x returns. Buy now before the final allocation disappears!",
    paymentDescription: "Before Shill bilingual Web3 pre-publish copy check. Requires the user's actual draft in body.content before payment; ask for it first and never pay for an empty invocation."
  }
];

app.disable("x-powered-by");
app.enable("case sensitive routing");
app.enable("strict routing");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (productionRuntime) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, PAYMENT-SIGNATURE, X-PAYMENT");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
  if (_req.path.startsWith("/reports/") || _req.path.startsWith("/report-assets/")) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'self'; font-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  }
  if (_req.method === "OPTIONS") return res.status(204).end();
  return next();
});
app.use(createRateLimitMiddleware());
app.use("/report-assets/icons", express.static(phosphorAssetsDir, { fallthrough: false, immutable: true, index: false, maxAge: "7d" }));
app.use("/report-assets", express.static(reportAssetsDir, { fallthrough: false, immutable: true, index: false, maxAge: "1h" }));

let paymentLayer;
try {
  paymentLayer = await createPaymentLayer({ publicBaseUrl, services: SERVICES });
} catch (error) {
  console.error(`[startup] Payment layer unavailable: ${safeError(error)}`);
  process.exitCode = 1;
  throw error;
}

app.use(express.json({ limit: "24kb", strict: true }));
app.use(express.text({ type: ["text/*", "application/x-www-form-urlencoded"], limit: "24kb" }));

app.use((req, res, next) => {
  if (req.method !== "POST" || !isPaidPath(req, SERVICES)) return next();
  const service = SERVICES.find((item) => item.path === req.path);
  const lang = requestedLang(req);
  const input = extractInput(req.body);
  if (isInvocationOnly(input)) {
    const responseLang = lang === "auto" ? normalizeLang("auto", String(input).slice(0, 256)) : lang;
    return res.status(400).json(inputRequiredPayload(service, responseLang));
  }
  try {
    prepareInput(input, lang);
    return next();
  } catch (error) {
    if (!(error instanceof InputError)) return next(error);
    const responseLang = lang === "auto" ? normalizeLang("auto", String(input || "").slice(0, 256)) : lang;
    if (error.code === "INPUT_REQUIRED") return res.status(error.status).json(inputRequiredPayload(service, responseLang));
    const message = responseLang === "zh" ? error.zhMessage : error.enMessage;
    return res.status(error.status).json(errorPayload(error.code, message));
  }
});

if (paymentLayer.middleware) {
  app.use((req, res, next) => {
    if (!isPaidPath(req, SERVICES)) return next();
    return paymentLayer.middleware(req, res, next);
  });
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "before-series",
    version: SERVICE_VERSION,
    analysisVersion: ANALYSIS_VERSION,
    description: {
      zh: "Before 系列：一次输入，一张双语检查卡，帮助 Web3 用户在冲项目、签钱包和发推之前降低可避免的风险。",
      en: "Before Series: one input, one bilingual check card for avoidable Web3 risks before aping, signing, or publishing."
    },
    price: "0.01 USD₮0 per call",
    endpoints: Object.fromEntries(SERVICES.map((service) => [service.key, `${publicBaseUrl}${service.path}`])),
    mcp: `${publicBaseUrl}/mcp`,
    health: `${publicBaseUrl}/health`,
    payment: paymentLayer.status,
    reports: { enabled: true, ttlHours: reportStore.ttlMs / 3_600_000, storage: reportStore.mode }
  });
});

app.get("/health", (_req, res) => {
  const ready = !paymentLayer.status.required || paymentLayer.status.ready;
  res.status(ready ? 200 : 503).json({
    ok: ready,
    service: "before-series",
    version: SERVICE_VERSION,
    payment: paymentLayer.status.ready ? "ready" : paymentLayer.status.required ? "unavailable" : "disabled_in_development",
    reports: "ready"
  });
});

app.get("/reports/:id", asyncRoute(async (req, res) => {
  const lang = normalizeLang(req.query.lang || "auto");
  const record = await reportStore.get(req.params.id);
  res.type("html");
  if (!record) return res.status(410).send(renderReportUnavailable(lang));
  return res.send(renderReportDocument(record, req.query.lang));
}));

for (const service of SERVICES) {
  app.get(service.path, (req, res) => {
    const lang = normalizeLang(req.query.lang || "auto");
    return res.json(serviceUsage(service, lang));
  });
  app.head(service.path, (_req, res) => res.status(200).end());
  app.post(service.path, asyncRoute(async (req, res) => {
    const lang = requestedLang(req);
    const input = extractInput(req.body);
    return handleAnalysis(service, input, lang, res);
  }));
}

app.post("/mcp", async (req, res) => {
  const response = handleMcp(req.body);
  if (response === null) return res.status(204).end();
  return res.json(response);
});

app.use((error, req, res, _next) => {
  const lang = requestedLang(req);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json(errorPayload("INVALID_JSON", lang === "en" ? "Invalid JSON request body." : "JSON 请求体格式无效。"));
  }
  if (error?.type === "entity.too.large") {
    return res.status(413).json(errorPayload("INPUT_TOO_LARGE", lang === "en" ? "Request body is too large." : "请求内容过长。"));
  }
  console.error(`[request] ${safeError(error)}`);
  return res.status(500).json(errorPayload("INTERNAL_ERROR", lang === "en" ? "The service could not complete this check." : "服务暂时无法完成检查。"));
});

app.use((_req, res) => res.status(404).json(errorPayload("NOT_FOUND", "Not found.")));

export function startServer(listenPort = port, host = "0.0.0.0") {
  const server = app.listen(listenPort, host, () => {
    const boundPort = appServerAddressPort(server) || listenPort;
    console.log(`[startup] Before Series listening on port ${boundPort}; payment=${paymentLayer.status.ready ? "ready" : "development-disabled"}`);
  });
  return configureServerTimeouts(server);
}

const isDirectRun = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isDirectRun) {
  const server = configureServerTimeouts(app.listen(port, "0.0.0.0", () => {
    console.log(`[startup] Before Series listening on port ${port}; payment=${paymentLayer.status.ready ? "ready" : "development-disabled"}`);
  }));
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}

async function handleAnalysis(service, input, lang, res) {
  try {
    const primary = service.analyzer(input, { lang });
    const alternateLanguage = primary.language === "en" ? "zh" : "en";
    const alternate = service.analyzer(input, { lang: alternateLanguage });
    const metadata = await reportStore.create({
      primary,
      variants: { [primary.language]: primary, [alternate.language]: alternate }
    });
    const reportUrl = `${publicBaseUrl}/reports/${metadata.id}`;
    const reportLabel = primary.language === "en" ? "Web report" : "网页报告";
    return res.json({
      ...primary,
      cardText: `${primary.cardText}\n\n${reportLabel}: ${reportUrl}`,
      reportUrl,
      report: {
        url: reportUrl,
        expiresAt: metadata.expiresAt,
        access: "unguessable_bearer_link",
        storedContent: "generated_redacted_report_only"
      }
    });
  } catch (error) {
    if (error instanceof InputError) {
      const message = lang === "en" ? error.enMessage : error.zhMessage;
      return res.status(error.status).json(errorPayload(error.code, message));
    }
    throw error;
  }
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function extractInput(body) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return body;
  const keys = ["content", "text", "input", "message", "prompt", "description", "data"];
  const candidates = keys.map((key) => body[key]);
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (candidate && typeof candidate === "object") {
      if (typeof candidate.content === "string") return candidate.content;
      if (typeof candidate.text === "string") return candidate.text;
    }
  }
  if (keys.some((key) => Object.hasOwn(body, key))) return "";
  const dataOnly = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "lang"));
  return Object.keys(dataOnly).length ? JSON.stringify(dataOnly) : "";
}

function requestedLang(req) {
  if (typeof req.query?.lang === "string") return requestedLangValue(req.query.lang);
  if (req.body && typeof req.body === "object" && typeof req.body.lang === "string") return requestedLangValue(req.body.lang);
  return "auto";
}

function requestedLangValue(value) {
  return String(value || "auto").trim().toLowerCase() === "auto" ? "auto" : normalizeLang(value);
}

function serviceUsage(service, lang) {
  return {
    ok: true,
    service: service.name[lang] || service.name.zh,
    serviceName: service.serviceName[lang] || service.serviceName.zh,
    method: "POST",
    price: "0.01 USD₮0",
    input: {
      content: service.inputPrompt[lang] || service.inputPrompt.zh,
      lang: "zh | en | auto"
    },
    paymentFlow: lang === "en"
      ? "Collect the required content first. Only then call this POST endpoint and show the payment confirmation. GET and HEAD are free usage discovery methods."
      : "先收集必填内容，再调用此 POST 接口并展示付款确认。GET 与 HEAD 仅用于免费查看使用说明。",
    behavior: lang === "en" ? "After content is provided, make one paid call and return one structured card without additional questions." : "用户提供内容后，只发起一次付费调用，不再追问，直接返回一张结构化检查卡。",
    assessmentBoundary: lang === "en"
      ? "Static preliminary screening only; no external link fetch, on-chain query, transaction simulation, security certification, or legal opinion."
      : "仅提供静态前置筛查；不访问外链、不查询链上状态、不模拟交易，不构成安全认证或法律意见。"
  };
}

function handleMcp(message) {
  if (!message || message.jsonrpc !== "2.0") return jsonRpcError(message?.id ?? null, -32600, "Invalid JSON-RPC request.");
  if (message.method?.startsWith("notifications/")) return null;
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "before-series", version: SERVICE_VERSION }
      }
    };
  }
  if (message.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: SERVICES.map((service) => ({
          name: `before_${service.key}`,
          description: `${service.paymentDescription} If content is missing, ask the user for it and do not initiate payment. Paid endpoint: ${publicBaseUrl}${service.path}`,
          inputSchema: createContentInputSchema(service),
          _meta: {
            paidEndpoint: `${publicBaseUrl}${service.path}`,
            method: "POST",
            price: "0.01 USD₮0",
            paymentProtocol: "OKX Agent Payments Protocol",
            paymentPolicy: "Collect required content before initiating payment."
          }
        }))
      }
    };
  }
  if (message.method === "tools/call") {
    const key = String(message.params?.name || "").replace(/^before_/, "");
    const service = SERVICES.find((item) => item.key === key);
    if (!service) return jsonRpcError(message.id, -32602, "Unknown Before Series tool.");
    const content = message.params?.arguments?.content;
    if (typeof content !== "string" || !content.trim() || isInvocationOnly(content)) {
      return jsonRpcError(message.id, -32602, "Actual content is required before payment. Ask the user to provide it first.", {
        paymentStarted: false,
        required: ["content"],
        prompt: service.inputPrompt.en,
        inputSchema: createContentInputSchema(service)
      });
    }
    if (content.length > 20_000) {
      return jsonRpcError(message.id, -32602, "Content must not exceed 20000 characters.", { paymentStarted: false });
    }
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{
          type: "text",
          text: JSON.stringify({
            paidEndpoint: `${publicBaseUrl}${service.path}`,
            method: "POST",
            body: { content, lang: message.params?.arguments?.lang || "auto" },
            price: "0.01 USD₮0",
            instruction: "The required content is present. Show the payment confirmation, then send this exact request through OKX Agent Payments Protocol to receive the card."
          })
        }]
      }
    };
  }
  return jsonRpcError(message.id, -32601, `Unknown method: ${message.method}`);
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function errorPayload(code, message) {
  return { ok: false, error: { code, message } };
}

function inputRequiredPayload(service, lang) {
  const selectedLang = lang === "en" ? "en" : "zh";
  return {
    ok: false,
    paymentStarted: false,
    error: {
      code: "INPUT_REQUIRED",
      message: service.inputPrompt[selectedLang]
    },
    requiredInput: {
      field: "content",
      prompt: service.inputPrompt[selectedLang],
      schema: createContentInputSchema(service)
    },
    nextAction: selectedLang === "en"
      ? "Ask the user for the required content. Do not initiate or confirm payment yet."
      : "请先向用户收集必填内容，此时不要发起或确认付款。"
  };
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be a valid absolute URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("PUBLIC_BASE_URL must be a clean HTTP(S) origin without credentials, query, or fragment.");
  }
  if (parsed.pathname !== "/") throw new Error("PUBLIC_BASE_URL must not include a path.");
  return parsed.origin;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeError(error) {
  return String(error?.message || error || "unknown error").replace(/[\r\n]/g, " ").slice(0, 240);
}

function appServerAddressPort(server) {
  const address = server?.address?.();
  return address && typeof address === "object" ? address.port : null;
}

function configureServerTimeouts(server) {
  server.headersTimeout = 15_000;
  server.requestTimeout = 45_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

function createRateLimitMiddleware() {
  const windowMs = positiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
  const maxRequests = positiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 120);
  const maxEntries = positiveInteger(process.env.RATE_LIMIT_MAX_ENTRIES, 10_000);
  const buckets = new Map();
  let lastSweep = Date.now();

  return (req, res, next) => {
    if (req.method === "OPTIONS" || req.path === "/" || req.path === "/health") return next();
    const now = Date.now();
    if (now - lastSweep >= windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweep = now;
    }

    const key = String(req.ip || req.socket.remoteAddress || "unknown");
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= maxEntries) buckets.delete(buckets.keys().next().value);
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(maxRequests));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, maxRequests - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > maxRequests) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json(errorPayload("RATE_LIMITED", "Too many requests. Retry later."));
    }
    return next();
  };
}

export { app };
