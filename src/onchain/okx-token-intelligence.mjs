import { createHmac } from "node:crypto";

const OKX_ORIGIN = "https://web3.okx.com";
const SEARCH_PATH = "/api/v6/dex/market/token/search";
const ADVANCED_PATH = "/api/v6/dex/market/token/advanced-info";
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_ADDRESSES = 3;
const CACHE_TTL_MS = 120_000;
const CACHE_LIMIT = 500;

const CHAINS = [
  { id: "1", name: "Ethereum", patterns: [/\beth(?:ereum)?\b/i, /\u4ee5\u592a\u574a/u] },
  { id: "56", name: "BNB Smart Chain", patterns: [/\bbsc\b/i, /\bbnb\s*(?:smart\s*)?chain\b/i, /\u5e01\u5b89\u667a\u80fd\u94fe/u] },
  { id: "8453", name: "Base", patterns: [/\bbase(?:\s+chain)?\b/i] },
  { id: "196", name: "X Layer", patterns: [/\bx\s*layer\b/i, /\bxlayer\b/i] },
  { id: "137", name: "Polygon", patterns: [/\bpolygon\b/i, /\bmatic\b/i] },
  { id: "42161", name: "Arbitrum", patterns: [/\barbitrum\b/i, /\barb\s*(?:one)?\b/i] },
  { id: "10", name: "Optimism", patterns: [/\boptimism\b/i, /\bop\s*(?:mainnet)?\b/i] },
  { id: "43114", name: "Avalanche", patterns: [/\bavalanche\b/i, /\bavax\b/i] },
  { id: "59144", name: "Linea", patterns: [/\blinea\b/i] },
  { id: "324", name: "zkSync Era", patterns: [/\bzksync(?:\s+era)?\b/i] }
];

const CHAIN_NAMES = Object.fromEntries(CHAINS.map((chain) => [chain.id, chain.name]));
const DEFAULT_CHAIN_IDS = CHAINS.map((chain) => chain.id);

export function createOkxTokenIntelligence(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());
  const timeoutMs = positiveInteger(options.timeoutMs ?? env.OKX_MARKET_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const apiKey = String(env.OKX_MARKET_API_KEY || env.OKX_API_KEY || "").trim();
  const secretKey = String(env.OKX_MARKET_SECRET_KEY || env.OKX_SECRET_KEY || "").trim();
  const passphrase = String(env.OKX_MARKET_PASSPHRASE || env.OKX_PASSPHRASE || "").trim();
  const configured = Boolean(apiKey && secretKey && passphrase && typeof fetchImpl === "function");
  const cache = new Map();

  return {
    status: {
      configured,
      provider: "OKX OnchainOS Token API",
      timeoutMs,
      maxAddresses: MAX_ADDRESSES
    },
    async inspect(rawInput) {
      const addresses = extractEvmAddresses(rawInput).slice(0, MAX_ADDRESSES);
      if (!addresses.length) return notApplicable();

      const queriedAt = now().toISOString();
      if (!configured) {
        return unavailable(addresses, queriedAt, "credentials_unavailable");
      }

      const hintedChains = detectChains(rawInput);
      const chainIds = hintedChains.length ? hintedChains.map((chain) => chain.id) : DEFAULT_CHAIN_IDS;
      const cacheKey = `${chainIds.join(",")}:${addresses.map((address) => address.toLowerCase()).join(",")}`;
      const cached = readCache(cache, cacheKey, now().getTime());
      if (cached) return { ...cached, cacheHit: true };

      const searchResults = await Promise.all(addresses.map(async (address) => {
        try {
          const data = await okxGet({
            fetchImpl,
            apiKey,
            secretKey,
            passphrase,
            now,
            timeoutMs,
            path: SEARCH_PATH,
            params: { chains: chainIds.join(","), search: address, limit: "100" }
          });
          return { address, ok: true, rows: normalizeSearchRows(data, address, chainIds) };
        } catch (error) {
          return { address, ok: false, reason: upstreamReason(error), rows: [] };
        }
      }));

      const searchFailures = searchResults.filter((item) => !item.ok);
      const allMatches = uniqueMatches(searchResults.flatMap((item) => item.rows));
      const matches = allMatches.slice(0, MAX_ADDRESSES);
      if (!matches.length) {
        const result = searchFailures.length === searchResults.length
          ? unavailable(addresses, queriedAt, searchFailures[0]?.reason || "upstream_unavailable")
          : {
              ...baseResult(queriedAt),
              status: "partial",
              attempted: true,
              addresses,
              matches: [],
              ambiguous: false,
              limitations: unique([
                "no_exact_token_match",
                ...(searchFailures.length ? ["some_searches_unavailable"] : []),
                ...(addresses.length < extractEvmAddresses(rawInput).length ? ["address_limit_applied"] : [])
              ])
            };
        writeCache(cache, cacheKey, result, now().getTime(), 15_000);
        return result;
      }

      const enriched = await Promise.all(matches.map(async (match) => {
        try {
          const data = await okxGet({
            fetchImpl,
            apiKey,
            secretKey,
            passphrase,
            now,
            timeoutMs,
            path: ADVANCED_PATH,
            params: { chainIndex: match.chainIndex, tokenContractAddress: match.tokenContractAddress }
          });
          return { ...match, advanced: normalizeAdvanced(data, match), advancedStatus: "verified" };
        } catch (error) {
          return { ...match, advanced: emptyAdvanced(), advancedStatus: "unavailable", advancedError: upstreamReason(error) };
        }
      }));

      const advancedFailures = enriched.filter((match) => match.advancedStatus !== "verified");
      const result = {
        ...baseResult(queriedAt),
        status: searchFailures.length || advancedFailures.length ? "partial" : "verified",
        attempted: true,
        addresses,
        matches: enriched,
        ambiguous: hasChainAmbiguity(enriched),
        limitations: unique([
          ...(searchFailures.length ? ["some_searches_unavailable"] : []),
          ...(advancedFailures.length ? ["some_advanced_checks_unavailable"] : []),
          ...(hasChainAmbiguity(enriched) ? ["contract_found_on_multiple_chains"] : []),
          ...(addresses.length < extractEvmAddresses(rawInput).length ? ["address_limit_applied"] : []),
          ...(allMatches.length > matches.length ? ["match_limit_applied"] : []),
          "preliminary_token_data_only"
        ])
      };
      writeCache(cache, cacheKey, result, now().getTime(), result.status === "verified" ? CACHE_TTL_MS : 15_000);
      return result;
    }
  };
}

