import {
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
  trimTo
} from "./common.mjs";

const RULES = [
  {
    id: "secret_exposure",
    weight: 20,
    zh: "内容中出现或索取助记词、私钥、验证码等敏感信息。钱包交互不需要提交这些秘密。",
    en: "The content contains or requests a seed phrase, private key, or verification code. Wallet interactions do not require sharing these secrets.",
    patterns: [/(?:填写|输入|发送|粘贴|提交|提供).{0,16}(?:助记词|私钥|验证码)|(?:provide|enter|send|paste|submit|share).{0,24}(?:seed\s*phrase|mnemonic|private\s*key|verification\s*code|\botp\b)/i]
  },
  {
    id: "unlimited_approval",
    weight: 7,
    zh: "可能是无限额度授权，授权对象未来可能持续动用对应代币。",
    en: "This may be an unlimited token allowance, allowing the spender to keep using the approved token later.",
    patterns: [/无限授权|最大额度|max(?:imum)?\s+(?:allowance|approval)|(?:approve|allowance).{0,32}(?:unlimited|max(?:imum)?)|unlimited.{0,32}(?:allowance|approv|spender|operator)|2\s*\^\s*256|maxuint256|ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff/i]
  },
  {
    id: "all_nft_approval",
    weight: 7,
    zh: "可能涉及 setApprovalForAll，操作方可管理该 NFT 合约下的全部资产。",
    en: "This may invoke setApprovalForAll, allowing an operator to manage every asset under that NFT contract.",
    patterns: [/setapprovalforall|全部\s*nft\s*授权|授权全部藏品|approve\s+all\s+nfts?/i]
  },
  {
    id: "asset_transfer",
    weight: 5,
    zh: "操作可能直接转出代币、NFT 或原生资产，必须核对接收地址和金额。",
    en: "The operation may directly transfer tokens, NFTs, or native assets; verify the recipient and amount.",
    patterns: [/发送|转账|转出|transferfrom|safetransferfrom|\btransfer\b|send\s+(?:token|asset|eth|sol|usdt)|recipient|接收地址/i]
  },
  {
    id: "blind_signature",
    weight: 7,
    zh: "签名内容可能无法直接读懂或使用高风险盲签方式，当前文本不足以确认真实授权范围。",
    en: "The request may be opaque or use a higher-risk blind-signing method, so the actual authority cannot be confirmed from this text.",
    patterns: [/盲签|blind\s*sign|\beth_sign\b|unknown\s+message|无法解析|unrecognized\s+data|raw\s+message/i]
  },
  {
    id: "permit",
    weight: 4,
    zh: "出现 Permit 或 Permit2 授权，签名本身可能建立代币额度，无需先发送链上 approve 交易。",
    en: "Permit or Permit2 appears; the signature itself may create token allowance without a separate on-chain approve transaction.",
    patterns: [/permit2?|eip[- ]?2612|signaturetransfer|allowancetransfer/i]
  },
  {
    id: "token_approval",
    weight: 4,
    zh: "操作涉及代币 approve 授权，需要确认 spender、代币和额度。",
    en: "The operation includes token approval; verify the spender, token, and allowance amount.",
    patterns: [/授权额度|代币授权|\bapprove\b|allowance|spender|increaseallowance/i]
  },
  {
    id: "proxy_or_delegate",
    weight: 4,
    zh: "出现代理、委托或可升级合约线索，实际执行逻辑可能由另一合约或管理员控制。",
    en: "Proxy, delegation, or upgradeable-contract language appears; another contract or administrator may control the actual logic.",
    patterns: [/代理合约|委托|可升级|proxy|delegatecall|delegation|upgradeable|implementation\s+contract/i]
  },
  {
    id: "bridge",
    weight: 3,
    zh: "这是跨链相关操作，除签名权限外还要考虑桥合约、目标链和到账规则。",
    en: "This is bridge-related; besides signature permissions, verify the bridge contract, destination chain, and delivery rules.",
    patterns: [/跨链|\bbridge\b|destination\s+chain|source\s+chain|目标链/i]
  },
  {
    id: "stake_or_lock",
    weight: 3,
    zh: "操作可能把资产质押或锁定，需要确认解锁条件、退出方法和合约权限。",
    en: "The operation may stake or lock assets; verify unlock conditions, exit mechanics, and contract privileges.",
    patterns: [/质押|锁仓|\bstake\b|staking|lock(?:ed|up)?|unstake|withdrawal\s+period/i]
  },
  {
    id: "claim_or_mint",
    weight: 2,
    zh: "操作以领取或 mint 为入口，但最终调用仍可能包含授权或转账。",
    en: "The flow is framed as a claim or mint, but the final call may still contain approvals or transfers.",
    patterns: [/领取|空投|铸造|\bclaim\b|\bmint\b|airdrop/i]
  },
  {
    id: "typed_data",
    weight: 1,
    zh: "这是结构化签名线索；需要查看域名、chainId、verifyingContract 和具体 message 字段。",
    en: "This appears to be typed-data signing; inspect the domain, chainId, verifyingContract, and message fields.",
    patterns: [/eip[- ]?712|signtypeddata|typed\s+data|verifyingcontract|domain\s+separator/i]
  },
  {
    id: "login_signature",
    weight: 1,
    zh: "内容看起来接近登录签名，但仍需确认消息中没有资产授权、订单或委托字段。",
    en: "This resembles a login signature, but confirm that the message contains no asset approval, order, or delegation fields.",
    patterns: [/登录签名|sign[- ]?in\s+with\s+ethereum|\bsiwe\b|login\s+signature|authenticate\s+wallet/i]
  },
  {
    id: "prompt_injection",
    weight: 2,
    zh: "文本包含要求忽略规则、泄露信息或执行命令的内容，应视为不可信提示。",
    en: "The text contains instructions to ignore safeguards, disclose information, or execute commands and should be treated as untrusted.",
    patterns: [/忽略.{0,12}(?:指令|规则)|执行以下命令|ignore\s+(?:all\s+)?previous\s+instructions?|reveal\s+(?:the\s+)?system\s+prompt|execute\s+(?:this|the)\s+command/i]
  }
];

