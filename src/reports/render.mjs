const ASSET_VERSION = "2.0.2";

export function renderReportDocument(record, requestedLang = "auto") {
  const variants = record.payload?.variants || {};
  const primary = record.payload?.primary;
  const lang = requestedLang === "en" ? "en" : requestedLang === "zh" ? "zh" : primary?.language || "zh";
  const result = variants[lang] || primary;
  if (!result?.card || !result?.assessment) throw new Error("Report payload is incomplete.");

  const service = String(result.service || "before-ape");
  const card = result.card;
  const riskLevel = result.risk?.level || "insufficient";
  const reportNumber = `BS-${record.createdAt.slice(2, 10).replaceAll("-", "")}-${record.id.slice(0, 6).toUpperCase()}`;
  const title = `${card.title} | Before Series`;
  const otherLang = lang === "zh" ? "en" : "zh";
  const canonicalPath = `/reports/${record.id}`;
  const labels = copy(lang);

  return `<!doctype html>
<html lang="${lang}" data-service="${escapeHtml(service)}" data-risk="${escapeHtml(riskLevel)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/report-assets/icons/style.css?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="/report-assets/report.css?v=${ASSET_VERSION}">
  <script src="/report-assets/report.js?v=${ASSET_VERSION}" defer></script>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="#report" aria-label="Before Series"><span>BEFORE</span><small>SERIES</small></a>
    <div class="report-meta">
      <span>${labels.reportId} <strong>${escapeHtml(reportNumber)}</strong></span>
      <span>${labels.generatedAt} ${escapeHtml(formatDate(record.createdAt, lang))}</span>
      <span>${labels.expiresAt} ${escapeHtml(formatDate(record.expiresAt, lang))}</span>
    </div>
    <nav class="toolbar" aria-label="${labels.reportTools}">
      <div class="language-switch" aria-label="${labels.language}">
        <a href="${canonicalPath}?lang=zh"${lang === "zh" ? " aria-current=\"page\"" : ""}>中文</a>
        <span aria-hidden="true">/</span>
        <a href="${canonicalPath}?lang=en"${lang === "en" ? " aria-current=\"page\"" : ""}>EN</a>
      </div>
      <button type="button" data-print aria-label="${labels.print}" title="${labels.print}"><i class="ph ph-printer" aria-hidden="true"></i><span>${labels.print}</span></button>
    </nav>
  </header>

  <main id="report" class="report-shell">
    ${renderTitle(result, lang)}
    ${renderRiskBanner(result, lang)}
    ${renderSummaryMetrics(result, lang)}
    ${service === "before-ape" ? renderApe(result, lang) : service === "before-sign" ? renderSign(result, lang) : renderShill(result, lang)}
    ${renderSafetyBoundary(result, lang)}
  </main>

  <footer class="report-footer">
    <i class="ph ph-lock-key" aria-hidden="true"></i>
    <p>${labels.retentionNotice}</p>
    <p>${labels.expiryNotice.replace("{date}", formatDate(record.expiresAt, lang))}</p>
  </footer>
</body>
</html>`;
}

