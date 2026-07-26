# Product / Service Security Assessment

## Service Identity

| Field | Assessment |
|---|---|
| Name | Before Series ASP |
| Provider | Independent developer deployment |
| URL | https://before.stoneup.xyz |
| Type | Public A2MCP HTTP API with x402 payment |
| Trust tier | New independent service; maximum launch-time scrutiny is appropriate |

## Architecture Analysis

### Key Management

| Field | Assessment |
|---|---|
| Model | OKX credentials authenticate payment settlement and Before Ape token-data queries; dedicated least-privilege Market API credentials are supported |
| Storage | Railway secret variables in production; `.env` is ignored locally |
| Rotation | Supported by rotating OKX credentials and redeploying |
| User wallet keys | Never requested, retained, or used. Accidental submissions are detected, withheld from output, and not hashed. |

### Human in the Loop

| Operation | Control |
|---|---|
| Input before payment | GET/HEAD are free; empty, placeholder, and invocation-only POST requests fail before x402; the Bazaar challenge declares required `body.content` |
| Payment | Only a POST with actual content can reach x402; the Buyer Agent must then show and obtain the user's required payment confirmation through OKX Agent Payments Protocol |
| Wallet action | Service cannot connect, sign, approve, or broadcast; the user keeps final authority |
| High-risk result | Card recommends pausing or cancelling but never executes an action |
| Publishing | Before Shill returns a draft; the user decides whether to publish |

### Data Flow

| Field | Assessment |
|---|---|
| Data destination | User text is sent to the Before Series API only. For Before Ape, the service sends only validated chain IDs and up to three public EVM contract addresses to fixed OKX OnchainOS token endpoints. |
| Third-party AI | None in version 2 |
| External URL retrieval | Submitted user URLs are never fetched. Before Ape calls only hard-coded `https://web3.okx.com` Token API paths; redirects are rejected. |
| Encryption | TLS required in production |
| Retention | No original request-body logging or separate raw-input retention; temporary generated reports only |
| Response cache | Disabled with `Cache-Control: no-store` |

### Update Mechanism

| Field | Assessment |
|---|---|
| Type | Manual Git commit and Railway deployment |
| Silent code download | None |
| Dependency lock | `package-lock.json` with `npm ci` in CI and deployment |
| CI | Syntax check, 42 automated tests, production dependency audit, and public x402 verifier |

## Permissions Required

The service requires:

1. Network access to OKX for payment verification/settlement and Before Ape Token API lookups.
2. An X Layer receiving address.
3. OKX seller API credentials stored as deployment secrets.
4. Public HTTPS ingress to the three paid endpoints and free health/MCP discovery endpoints.
5. A persistent report volume and a dedicated 32-byte report encryption key.

It does not require browser cookies, wallet extensions, user-wallet authority, shell execution, SSH keys, cloud credentials, or a database. Production filesystem access is limited to the encrypted temporary-report directory.

## Worst Case If Compromised

1. An attacker could alter risk cards and mislead users about visible warning signs.
2. User-submitted text could be exposed while the compromised server processes it.
3. Seller API credentials could be abused against the permissions granted to those credentials; they must be narrowly scoped and rotated immediately after suspected exposure.
4. The receiving address or payment resource configuration could be changed, diverting future 0.01 payments until the deployment is disabled.
5. The service still cannot directly sign from or drain a user's wallet because it never receives user keys or wallet authority.

## Red Flags and Residual Risk

| Item | Assessment |
|---|---|
| False negatives | Before Ape live token indicators and static text cannot reveal all hidden calldata, proxy/admin state, malicious bytecode, compromised frontends, actual sell outcomes, or later project changes |
| False positives | Keyword context can raise a warning for legitimate documentation that discusses a risky feature |
| Live reputation | Before Ape integrates OKX token search and advanced token indicators. No live domain reputation, AML feed, bytecode audit, or transaction simulation is integrated. Missing or unavailable OKX data is never treated as evidence of safety. |
| Legal scope | Before Shill cannot determine jurisdiction-specific advertising, securities, or consumer-protection obligations |
| Report links | Possession grants read access until expiry; users must treat a report URL as private unless public sharing is intended |
| New-service trust | Production uptime, independent user feedback, and operational history must be established after launch |

## Risk and Verdict

**Risk:** MEDIUM

**Verdict:** USE WITH RESTRICTIONS

The architecture has a narrow and read-only user-facing capability, no user-wallet authority, no external content execution, and no third-party AI data flow. The remaining medium risk comes from the security-adjacent subject matter: users may over-trust a short card despite incomplete input. Product copy and responses must preserve the visible-evidence versus unknown-information distinction.

## Recommended Restrictions

1. Keep `assessment`, `scope`, `reportUrl`, evidence status, and confidence in every successful response.
2. Never add definitive `safe`, `verified`, `certified`, or `compliant` verdicts.
3. Never display a SlowMist/MistTrack/AML score without an authorized live integration and timestamped source.
4. Keep user input out of application logs and error telemetry.
5. Use a dedicated, least-privilege OKX API credential set for this deployment.
6. Rotate credentials after any accidental disclosure and after changes in repository or hosting access.
7. Re-run all tests, `npm audit --omit=dev`, public 402 verification, and one paid replay per endpoint before every listing update.
8. Keep OKX Market calls bounded to validated public contract addresses, reject redirects and oversized responses, retain the fixed-origin allowlist, and preserve timeout/error fail-closed behavior.

## Launch Verification Snapshot

- Public health: `200`, with payment and reports both ready.
- Public invalid-input preflight: empty content returns `400 INPUT_REQUIRED` before any payment challenge.
- Public intake verification: free GET usage works; placeholder and bare Agent-invocation requests return `paymentStarted: false` without a challenge.
- Public unpaid verification: all three canonical endpoints return valid 0.01 USD₮0 x402 v2 challenges on X Layer.
- Public input contract: each challenge declares a Bazaar POST JSON body with required `content`.
- Public challenge resource URLs: match `https://before.stoneup.xyz/api/before/{ape|sign|shill}` exactly.
- MCP discovery: exposes only the three paid service descriptors and does not return a free full report.
- Automated checks: 42 tests passed; production dependency audit reported zero known vulnerabilities.
- Visual checks: desktop and 390 px mobile reports were inspected for all three services with no horizontal overflow.
- Remaining launch requirement: record one real paid replay for each endpoint after the final deployment.

## Methodology Note

This assessment uses the public SlowMist Agent Security Review categories for external-input distrust, social engineering, prompt injection, approval risk, permissions, data flow, and worst-case impact. It is a self-assessment and does not imply SlowMist affiliation, audit, certification, or endorsement.
