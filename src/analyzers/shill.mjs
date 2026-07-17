import {
  baseResult,
  collectSignals,
  listText,
  prepareInput,
  riskFromScore,
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
    patterns: [/立即买入|建议买入|加仓|梭哈|抄底|卖出|buy\s+now|you\s+should\s+buy|go\s+all[- ]?in|load\s+your\s+bags|sell\s+now/i]
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
    patterns: [/仅限今天|马上结束|最后.{0,6}(?:机会|名额)|手慢无|倒计时|limited\s+(?:time|slots)|last\s+chance|ends?\s+(?:soon|today)|act\s+now/i]
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
  { pattern: /稳赚不赔|稳赚|必赚|保证收益|保本|零风险/gi, zh: "实际结果存在不确定性", en: "returns are uncertain and risks require independent review" },
  { pattern: /闭眼冲|必冲|无脑冲/gi, zh: "参与前请核验信息和风险", en: "review the details and risks first" },
  { pattern: /财富密码/gi, zh: "一个需要自行核验的项目", en: "a project that needs independent verification" },
  { pattern: /百倍|千倍|100x|1000x/gi, zh: "高波动预期", en: "a high-volatility claim" },
  { pattern: /立即买入|建议买入|买爆|梭哈|加仓/gi, zh: "关注并自行评估", en: "review and assess independently" },
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
  const signals = collectSignals(prepared.text, RULES);
  const riskScore = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const risk = riskFromScore(riskScore);
  const overallScore = Math.max(1, Math.min(10, 10 - Math.ceil(riskScore / 2)));
  const optimized = optimizeCopy(prepared.text, lang);
  const phrases = take(
    signals.map((signal) => `${tr(lang, signal.zh, signal.en)} ${tr(lang, "示例：", "Example: ")}“${signal.evidence}”`),
    3,
    [tr(lang, "未发现必须删除的高风险表达；可继续检查事实来源和合作披露。", "No high-risk phrase clearly requires removal; still verify factual support and sponsorship disclosure.")]
  );
  const retained = identifyCoreInformation(prepared.text, lang);
  const direction = buildDirection(signals, lang);
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
    overallScore,
    biggestIssue: mainIssue,
    publishingRisk: releaseRisk,
    expressionsToRemoveOrSoften: phrases,
    coreInformationToKeep: retained,
    revisionDirection: direction,
    optimizedVersion: optimized,
    prePublishReminder: reminder
  };

  return {
    ...baseResult("before-shill", prepared),
    risk: { level: risk.key, score: riskScore, observedSignalCount: signals.length },
    evidence: signals.slice(0, 6).map(({ id, weight, evidence }) => ({ id, weight, evidence })),
    card,
    cardText: renderCard(card, lang)
  };
}

function optimizeCopy(text, lang) {
  let output = String(text);
  for (const replacement of REPLACEMENTS) {
    output = output.replace(replacement.pattern, lang === "en" ? replacement.en : replacement.zh);
  }
  for (const pattern of EMPTY_PHRASES) output = output.replace(pattern, "");

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
  return output;
}

function identifyCoreInformation(text, lang) {
  const sentences = String(text).split(/(?<=[。！？.!?])|\n+/).map((item) => item.trim()).filter(Boolean);
  const safer = sentences.filter((sentence) => !RULES.some((rule) => rule.patterns.some((pattern) => pattern.test(sentence))));
  const selected = (safer.length ? safer : sentences).slice(0, 3).map((sentence) => trimTo(sentence, lang === "zh" ? 72 : 120));
  return take(selected, 3, [
    tr(lang, "原文中的项目名称、功能和参与方式等可核验事实。", "Verifiable facts such as the project name, function, and participation method."),
    tr(lang, "原文已明确给出的时间、费用、条件或官方链接。", "Dates, fees, conditions, or official links explicitly present in the original."),
    tr(lang, "作者真实使用感受中不涉及收益承诺的部分。", "Authentic user experience that does not imply guaranteed returns.")
  ]);
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
    `${tr(lang, "整体评分", "Overall score")}${colon} ${card.overallScore}/10`,
    "",
    `${tr(lang, "最大问题", "Biggest issue")}${colon} ${card.biggestIssue}`,
    "",
    `${tr(lang, "发布风险", "Publishing risk")}${colon} ${card.publishingRisk}`,
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
