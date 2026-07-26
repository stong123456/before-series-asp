import assert from "node:assert/strict";
import test from "node:test";
import { bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import {
  buildRouteConfig,
  isProductionRuntime,
  isPaidPath,
  validateOkxBaseUrl,
  validatePublicBaseUrl
} from "../src/payment.mjs";

test("installed OKX SDK exposes the production payment constructors", async () => {
  const [expressSdk, coreSdk, evmSdk] = await Promise.all([
    import("@okxweb3/x402-express"),
    import("@okxweb3/x402-core"),
    import("@okxweb3/x402-evm/exact/server")
  ]);

  assert.equal(typeof expressSdk.paymentMiddleware, "function");
  assert.equal(typeof expressSdk.x402ResourceServer, "function");
  assert.equal(typeof coreSdk.OKXFacilitatorClient, "function");
  assert.equal(typeof evmSdk.ExactEvmScheme, "function");
});

test("Railway and paid deployments always use strict production mode", () => {
  assert.equal(isProductionRuntime({}), false);
  assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
  assert.equal(isProductionRuntime({ X402_REQUIRE_PAYMENT: "true" }), true);
  assert.equal(isProductionRuntime({ RAILWAY_ENVIRONMENT_ID: "env-id" }), true);
  assert.equal(isProductionRuntime({ RAILWAY_SERVICE_ID: "service-id" }), true);
});

test("payment config protects only POST and declares required content before payment", () => {
  const services = [
    serviceFixture("ape"),
    serviceFixture("sign"),
    serviceFixture("shill")
  ];
  const payTo = "0x1111111111111111111111111111111111111111";
  const routes = buildRouteConfig({
    publicBaseUrl: "https://before.example",
    services,
    payTo,
    network: "eip155:196",
    timeoutSeconds: 300
  });

  assert.equal(Object.keys(routes).length, 3);
  for (const service of services) {
    assert.equal(routes[`GET ${service.path}`], undefined);
    assert.equal(routes[`HEAD ${service.path}`], undefined);
    const config = routes[`POST ${service.path}`];
    assert.equal(config.resource, `https://before.example${service.path}`);
    assert.equal(config.mimeType, "application/json");
    assert.deepEqual(config.accepts, [{
      scheme: "exact",
      network: "eip155:196",
      payTo,
      price: "$0.01",
      maxTimeoutSeconds: 300
    }]);

    const enriched = bazaarResourceServerExtension.enrichDeclaration(config.extensions.bazaar, {
      method: "POST",
      path: service.path,
      adapter: { getPath: () => service.path }
    });
    assert.equal(enriched.info.input.type, "http");
    assert.equal(enriched.info.input.method, "POST");
    assert.equal(enriched.info.input.bodyType, "json");
    assert.equal(enriched.info.input.body.content, service.inputExample);
    assert.deepEqual(enriched.schema.properties.input.properties.body.required, ["content"]);
  }
});

test("payment guard matches only canonical paid paths", () => {
  const services = [{ path: "/api/before/ape" }];
  assert.equal(isPaidPath({ method: "POST", path: "/api/before/ape" }, services), true);
  assert.equal(isPaidPath({ method: "GET", path: "/api/before/ape" }, services), false);
  assert.equal(isPaidPath({ method: "HEAD", path: "/api/before/ape" }, services), false);
  assert.equal(isPaidPath({ method: "POST", path: "/api/before/ape/" }, services), false);
  assert.equal(isPaidPath({ method: "POST", path: "/API/BEFORE/APE" }, services), false);
  assert.equal(isPaidPath({ method: "PUT", path: "/api/before/ape" }, services), false);
});

test("production payment origins reject unsafe or ambiguous configuration", () => {
  assert.equal(validatePublicBaseUrl("https://before.example", true), "https://before.example");
  assert.throws(() => validatePublicBaseUrl("http://before.example", true), /HTTPS/);
  assert.throws(() => validatePublicBaseUrl("https://before.example/path", true), /origin/);
  assert.equal(validateOkxBaseUrl("https://web3.okx.com", true), "https://web3.okx.com");
  assert.throws(() => validateOkxBaseUrl("https://example.com", true), /web3\.okx\.com/);
  assert.throws(() => validateOkxBaseUrl("https://user:pass@web3.okx.com", true), /clean HTTPS origin/);
});

function serviceFixture(key) {
  return {
    key,
    path: `/api/before/${key}`,
    paymentDescription: key,
    inputDescription: { zh: `${key} 输入`, en: `${key} input` },
    inputExample: `${key} example content`
  };
}