export function analyzeBeforeSign(rawInput, options = {}) {
  const prepared = prepareInput(rawInput, options.lang);
  const lang = prepared.lang;
  const revocation = !prepared.sensitiveDataDetected && detectApprovalRevocation(prepared.scanText);
  let signals = prepared.sensitiveDataDetected
    ? [sensitiveExposureSignal(lang)]
    : collectSignals(prepared.scanText, RULES);
  if (revocation) {
    signals = signals.filter((signal) => !["all_nft_approval", "token_approval", "unlimited_approval"].includes(signal.id));
    signals.push(revocationSignal(prepared.scanText, lang));
    signals.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  }
  const insufficient = isInsufficient(prepared, signals);
  const score = signals.reduce((sum, signal) => sum + signal.weight, 0);
  const severe = prepared.sensitiveDataDetected;
  const risk = riskFromScore(score, { insufficient, severe });
  const interactionType = classifyInteraction(prepared.scanText, signals, revocation, lang);
  const details = extractInteractionDetails(prepared, signals, revocation, lang);
  const warnings = buildWarnings(signals, lang);
  const firstSteps = buildFirstSteps(prepared, signals, lang);
  const unknowns = buildUnknowns(prepared, signals, lang);
  const explanation = buildExplanation(interactionType, signals, insufficient, lang);
  const mainWallet = buildMainWalletAdvice(signals, insufficient, score, lang);
  const assessment = buildAssessment(lang, {
    subjectZh: "当前可见签名、授权或交易提示中的资产权限风险",
    subjectEn: "Asset-permission risk in the visible signature, approval, or transaction prompt",
    signals,
    insufficient,
    severe,
    decision: severe ? "stop" : insufficient || score >= 4 ? "pause_and_verify" : "verify_before_action",
    checked: [
      tr(lang, "交互类型、授权方向和高风险方法", "Interaction type, approval direction, and high-risk methods"),
      tr(lang, "授权额度、spender/operator、接收方和有效期线索", "Allowance, spender/operator, recipient, and expiry indicators"),
      tr(lang, "敏感凭证、盲签、Permit、代理、跨链和资产转移线索", "Secrets, blind signing, Permit, proxy, bridge, and asset-transfer indicators")
    ],
    unverified: [
      tr(lang, "域名是否真实且与目标合约一致", "Whether the domain is authentic and matches the target contract"),
      tr(lang, "链上合约源码、代理实现、管理员权限和地址风险标签", "On-chain source, proxy implementation, admin powers, and address risk labels"),
      tr(lang, "完整 calldata、交易模拟结果和最终资产变化", "Complete calldata, simulation result, and final asset changes")
    ]
  });
  const safetyFloor = tr(
    lang,
    "不要提供助记词、私钥或验证码；不要在来源未确认的网站连接主钱包；签名前逐项核对域名、链、合约、接收方、授权对象、额度和金额。",
    "Never share a seed phrase, private key, or verification code. Do not connect a primary wallet to an unverified site. Before signing, verify the domain, chain, contract, recipient, spender, allowance, and value."
  );
  const disclaimer = tr(
    lang,
    "本结果仅对用户提供的可见文字做静态风险解释，未访问网站、未模拟交易、未读取链上状态或审计合约，不代表该交互一定安全或一定危险，也不构成投资建议。",
    "This result is a static explanation of visible user-supplied text. It does not visit the site, simulate the transaction, read on-chain state, or audit the contract. It does not certify the interaction as safe or dangerous and is not investment advice."
  );

  const card = {
    title: tr(lang, "Before Sign 签名前提醒卡", "Before Sign Pre-Sign Check Card"),
    assessmentType: tr(lang, "静态签名前置风险筛查", "Static pre-sign risk screening"),
    riskSubject: assessment.subject,
    interactionType,
    riskLevel: tr(lang, risk.zh, risk.en),
    evidenceStatus: assessment.evidenceStatus.label,
    confidence: assessment.confidence.label,
    recommendedDecision: assessment.recommendedDecision.label,
    permissionDetails: details,
    explanation,
    warnings,
    firstSteps,
    mainWalletReminder: mainWallet,
    unknowns,
    safetyFloor,
    disclaimer
  };

  return {
    ...baseResult("before-sign", prepared, assessment),
    risk: {
      subject: "visible_signature_and_asset_permissions",
      level: risk.key,
      score,
      confidence: assessment.confidence.key,
      observedSignalCount: signals.length
    },
    evidence: publicEvidence(prepared, signals, 6),
    card,
    cardText: renderCard(card, lang)
  };
}

