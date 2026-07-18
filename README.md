# Before Series ASP

Before Series is an independent bilingual A2MCP service for lightweight Web3 checks:

- **Before Ape**: checks project, campaign, and promotional text before a user participates.
- **Before Sign**: explains visible wallet-signature and approval risks before confirmation.
- **Before Shill**: checks Web3 copy for advertising tone, AI-like phrasing, unsupported claims, and publishing risk.

Every service follows the same product rule: **one input, no follow-up questions, one concise card and one temporary web report**. Each paid call costs **0.01 USD₮0** through the **OKX Agent Payments Protocol** on X Layer.

The repository is designed for an independent Agent identity with its own code, configuration, endpoints, deployment, branding, and listing materials.

## Endpoints

| Service | Method | Endpoint | Price |
|---|---|---|---|
| Before Ape | `POST` | `/api/before/ape` | 0.01 USD₮0 |
| Before Sign | `POST` | `/api/before/sign` | 0.01 USD₮0 |
| Before Shill | `POST` | `/api/before/shill` | 0.01 USD₮0 |
| MCP discovery | `POST` | `/mcp` | Free discovery only |
| Health | `GET` | `/health` | Free |

JSON request:

```json
{
  "content": "Paste one block of project, signature, or post content here.",
  "lang": "auto"
}
```

`lang` supports `auto`, `zh`, and `en`. The server also accepts plain-text request bodies and common input keys such as `text`, `input`, `message`, and `prompt`.

The response includes:

- `card`: structured fields for Agent rendering.
- `cardText`: ready-to-display bilingual plain text.
- `assessment`: risk subject, evidence status, confidence, recommended decision, checked scope, and unverified scope.
- `evidence`: matched signal IDs, weights, and short evidence snippets.
- `reportUrl`: a required, unguessable temporary link to the styled bilingual HTML report.
- `scope`: explicit limits, including no link fetching, on-chain query, transaction simulation, legal opinion, or security certification.

The report styles are intentionally distinct: Before Ape uses a dark evidence desk, Before Sign uses a light audit dossier, and Before Shill uses an editorial action-prescription layout.

## Local Development

```bash
npm install
copy .env.example .env
npm run dev
```

Development defaults to payment disabled. Test a card locally:

```bash
curl -X POST http://127.0.0.1:8790/api/before/sign \
  -H "Content-Type: application/json" \
  -d '{"content":"Approve unlimited USDT allowance to spender 0x1111111111111111111111111111111111111111","lang":"en"}'
```

## Production Configuration

Set these variables in the deployment secret manager:

```text
NODE_ENV=production
PUBLIC_BASE_URL=https://your-public-domain.example
X402_ENABLED=true
X402_REQUIRE_PAYMENT=true
X402_PAY_TO=0xYourXLayerReceivingAddress
X402_NETWORK=eip155:196
X402_TIMEOUT_SECONDS=300
X402_INIT_TIMEOUT_MS=10000
OKX_SYNC_SETTLE=true
OKX_BASE_URL=https://web3.okx.com
OKX_API_KEY=...
OKX_SECRET_KEY=...
OKX_PASSPHRASE=...
REPORT_TTL_HOURS=24
REPORT_MAX_ENTRIES=2000
REPORT_STORAGE_DIR=/data/before-reports
REPORT_ENCRYPTION_KEY=<32-byte base64 or 64-character hex key>
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120
```

Mount a persistent Railway volume at `/data` before production deployment. Generate the report encryption key locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, then store it only in Railway variables. Losing or rotating this key makes existing report links unreadable by design.

The production server fails closed and refuses to start when the public HTTPS base URL, seller credentials, receiving address, report storage directory, or report encryption key is invalid. This prevents a deployment from appearing healthy while paid endpoints cannot return a valid challenge and report link.

Never commit `.env`. Never paste credentials into issues, logs, screenshots, or chat messages.

## Required Production Verification

After deployment:

```bash
npm run verify:public -- https://your-public-domain.example
```

The script verifies:

1. `/health` returns `200`.
2. All three unpaid `POST` requests return `402`.
3. Every `402` response includes a decodable `PAYMENT-REQUIRED` header.
4. The challenge uses x402 v2, X Layer, the exact endpoint URL, and a 0.01 payment amount.
5. MCP discovery returns all three tools.

Complete one real 0.01 USD₮0 paid call for each endpoint before listing. Confirm that the paid replay returns `200`, the card matches the selected service, the response includes a settlement response header and `reportUrl`, and each report link opens in Chinese and English.

## Safety Model

- User input is treated as untrusted data and is never executed.
- Submitted URLs are not fetched, preventing server-side request forgery and deceptive redirects from being followed automatically.
- Request bodies are not logged.
- Likely private keys, seed phrases, secret-key arrays, API secrets, bearer tokens, and verification codes stop normal echoing and produce a fixed severe-risk response.
- Input is limited to 20,000 characters; HTTP bodies are capped at 24 KB.
- Fullwidth and zero-width obfuscation is normalized before signal matching.
- Sparse project or signing input returns `insufficient`; absence of a keyword is never presented as verified safety.
- Risk labels name the evaluated subject and separate observed text signals from confidence and unknown information.
- Before Sign is a static explanation layer, not transaction simulation, bytecode analysis, AML screening, or a contract audit.
- Before Shill provides general publishing-risk guidance, not jurisdiction-specific legal advice.
- Temporary report IDs use 192 bits of randomness. Production reports are AES-256-GCM encrypted at rest, expire after 24 hours by default, are not indexed, and are served with restrictive CSP and no-store headers.
- The original request body is not stored separately. The generated report necessarily retains redacted evidence and edited output until the temporary link expires.

The threat-model structure is informed by publicly documented security-review principles, including SlowMist's agent security framework. This project is not affiliated with, endorsed by, audited by, or certified by SlowMist.

See [SECURITY.md](SECURITY.md) for the full boundary and disclosure policy.

## Quality Gates

```bash
npm run check
npm test
```

## License and Content

The code and product copy in this repository are original. Brand names and protocol names belong to their respective owners. The product provides information organization, risk education, and copy editing only; it does not provide investment advice or a safety guarantee.
