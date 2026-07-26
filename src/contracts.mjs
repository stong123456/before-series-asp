import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

export const MAX_CONTENT_CHARS = 20_000;

export function createContentInputSchema(service) {
  return {
    type: "object",
    required: ["content"],
    properties: {
      content: {
        type: "string",
        minLength: 1,
        maxLength: MAX_CONTENT_CHARS,
        description: service.inputDescription.en
      },
      lang: {
        type: "string",
        enum: ["auto", "zh", "en"],
        default: "auto",
        description: "Output language. Use auto to match the submitted content."
      }
    },
    additionalProperties: false
  };
}

export function createBazaarExtensions(service) {
  const inputSchema = createContentInputSchema(service);
  return declareDiscoveryExtension({
    input: {
      content: service.inputExample,
      lang: "auto"
    },
    inputSchema: {
      properties: inputSchema.properties,
      required: inputSchema.required,
      additionalProperties: inputSchema.additionalProperties
    },
    bodyType: "json",
    output: {
      example: {
        ok: true,
        service: `before-${service.key}`,
        language: "en",
        cardText: "A concise check card based on the submitted content.",
        reportUrl: "https://before.stoneup.xyz/reports/example-report-id"
      },
      schema: {
        properties: {
          ok: { type: "boolean" },
          service: { type: "string" },
          language: { type: "string", enum: ["zh", "en"] },
          cardText: { type: "string" },
          reportUrl: { type: "string", format: "uri" }
        },
        required: ["service", "language", "cardText", "reportUrl"]
      }
    }
  });
}

export function isInvocationOnly(value) {
  const text = String(value || "").normalize("NFKC").trim();
  if (!text) return false;

  const labeledContent = text.match(/(?:检查内容|待检查内容|需要检查的内容|要检查的内容|content|content\s+to\s+check|actual\s+content)\s*[:：]\s*([^\r\n]+)/iu)?.[1]?.trim();
  const placeholder = labeledContent && (
    /^[<\[（(].*[>\]）)]$/u.test(labeledContent)
    || /^(?:请)?粘贴.*(?:内容|这里|此处)$/u.test(labeledContent)
    || /^paste\b.*\b(?:here|content|text|description|draft)\b/i.test(labeledContent)
  );
  if (labeledContent && labeledContent.length >= 8 && !placeholder) return false;

  const invocationIntent = /(?:我想使用\s*Agent|使用\s*Agent\s*\d+\s*提供的服务|I\s+(?:would\s+like|want)\s+to\s+use\s+(?:the\s+)?services?\s+of\s+agent)/iu.test(text);
  const metadataMarkers = [
    /(?:服务名称|service\s+name)\s*[:：]/iu,
    /(?:服务类型|service\s+type)\s*[:：]\s*A2MCP/iu,
    /(?:接口地址|endpoint)\s*[:：]\s*https?:\/\//iu,
    /OKX\s+Agent\s+Payments\s+Protocol/iu
  ].filter((pattern) => pattern.test(text)).length;

  return invocationIntent && metadataMarkers >= 2;
}