function isInsufficient(prepared, signals) {
  if (prepared.sensitiveDataDetected) return false;
  if (prepared.scanText.length < 12) return true;
  if (prepared.addresses.length === 1 && prepared.scanText.replace(prepared.addresses[0], "").trim().length < 12) return true;
  return signals.length === 0 && !/[{[(].{8,}[}\])]|0x[a-f0-9]{8,}|signature|transaction|签名|交易/i.test(prepared.scanText);
}

function classifyInteraction(text, signals, revocation, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  if (revocation) return tr(lang, "撤销授权", "Approval revocation");
  if (ids.has("asset_transfer")) return tr(lang, "转账", "Transfer");
  if (ids.has("bridge")) return tr(lang, "跨链 bridge", "Bridge");
  if (ids.has("stake_or_lock")) return tr(lang, "质押 stake", "Stake");
  if (/\bmint\b|铸造/i.test(text)) return "mint";
  if (/\bclaim\b|领取|空投/i.test(text)) return tr(lang, "领取 claim", "Claim");
  if (ids.has("unlimited_approval") || ids.has("all_nft_approval") || ids.has("permit") || ids.has("token_approval")) return tr(lang, "授权 approve", "Approval");
  if (ids.has("login_signature")) return tr(lang, "登录签名", "Login signature");
  if (preparedContractLike(text)) return tr(lang, "合约交互", "Contract interaction");
  return tr(lang, "无法判断", "Unable to determine");
}

