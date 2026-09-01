const OFFICIAL_OKX_REVIEW_ADDRESS = "0xbc59eb75c55e3bf1e63aaee653c2b8e02bfd2033";

export function extractPaymentPayer(req) {
  const encoded = req?.get?.("payment-signature") || req?.get?.("x-payment") || "";
  if (!encoded) return "";

  try {
    const payment = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    const payer = payment?.payload?.authorization?.from
      || payment?.authorization?.from
      || payment?.payer
      || payment?.from;
    return normalizeAddress(payer);
  } catch {
    return "";
  }
}

export function isOfficialOkxReviewPayer(value) {
  return normalizeAddress(value) === OFFICIAL_OKX_REVIEW_ADDRESS;
}

function normalizeAddress(value) {
  const raw = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(raw) ? raw : "";
}
