import { createHash, randomUUID } from "node:crypto";

export const ANALYSIS_VERSION = "before-series-2.0.0";
export const MAX_INPUT_CHARS = 20_000;
export const MAX_REWRITTEN_CHARS = 1_800;

const SENSITIVE_PLACEHOLDER = "[SENSITIVE_CONTENT_REDACTED]";
const SECRET_PATTERNS = [
  {
    id: "seed_phrase",
    pattern: /(?:["']?(?:seed\s*phrase|seedphrase|mnemonic|助记词)["']?\s*[:=：-]\s*["']?)(?:[a-z]{2,20}(?:[\s,;，；]+|\\n)){5,23}[a-z]{2,20}/giu
  },
  {
    id: "labeled_private_key",
    pattern: /(?:["']?(?:private\s*key|privatekey|secret\s*key|secretkey|私钥|密钥)["']?\s*[:=：-]\s*["']?)(?:0x)?[a-f0-9]{32,128}/giu
  },
  {
    id: "private_key_hex",
    pattern: /\b(?:0x)?[a-f0-9]{64}\b/giu
  },
  {
    id: "private_key_wif",
    pattern: /\b[5KL][1-9A-HJ-NP-Za-km-z]{49,51}\b/g
  },
  {
    id: "secret_key_array",
    pattern: /(?:["']?(?:secret\s*key|secretkey|private\s*key|privatekey)["']?\s*[:=：-]\s*)?\[(?:\s*\d{1,3}\s*,){31,127}\s*\d{1,3}\s*\]/giu
  },
  {
    id: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/giu
  },
  {
    id: "labeled_api_secret",
    pattern: /(?:["']?(?:api\s*key|apikey|api\s*secret|client\s*secret|access\s*token)["']?\s*[:=：-]\s*["']?)[A-Za-z0-9._~+/=-]{12,}/giu
  },
  {
    id: "verification_code",
    pattern: /(?:["']?(?:otp|verification\s*code|验证码)["']?\s*[:=：-]\s*["']?)[A-Za-z0-9-]{4,12}/giu
  }
];

const RISK_LEVELS = ["low", "medium_low", "medium", "medium_high", "high", "severe"];
const RISK_LABELS = {
  insufficient: { zh: "信息不足", en: "Insufficient information" },
  low: { zh: "低", en: "Low" },
  medium_low: { zh: "中低", en: "Medium-low" },
  medium: { zh: "中", en: "Medium" },
  medium_high: { zh: "中高", en: "Medium-high" },
  high: { zh: "高", en: "High" },
  severe: { zh: "严重", en: "Severe" }
};

export function prepareInput(rawInput, explicitLang = "auto") {
  if (rawInput === null || rawInput === undefined) {
    throw new InputError("INPUT_REQUIRED", "请粘贴需要检查的内容。", "Paste the content you want checked.");
  }

  const normalized = String(rawInput).normalize("NFC").replace(/\0/g, "").trim();
  if (!normalized) {
    throw new InputError("INPUT_REQUIRED", "请粘贴需要检查的内容。", "Paste the content you want checked.");
  }
  if (normalized.length > MAX_INPUT_CHARS) {
    throw new InputError(
      "INPUT_TOO_LARGE",
      `内容不能超过 ${MAX_INPUT_CHARS} 个字符。`,
      `Content must not exceed ${MAX_INPUT_CHARS} characters.`,
      413
    );
  }

  let redacted = normalized;
  const redactions = [];
  for (const rule of SECRET_PATTERNS) {
    let matched = false;
    rule.pattern.lastIndex = 0;
    redacted = redacted.replace(rule.pattern, () => {
      matched = true;
      return SENSITIVE_PLACEHOLDER;
    });
    if (matched) redactions.push(rule.id);
  }

  const sensitiveDataDetected = redactions.length > 0;
  const safeText = sensitiveDataDetected ? SENSITIVE_PLACEHOLDER : redacted;
  const lang = normalizeLang(explicitLang, sensitiveDataDetected ? normalized.slice(0, 256) : safeText);
  const scanText = normalizeForScan(safeText);

  return {
    originalLength: normalized.length,
    text: safeText,
    scanText,
    lower: scanText.toLowerCase(),
    lang,
    redactions: [...new Set(redactions)],
    sensitiveDataDetected,
    urls: extractUrls(safeText),
    addresses: extractAddresses(safeText),
    hash: sensitiveDataDetected ? null : createHash("sha256").update(safeText).digest("hex")
  };
}

export function normalizeForScan(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

export function normalizeLang(value, text = "") {
  const normalized = String(value || "auto").toLowerCase();
  if (["zh", "zh-cn", "cn", "chinese"].includes(normalized)) return "zh";
  if (["en", "english"].includes(normalized)) return "en";
  const chineseCount = (String(text).match(/[\u3400-\u9fff]/g) || []).length;
  const letterCount = (String(text).match(/[a-z]/gi) || []).length;
  return chineseCount >= Math.max(2, letterCount * 0.12) ? "zh" : "en";
}

export function extractUrls(text) {
  const matches = String(text).match(/https?:\/\/[^\s<>"'）)\]}]+/gi) || [];
  return [...new Set(matches)].slice(0, 10);
}

export function extractDomains(urls) {
  return [...new Set(urls.map((url) => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }).filter(Boolean))];
}

export function extractAddresses(text) {
  return [...new Set(String(text).match(/\b0x[a-fA-F0-9]{40}\b/g) || [])].slice(0, 10);
}

export function collectSignals(text, rules) {
  const signals = [];
  for (const rule of rules) {
    let evidence = "";
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(String(text));
      if (match) {
        evidence = evidenceSnippet(text, match.index, match[0].length);
        break;
      }
    }
    if (evidence) signals.push({ ...rule, evidence });
  }
  return signals.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
}

export function evidenceSnippet(text, index, matchLength, maxLength = 96) {
  const value = String(text).replace(/\s+/g, " ").trim();
  const start = Math.max(0, index - 28);
  const end = Math.min(value.length, index + matchLength + 42);
  const snippet = `${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
  return snippet.slice(0, maxLength).replace(/[`\r\n]/g, " ");
}

export function sensitiveExposureSignal(lang, id = "sensitive_exposure") {
  return {
    id,
    weight: 20,
    severity: "severe",
    zh: "检测到疑似助记词、私钥、API 密钥或验证码，系统已停止回显原始内容。",
    en: "A possible seed phrase, private key, API secret, or verification code was detected, and the original content is no longer echoed.",
    evidence: tr(lang, "敏感内容已隐藏", "Sensitive content withheld")
  };
}

export function publicEvidence(prepared, signals, count = 6) {
  return signals.slice(0, count).map(({ id, weight, severity, evidence }) => ({
    id,
    weight,
    ...(severity ? { severity } : {}),
    evidence: prepared.sensitiveDataDetected ? "[REDACTED]" : evidence
  }));
}

export function riskFromScore(score, options = {}) {
  const config = typeof options === "boolean" ? { insufficient: options } : options;
  if (config.severe) return riskLevel("severe");
  if (config.insufficient) return riskLevel("insufficient");
  let key = score >= 11 ? "high" : score >= 7 ? "medium_high" : score >= 4 ? "medium" : score >= 2 ? "medium_low" : "low";
  if (config.minimum && RISK_LEVELS.indexOf(key) < RISK_LEVELS.indexOf(config.minimum)) key = config.minimum;
  return riskLevel(key);
}

export function buildAssessment(lang, {
  subjectZh,
  subjectEn,
  signals = [],
  insufficient = false,
  severe = false,
  checked = [],
  unverified = [],
  decision
}) {
  const evidenceKey = severe ? "sensitive_data_detected" : insufficient ? "insufficient" : signals.length ? "textual_indicators" : "no_visible_indicators";
  const confidenceKey = severe || signals.length >= 2 ? "high" : signals.length === 1 ? "medium" : "low";
  const decisionKey = decision || (severe ? "stop" : insufficient || signals.some((signal) => signal.weight >= 4) ? "pause_and_verify" : "verify_before_action");
  return {
    subject: tr(lang, subjectZh, subjectEn),
    evidenceStatus: labeledValue(lang, evidenceKey, {
      sensitive_data_detected: ["已检测到敏感信息", "Sensitive data detected"],
      insufficient: ["信息不足", "Insufficient information"],
      textual_indicators: ["存在输入文本迹象，尚未外部核验", "Input-text indicators found; not externally verified"],
      no_visible_indicators: ["未发现明显文本红旗，尚未外部核验", "No obvious text red flag found; not externally verified"]
    }),
    confidence: labeledValue(lang, confidenceKey, {
      low: ["低", "Low"],
      medium: ["中", "Medium"],
      high: ["高", "High"]
    }),
    recommendedDecision: labeledValue(lang, decisionKey, {
      stop: ["停止当前操作并处理风险", "Stop the current action and address the risk"],
      pause_and_verify: ["暂停操作，完成关键核验", "Pause and complete key verification"],
      verify_before_action: ["完成常规核验后再决定", "Complete standard verification before deciding"],
      revise_before_publish: ["修改并核实后再发布", "Revise and verify before publishing"]
    }),
    checked: unique(checked),
    unverified: unique(unverified)
  };
}

function riskLevel(key) {
  return { key, ...RISK_LABELS[key] };
}

function labeledValue(lang, key, labels) {
  const [zh, en] = labels[key];
  return { key, label: tr(lang, zh, en) };
}

export function tr(lang, zh, en) {
  return lang === "en" ? en : zh;
}

export function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

export function take(items, count, fallback = []) {
  const output = unique(items).slice(0, count);
  for (const value of fallback) {
    if (output.length >= count) break;
    if (!output.includes(value)) output.push(value);
  }
  return output.slice(0, count);
}

export function baseResult(service, prepared, assessment) {
  return {
    ok: true,
    service,
    analysisVersion: ANALYSIS_VERSION,
    requestId: randomUUID(),
    requestHash: prepared.hash,
    language: prepared.lang,
    input: {
      characters: prepared.originalLength,
      urlCount: prepared.urls.length,
      addressCount: prepared.addresses.length,
      sensitiveDataRedacted: prepared.sensitiveDataDetected,
      ...(prepared.sensitiveDataDetected ? { sensitiveDataTypes: prepared.redactions } : {})
    },
    assessment,
    scope: {
      method: "static_preliminary_review",
      fetchedExternalLinks: false,
      queriedOnchainData: false,
      simulatedTransactions: false,
      executedInput: false,
      securityCertification: false,
      legalOpinion: false
    }
  };
}

export function listText(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

export function trimTo(text, maxLength) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export class InputError extends Error {
  constructor(code, zhMessage, enMessage, status = 400) {
    super(zhMessage);
    this.name = "InputError";
    this.code = code;
    this.zhMessage = zhMessage;
    this.enMessage = enMessage;
    this.status = status;
  }
}