function detectApprovalRevocation(text) {
  return /setapprovalforall\s*\([^)]*,\s*false\s*\)|\bapprove\s*\([^,]+,\s*(?:0|0x0+)\s*\)|撤销授权|取消授权|移除授权|\brevoke(?:d|s|ing)?\b|\brevocation\b/i.test(text);
}

function revocationSignal(text, lang) {
  return {
    id: "approval_revocation",
    weight: 1,
    severity: "informational",
    zh: "文本显示这可能是撤销或归零现有授权，而不是新增授权。仍需确认 operator/spender 与目标资产。",
    en: "The text suggests revoking or zeroing an existing approval rather than granting a new one. Verify the operator/spender and target asset.",
    evidence: trimTo(text, 96)
  };
}

function extractInteractionDetails(prepared, signals, revocation, lang) {
  if (prepared.sensitiveDataDetected) {
    return [
      tr(lang, "授权方向：无法继续解析，敏感内容已隐藏", "Permission direction: parsing stopped; sensitive content withheld"),
      tr(lang, "目标对象：未核验", "Target: unverified"),
      tr(lang, "额度与有效期：未核验", "Allowance and expiry: unverified")
    ];
  }

  const text = prepared.scanText;
  const ids = new Set(signals.map((signal) => signal.id));
  const method = firstMatch(text, [
    /setapprovalforall/i,
    /permit2?/i,
    /safeTransferFrom/i,
    /transferFrom/i,
    /\bapprove\b/i,
    /\btransfer\b/i,
    /sign[- ]?in\s+with\s+ethereum|\bsiwe\b/i,
    /\b(?:claim|mint|stake|bridge)\b/i
  ]);
  const chain = displayChain(firstCaptured(text, /(?:chain\s*id|chainid|链\s*id)\s*[:=：]?\s*([0-9]{1,10})/i))
    || firstMatch(text, [/x\s*layer/i, /ethereum/i, /arbitrum/i, /base/i, /bsc|bnb\s*chain/i, /solana/i]);
  const labeledTarget = firstCaptured(text, /(?:spender|operator|recipient|verifyingcontract|授权对象|接收地址|目标合约)\s*[:=：]?\s*(0x[a-f0-9]{40})/i);
  const target = labeledTarget || prepared.addresses[0];
  const amount = ids.has("unlimited_approval")
    ? tr(lang, "无限或最大额度", "Unlimited or maximum")
    : firstCaptured(text, /(?:amount|allowance|value|额度|金额)\s*[:=：]?\s*([0-9][0-9.,]*(?:\s*[A-Za-z]{2,10})?)/i);
  const expiry = firstCaptured(text, /(?:deadline|expiry|expiration|expires?|有效期|截止时间)\s*[:=：]?\s*([^,;，；\n]{1,40})/i);
  const direction = revocation
    ? tr(lang, "撤销或归零", "Revoke or zero")
    : ids.has("token_approval") || ids.has("permit") || ids.has("all_nft_approval")
      ? tr(lang, "新增或扩大权限", "Grant or expand permission")
      : tr(lang, "无法确认", "Unknown");

  return [
    tr(lang, `授权方向：${direction}`, `Permission direction: ${direction}`),
    tr(lang, `方法与目标：${method || "未识别"} / ${target || "未提供"}`, `Method and target: ${method || "Not identified"} / ${target || "Not supplied"}`),
    tr(lang, `网络、额度、有效期：${chain || "未提供"} / ${amount || "未提供"} / ${expiry || "未提供"}`, `Network, allowance, expiry: ${chain || "Not supplied"} / ${amount || "Not supplied"} / ${expiry || "Not supplied"}`)
  ];
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match) return match[0];
  }
  return "";
}

function firstCaptured(text, pattern) {
  return String(text).match(pattern)?.[1]?.trim() || "";
}

function preparedContractLike(text) {
  return /0x[a-f0-9]{8,}|calldata|function|method|合约|transaction/i.test(text);
}

