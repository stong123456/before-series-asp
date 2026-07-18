const PRICE_USD = "0.01";

export async function createPaymentLayer({ publicBaseUrl, services }) {
  const required = truthy(process.env.X402_REQUIRE_PAYMENT) || process.env.NODE_ENV === "production";
  const payTo = String(process.env.X402_PAY_TO || process.env.PAY_TO_ADDRESS || "").trim();
  const enabled = truthy(process.env.X402_ENABLED) || Boolean(payTo);
  const network = process.env.X402_NETWORK || "eip155:196";
  const status = {
    required,
    enabled,
    ready: false,
    network,
    price: `$${PRICE_USD}`
  };

  if (!enabled) {
    if (required) throw new Error("Production payment is required but X402_ENABLED/X402_PAY_TO is not configured.");
    return { status, middleware: null };
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) throw new Error("X402_PAY_TO must be a valid EVM address.");
  validatePublicBaseUrl(publicBaseUrl, required);
  if (required && network !== "eip155:196") throw new Error("Production X402_NETWORK must be X Layer mainnet (eip155:196).");

  const apiKey = process.env.OKX_API_KEY || "";
  const secretKey = process.env.OKX_SECRET_KEY || "";
  const passphrase = process.env.OKX_PASSPHRASE || "";
  if (!apiKey || !secretKey || !passphrase) throw new Error("OKX seller credentials are incomplete.");

  const [{ paymentMiddleware }, { OKXFacilitatorClient, x402ResourceServer }, { ExactEvmScheme }] = await Promise.all([
    import("@okxweb3/x402-express"),
    import("@okxweb3/x402-core"),
    import("@okxweb3/x402-evm/exact/server")
  ]);

  const facilitatorClient = new OKXFacilitatorClient({
    apiKey,
    secretKey,
    passphrase,
    baseUrl: validateOkxBaseUrl(process.env.OKX_BASE_URL || "https://web3.okx.com", required),
    syncSettle: process.env.OKX_SYNC_SETTLE === undefined ? true : truthy(process.env.OKX_SYNC_SETTLE)
  });
  const resourceServer = new x402ResourceServer(facilitatorClient);
  resourceServer.register(status.network, new ExactEvmScheme());
  await withTimeout(
    resourceServer.initialize(),
    positiveInteger(process.env.X402_INIT_TIMEOUT_MS, 10_000),
    "OKX payment facilitator initialization timed out."
  );

  const routeConfig = buildRouteConfig({
    publicBaseUrl,
    services,
    payTo,
    network: status.network,
    timeoutSeconds: positiveInteger(process.env.X402_TIMEOUT_SECONDS, 300)
  });

  status.ready = true;
  const sdkMiddleware = paymentMiddleware(routeConfig, resourceServer, undefined, undefined, false);
  return {
    status,
    middleware(req, res, next) {
      wrapPaymentRequiredResponse(res);
      return sdkMiddleware(req, res, next);
    }
  };
}

export function buildRouteConfig({ publicBaseUrl, services, payTo, network = "eip155:196", timeoutSeconds = 300 }) {
  const routeConfig = {};
  for (const service of services) {
    for (const method of ["GET", "HEAD", "POST"]) {
      routeConfig[`${method} ${service.path}`] = {
        accepts: [{
          scheme: "exact",
          network,
          payTo,
          price: `$${PRICE_USD}`,
          maxTimeoutSeconds: timeoutSeconds
        }],
        resource: `${publicBaseUrl}${service.path}`,
        description: service.paymentDescription,
        mimeType: "application/json"
      };
    }
  }
  return routeConfig;
}

export function isPaidPath(req, services) {
  return ["GET", "HEAD", "POST"].includes(req.method) && services.some((service) => service.path === req.path);
}

export function validatePublicBaseUrl(value, required = true) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("PUBLIC_BASE_URL must be a valid absolute URL.");
  }
  if (required && parsed.protocol !== "https:") throw new Error("PUBLIC_BASE_URL must use HTTPS in production.");
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("PUBLIC_BASE_URL must be an origin without credentials, path, query, or fragment.");
  }
  return parsed.origin;
}

export function validateOkxBaseUrl(value, required = true) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new Error("OKX_BASE_URL must be a valid absolute URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("OKX_BASE_URL must be a clean HTTPS origin.");
  }
  if (required && parsed.origin !== "https://web3.okx.com") {
    throw new Error("Production OKX_BASE_URL must be https://web3.okx.com.");
  }
  return parsed.origin;
}

function wrapPaymentRequiredResponse(res) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 402) {
      const rawHeader = firstHeaderValue(res.getHeader("PAYMENT-REQUIRED") || res.getHeader("payment-required"));
      const challenge = decodePaymentRequired(rawHeader);
      if (challenge?.x402Version) {
        res.setHeader("PAYMENT-REQUIRED", rawHeader);
        res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
        return originalJson(challenge);
      }
    }
    return originalJson(body);
  };
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function decodePaymentRequired(value) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
