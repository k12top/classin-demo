/** Remove generated provenance markers, never general numbers, times or UUIDs discussed in teaching. */
export function summaryContent(value: string): string {
  return value.replace(
    /[（(\[【]\s*(?:(?:字幕|发言|说话人)\s*(?:IDs?|编号|行号)|(?:caption|speaker)[_\s-]*ids?|evidence\.(?:captionIds|lines))\s*[:：][^（）()\[\]【】]*[）)\]】]/gi,
    (annotation, offset: number, text: string) => {
      const quotes: Record<string, string> = { '"': '"', "'": "'", "“": "”", "‘": "’", "「": "」", "『": "』", "`": "`" };
      const closingQuote = quotes[text[offset - 1]];
      if (closingQuote && closingQuote === text[offset + annotation.length]) return annotation;
      const prefix = text.slice(Math.max(0, offset - 48), offset).split(/[。！？!?\n]/).at(-1) || "";
      // Literal examples about identifiers are lesson content, not provenance.
      return /(?:字段|字符串|标识符|示例|格式|\b(?:field|literal|string|example|format|UUID)\b|\bID\b)/i.test(prefix) ? annotation : "";
    },
  ).replace(/\s+/g, " ").trim();
}
export function summarySpeakerName(value: string): string {
  const name = summaryContent(value);
  return !name || /^(?:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-f\d]{24,64})$/i.test(name) ? "发言人" : name;
}

/** Historical prose can contain a stored speaker UUID. Keep metadata and literal ID discussions intact. */
export function summarySpeakerReferences(value: string, names: Map<string, string>): string {
  return summaryContent(value).replace(/\b[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\b/gi,
    (id, offset: number, text: string) => {
      if (/(?:UUID|\bID|标识符|编号|型号)\s*[:：=]?\s*$/i.test(text.slice(Math.max(0, offset - 20), offset))) return id;
      return names.has(id) ? names.get(id)! : id;
    });
}