function buildWarnings(signals, lang) {
  return take(
    signals.map((signal) => `${tr(lang, signal.zh, signal.en)} ${tr(lang, "证据：", "Evidence: ")}“${signal.evidence}”`),
    3,
    [
      tr(lang, "仅凭当前文字无法确认授权对象或合约是否来自官方。", "The supplied text cannot establish whether the spender or contract is official."),
      tr(lang, "仍需在钱包确认页核对实际方法、对象、额度、金额和资产变化。", "Inspect the actual method, target, allowance, value, and asset changes in the wallet confirmation."),
      tr(lang, "文字检查无法替代交易模拟、链上状态查询或合约审计。", "A text-only check does not replace transaction simulation, on-chain state review, or contract auditing.")
    ]
  );
}

function buildFirstSteps(prepared, signals, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  const steps = [];
  if (ids.has("secret_exposure") || prepared.redactions.length) steps.push(tr(lang, "立即停止提交敏感信息；如果私钥或助记词已经泄露，使用可信设备把剩余资产迁移到新钱包。", "Stop sharing sensitive data. If a private key or seed phrase was exposed, use a trusted device to move remaining assets to a new wallet."));
  steps.push(tr(lang, "逐字确认当前域名来自项目官方渠道，排除相似拼写、搜索广告和群聊私链。", "Confirm the exact domain through the project's official channel; rule out lookalike spelling, search ads, and private group links."));
  if (ids.has("token_approval") || ids.has("permit") || ids.has("unlimited_approval") || ids.has("all_nft_approval")) steps.push(tr(lang, "核对 spender/operator、代币或 NFT 合约、授权额度和有效期；优先使用最小必要额度。", "Verify the spender/operator, token or NFT contract, allowance, and expiry; prefer the minimum necessary permission."));
  else steps.push(tr(lang, "展开钱包详情，核对链、调用方法、目标合约、接收地址和资产变化。", "Expand wallet details and verify the chain, method, target contract, recipient, and asset changes."));
  steps.push(tr(lang, "信息仍不完整时先取消，用与主要资产隔离的小额钱包重新核验。", "If key details remain incomplete, cancel and re-check with a low-value wallet isolated from primary assets."));
  return take(steps, 3);
}

function buildUnknowns(prepared, signals, lang) {
  const text = prepared.lower;
  const unknowns = [];
  if (!/spender|operator|授权对象|接收地址|recipient/i.test(text)) unknowns.push(tr(lang, "无法确认实际 spender、operator 或接收地址。", "The actual spender, operator, or recipient cannot be confirmed."));
  if (!/amount|value|额度|金额|maxuint|unlimited|无限/i.test(text)) unknowns.push(tr(lang, "无法确认授权额度、转账金额或交易 value。", "The allowance amount, transfer amount, or transaction value is unknown."));
  if (!/chainid|chain\s*id|网络|主网|ethereum|x\s*layer|base|arbitrum|solana|bsc/i.test(text)) unknowns.push(tr(lang, "无法确认当前网络或 chainId。", "The network or chainId cannot be confirmed."));
  if (!/function|method|调用方法|approve|transfer|claim|mint|stake|bridge|permit/i.test(text)) unknowns.push(tr(lang, "无法确认最终调用的方法和完整 calldata。", "The final method and complete calldata cannot be confirmed."));
  if (prepared.addresses.length === 0) unknowns.push(tr(lang, "没有可核对的合约地址。", "No contract address was supplied for verification."));
  return take(unknowns, 3, [
    tr(lang, "当前文字不足以确认网站真实性。", "The supplied text cannot verify site authenticity."),
    tr(lang, "无法确认目标合约是否已验证、是否为代理合约以及管理员权限。", "Contract verification, proxy status, and administrator privileges are unknown."),
    tr(lang, "没有交易模拟结果，无法确认最终资产变化和失败路径。", "No transaction simulation is available to confirm final asset changes or failure paths.")
  ]);
}

function buildExplanation(interactionType, signals, insufficient, lang) {
  if (insufficient) return tr(lang, "现有内容不足以识别真实调用。它可能只是说明文字，也可能隐藏在钱包详情中的授权、转账或合约操作。", "The supplied content is insufficient to identify the actual call. It may be descriptive text while the wallet details contain an approval, transfer, or contract operation.");
  if (!signals.length) return tr(lang, `当前内容接近“${interactionType}”，但没有足够字段确认是否携带资产权限。`, `The closest visible interaction type is ${interactionType}. The text lacks enough fields to confirm whether asset permissions are included.`);
  return trimTo(tr(lang, `当前内容接近“${interactionType}”。${signals[0].zh}`, `The closest visible interaction type is ${interactionType}. ${signals[0].en}`), lang === "zh" ? 100 : 180);
}