export function renderReportUnavailable(lang = "zh") {
  const english = lang === "en";
  const title = english ? "Report unavailable" : "报告不可用";
  const body = english
    ? "This temporary report link is invalid, expired, or no longer available. Run the service again to generate a new report."
    : "此临时报告链接无效、已经过期或不再可用。请重新调用服务生成一份新报告。";
  return `<!doctype html><html lang="${english ? "en" : "zh"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${title} | Before Series</title><link rel="stylesheet" href="/report-assets/icons/style.css?v=${ASSET_VERSION}"><link rel="stylesheet" href="/report-assets/report.css?v=${ASSET_VERSION}"></head><body class="unavailable"><main><i class="ph ph-clock-countdown" aria-hidden="true"></i><p class="eyebrow">BEFORE SERIES</p><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

function renderTitle(result, lang) {
  return `<section class="report-title">
    <div>
      <p class="eyebrow">${escapeHtml(result.card.assessmentType)}</p>
      <h1>${escapeHtml(result.card.title)}</h1>
      <p class="risk-subject"><span>${tr(lang, "评估对象", "Risk subject")}</span>${escapeHtml(result.card.riskSubject)}</p>
    </div>
    <span class="service-mark">${escapeHtml(result.service.replace("before-", "BEFORE ").toUpperCase())}</span>
  </section>`;
}

function renderRiskBanner(result, lang) {
  const card = result.card;
  const summary = card.oneLineConclusion || card.biggestIssue || card.explanation;
  return `<section class="risk-banner" aria-label="${tr(lang, "风险结论", "Risk conclusion")}">
    <i class="ph ph-warning-octagon" aria-hidden="true"></i>
    <strong>${escapeHtml(tr(lang, `检测结果：${card.riskLevel}`, `Result: ${card.riskLevel}`))}</strong>
    <p>${escapeHtml(summary)}</p>
  </section>`;
}

function renderSummaryMetrics(result, lang) {
  const card = result.card;
  const score = card.overallScore ? `${card.overallScore}/10` : card.riskLevel;
  const scoreLabel = result.service === "before-shill"
    ? tr(lang, "整体评分", "Overall score")
    : tr(lang, "风险等级", "Risk level");
  const metrics = [
    ["crosshair", scoreLabel, score],
    ["shield-check", tr(lang, "证据状态", "Evidence status"), card.evidenceStatus],
    ["gauge", tr(lang, "判断置信度", "Assessment confidence"), card.confidence],
    ["signpost", tr(lang, "建议动作", "Recommended decision"), card.recommendedDecision]
  ];
  return `<section class="summary-metrics">${metrics.map(([icon, label, value]) => `<div class="metric"><i class="ph ph-${icon}" aria-hidden="true"></i><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</section>`;
}

function renderApe(result, lang) {
  const card = result.card;
  return `<div class="ape-layout">
    <div class="ape-main">
      ${sectionList(lang, "flag", "已观察到的红旗信号", "Observed red flags", card.mainRedFlags, "danger")}
      ${sectionList(lang, "question", "信息缺口", "Information gaps", card.informationGaps, "unknown")}
      <section class="action-strip"><i class="ph ph-shield-chevron" aria-hidden="true"></i><div><span>${tr(lang, "更稳妥的动作", "Safer action")}</span><strong>${escapeHtml(card.saferAction)}</strong></div></section>
    </div>
    <aside class="ape-rail">
      ${numberedSection(lang, "冲之前最该查的三件事", "Top three checks", card.topThreeChecks)}
      ${scopeSection(result, lang)}
      <section class="rail-note"><h2>${tr(lang, "小白版翻译", "Plain-language translation")}</h2><p>${escapeHtml(card.plainLanguageTranslation)}</p></section>
    </aside>
  </div>`;
}

function renderSign(result, lang) {
  const card = result.card;
  const fieldLabel = tr(lang, "字段", "Field");
  const valueLabel = tr(lang, "当前可见内容", "Visible value");
  const verificationLabel = tr(lang, "核验状态", "Verification");
  return `<section class="permission-overview">
      <div class="section-heading"><i class="ph ph-identification-badge" aria-hidden="true"></i><h2>${tr(lang, "权限与交易字段", "Permission and transaction fields")}</h2><span>${escapeHtml(card.interactionType)}</span></div>
      <table><thead><tr><th>${fieldLabel}</th><th>${valueLabel}</th><th>${verificationLabel}</th></tr></thead><tbody>${card.permissionDetails.map((detail, index) => `<tr><td data-label="${fieldLabel}">${escapeHtml(permissionLabel(index, lang))}</td><td data-label="${valueLabel}">${escapeHtml(stripDetailLabel(detail))}</td><td data-label="${verificationLabel}"><span class="status-dot status-dot--unknown">${tr(lang, "待核验", "Unverified")}</span></td></tr>`).join("")}</tbody></table>
    </section>
    <div class="sign-evidence-grid">
      ${sectionList(lang, "warning", "需要注意的地方", "Observed risk signals", card.warnings, "danger")}
      ${sectionList(lang, "question", "看不出来的地方", "Unverified items", card.unknowns, "unknown")}
    </div>
    <section class="sign-next-steps">${numberedSection(lang, "签名前先做", "Before signing", card.firstSteps)}<div class="wallet-warning"><i class="ph ph-wallet" aria-hidden="true"></i><div><span>${tr(lang, "主钱包提醒", "Primary-wallet reminder")}</span><p>${escapeHtml(card.mainWalletReminder)}</p></div></div></section>
    <section class="action-strip"><i class="ph ph-shield-check" aria-hidden="true"></i><div><span>${tr(lang, "安全底线", "Safety floor")}</span><strong>${escapeHtml(card.safetyFloor)}</strong></div></section>`;
}

function renderShill(result, lang) {
  const card = result.card;
  return `<section class="editorial-review">
      <div class="expressions-panel"><div class="section-heading"><i class="ph ph-text-strikethrough" aria-hidden="true"></i><h2>${tr(lang, "需要删除或弱化的表达", "Expressions to remove or soften")}</h2></div>${renderEditorialItems(card.expressionsToRemoveOrSoften)}</div>
      <div class="rewrite-panel"><div class="section-heading"><i class="ph ph-check-circle" aria-hidden="true"></i><h2>${tr(lang, "优化后版本", "Optimized version")}</h2></div><div class="publish-copy">${escapeHtml(card.optimizedVersion).replaceAll("\n", "<br>")}</div></div>
    </section>
    <div class="shill-review-grid">
      <section><div class="section-heading"><i class="ph ph-handshake" aria-hidden="true"></i><h2>${tr(lang, "合作与利益披露", "Sponsorship and conflicts")}</h2></div><p>${escapeHtml(card.sponsorshipDisclosure)}</p></section>
      ${numberedSection(lang, "发布前事实核验", "Fact checks before publishing", card.factChecksRequired)}
      <section><div class="section-heading"><i class="ph ph-scales" aria-hidden="true"></i><h2>${tr(lang, "合规边界", "Compliance boundary")}</h2></div><p>${escapeHtml(card.complianceBoundary)}</p></section>
    </div>
    <section class="action-strip action-strip--primary"><i class="ph ph-paper-plane-tilt" aria-hidden="true"></i><div><span>${tr(lang, "发布建议", "Publishing recommendation")}</span><strong>${escapeHtml(card.recommendedDecision)}</strong></div></section>`;
}

function renderSafetyBoundary(result, lang) {
  const notice = result.card.riskNotice || result.card.disclaimer || result.card.prePublishReminder;
  return `<section class="boundary"><div><i class="ph ph-info" aria-hidden="true"></i><h2>${tr(lang, "责任边界", "Responsibility boundary")}</h2></div><p>${escapeHtml(notice)}</p></section>`;
}

function sectionList(lang, icon, zhTitle, enTitle, items, tone) {
  return `<section class="evidence-section evidence-section--${tone}"><div class="section-heading"><i class="ph ph-${icon}" aria-hidden="true"></i><h2>${tr(lang, zhTitle, enTitle)}</h2><span>${items.length}</span></div><ol>${items.map((item) => `<li><span>${escapeHtml(item)}</span></li>`).join("")}</ol></section>`;
}

function numberedSection(lang, zhTitle, enTitle, items) {
  return `<section class="numbered-section"><div class="section-heading"><i class="ph ph-list-numbers" aria-hidden="true"></i><h2>${tr(lang, zhTitle, enTitle)}</h2></div><ol>${items.map((item) => `<li><span>${escapeHtml(item)}</span></li>`).join("")}</ol></section>`;
}

function scopeSection(result, lang) {
  const items = [
    tr(lang, "未访问提交的链接", "Submitted links were not fetched"),
    tr(lang, "未查询链上或地址信誉数据", "No on-chain or address-reputation query"),
    tr(lang, "未模拟交易或审计合约", "No transaction simulation or contract audit")
  ];
  return `<section class="scope-section"><div class="section-heading"><i class="ph ph-prohibit" aria-hidden="true"></i><h2>${tr(lang, "本报告不包含", "Out of scope")}</h2></div><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

function renderEditorialItems(items) {
  return `<ol>${items.map((item) => `<li><span>${escapeHtml(item)}</span><i class="ph ph-arrow-right" aria-hidden="true"></i></li>`).join("")}</ol>`;
}

function permissionLabel(index, lang) {
  return [tr(lang, "授权方向", "Permission direction"), tr(lang, "方法与目标", "Method and target"), tr(lang, "网络、额度、有效期", "Network, allowance, expiry")][index] || tr(lang, "字段", "Field");
}

function stripDetailLabel(value) {
  return String(value).replace(/^[^:：]{1,40}[:：]\s*/, "");
}

function formatDate(value, lang) {
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function copy(lang) {
  return lang === "en" ? {
    reportId: "Report ID",
    generatedAt: "Generated",
    expiresAt: "Expires",
    reportTools: "Report tools",
    language: "Language",
    print: "Print",
    retentionNotice: "Only the generated, redacted report is retained temporarily; the original request body is not stored separately.",
    expiryNotice: "This bearer-link report expires at {date}. Anyone with the link can view it before expiry."
  } : {
    reportId: "报告编号",
    generatedAt: "生成时间",
    expiresAt: "失效时间",
    reportTools: "报告工具",
    language: "语言",
    print: "打印报告",
    retentionNotice: "系统仅临时保存生成后的脱敏报告，不会单独保存原始请求正文。",
    expiryNotice: "此持有链接可查看的报告将在 {date} 失效；失效前任何获得链接的人都可以访问。"
  };
}

function tr(lang, zh, en) {
  return lang === "en" ? en : zh;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}
