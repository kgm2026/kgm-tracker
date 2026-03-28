export const PDF_COLORS = {
  navy: [26, 26, 46],
  gold: [246, 173, 85],
  white: [255, 255, 255],
  gray: [245, 245, 245],
  red: [220, 53, 69],
  green: [40, 167, 69],
  black: [0, 0, 0],
};

export function addKgmHeader(doc, { title, projectName, projectAddress, dateStr }) {
  const W = doc.internal.pageSize.getWidth();
  const { navy, gold, white } = PDF_COLORS;
  doc.setFillColor(...navy);
  doc.rect(0, 0, W, 22, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 22, W, 2, "F");
  doc.setFillColor(...gold);
  doc.roundedRect(8, 4, 14, 14, 2, 2, "F");
  doc.setTextColor(...navy);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("KGM", 15, 13, { align: "center" });
  doc.setTextColor(...white);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("KGM Constructions", 28, 10);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...gold);
  doc.text(title, 28, 17);
  doc.setTextColor(...white);
  doc.setFontSize(8);
  doc.text(dateStr || formatPKDate(), W - 10, 10, { align: "right" });
  doc.setTextColor(180, 180, 180);
  doc.text(projectAddress || "", W - 10, 16, { align: "right" });
}

export function formatPKDate(date = new Date()) {
  return date.toLocaleDateString("en-PK");
}

export function formatDateStrForFilename(dateStr) {
  return String(dateStr || "").replace(/\//g, "-");
}

export function safeFilenamePart(s, { separator = "-" } = {}) {
  const str = String(s ?? "").trim();
  if (!str) return "KGM";
  return str
    .replace(/[\s]+/g, separator)
    .replace(/[^\w\-]+/g, separator)
    .replace(new RegExp(`${separator}+`, "g"), separator)
    .replace(new RegExp(`^${separator}|${separator}$`, "g"), "");
}

export function addKgmFooter(doc, {
  leftText,
  pageBarHeight = 8,
  leftY,
  rightY,
  barColor = PDF_COLORS.navy,
  textColor = [150, 150, 150],
  fontSize = 7,
} = {}) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pc = doc.internal.getNumberOfPages();

  const resolvedLeftY = leftY ?? (H - (pageBarHeight === 6 ? 2 : 3));
  const resolvedRightY = rightY ?? resolvedLeftY;

  for (let i = 1; i <= pc; i++) {
    doc.setPage(i);
    doc.setFillColor(...barColor);
    doc.rect(0, H - pageBarHeight, W, pageBarHeight, "F");
    doc.setTextColor(...textColor);
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "normal");
    doc.text(leftText, 10, resolvedLeftY);
    doc.text(`Page ${i} of ${pc}`, W - 10, resolvedRightY, { align: "right" });
  }
}

/**
 * Sanitizes text for PDF output to prevent XSS and ensure safe rendering.
 * Removes HTML tags, control characters, and limits length.
 * @param {string} text - Input text to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 500)
 * @returns {string} Sanitized text safe for PDF
 */
export function sanitizeForPdf(text, maxLength = 500) {
  if (!text) return "";
  let sanitized = String(text)
    // Remove HTML tags
    .replace(/<[^>]*>/g, "")
    // Remove control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + "...";
  }

  return sanitized;
}