function buildMainWalletAdvice(signals, insufficient, score, lang) {
  const ids = new Set(signals.map((signal) => signal.id));
  if (ids.has("secret_exposure")) return tr(lang, "不适合继续交互。若主钱包秘密已经暴露，应优先迁移资产并停用旧钱包。", "Do not continue. If a primary-wallet secret was exposed, prioritize asset migration and retire the old wallet.");
  const elevatedPermission = ["unlimited_approval", "all_nft_approval", "blind_signature", "asset_transfer", "permit", "token_approval", "proxy_or_delegate", "bridge", "stake_or_lock"]
    .some((id) => ids.has(id));
  if (insufficient || score >= 4 || elevatedPermission) return tr(lang, "当前不建议直接使用主钱包。先取消并补足域名、链、目标合约、授权对象、额度与有效期核验；确需继续时，使用与主要资产隔离的小额钱包。", "Do not use a primary wallet yet. Cancel and verify the domain, chain, target contract, spender, allowance, and expiry. If interaction remains necessary, use a low-value wallet isolated from primary assets.");
  return tr(lang, "即使风险等级较低，也应先核对域名、合约、授权范围和资产变化；主钱包只承担已经完全看懂的最小权限。", "Even at a lower risk level, verify the domain, contract, permissions, and asset changes. A primary wallet should accept only the minimum permission you fully understand.");
}

function displayChain(value) {
  const chain = String(value || "").trim();
  const names = {
    "1": "Ethereum",
    "10": "Optimism",
    "56": "BNB Smart Chain",
    "137": "Polygon",
    "196": "X Layer",
    "8453": "Base",
    "42161": "Arbitrum One",
    "43114": "Avalanche C-Chain"
  };
  return names[chain] ? `${chain} (${names[chain]})` : chain;
}

function renderCard(card, lang) {
  const colon = lang === "en" ? ":" : "：";
  return [
    lang === "en" ? `[${card.title}]` : `【${card.title}】`,
    "",
    `${tr(lang, "评估类型", "Assessment type")}${colon} ${card.assessmentType}`,
    `${tr(lang, "评估对象", "Risk subject")}${colon} ${card.riskSubject}`,
    `${tr(lang, "交互类型", "Interaction type")}${colon} ${card.interactionType}`,
    `${tr(lang, "风险等级", "Risk level")}${colon} ${card.riskLevel}`,
    `${tr(lang, "证据状态", "Evidence status")}${colon} ${card.evidenceStatus}`,
    `${tr(lang, "判断置信度", "Assessment confidence")}${colon} ${card.confidence}`,
    `${tr(lang, "建议动作", "Recommended decision")}${colon} ${card.recommendedDecision}`,
    "",
    `${tr(lang, "权限与交易字段", "Permission and transaction fields")}${colon}`,
    listText(card.permissionDetails),
    "",
    `${tr(lang, "这次操作可能在做什么", "What this may do")}${colon}`,
    card.explanation,
    "",
    `${tr(lang, "需要注意的地方", "What to watch")}${colon}`,
    listText(card.warnings),
    "",
    `${tr(lang, "如果你是新手，建议先做", "If you are new, do this first")}${colon}`,
    listText(card.firstSteps),
    "",
    `${tr(lang, "主钱包提醒", "Primary-wallet reminder")}${colon} ${card.mainWalletReminder}`,
    "",
    `${tr(lang, "看不出来的地方", "What cannot be determined")}${colon}`,
    listText(card.unknowns),
    "",
    `${tr(lang, "安全底线", "Safety floor")}${colon} ${card.safetyFloor}`,
    "",
    `${tr(lang, "免责声明", "Disclaimer")}${colon} ${card.disclaimer}`
  ].join("\n");
}
