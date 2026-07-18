# Product / Service Security Assessment

## Service Identity

| Field | Assessment |
|---|---|
| Name | Before Series ASP |
| Provider | Independent developer deployment |
| URL | Pending dedicated production domain |
| Type | Public A2MCP HTTP API with x402 payment |
| Trust tier | New independent service; maximum launch-time scrutiny is appropriate |

## Architecture Analysis

### Key Management

| Field | Assessment |
|---|---|
| Model | Remote seller credentials used only for OKX payment-facilitator authentication |
| Storage | Railway secret variables in production; `.env` is ignored locally |
| Rotation | Supported by rotating OKX credentials and redeploying |
| User wallet keys | Never requested, retained, or used. Accidental submissions are detected, withheld from output, and not hashed. |

### Human in the Loop

| Operation | Control |
|---|---|
| Payment | Buyer Agent must show and obtain the user's required payment confirmation through OKX Agent Payments Protocol |
| Wallet action | Service cannot connect, sign, approve, or broadcast; the user keeps final authority |
| High-risk result | Card recommends pausing or cancelling but never executes an action |
| Publishing | Before Shill returns a draft; the user decides whether to publish |

### Data Flow

| Field | Assessment |
|---|---|
| Data destination | User text is sent to the Before Series API only |
| Third-party AI | None in version 2 |
| External URL retrieval | None |
| Encryption | TLS required in production |
| Retention | No original request-body logging or separate raw-input retention; temporary generated reports only |
| Response cache | Disabled with `Cache-Control: no-store` |

### Update Mechanism

| Field | Assessment |
|---|---|
| Type | Manual Git commit and Railway deployment |
| Silent code download | None |
| Dependency lock | `package-lock.json` with `npm ci` in CI and deployment |
| CI | Syntax check, 29 automated tests, and production dependency audit |

## Permissions Required

The service requires:

1. Network access to the OKX payment facilitator for payment verification and settlement.
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
| False negatives | Static text cannot reveal hidden calldata, proxy state, malicious bytecode, compromised frontends, or later project changes |
| False positives | Keyword context can raise a warning for legitimate documentation that discusses a risky feature |
| Live reputation | No live domain reputation, AML, audit, or contract-security feed is integrated |
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

## Methodology Note

This assessment uses the public SlowMist Agent Security Review categories for external-input distrust, social engineering, prompt injection, approval risk, permissions, data flow, and worst-case impact. It is a self-assessment and does not imply SlowMist affiliation, audit, certification, or endorsement.
