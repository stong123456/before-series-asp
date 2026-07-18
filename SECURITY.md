# Security Policy

## Product Boundary

Before Series performs static analysis of text supplied in a single request. It does not:

- fetch or open submitted links;
- connect to a wallet;
- sign or broadcast transactions;
- request seed phrases, private keys, passwords, API secrets, or verification codes;
- query live contract state, transaction simulation, bytecode, token audits, or AML labels;
- certify that a project, website, contract, signature, or post is safe, legal, or compliant.

This boundary is deliberate. A short pasted popup cannot support a definitive security verdict. The service separates visible evidence, confidence, and unknown information, and it never treats missing evidence as proof of safety.

## Threat Model

All submitted content is untrusted. Relevant threats include:

1. Prompt injection disguised as project instructions.
2. Phishing content that requests secrets or urgent wallet interaction.
3. Unlimited token approval, `setApprovalForAll`, Permit/Permit2, opaque signing, and direct asset transfer.
4. Lookalike domains, private group links, false endorsement, and manufactured urgency.
5. Sensitive values accidentally pasted by users.
6. Oversized or malformed input intended to exhaust the service.
7. Host-header manipulation and incorrect x402 resource binding.
8. Missing payment configuration that exposes paid content or causes review-time timeouts.
9. Guessable, persistent, indexed, or plaintext report links that expose paid findings.
10. Case or trailing-slash route aliases that reach business logic without the payment guard.

## Controls

- Deterministic rules only; untrusted text cannot change system behavior.
- No server-side URL retrieval or command execution.
- Sensitive-value fail-safe handling before evidence generation; detected secrets are not hashed or echoed.
- NFKC and zero-width normalization before security signal matching.
- No request-body logging and no separate retention of the original request body.
- Strict input and body-size limits.
- Exact case-sensitive and strict routing across paid endpoints.
- Bounded per-IP request rate limiting.
- Fixed production `PUBLIC_BASE_URL` for payment resource URLs.
- Production allowlisting of X Layer mainnet and the official OKX facilitator origin.
- Official OKX Payment SDK for challenge generation, verification, replay protection, and settlement.
- Production fail-closed startup when payment configuration is incomplete.
- Standard security headers, no cookies, no credentialed CORS, and `Cache-Control: no-store`.
- 192-bit report bearer IDs, 24-hour expiry by default, AES-256-GCM encrypted production storage, no indexing, and a restrictive report CSP.
- Structured JSON errors that do not expose stack traces or environment data.

## SlowMist Methodology Reference

The review categories and external-input principles were informed by the public SlowMist Agent Security Review framework, particularly its treatment of external content as untrusted, prompt injection, social engineering, approval risk, proxy authority, and human decision boundaries.

This reference does not imply affiliation, endorsement, audit, certification, or a live MistTrack/SlowMist data integration. Before Series must never display a SlowMist AML score or security verdict unless a future version integrates an authorized live source and clearly names the source and timestamp.

## Incident Response

If a vulnerability is discovered:

1. Disable the affected paid endpoint or deployment.
2. Rotate exposed deployment and OKX API credentials immediately.
3. Preserve deployment logs that do not contain user bodies or secrets.
4. Patch and test locally.
5. Re-run unpaid 402 verification and one paid replay per endpoint.
6. Update the OKX.AI listing only if endpoint behavior, pricing, or service scope changed.
7. Rotate `REPORT_ENCRYPTION_KEY` only when intentionally invalidating all outstanding report links, or immediately after suspected exposure.

Do not publish sensitive proof-of-concept data. Report vulnerabilities privately to the repository owner.
