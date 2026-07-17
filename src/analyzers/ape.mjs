import {
  baseResult,
  collectSignals,
  extractDomains,
  listText,
  prepareInput,
  riskFromScore,
  take,
  tr,
  trimTo
} from "./common.mjs";

const RULES = [
  {
    id: "secret_request",
    weight: 11,
    zh: "内容涉及助记词、私钥或验证码等敏感信息。任何正规活动都不应索取这些信息。",
    en: "The content involves a seed phrase, private key, or verification code. Legitimate campaigns should never request these secrets.",
    patterns: [/助记词|私钥|验证码|seed\s*phrase|mnemonic|private\s*key|verification\s*code|\botp\b/i]
  },
  {
    id: "guaranteed_return",
    weight: 4,
    zh: "出现保本、稳赚或确定收益表达，收益承诺需要高度谨慎。",
    en: "It uses guaranteed-profit or fixed-return language, which requires heightened caution.",
    patterns: [/稳赚|保本|零风险|保证收益|固定收益|guaranteed?\s*(?:profit|return)|risk[- ]?free|no\s+risk/i]
  },
  {
    id: "transfer_first",
    weight: 4,
    zh: "要求先转账、充值或发送资产，资金去向与退款条件需要先核验。",
    en: "It asks for a transfer, deposit, or asset payment first; verify the recipient and refund terms before proceeding.",
    patterns: [/先.{0,8}(?:转账|打款|充值|付款)|发送.{0,8}(?:usdt|eth|sol|代币)|send\s+(?:funds|usdt|eth|sol)|deposit\s+(?:first|now)/i]
  },
  {
    id: "wallet_interaction",
    weight: 3,
    zh: "参与过程涉及连接钱包、签名、授权或合约交互，存在资产权限风险。",
    en: "Participation involves connecting a wallet, signing, approving, or interacting with a contract, which may grant asset permissions.",
    patterns: [/连接钱包|钱包签名|授权|approve|permit2?|setapprovalforall|connect\s+wallet|sign\s+(?:the\s+)?message|contract\s+interaction/i]
  },
  {
    id: "lock_or_stake",
    weight: 3,
    zh: "涉及质押、锁仓、跨链或资金托管，退出条件和合约权限需要单独确认。",
    en: "It involves staking, lockups, bridging, or custody; verify withdrawal conditions and contract permissions separately.",
    patterns: [/质押|锁仓|跨链|资金池|stake|staking|lock(?:ed|up)?|bridge|liquidity\s+pool/i]
  },
  {
    id: "urgency",
    weight: 2,
    zh: "使用限时、名额或马上行动等催促表达，容易压缩正常核验时间。",
    en: "It uses countdowns, limited slots, or act-now pressure that can shorten normal verification time.",
    patterns: [/限时|仅限今天|最后.{0,6}(?:机会|名额|小时)|马上|立即冲|手慢无|倒计时|limited\s+(?:time|slots)|act\s+now|last\s+chance|ends?\s+(?:soon|today)/i]
  },
  {
    id: "airdrop_ambiguity",
    weight: 2,
    zh: "空投、白名单或未来权益被强调，但获取条件或发放规则不够清楚。",
    en: "Airdrop, whitelist, or future benefits are emphasized without clear eligibility or distribution rules.",
    patterns: [/空投|白名单|未来权益|积分兑换|airdrop|whitelist|future\s+(?:reward|benefit)|points?\s+will/i]
  },
  {
    id: "authority_claim",
    weight: 2,
    zh: "内容借用合作、官方、审计或知名机构背书，需要从相关方官方渠道交叉验证。",
    en: "It relies on partnership, official, audit, or institutional endorsement claims that should be cross-checked through the named party.",
    patterns: [/官方合作|战略合作|获得.{0,10}投资|顶级机构|审计通过|official\s+partner|backed\s+by|audited\s+by|strategic\s+partnership/i]
  },
  {
    id: "fomo_narrative",
    weight: 2,
    zh: "出现“先冲再说”、错过焦虑或暴富叙事，容易推动未经核验的决定。",
    en: "It uses ape-first, fear-of-missing-out, or instant-wealth framing that can encourage unverified decisions.",
    patterns: [/先冲再说|闭眼冲|财富密码|百倍|上车|错过.{0,8}(?:后悔|拍断)|ape\s+(?:now|first)|100x|next\s+100x|don'?t\s+miss|financial\s+freedom/i]
  },
  {
    id: "prompt_injection",
    weight: 2,
    zh: "文本包含要求系统忽略规则或执行命令的指令，应把它当作不可信内容处理。",
    en: "The text contains instructions to ignore rules or execute commands and should be treated as untrusted content.",
    patterns: [/忽略.{0,12}(?:之前|以上).{0,8}(?:指令|规则)|执行以下命令|ignore\s+(?:all\s+)?previous\s+instructions?|reveal\s+(?:the\s+)?system\s+prompt|execute\s+(?:this|the)\s+command/i]
  }
];

export function analyzeBeforeApe(rawInput, options = {}) {
  const prepared = prepareInput(rawInput, options.lang);
  const lang = prepared.lang;
  const signals = collectSignals(prepared.text, RULES);
  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const risk = riskFromScore(score);
  const domains = extractDomains(prepared.urls);
  const gaps = buildGaps(prepared, lang);
  const checks = buildChecks(prepared, signals, domains, lang);
  const actions = buildActions(signals, lang);
  const flags = take(
    signals.map((signal) => `${tr(lang, signal.zh, signal.en)} ${tr(lang, "证据：", "Evidence: ")}“${signal.evidence}”`),
    3,
    [
      tr(lang, "没有观察到第三项独立红旗；仍需结合官方来源和真实钱包弹窗核验。", "No third independent red flag was observed; official sources and the actual wallet prompt still require verification."),
      tr(lang, "文字检查无法确认网站、合约和项目主体的真实性。", "A text-only check cannot verify the website, contract, or operator."),
      tr(lang, "风险等级只反映当前可见内容，不代表项目已经过安全验证。", "The risk level reflects only visible content and is not a security verification.")
    ]
  );

  const conclusion = buildConclusion(signals, risk, lang);
  const plain = buildPlainTranslation(signals, prepared, lang);
  const disclaimer = tr(
    lang,
    "本结果仅基于用户提供的文字进行信息整理和风险教育，未访问链接、未审计合约，不构成投资建议，也不代表项目真实安全或不安全。",
    "This result is a static review of user-supplied text for information organization and risk education. It does not visit links, audit contracts, provide investment advice, or certify that a project is safe or unsafe."
  );

  const card = {
    title: tr(lang, "Before Ape 冲前检查卡", "Before Ape Pre-Ape Check Card"),
    riskLevel: tr(lang, risk.zh, risk.en),
    oneLineConclusion: conclusion,
    mainRedFlags: flags,
    informationGaps: gaps,
    topThreeChecks: checks,
    saferAction: actions,
    plainLanguageTranslation: plain,
    riskNotice: disclaimer
  };

  return {
    ...baseResult("before-ape", prepared),
    risk: { level: risk.key, score, observedSignalCount: signals.length },
    evidence: signals.slice(0, 5).map(({ id, weight, evidence }) => ({ id, weight, evidence })),
    card,
    cardText: renderCard(card, lang)
  };
}

function buildGaps(prepared, lang) {
  const text = prepared.lower;
  const gaps = [];
  if (prepared.urls.length === 0) gaps.push(tr(lang, "未提供可核对的官方链接或域名。", "No official link or domain was supplied for verification."));
  if (prepared.addresses.length === 0) gaps.push(tr(lang, "未提供可核对的合约地址、链和代币信息。", "No contract address, chain, or token details were supplied."));
  if (!/团队|创始人|开发者|team|founder|developer/i.test(text)) gaps.push(tr(lang, "团队身份、历史项目和责任主体不明确。", "The team identity, track record, and accountable entity are unclear."));
  if (!/审计|audit|verified\s+contract|开源|open\s*source/i.test(text)) gaps.push(tr(lang, "未看到合约开源、验证或独立审计信息。", "No contract verification, source disclosure, or independent audit information is visible."));
  if (!/退出|赎回|解锁|退款|withdraw|redeem|unlock|refund/i.test(text)) gaps.push(tr(lang, "退出、赎回、解锁或退款条件没有说明。", "Exit, redemption, unlock, or refund conditions are not stated."));
  return take(gaps, 3, [tr(lang, "现有内容不足以独立确认项目主体与交互范围。", "The supplied content is insufficient to independently verify the operator and interaction scope.")]);
}

function buildChecks(prepared, signals, domains, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  const checks = [];
  if (domains.length) checks.push(tr(lang, `从项目官方账号反向确认域名 ${domains[0]}，逐字检查拼写和跳转。`, `Confirm ${domains[0]} from the project's official account and inspect spelling and redirects character by character.`));
  else checks.push(tr(lang, "从项目官方账号找到官网，不使用群聊私链或搜索广告入口。", "Find the website from the project's official account; avoid group-chat links and search ads."));
  if (prepared.addresses.length) checks.push(tr(lang, `确认地址 ${prepared.addresses[0].slice(0, 10)}… 所在链、合约源码、权限和官方归属。`, `Confirm the chain, verified source, privileges, and official ownership of ${prepared.addresses[0].slice(0, 10)}….`));
  else checks.push(tr(lang, "确认链、官方合约地址、是否为代理合约以及管理员可修改的权限。", "Confirm the chain, official contract address, proxy status, and administrator privileges."));
  if (ids.has("wallet_interaction") || ids.has("lock_or_stake")) checks.push(tr(lang, "在签名前核对调用方法、授权对象、授权额度、转账金额和能否撤销。", "Before signing, verify the method, spender, allowance, transfer value, and revocation path."));
  else checks.push(tr(lang, "核对参与规则、实际成本、退出条件，以及积分或未来权益是否有明确依据。", "Verify participation rules, actual costs, exit conditions, and the basis for points or future benefits."));
  return take(checks, 3);
}

function buildActions(signals, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  const actions = [];
  if (ids.has("secret_request")) actions.push(tr(lang, "停止填写或发送任何助记词、私钥、验证码，并将已暴露的钱包视为需要迁移处理。", "Stop sharing any seed phrase, private key, or verification code; treat an exposed wallet as requiring migration."));
  if (ids.has("wallet_interaction") || ids.has("lock_or_stake")) actions.push(tr(lang, "先用与主要资产隔离的小额测试钱包，签名前检查授权范围，交互后复查并撤销不再需要的授权。", "Use a low-value wallet isolated from primary assets, inspect permissions before signing, and revoke unnecessary approvals afterward."));
  if (ids.has("urgency") || ids.has("fomo_narrative")) actions.push(tr(lang, "先暂停，保存原文和域名，独立核对至少两个官方来源后再决定是否继续。", "Pause, preserve the original text and domain, and cross-check at least two official sources before deciding whether to continue."));
  return take(actions, 2, [tr(lang, "先核对官方来源、合约权限和退出条件；信息无法确认时先观察，不使用主钱包直接交互。", "Verify official sources, contract privileges, and exit conditions first. If key facts remain unclear, wait and avoid using a primary wallet.")]).join(" ");
}

function buildConclusion(signals, risk, lang) {
  if (!signals.length) return tr(lang, "现有文字未显示明确高危红旗，但项目主体、合约和真实交互仍需独立核验。", "The text shows no explicit high-risk red flag, but the operator, contracts, and actual interaction still require independent verification.");
  const top = signals[0];
  return trimTo(tr(lang, `当前最值得注意的是：${top.zh}`, `The main concern is: ${top.en}`), 180);
}

function buildPlainTranslation(signals, prepared, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  const actions = [];
  if (ids.has("wallet_interaction")) actions.push(tr(lang, "连接钱包或签名", "connect a wallet or sign"));
  if (ids.has("lock_or_stake")) actions.push(tr(lang, "把资产锁进合约", "lock assets in a contract"));
  if (ids.has("transfer_first")) actions.push(tr(lang, "先转出资产", "send assets first"));
  if (ids.has("airdrop_ambiguity")) actions.push(tr(lang, "用空投或未来权益吸引参与", "use an airdrop or future benefits to attract participation"));
  if (!actions.length) actions.push(tr(lang, "了解并参与一个尚需核验的项目或活动", "consider a project or campaign that still needs verification"));
  const details = prepared.urls.length || prepared.addresses.length
    ? tr(lang, "已有部分链接或地址线索，但仍需确认是否来自官方。", "Some links or addresses are present, but their official origin still needs confirmation.")
    : tr(lang, "关键链接、合约或主体信息不足。", "Key links, contracts, or operator details are missing.");
  return trimTo(tr(lang, `这段内容希望你${actions.join("、")}。${details}`, `The content asks you to ${actions.join(", ")}. ${details}`), lang === "zh" ? 120 : 220);
}

function renderCard(card, lang) {
  const colon = lang === "en" ? ":" : "：";
  return [
    lang === "en" ? `[${card.title}]` : `【${card.title}】`,
    "",
    `${tr(lang, "风险等级", "Risk level")}${colon} ${card.riskLevel}`,
    "",
    `${tr(lang, "一句话结论", "One-line conclusion")}${colon}`,
    card.oneLineConclusion,
    "",
    `${tr(lang, "主要红旗", "Main red flags")}${colon}`,
    listText(card.mainRedFlags),
    "",
    `${tr(lang, "信息缺口", "Information gaps")}${colon}`,
    listText(card.informationGaps),
    "",
    `${tr(lang, "冲之前最该查的三件事", "Top three checks before participating")}${colon}`,
    listText(card.topThreeChecks),
    "",
    `${tr(lang, "更稳妥的动作", "Safer action")}${colon} ${card.saferAction}`,
    "",
    `${tr(lang, "小白版翻译", "Plain-language translation")}${colon} ${card.plainLanguageTranslation}`,
    "",
    `${tr(lang, "风险提示", "Risk notice")}${colon} ${card.riskNotice}`
  ].join("\n");
}
