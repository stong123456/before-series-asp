# Before Series Report Design QA

## Findings

No actionable P0, P1, or P2 findings remain after three visual QA iterations.

- Fonts and typography: the implementation preserves the source hierarchy with heavy report titles, compact metadata, restrained body weights, readable bilingual wrapping, and zero negative letter spacing. Chinese and English variants remain legible at desktop and mobile widths.
- Spacing and layout rhythm: all three reports keep the source's dense audit-report structure, clear metric bands, evidence grouping, and compact card radii. No page-level horizontal overflow remains at the tested mobile width.
- Colors and visual tokens: Before Ape retains the graphite/cyan risk-desk treatment, Before Sign uses a light audit-dossier system, and Before Shill uses a white/cobalt editorial review system. Warning, danger, unknown, and action colors remain semantically consistent.
- Image and asset fidelity: the reports use one consistent local Phosphor icon family. No generated source artwork was substituted with CSS drawings, emoji, inline SVG, or placeholder imagery.
- Copy and content: labels clearly separate visible evidence, confidence, recommended action, unknown scope, and responsibility boundaries. Before Shill now removes return promises, scarcity pressure, and direct trading calls from the publishable rewrite.
- Accessibility and interaction: mobile icon controls are 44 by 44 pixels and expose stable accessible names. Copy-link feedback is visible and the copied URL matches the current report. Focus styles, reduced-motion handling, semantic headings, tables, buttons, and no-index metadata are present.

## Source Visual Truth

- Before Ape: `C:\Users\Administrator\.codex\generated_images\019f4582-801c-72c3-a5e3-8d91ab13b013\exec-13f7eb67-7633-4262-ab3f-e19542067895.png`
- Before Sign: `C:\Users\Administrator\.codex\generated_images\019f4582-801c-72c3-a5e3-8d91ab13b013\exec-5c22e375-730c-4563-8a3a-d250e78844b1.png`
- Before Shill: `C:\Users\Administrator\.codex\generated_images\019f4582-801c-72c3-a5e3-8d91ab13b013\exec-3f9155bd-4a27-4cd8-a8b7-f3ae3df33a15.png`

## Implementation Evidence

Desktop viewport: 1440 by 1024.

- `docs/qa/qa-ape-1440-final.png`
- `docs/qa/qa-sign-1440-final.png`
- `docs/qa/qa-shill-1440-final.png`

Mobile viewport: browser-reported content width 415 pixels in a 430 by 900 override.

- `docs/qa/qa-ape-mobile-final.png`
- `docs/qa/qa-sign-mobile-final.png`
- `docs/qa/qa-sign-mobile-table-final.png`
- `docs/qa/qa-shill-mobile-final.png`

State: Chinese, high-risk examples for each service. English variants were also opened and checked for translated labels, scope, confidence, decisions, and report navigation.

## Comparison Evidence

Full-view source and implementation pairs:

- `docs/qa/qa-compare-ape.png`
- `docs/qa/qa-compare-sign.png`
- `docs/qa/qa-compare-shill.png`

Focused evidence was required because desktop pair captures cannot prove small-screen behavior. `docs/qa/qa-sign-mobile-table-final.png` verifies the safety-critical signature fields after the mobile stacking fix. The final Before Shill desktop comparison shows the corrected publishable rewrite and the `Overall score` label. Final mobile captures verify title wrapping, metric stacking, 44-pixel controls, and the absence of page-level horizontal overflow.

Intentional differences from the source visuals are acceptable product constraints. The source concepts include decoded or externally verified project/transaction metadata that this static text-only service cannot honestly claim. The implementation replaces those unsupported fields with visible evidence status, explicit unknowns, and out-of-scope notices. Browser print replaces a separate PDF-export workflow.

## Primary Interactions Tested

- Chinese and English report variants load through `?lang=zh` and `?lang=en`.
- Copy-link control resolves to one accessible button, shows `链接已复制`, and writes the exact current report URL to the browser clipboard.
- Print control is present with an accessible name and dedicated print CSS; the operating-system print preview itself was not captured by the in-app browser.
- Desktop and mobile layouts were opened for all three report types.
- Before Sign's mobile field table was scrolled and visually checked after the stacking fix.
- Browser console warning/error logs were checked and were empty on final desktop and mobile report tabs.

## Comparison History

### Iteration 1

- P1: Before Shill detected FOMO and a direct buy call but retained them in the optimized version.
- P2: Before Shill displayed a quality score under the misleading `Risk level` label.
- P2: Before Sign showed a generic primary-wallet message for a Permit2 approval and displayed chain ID `196` without its network name.
- P2: mobile icon controls were smaller than a practical tap target and lost their accessible names; the signature table required horizontal scrolling.

Fixes: expanded bilingual trading-call and scarcity sanitization, changed the metric label to `Overall score`, mapped known chain IDs, made primary-wallet guidance risk-aware, added button labels and 44-pixel targets, and stacked signature fields on mobile.

Post-fix evidence: `docs/qa/qa-shill-1440-final.png`, `docs/qa/qa-sign-1440-final.png`, and the final mobile captures.

### Iteration 2

- P2: desktop table width rules still constrained the stacked mobile cells, causing Chinese field names to wrap one character per line.

Fix: added higher-specificity mobile width overrides for the first and last table cells and bumped the report asset cache version to `2.0.2`.

Post-fix evidence: `docs/qa/qa-sign-mobile-table-final.png` shows readable field names, `196 (X Layer)`, `Unlimited or maximum`, expiry, and verification status without horizontal scrolling.

### Iteration 3

No actionable P0, P1, or P2 differences remained. The three source/implementation pairs preserve their intended visual identities while keeping the implementation's static-assessment limits honest.

## Residual Test Gap

The native operating-system print preview was not captured. Print styles are present, syntax-checked, and the print button is wired to `window.print()`; a production-browser print preview remains a pre-deployment smoke check.

final result: passed
