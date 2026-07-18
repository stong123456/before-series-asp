import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRouteConfig,
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

test("payment config binds all methods to exact 0.01 X Layer resources", () => {
  const services = [
    { path: "/api/before/ape", paymentDescription: "ape" },
    { path: "/api/before/sign", paymentDescription: "sign" },
    { path: "/api/before/shill", paymentDescription: "shill" }
  ];
  const payTo = "0x1111111111111111111111111111111111111111";
  const routes = buildRouteConfig({
    publicBaseUrl: "https://before.example",
    services,
    payTo,
    network: "eip155:196",
    timeoutSeconds: 300
  });

  assert.equal(Object.keys(routes).length, 9);
  for (const service of services) {
    for (const method of ["GET", "HEAD", "POST"]) {
      const config = routes[`${method} ${service.path}`];
      assert.equal(config.resource, `https://before.example${service.path}`);
      assert.equal(config.mimeType, "application/json");
      assert.deepEqual(config.accepts, [{
        scheme: "exact",
        network: "eip155:196",
        payTo,
        price: "$0.01",
        maxTimeoutSeconds: 300
      }]);
    }
  }
});

test("payment guard matches only canonical paid paths", () => {
  const services = [{ path: "/api/before/ape" }];
  assert.equal(isPaidPath({ method: "POST", path: "/api/before/ape" }, services), true);
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
