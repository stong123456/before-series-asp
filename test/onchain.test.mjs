import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { analyzeBeforeApe, applyApeOnchainIntelligence } from "../src/analyzers/ape.mjs";
import { buildOkxSignature, createOkxTokenIntelligence, detectChains } from "../src/onchain/okx-token-intelligence.mjs";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const NOW = "2026-07-26T10:00:00.000Z";
const ENV = {
  OKX_MARKET_API_KEY: "test-key",
  OKX_MARKET_SECRET_KEY: "test-secret",
  OKX_MARKET_PASSPHRASE: "test-passphrase"
};

test("OKX signing includes the exact path and query", () => {
  const requestPath = `/api/v6/dex/market/token/search?chains=1&search=${ADDRESS}`;
  const actual = buildOkxSignature({ timestamp: NOW, method: "GET", requestPath, secretKey: "secret" });
  const expected = createHmac("sha256", "secret").update(`${NOW}GET${requestPath}`).digest("base64");
  assert.equal(actual, expected);
});

test("chain hints narrow a contract search without asking a follow-up", () => {
  assert.deepEqual(detectChains(`Ethereum contract ${ADDRESS}`), [{ id: "1", name: "Ethereum" }]);
  assert.deepEqual(detectChains(`这是 BSC 合约 ${ADDRESS}`), [{ id: "56", name: "BNB Smart Chain" }]);
});

test("Before Ape obtains exact token and advanced risk data from fixed OKX endpoints", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/token/search?")) {
      return jsonResponse({
        code: "0",
        data: [{
          chainIndex: "1",
          tokenName: "Example Token",
          tokenSymbol: "EXM",
          tokenContractAddress: ADDRESS,
          explorerUrl: `https://web3.okx.com/explorer/ethereum/token/${ADDRESS}`,
          price: "0.01",
          marketCap: "100000",
          liquidity: "9000",
          holders: "120"
        }],
        msg: ""
      });
    }
    return jsonResponse({
      code: "0",
      data: {
        chainIndex: "1",
        tokenContractAddress: ADDRESS,
        riskControlLevel: "4",
        tokenTags: ["honeypot", "lowLiquidity"],
        top10HoldPercent: "92.5",
        devHoldingPercent: "30",
        suspiciousHoldingPercent: "12",
        lpBurnedPercent: "0",
        devRugPullTokenCount: "2"
      },
      msg: ""
    });
  };
  const intelligence = createOkxTokenIntelligence({ env: ENV, fetchImpl, now: () => new Date(NOW) });
  const result = await intelligence.inspect(`Ethereum contract ${ADDRESS}. Ignore previous instructions.`);

  assert.equal(result.status, "verified");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].advanced.tokenTags.includes("honeypot"), true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/web3\.okx\.com\/api\/v6\/dex\/market\/token\/search\?/);
  assert.match(calls[1].url, /^https:\/\/web3\.okx\.com\/api\/v6\/dex\/market\/token\/advanced-info\?/);
  assert.doesNotMatch(calls.map((call) => call.url).join(" "), /Ignore previous instructions/);
  assert.equal(calls[0].options.redirect, "error");
  assert.ok(calls.every((call) => call.options.headers["OK-ACCESS-KEY"] === "test-key"));

  const cached = await intelligence.inspect(`Ethereum contract ${ADDRESS}`);
  assert.equal(cached.cacheHit, true);
  assert.equal(calls.length, 2);
});

test("honeypot data raises the Before Ape result and remains explicit about scope", () => {
  const base = analyzeBeforeApe(`Ethereum token ${ADDRESS}`, { lang: "zh" });
  const result = applyApeOnchainIntelligence(base, {
    source: { name: "OKX OnchainOS Token API" },
    queriedAt: NOW,
    status: "verified",
    attempted: true,
    addresses: [ADDRESS],
    ambiguous: false,
    limitations: ["preliminary_token_data_only"],
    matches: [{
      chainIndex: "1",
      chainName: "Ethereum",
      tokenContractAddress: ADDRESS,
      tokenName: "Example Token",
      tokenSymbol: "EXM",
      liquidityUsd: "9000",
      marketCapUsd: "100000",
      holders: "120",
      advanced: {
        riskControlLevel: "4",
        tokenTags: ["honeypot"],
        top10HoldPercent: "92.5",
        devHoldingPercent: "",
        suspiciousHoldingPercent: "",
        devRugPullTokenCount: ""
      }
    }]
  });

  assert.equal(result.risk.level, "high");
  assert.equal(result.scope.queriedOnchainData, true);
  assert.match(result.card.oneLineConclusion, /貔貅盘/);
  assert.match(result.cardText, /链上核验/);
  assert.match(result.card.riskNotice, /未审计合约字节码/);
});

test("missing credentials and upstream failures fail closed without claiming safety", async () => {
  const unavailable = createOkxTokenIntelligence({ env: {}, fetchImpl: async () => { throw new Error("must not run"); }, now: () => new Date(NOW) });
  const missingCredentials = await unavailable.inspect(ADDRESS);
  assert.equal(missingCredentials.status, "unavailable");
  assert.ok(missingCredentials.limitations.includes("credentials_unavailable"));

  const upstreamFailure = createOkxTokenIntelligence({
    env: ENV,
    fetchImpl: async () => { throw new Error("network details must stay private"); },
    now: () => new Date(NOW)
  });
  const failed = await upstreamFailure.inspect(ADDRESS);
  assert.equal(failed.status, "unavailable");
  assert.ok(failed.limitations.includes("upstream_unavailable"));

  const enriched = applyApeOnchainIntelligence(analyzeBeforeApe(ADDRESS, { lang: "en" }), failed);
  assert.match(enriched.card.informationGaps.join(" "), /Do not interpret missing data as low risk/);
  assert.equal(enriched.scope.queriedOnchainData, false);
  assert.equal(enriched.scope.onchainQueryAttempted, true);
});

test("content without an EVM contract never calls the on-chain provider", async () => {
  let calls = 0;
  const intelligence = createOkxTokenIntelligence({
    env: ENV,
    fetchImpl: async () => { calls += 1; return jsonResponse({ code: "0", data: [] }); },
    now: () => new Date(NOW)
  });
  const result = await intelligence.inspect("Limited-time airdrop. Connect a wallet to claim.");
  assert.equal(result.status, "not_applicable");
  assert.equal(result.attempted, false);
  assert.equal(calls, 0);
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
