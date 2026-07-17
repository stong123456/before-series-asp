# Before Series ASP

Before Series is an independent bilingual A2MCP service for lightweight Web3 checks:

- **Before Ape**: checks project, campaign, and promotional text before a user participates.
- **Before Sign**: explains visible wallet-signature and approval risks before confirmation.
- **Before Shill**: checks Web3 copy for advertising tone, AI-like phrasing, unsupported claims, and publishing risk.

Every service follows the same product rule: **one input, no follow-up questions, one concise card**. Each paid call costs **0.01 USD₮0** through the **OKX Agent Payments Protocol** on X Layer.

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
- `evidence`: matched signal IDs, weights, and short evidence snippets.
- `scope`: explicit limits, including no link fetching, no code execution, and no security certification.

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
```

The production server fails closed and refuses to start when the public HTTPS base URL, seller credentials, or receiving address is invalid. This prevents a deployment from appearing healthy while paid endpoints cannot return a valid payment challenge.

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

Complete one real 0.01 USD₮0 paid call for each endpoint before listing. Confirm that the paid replay returns `200`, the card matches the selected service, and the response includes a settlement response header.

## Safety Model

- User input is treated as untrusted data and is never executed.
- Submitted URLs are not fetched, preventing server-side request forgery and deceptive redirects from being followed automatically.
- Request bodies are not logged.
- Likely private keys, seed labels, bearer tokens, and verification codes are redacted before analysis and never echoed in card evidence.
- Input is limited to 20,000 characters; HTTP bodies are capped at 24 KB.
- Risk labels describe observed text signals, not verified project or contract safety.
- Before Sign is a static explanation layer, not transaction simulation, bytecode analysis, AML screening, or a contract audit.
- Before Shill provides general publishing-risk guidance, not jurisdiction-specific legal advice.

The threat-model structure is informed by publicly documented security-review principles, including SlowMist's agent security framework. This project is not affiliated with, endorsed by, audited by, or certified by SlowMist.

See [SECURITY.md](SECURITY.md) for the full boundary and disclosure policy.

## Quality Gates

```bash
npm run check
npm test
```

## License and Content

The code and product copy in this repository are original. Brand names and protocol names belong to their respective owners. The product provides information organization, risk education, and copy editing only; it does not provide investment advice or a safety guarantee.
