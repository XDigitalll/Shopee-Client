export type ExternalOrderParsedInput = {
  originalRawMessage: string;
  cleanDescription: string | null;
  cleanedTitle: string | null;
  productLink: string | null;
  detectedLinks: string[];
  sourceStore: string | null;
  promotionalTextRemoved: boolean;
};

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

const PROMOTIONAL_PATTERNS = [
  /i discovered amazing products on .*/i,
  /come check (it|them) out!?/i,
  /check (it|them) out!?/i,
  /i found .* on (shein|temu|amazon|aliexpress).*/i,
  /shop now/i,
  /download (the )?(shein|temu|amazon|aliexpress) app/i,
  /^#\S+/i,
];

function normalizeLink(rawUrl: string) {
  return rawUrl
    .trim()
    .replace(/[),.;]+$/g, "")
    .replace(/&amp;/g, "&");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function detectExternalSourceStore(input: string | null | undefined): string | null {
  const value = (input || "").toLowerCase();
  if (!value) return null;
  if (value.includes("api-shein.shein.com") || value.includes("shein.")) return "SHEIN";
  if (value.includes("temu.")) return "TEMU";
  if (value.includes("amazon.")) return "AMAZON";
  if (value.includes("aliexpress.")) return "ALI_EXPRESS";
  if (value.includes("alibaba.")) return "ALI_BABA";
  if (value.includes("makro.co.za") || value.includes("makro.")) return "MAKRO";
  if (value.includes("mrp.com") || value.includes("mrprice") || value.includes("mr price")) return "MR_PRICE";
  if (value.includes("buffalo")) return "BUFFALO";
  if (value.includes("zara.")) return "ZARA";
  if (value.includes("pinduoduo.")) return "PINDUODUO";
  if (value.includes("yupoo.")) return "YUPOO";
  if (value.includes("asos.")) return "ASOS";
  if (value.includes("ebay.")) return "EBAY";
  return null;
}

export function extractExternalOrderInput(rawText: string | null | undefined): ExternalOrderParsedInput {
  const originalRawMessage = rawText ?? "";
  const detectedLinks = unique(
    Array.from(originalRawMessage.matchAll(URL_PATTERN)).map((match) => normalizeLink(match[0])),
  );
  const sourceStore = detectExternalSourceStore([originalRawMessage, ...detectedLinks].join("\n"));
  const productLink = detectedLinks[0] ?? null;

  let promotionalTextRemoved = false;
  const lines = originalRawMessage
    .replace(/\r/g, "\n")
    .split("\n")
    .flatMap((line) => line.split(/\s{2,}/))
    .map((line) => line.trim())
    .filter(Boolean);

  const cleanedLines = lines
    .map((line) => {
      let next = line;
      for (const link of detectedLinks) {
        next = next.replace(link, " ");
      }
      next = next.replace(URL_PATTERN, " ").trim();
      return next;
    })
    .filter((line) => {
      if (!line) return false;
      const lower = line.toLowerCase();
      const promotional = PROMOTIONAL_PATTERNS.some((pattern) => pattern.test(line));
      const storeOnly = ["shein", "temu", "amazon", "aliexpress", "alibaba", "pinduoduo", "yupoo"].includes(lower);
      if (promotional || storeOnly) {
        promotionalTextRemoved = true;
        return false;
      }
      return true;
    });

  const compact = unique(cleanedLines)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const cleanDescription = compact || null;
  const cleanedTitle = cleanDescription?.split("\n").find(Boolean)?.trim() || null;

  return {
    originalRawMessage,
    cleanDescription,
    cleanedTitle,
    productLink,
    detectedLinks,
    sourceStore,
    promotionalTextRemoved,
  };
}
