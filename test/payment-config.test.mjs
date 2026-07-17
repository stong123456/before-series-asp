import assert from "node:assert/strict";
import test from "node:test";
import { buildRouteConfig } from "../src/payment.mjs";

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