export function buildOkxSignature({ timestamp, method = "GET", requestPath, body = "", secretKey }) {
  return createHmac("sha256", secretKey)
    .update(`${timestamp}${String(method).toUpperCase()}${requestPath}${body}`)
    .digest("base64");
}

export function detectChains(rawInput) {
  const text = String(rawInput || "");
  return CHAINS.filter((chain) => chain.patterns.some((pattern) => pattern.test(text)))
    .map(({ id, name }) => ({ id, name }));
}

async function okxGet({ fetchImpl, apiKey, secretKey, passphrase, now, timeoutMs, path, params }) {
  const query = new URLSearchParams(params).toString();
  const requestPath = `${path}?${query}`;
  const timestamp = now().toISOString();
  const signature = buildOkxSignature({ timestamp, method: "GET", requestPath, secretKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${OKX_ORIGIN}${requestPath}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase
      },
      redirect: "error",
      signal: controller.signal
    });
    const contentLength = Number(response.headers?.get?.("content-length") || 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new UpstreamError("response_too_large");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new UpstreamError("response_too_large");
    if (!response.ok) throw new UpstreamError("upstream_http_error");

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new UpstreamError("invalid_upstream_response");
    }
    if (String(payload?.code) !== "0") throw new UpstreamError("upstream_business_error");
    return payload.data;
  } catch (error) {
    if (error?.name === "AbortError") throw new UpstreamError("upstream_timeout");
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError("upstream_unavailable");
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSearchRows(data, requestedAddress, allowedChains) {
  const rows = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  return rows.filter((row) => {
    const address = boundedString(row?.tokenContractAddress, 128);
    return address.toLowerCase() === requestedAddress.toLowerCase() && allowedChains.includes(String(row?.chainIndex || ""));
  }).map((row) => ({
    chainIndex: boundedString(row.chainIndex, 24),
    chainName: CHAIN_NAMES[String(row.chainIndex)] || `Chain ${boundedString(row.chainIndex, 24)}`,
    tokenContractAddress: boundedString(row.tokenContractAddress, 128),
    tokenName: boundedString(row.tokenName, 160),
    tokenSymbol: boundedString(row.tokenSymbol, 48),
    explorerUrl: safeExplorerUrl(row.explorerUrl),
    priceUsd: numericString(row.price),
    marketCapUsd: numericString(row.marketCap),
    liquidityUsd: numericString(row.liquidity),
    holders: integerString(row.holders)
  }));
}

function normalizeAdvanced(data, expected) {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") throw new UpstreamError("invalid_upstream_response");
  const responseChain = boundedString(value.chainIndex, 24);
  const responseAddress = boundedString(value.tokenContractAddress, 128);
  if (responseChain !== expected.chainIndex || responseAddress.toLowerCase() !== expected.tokenContractAddress.toLowerCase()) {
    throw new UpstreamError("invalid_upstream_response");
  }
  return {
    riskControlLevel: enumString(value.riskControlLevel, ["0", "1", "2", "3", "4", "5"]),
    tokenTags: Array.isArray(value.tokenTags)
      ? unique(value.tokenTags.map((item) => boundedString(item, 64)).filter(Boolean)).slice(0, 20)
      : [],
    top10HoldPercent: percentString(value.top10HoldPercent),
    devHoldingPercent: percentString(value.devHoldingPercent),
    bundleHoldingPercent: percentString(value.bundleHoldingPercent),
    suspiciousHoldingPercent: percentString(value.suspiciousHoldingPercent),
    sniperHoldingPercent: percentString(value.sniperHoldingPercent),
    lpBurnedPercent: percentString(value.lpBurnedPercent),
    creatorAddress: boundedString(value.creatorAddress, 128),
    devRugPullTokenCount: integerString(value.devRugPullTokenCount),
    devCreateTokenCount: integerString(value.devCreateTokenCount),
    createTime: integerString(value.createTime)
  };
}

function emptyAdvanced() {
  return {
    riskControlLevel: "",
    tokenTags: [],
    top10HoldPercent: "",
    devHoldingPercent: "",
    bundleHoldingPercent: "",
    suspiciousHoldingPercent: "",
    sniperHoldingPercent: "",
    lpBurnedPercent: "",
    creatorAddress: "",
    devRugPullTokenCount: "",
    devCreateTokenCount: "",
    createTime: ""
  };
}

function extractEvmAddresses(value) {
  const seen = new Set();
  return (String(value || "").match(/\b0x[a-fA-F0-9]{40}\b/g) || []).filter((address) => {
    const normalized = address.toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function uniqueMatches(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.chainIndex}:${row.tokenContractAddress.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasChainAmbiguity(matches) {
  const chainsByAddress = new Map();
  for (const match of matches) {
    const address = match.tokenContractAddress.toLowerCase();
    if (!chainsByAddress.has(address)) chainsByAddress.set(address, new Set());
    chainsByAddress.get(address).add(match.chainIndex);
  }
  return [...chainsByAddress.values()].some((chains) => chains.size > 1);
}

function baseResult(queriedAt) {
  return {
    source: {
      name: "OKX OnchainOS Token API",
      searchEndpoint: SEARCH_PATH,
      advancedEndpoint: ADVANCED_PATH
    },
    queriedAt,
    cacheHit: false
  };
}

function notApplicable() {
  return {
    ...baseResult(null),
    status: "not_applicable",
    attempted: false,
    addresses: [],
    matches: [],
    ambiguous: false,
    limitations: ["no_evm_contract_address"]
  };
}

function unavailable(addresses, queriedAt, reason) {
  return {
    ...baseResult(queriedAt),
    status: "unavailable",
    attempted: true,
    addresses,
    matches: [],
    ambiguous: false,
    limitations: unique([reason, "onchain_status_not_verified"])
  };
}

function readCache(cache, key, nowMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    cache.delete(key);
    return null;
  }
  return structuredClone(entry.value);
}

function writeCache(cache, key, value, nowMs, ttlMs = CACHE_TTL_MS) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, { expiresAt: nowMs + ttlMs, value: structuredClone(value) });
}

function boundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : value === null || value === undefined ? "" : String(value).slice(0, maxLength);
}

function numericString(value) {
  const text = boundedString(value, 96);
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : "";
}

function integerString(value) {
  const text = boundedString(value, 48);
  return /^\d+$/.test(text) ? text : "";
}

function percentString(value) {
  const text = numericString(value);
  if (!text) return "";
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? text : "";
}

function enumString(value, allowed) {
  const text = boundedString(value, 12);
  return allowed.includes(text) ? text : "";
}

function safeExplorerUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && url.hostname === "web3.okx.com" ? url.href.slice(0, 500) : "";
  } catch {
    return "";
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function upstreamReason(error) {
  return error instanceof UpstreamError ? error.code : "upstream_unavailable";
}

class UpstreamError extends Error {
  constructor(code) {
    super(code);
    this.name = "UpstreamError";
    this.code = code;
  }
}
