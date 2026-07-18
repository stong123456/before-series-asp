# OKX.AI Review Checklist

Run this checklist from top to bottom before submitting the Agent.

## Product Separation

- [ ] Repository, GitHub remote, Railway project, service, domain, variables, Agent identity, and avatar are dedicated to Before Series.
- [ ] No name, route, asset, model, endpoint, or environment file from another product appears in this repository or listing.
- [ ] The public Agent is named `Before Series`; the three paid services are Before Ape, Before Sign, and Before Shill.

## Avatar

- [ ] Exactly 440 x 440 pixels.
- [ ] Square corners; no rounded image mask baked into the file.
- [ ] Opaque background; no transparency.
- [ ] No letters, words, numbers, ticker symbols, or other text characters.
- [ ] Clearly represents a lightweight pre-action safety check, not DNA/personality testing.
- [ ] Sharp at full size and still recognizable at small marketplace size.

## Deployment

- [ ] Railway deployment reports success and `/health` returns HTTP 200.
- [ ] Public domain uses HTTPS and is reachable without login from both domestic and international networks.
- [ ] `PUBLIC_BASE_URL` exactly matches the final public origin, with no trailing slash.
- [ ] Railway `PORT` is not manually hard-coded; the app reads the platform-provided value.
- [ ] No sleeping, scale-to-zero, private-only networking, or firewall rule can delay the first response beyond the platform timeout.
- [ ] The service logs contain startup/health status only and never contain request bodies or credentials.

## Payment

- [ ] Uses the official `@okxweb3/x402-*` packages.
- [ ] `NODE_ENV=production`, `X402_ENABLED=true`, and `X402_REQUIRE_PAYMENT=true`.
- [ ] Seller API key, secret key, passphrase, and X Layer receiving address are present only in Railway variables.
- [ ] All three unpaid `POST` requests return HTTP 402 immediately.
- [ ] Every response includes `PAYMENT-REQUIRED` containing base64 x402 v2 JSON.
- [ ] Resource URL exactly matches the service endpoint being called.
- [ ] Network is `eip155:196`, scheme is `exact`, and amount is `10000` base units (0.01 USD₮0).
- [ ] One real paid replay per endpoint returns HTTP 200 and `PAYMENT-RESPONSE`.
- [ ] There is no alternate free endpoint that returns the full card.

## Interaction

- [ ] The service accepts `{ "content": "...", "lang": "auto" }` and `text/plain`.
- [ ] Chinese input returns Chinese; English input returns English; explicit `zh`/`en` overrides work.
- [ ] The Agent does not ask follow-up questions.
- [ ] Each paid replay returns one `card` object and one ready-to-display `cardText`.
- [ ] Each paid replay returns a non-empty `reportUrl`; the report opens in both `?lang=zh` and `?lang=en`.
- [ ] Report responses include restrictive CSP, `X-Robots-Tag: noindex`, and `Cache-Control: no-store`.
- [ ] Railway has a persistent report volume and valid `REPORT_STORAGE_DIR` / `REPORT_ENCRYPTION_KEY` secrets.
- [ ] Empty, malformed, and oversized input returns a fast 4xx error, never a timeout.

## Safety Claims

- [ ] No listing text claims a project, contract, signature, or post is definitively safe.
- [ ] No listing text claims SlowMist endorsement, audit, certification, or live data integration.
- [ ] Before Sign clearly states that static text review does not replace simulation, on-chain state review, or contract audit.
- [ ] Before Shill clearly states that general publishing-risk guidance is not legal advice.
- [ ] Before Ape clearly states that it does not provide investment advice or price prediction.
- [ ] Seed phrases, private keys, verification codes, and bearer tokens are redacted and never echoed.

## Final Automated Checks

```bash
npm ci
npm run check
npm test
npm audit --omit=dev
npm run verify:public -- https://your-public-domain.example
```

Only submit after every box above is complete and the three real paid replays have been recorded with timestamps and transaction hashes stored privately.
