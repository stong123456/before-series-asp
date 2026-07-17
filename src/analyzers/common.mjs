import { createHash, randomUUID } from "node:crypto";

export const ANALYSIS_VERSION = "before-series-1.0.0";
export const MAX_INPUT_CHARS = 20_000;

const SECRET_PATTERNS = [
  {
    id: "seed_phrase_line",
    pattern: /((?:seed\s*phrase|mnemonic|助记词)\s*[:=：-]\s*)[^\r\n]{3,300}/gi,
    replacement: "$1[REDACTED]"
  },
  {
    id: "private_key",
    pattern: /\b(?:0x)?[a-f0-9]{64}\b/gi,
    replacement: "[REDACTED_64_HEX]"
  },
  {
    id: "labeled_secret",
    pattern: /((?:private\s*key|secret\s*key|api\s*key|otp|verification\s*code|私钥|密钥|验证码)\s*[:=：-]\s*)[^\s,;，；]+/gi,
    replacement: "$1[REDACTED]"
  },
  {
    id: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
    replacement: "Bearer [REDACTED]"
  }
];

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
    redacted = redacted.replace(rule.pattern, (...args) => {
      matched = true;
      if (typeof rule.replacement === "function") return rule.replacement(...args);
      return rule.replacement.replace("$1", args[1] || "");
    });
    if (matched) redactions.push(rule.id);
  }

  const lang = normalizeLang(explicitLang, redacted);
  return {
    originalLength: normalized.length,
    text: redacted,
    lower: redacted.normalize("NFKC").toLowerCase(),
    lang,
    redactions: [...new Set(redactions)],
    urls: extractUrls(redacted),
    addresses: extractAddresses(redacted),
    hash: createHash("sha256").update(redacted).digest("hex")
  };
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
      const match = String(text).match(pattern);
      if (match) {
        evidence = evidenceSnippet(text, match.index ?? 0, match[0].length);
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

export function riskFromScore(score, insufficient = false) {
  if (insufficient) return { key: "insufficient", zh: "信息不足", en: "Insufficient information" };
  if (score >= 11) return { key: "high", zh: "高", en: "High" };
  if (score >= 7) return { key: "medium_high", zh: "中高", en: "Medium-high" };
  if (score >= 4) return { key: "medium", zh: "中", en: "Medium" };
  if (score >= 2) return { key: "medium_low", zh: "中低", en: "Medium-low" };
  return { key: "low", zh: "低", en: "Low" };
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

export function baseResult(service, prepared) {
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
      sensitiveDataRedacted: prepared.redactions.length > 0
    },
    scope: {
      method: "static_text_review",
      fetchedExternalLinks: false,
      executedInput: false,
      securityCertification: false
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
