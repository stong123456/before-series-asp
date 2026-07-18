import {
  MAX_REWRITTEN_CHARS,
  baseResult,
  buildAssessment,
  collectSignals,
  listText,
  prepareInput,
  publicEvidence,
  riskFromScore,
  sensitiveExposureSignal,
  take,
  tr,
  trimTo,
  unique
} from "./common.mjs";

const RULES = [
  {
    id: "guaranteed_profit",
    weight: 5,
    zh: "存在确定收益、保本或无风险暗示，容易被理解为收益承诺。",
    en: "It implies guaranteed returns, principal protection, or no risk and may be read as a performance promise.",
    patterns: [/稳赚|保本|零风险|必赚|保证收益|guaranteed?\s*(?:profit|return)|risk[- ]?free|can'?t\s+lose|free\s+money/i]
  },
  {
    id: "direct_investment_call",
    weight: 4,
    zh: "存在直接买入、加仓、梭哈或卖出指令，投资建议边界不够清楚。",
    en: "It directly tells readers to buy, add, go all-in, or sell, making the investment-advice boundary unclear.",
    patterns: [/(?:建议|请|现在|马上|立即)?.{0,6}(?:买入|加仓|梭哈|抄底|卖出)|buy\s+now|you\s+should\s+buy|go\s+all[- ]?in|load\s+your\s+bags|sell\s+now/i]
  },
  {
    id: "extreme_fomo",
    weight: 4,
    zh: "使用必冲、闭眼冲、百倍或财富密码等 FOMO 表达，容易推动冲动决策。",
    en: "It uses must-ape, blind-ape, 100x, or secret-to-wealth language that can push impulsive decisions.",
    patterns: [/必冲|闭眼冲|财富密码|百倍|千倍|错过.{0,8}(?:后悔|拍断)|must\s+ape|ape\s+now|100x|1000x|next\s+gem|don'?t\s+miss/i]
  },
  {
    id: "urgency",
    weight: 2,
    zh: "限时、倒计时或名额稀缺表达较强，可能制造不必要的紧迫感。",
    en: "Strong deadline, countdown, or scarcity language may create unnecessary urgency.",
    patterns: [/仅限今天|马上结束|最后.{0,14}(?:机会|名额)|手慢无|倒计时|limited\s+(?:time|slots)|last\s+chance|ends?\s+(?:soon|today)|act\s+now/i]
  },
  {
    id: "unsupported_superlative",
    weight: 2,
    zh: "使用最强、唯一、颠覆或革命性等绝对化表达，但原文未给出可核验依据。",
    en: "It uses strongest, only, revolutionary, or disruptive superlatives without verifiable support in the text.",
    patterns: [/全网最|行业第一|唯一|绝对|颠覆|革命性|史诗级|the\s+best|number\s+one|only\s+project|revolutionary|game[- ]?changing|disruptive/i]
  },
  {
    id: "ai_jargon",
    weight: 1,
    zh: "模板化和抽象词偏多，容易显得像 AI 或项目方通稿。",
    en: "Template-like abstract jargon makes the copy sound AI-generated or like a project press release.",
    patterns: [/总的来说|值得关注的是|不仅如此|生态赋能|价值闭环|底层逻辑|多维度|in\s+conclusion|it\s+is\s+worth\s+noting|not\s+only\s+that|ecosystem\s+empowerment|value\s+flywheel|synergy/i]
  },
  {
    id: "heavy_ad_tone",
    weight: 2,
    zh: "营销词和号召动作过密，读起来更像硬广而非真实使用分享。",
    en: "Dense marketing claims and calls to action make it read more like an advertisement than an authentic user post.",
    patterns: [/震撼上线|重磅来袭|强势登陆|不容错过|立即参与|马上加入|grand\s+launch|massive\s+launch|join\s+now|don'?t\s+miss\s+out|once[- ]in[- ]a[- ]lifetime/i]
  },
  {
    id: "pseudo_authority",
    weight: 3,
    zh: "包含官方背书、审计、安全认证或机构合作主张，发布前应确认可公开证明。",
    en: "It claims official endorsement, audits, safety certification, or institutional partnerships that should be publicly verifiable before posting.",
    patterns: [/官方背书|官方认证|绝对安全|审计认证|战略合作|顶级机构加持|officially\s+endorsed|certified\s+safe|fully\s+audited|strategic\s+partner|backed\s+by/i]
  },
  {
    id: "market_manipulation",
    weight: 5,
    zh: "内容可能号召集中买入、拉盘或协同行动，容易形成市场操纵或误导风险。",
    en: "The copy may encourage coordinated buying, pumping, or collective market action, creating manipulation or deception risk.",
    patterns: [/集体.{0,8}(?:买入|冲|拉盘)|一起.{0,8}(?:拉盘|买爆)|目标价.{0,12}(?:马上|今天)|喊单|拉盘|coordinate(?:d)?\s+buy|pump\s+(?:it|this|the)|buy\s+together|send\s+it\s+higher/i]
  },
  {
    id: "giveaway_or_airdrop_terms",
    weight: 2,
    zh: "内容涉及抽奖、空投、白名单或奖励，需要把资格、时间、数量和发放条件写清楚。",
    en: "The copy involves a giveaway, airdrop, whitelist, or reward and should state eligibility, timing, quantity, and distribution conditions clearly.",
    patterns: [/抽奖|空投|白名单|转发.{0,8}领取|关注.{0,8}奖励|giveaway|airdrop|whitelist|retweet.{0,12}(?:win|claim)/i]
  },
  {
    id: "unverified_metrics",
    weight: 2,
    zh: "内容使用用户量、收益率、交易量或增长数据，发布前需要可追溯来源和统计口径。",
    en: "The copy uses user, return, volume, or growth metrics that require a traceable source and measurement basis before publishing.",
    patterns: [/\d+(?:\.\d+)?%\s*(?:收益|增长|回报)|用户突破\s*\d+|交易量.{0,8}\d+|tvl.{0,8}\$?\d+|\d+(?:\.\d+)?%\s*(?:apy|apr|return|growth)|\b\d+[km]?\+?\s+users\b|volume.{0,12}\$?\d+/i]
  },
  {
    id: "excessive_punctuation",
    weight: 1,
    zh: "感叹号、问号或全大写强调过多，削弱可信度。",
    en: "Excessive exclamation marks, question marks, or all-caps emphasis reduces credibility.",
    patterns: [/[!！?？]{3,}/, /\b[A-Z]{8,}\b/]
  },
  {
    id: "prompt_injection",
    weight: 2,
    zh: "原文中混入要求忽略规则、泄露提示词或执行命令的内容，不应进入发布稿。",
    en: "The draft contains instructions to ignore safeguards, reveal prompts, or execute commands and should not appear in published copy.",
    patterns: [/忽略.{0,12}(?:指令|规则)|执行以下命令|ignore\s+(?:all\s+)?previous\s+instructions?|reveal\s+(?:the\s+)?system\s+prompt|execute\s+(?:this|the)\s+command/i]
  }
];

const REPLACEMENTS = [
  { pattern: /guaranteed\s+(?:100x|1000x)\s+gem/gi, zh: "高波动项目", en: "high-volatility project" },
  { pattern: /预计\s*(?:至少)?\s*(?:百倍|千倍|100x|1000x)/gi, zh: "实际结果无法预先保证", en: "results cannot be guaranteed in advance" },
  { pattern: /稳赚不赔|稳赚|必赚|保证收益|保本|零风险/gi, zh: "实际结果存在不确定性", en: "returns are uncertain and risks require independent review" },
  { pattern: /闭眼冲|必冲|无脑冲/gi, zh: "参与前请核验信息和风险", en: "review the details and risks first" },
  { pattern: /财富密码/gi, zh: "一个需要自行核验的项目", en: "a project that needs independent verification" },
  { pattern: /百倍|千倍|100x|1000x/gi, zh: "无法预先保证的结果", en: "an outcome that cannot be guaranteed" },
  { pattern: /(?:建议|请|现在|马上|立即)?.{0,6}(?:买入|加仓|梭哈|抄底|卖出)/gi, zh: "请基于可核验信息自行评估风险", en: "review verifiable information and assess the risks independently" },
  { pattern: /最后\s*\d+\s*(?:个)?\s*(?:机会|名额)[^。！？\n]*/gi, zh: "名额与截止条件请以可核验的官方规则为准", en: "verify any scarcity or deadline claim against the official rules" },
  { pattern: /(?:last|final)\s*\d+\s*(?:slots?|spots?)[^.!?\n]*/gi, zh: "名额与截止条件请以可核验的官方规则为准", en: "verify any scarcity or deadline claim against the official rules" },
  { pattern: /错过[^。！？\n]{0,36}/gi, zh: "", en: "" },
  { pattern: /(?:don'?t|do\s+not)\s+miss(?:\s+out)?[^.!?\n]{0,36}/gi, zh: "", en: "" },
  { pattern: /the\s+best|number\s+one|game[- ]?changing|revolutionary/gi, zh: "值得进一步了解", en: "worth examining further" },
  { pattern: /buy\s+now|must\s+ape|ape\s+now|go\s+all[- ]?in/gi, zh: "先核验信息与风险", en: "review the details and risks first" },
  { pattern: /\bguaranteed\b|guaranteed?\s*(?:profit|return)|risk[- ]?free|can'?t\s+lose/gi, zh: "结果存在不确定性", en: "uncertain" }
];

const EMPTY_PHRASES = [
  /(?:重磅来袭|震撼上线|强势登陆|不容错过)[!！,，:：]?/gi,
  /(?:grand\s+launch|massive\s+launch|once[- ]in[- ]a[- ]lifetime)[!,:]?/gi,
  /总的来说[，,:：]?/gi,
  /值得关注的是[，,:：]?/gi,
  /不仅如此[，,:：]?/gi,
  /生态赋能/gi,
  /价值闭环/gi,
  /底层逻辑/gi,
  /in\s+conclusion[,:]?/gi,
  /it\s+is\s+worth\s+noting\s+that[,:]?/gi,
  /not\s+only\s+that[,:]?/gi,
  /ecosystem\s+empowerment/gi,
  /value\s+flywheel/gi
];

export function analyzeBeforeShill(rawInput, options = {}) {
  const prepared = prepareInput(rawInput, options.lang);
  const lang = prepared.lang;
  const context = analyzePublishingContext(prepared);
  let signals = prepared.sensitiveDataDetected
    ? [sensitiveExposureSignal(lang, "sensitive_data_in_draft")]
    : collectSignals(prepared.scanText, RULES);
  if (!prepared.sensitiveDataDetected && context.sponsorshipMentioned && !context.sponsorshipDisclosed) {
    signals.push({
      id: "sponsorship_disclosure_gap",
      weight: 3,
      zh: "内容存在推广、合作、返佣或邀请关系线索，但没有看到清晰、显著的利益关系披露。",
      en: "The copy suggests a promotional, sponsored, affiliate, or referral relationship without a clear and prominent disclosure.",
      evidence: context.sponsorshipEvidence
    });
    signals.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  }
  const riskScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const severe = prepared.sensitiveDataDetected;
  const risk = riskFromScore(riskScore, { severe });
  const overallScore = severe ? 1 : Math.max(1, Math.min(10, 10 - Math.ceil(riskScore / 2)));
  const optimized = severe
    ? tr(lang, "检测到疑似敏感凭证，系统未生成改写稿。请先删除秘密信息并更换可能泄露的凭证。", "A possible secret was detected, so no rewrite was generated. Remove the secret and rotate any credential that may have been exposed.")
    : optimizeCopy(prepared.text, lang, signals);
  const phrases = take(
    signals.map((signal) => `${tr(lang, signal.zh, signal.en)} ${tr(lang, "示例：", "Example: ")}“${signal.evidence}”`),
    3,
    [tr(lang, "未发现必须删除的高风险表达；可继续检查事实来源和合作披露。", "No high-risk phrase clearly requires removal; still verify factual support and sponsorship disclosure.")]
  );
  const retained = identifyCoreInformation(prepared.text, lang);
  const direction = buildDirection(signals, lang);
  const assessment = buildAssessment(lang, {
    subjectZh: "当前文案的广告表达、事实可信度与一般发布风险",
    subjectEn: "Advertising tone, factual support, and general publishing risk in the supplied copy",
    signals,
    severe,
    decision: severe ? "stop" : riskScore >= 2 ? "revise_before_publish" : "verify_before_action",
    checked: [
      tr(lang, "收益承诺、买卖指令、FOMO 和市场操纵表达", "Return promises, trading calls, FOMO, and market-manipulation language"),
      tr(lang, "广告腔、AI 腔、绝对化表述和伪权威背书", "Advertising tone, AI-like phrasing, absolutes, and pseudo-authority claims"),
      tr(lang, "合作披露、数据来源、抽奖空投和普通用户理解门槛", "Sponsorship disclosure, metric sourcing, giveaways, airdrops, and readability")
    ],
    unverified: [
      tr(lang, "合作合同、报酬、返佣和实际利益关系", "Contracts, compensation, affiliate payments, and actual conflicts of interest"),
      tr(lang, "项目数据、审计、合作、牌照和其他事实主张的真实性", "Accuracy of project metrics, audits, partnerships, licenses, and other factual claims"),
      tr(lang, "发布者和受众所在地法律以及发布时最新的平台规则", "Applicable law for the publisher and audience, and platform rules current at publication time")
    ]
  });
  const mainIssue = signals.length
    ? tr(lang, signals[0].zh, signals[0].en)
    : tr(lang, "整体表达较克制，发布前重点确认事实来源、合作披露和风险边界。", "The tone is generally restrained; verify factual support, sponsorship disclosure, and risk boundaries before publishing.");
  const releaseRisk = tr(lang, `${risk.zh}：${buildRiskReason(signals, lang)}`, `${risk.en}: ${buildRiskReason(signals, lang)}`);
  const reminder = tr(
    lang,
    "本结果仅用于文案优化和一般风险提示，不构成法律意见、项目背书或投资建议。若内容属于有偿合作，请按发布平台规则和适用地区要求清晰披露合作关系。",
    "This result is for copy editing and general risk awareness only. It is not legal advice, project endorsement, or investment advice. If the post is sponsored, disclose the relationship clearly under platform rules and applicable requirements."
  );

  const card = {
    title: tr(lang, "Before Shill 发布前检查卡", "Before Shill Pre-Publish Check Card"),
    assessmentType: tr(lang, "静态发布前风险筛查", "Static pre-publish risk screening"),
    riskSubject: assessment.subject,
    overallScore,
    riskLevel: tr(lang, risk.zh, risk.en),
    evidenceStatus: assessment.evidenceStatus.label,
    confidence: assessment.confidence.label,
    recommendedDecision: assessment.recommendedDecision.label,
    biggestIssue: mainIssue,
    publishingRisk: releaseRisk,
    sponsorshipDisclosure: buildDisclosureCheck(context, lang),
    factChecksRequired: buildFactChecks(context, signals, lang),
    complianceBoundary: tr(
      lang,
      "这是一般发布风险筛查，不是法律合规结论。系统未确认发布者所在地、受众地区、合作合同或发布时最新平台规则。",
      "This is a general publishing-risk screen, not a legal compliance determination. The publisher's jurisdiction, audience location, contract terms, and current platform rules were not verified."
    ),
    expressionsToRemoveOrSoften: phrases,
    coreInformationToKeep: retained,
    revisionDirection: direction,
    optimizedVersion: optimized,
    prePublishReminder: reminder
  };

  return {
    ...baseResult("before-shill", prepared, assessment),
    risk: {
      subject: "general_publishing_and_copy_risk",
      level: risk.key,
      score: riskScore,
      confidence: assessment.confidence.key,
      observedSignalCount: signals.length
    },
    evidence: publicEvidence(prepared, signals, 6),
    card,
    cardText: renderCard(card, lang)
  };
}

function optimizeCopy(text, lang, signals = []) {
  const source = String(text);
  const sourceWasTruncated = source.length > MAX_REWRITTEN_CHARS * 2;
  const ids = new Set(signals.map((signal) => signal.id));
  const safeSentences = extractSaferSentences(source);
  if (!safeSentences.length && ["guaranteed_profit", "direct_investment_call", "extreme_fomo"].some((id) => ids.has(id))) {
    const fallback = tr(
      lang,
      "我正在了解这个项目，目前没有足够的可核验信息支持收益、名额或回报判断。参与前请先核对项目功能、官方规则、费用和风险，并根据自己的情况独立判断。",
      "I am reviewing this project, but there is not enough verifiable information to support claims about returns, scarcity, or outcomes. Check the product, official rules, costs, and risks before making an independent decision."
    );
    const truncationNote = tr(lang, "[长文已截断，请分段检查后再发布]", "[Long draft truncated; review it in sections before publishing]");
    return sourceWasTruncated ? `${fallback}\n${truncationNote}` : fallback;
  }
  let output = source.slice(0, MAX_REWRITTEN_CHARS * 2);
  for (const replacement of REPLACEMENTS) {
    output = output.replace(replacement.pattern, lang === "en" ? replacement.en : replacement.zh);
  }
  for (const pattern of EMPTY_PHRASES) output = output.replace(pattern, "");

  output = output
    .replace(/实际结果存在不确定性[，,]\s*实际结果无法预先保证/g, "实际结果与回报无法预先保证")
    .replace(/returns are uncertain and risks require independent review[,.]?\s*results cannot be guaranteed in advance/gi, "results and returns cannot be guaranteed in advance");

  output = output
    .replace(/ignore\s+(?:all\s+)?previous\s+instructions?[^\n。.!?]*/gi, "")
    .replace(/reveal\s+(?:the\s+)?system\s+prompt[^\n。.!?]*/gi, "")
    .replace(/忽略.{0,12}(?:指令|规则)[^\n。！？]*/g, "")
    .replace(/[!！]{2,}/g, lang === "en" ? "!" : "！")
    .replace(/[?？]{2,}/g, lang === "en" ? "?" : "？")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[，,：:\s]+|[，,：:\s]+$/g, "")
    .trim();

  if (lang === "en") {
    output = output.replace(/(^|[.!?]\s+)([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
  } else {
    output = output.replace(/[!！]+/g, "。").replace(/。{2,}/g, "。");
  }

  if (!output) {
    return tr(lang, "原文主要由高风险或无实质信息的表达组成，建议保留可核验事实后重新撰写。", "The original draft is mostly high-risk or non-substantive language. Retain verifiable facts and rewrite it from those facts.");
  }
  if (sourceWasTruncated || output.length > MAX_REWRITTEN_CHARS) {
    const note = tr(lang, "[长文已截断，请分段检查后再发布]", "[Long draft truncated; review it in sections before publishing]");
    const available = Math.max(200, MAX_REWRITTEN_CHARS - note.length - 2);
    return `${output.slice(0, available).trim()}…\n${note}`;
  }
  return output;
}

function analyzePublishingContext(prepared) {
  if (prepared.sensitiveDataDetected) {
    return {
      sponsorshipMentioned: false,
      sponsorshipDisclosed: false,
      sponsorshipEvidence: "[REDACTED]",
      hasExternalSource: false
    };
  }
  const text = prepared.scanText;
  const sponsorshipPattern = /商业合作|品牌合作|推广合作|赞助|返佣|邀请码|推荐码|affiliate|referral|sponsor(?:ed|ship)?|paid\s+(?:post|partnership|promotion)|promotional\s+partner/i;
  const disclosurePattern = /#(?:ad|广告|赞助)|有偿合作|付费合作|合作内容|利益相关|含返佣|sponsored\s+post|paid\s+partnership|affiliate\s+disclosure|contains?\s+affiliate/i;
  const sponsorshipMatch = text.match(sponsorshipPattern);
  return {
    sponsorshipMentioned: Boolean(sponsorshipMatch),
    sponsorshipDisclosed: disclosurePattern.test(text),
    sponsorshipEvidence: sponsorshipMatch ? trimTo(sponsorshipMatch[0], 96) : "",
    hasExternalSource: prepared.urls.length > 0
  };
}

function buildDisclosureCheck(context, lang) {
  if (context.sponsorshipDisclosed) {
    return tr(lang, "已看到合作或广告披露线索；发布前仍应确认披露位置足够显著、措辞真实且符合适用规则。", "A sponsorship or advertising disclosure is visible. Confirm that it is prominent, accurate, and suitable for the applicable rules.");
  }
  if (context.sponsorshipMentioned) {
    return tr(lang, "存在合作、赞助、返佣或邀请关系线索，但未看到清晰披露。发布前应确认并显著说明真实利益关系。", "A sponsorship, affiliate, or referral relationship may exist, but no clear disclosure is visible. Confirm and prominently disclose the actual relationship before publishing.");
  }
  return tr(lang, "仅凭原文无法确认是否存在报酬、返佣、持仓或其他利益关系；如存在，应在正文中清晰披露。", "The text alone cannot establish whether compensation, affiliate payments, holdings, or another conflict exists. Disclose it clearly in the post if applicable.");
}

function buildFactChecks(context, signals, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  const checks = [];
  if (ids.has("pseudo_authority")) checks.push(tr(lang, "逐项核验审计、合作、认证和机构背书，并链接到相关方官方来源。", "Verify every audit, partnership, certification, and endorsement through the named party's official source."));
  if (ids.has("unverified_metrics") || ids.has("guaranteed_profit")) checks.push(tr(lang, "核对数字、收益率、用户量和增长口径，保留日期、计算方法与可追溯来源。", "Verify figures, return rates, user counts, and growth methodology, including dates, calculations, and traceable sources."));
  if (ids.has("giveaway_or_airdrop_terms")) checks.push(tr(lang, "确认资格、截止时间、奖励数量、发放方式、地区限制和主办方责任。", "Confirm eligibility, deadline, reward quantity, distribution method, geographic restrictions, and organizer responsibility."));
  if (!context.hasExternalSource && (ids.has("pseudo_authority") || ids.has("unverified_metrics"))) checks.push(tr(lang, "当前文案没有提供可追溯来源，发布前补充准确链接或删除无法证明的主张。", "The draft provides no traceable source. Add an accurate link or remove claims that cannot be substantiated."));
  return take(checks, 3, [
    tr(lang, "核对项目名称、合约、日期、费用、功能和参与条件是否与官方最新信息一致。", "Check that names, contracts, dates, fees, functions, and participation conditions match the latest official information."),
    tr(lang, "确认改写稿没有改变原文事实、遗漏关键限制或制造新的承诺。", "Confirm that the rewrite does not alter facts, omit material limitations, or create a new promise."),
    tr(lang, "如涉及合作、持仓或返佣，确认披露真实、清晰并靠近相关主张。", "If sponsorship, holdings, or affiliate payments are involved, make the disclosure accurate, prominent, and close to the relevant claim.")
  ]);
}

function identifyCoreInformation(text, lang) {
  const selected = extractSaferSentences(text).slice(0, 3).map((sentence) => trimTo(sentence, lang === "zh" ? 72 : 120));
  return take(selected, 3, [
    tr(lang, "原文中的项目名称、功能和参与方式等可核验事实。", "Verifiable facts such as the project name, function, and participation method."),
    tr(lang, "原文已明确给出的时间、费用、条件或官方链接。", "Dates, fees, conditions, or official links explicitly present in the original."),
    tr(lang, "作者真实使用感受中不涉及收益承诺的部分。", "Authentic user experience that does not imply guaranteed returns.")
  ]);
}

function extractSaferSentences(text) {
  return String(text)
    .split(/(?<=[。！？.!?])|\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((sentence) => !RULES.some((rule) => rule.patterns.some((pattern) => pattern.test(sentence))));
}

function buildDirection(signals, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  const directions = [];
  if (ids.has("guaranteed_profit") || ids.has("direct_investment_call") || ids.has("extreme_fomo")) directions.push(tr(lang, "删除收益承诺和行动指令，改成事实、使用场景与待核验风险。", "Remove return promises and action commands; focus on facts, use cases, and risks that still need verification."));
  if (ids.has("ai_jargon") || ids.has("heavy_ad_tone") || ids.has("unsupported_superlative")) directions.push(tr(lang, "减少抽象营销词，用具体功能、步骤或亲身体验替代通稿口吻。", "Replace abstract marketing language with concrete functions, steps, or first-hand experience."));
  if (ids.has("pseudo_authority")) directions.push(tr(lang, "背书、合作、审计和数据只保留可公开核验的内容，并提供准确来源。", "Keep endorsement, partnership, audit, and data claims only when publicly verifiable and accurately sourced."));
  directions.push(tr(lang, "保留一个清楚开头和一个自然结尾；如属合作内容，增加清晰披露和风险边界。", "Keep one clear opening and one natural closing; add transparent sponsorship disclosure and risk boundaries when applicable."));
  return take(directions, 3, [tr(lang, "不增加原文没有的事实，发布前再次核对名称、数字、链接和时间。", "Do not add facts absent from the original; re-check names, numbers, links, and dates before posting.")]);
}

function buildRiskReason(signals, lang) {
  if (!signals.length) return tr(lang, "未发现明显收益承诺或强制行动表达，但仍需人工核验事实与披露。", "No obvious return promise or forceful call to action was found, but facts and disclosures still require human review.");
  const categories = unique(signals.slice(0, 3).map((signal) => tr(lang, signal.zh.split("，")[0], signal.en.split(",")[0])));
  return trimTo(categories.join(tr(lang, "；", "; ")), lang === "zh" ? 120 : 200);
}

function renderCard(card, lang) {
  const colon = lang === "en" ? ":" : "：";
  return [
    lang === "en" ? `[${card.title}]` : `【${card.title}】`,
    "",
    `${tr(lang, "评估类型", "Assessment type")}${colon} ${card.assessmentType}`,
    `${tr(lang, "评估对象", "Risk subject")}${colon} ${card.riskSubject}`,
    `${tr(lang, "一般发布风险", "General publishing risk")}${colon} ${card.riskLevel}`,
    `${tr(lang, "证据状态", "Evidence status")}${colon} ${card.evidenceStatus}`,
    `${tr(lang, "判断置信度", "Assessment confidence")}${colon} ${card.confidence}`,
    `${tr(lang, "建议动作", "Recommended decision")}${colon} ${card.recommendedDecision}`,
    "",
    `${tr(lang, "整体评分", "Overall score")}${colon} ${card.overallScore}/10`,
    "",
    `${tr(lang, "最大问题", "Biggest issue")}${colon} ${card.biggestIssue}`,
    "",
    `${tr(lang, "发布风险", "Publishing risk")}${colon} ${card.publishingRisk}`,
    "",
    `${tr(lang, "合作与利益披露", "Sponsorship and conflict disclosure")}${colon} ${card.sponsorshipDisclosure}`,
    "",
    `${tr(lang, "发布前事实核验", "Fact checks before publishing")}${colon}`,
    listText(card.factChecksRequired),
    "",
    `${tr(lang, "合规边界", "Compliance boundary")}${colon} ${card.complianceBoundary}`,
    "",
    `${tr(lang, "需要删掉或弱化的表达", "Expressions to remove or soften")}${colon}`,
    listText(card.expressionsToRemoveOrSoften),
    "",
    `${tr(lang, "可以保留的核心信息", "Core information to keep")}${colon}`,
    listText(card.coreInformationToKeep),
    "",
    `${tr(lang, "修改方向", "Revision direction")}${colon}`,
    listText(card.revisionDirection),
    "",
    `${tr(lang, "优化后版本", "Optimized version")}${colon}`,
    card.optimizedVersion,
    "",
    `${tr(lang, "发布前提醒", "Pre-publish reminder")}${colon} ${card.prePublishReminder}`
  ].join("\n");
}
