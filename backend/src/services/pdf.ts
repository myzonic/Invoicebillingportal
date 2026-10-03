import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFImage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { Invoice, Client, Brand } from "@prisma/client";
import { env } from "../config/env";

export interface InvoicePdfData {
  invoice: Invoice;
  client: Client;
  brand: Brand | null;
  company: { name: string; email: string; phone: string; address: string; website: string };
}

/** Currency code -> display symbol shown before the amount. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  CAD: "CA$",
};

function money(value: number | string | { toNumber: () => number }, currency: string) {
  const n = Number(typeof value === "object" ? value.toNumber() : value);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${symbol}${number}`;
}

/** Wrap text into lines that fit within maxWidth (word-level breaking). */
function wrapText(text: string, maxWidth: number, f: PDFFont, size: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of String(text).split(/\s+/)) {
    if (!w) continue;
    const test = cur ? `${cur} ${w}` : w;
    if (!cur || f.widthOfTextAtSize(test, size) <= maxWidth) cur = test;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Truncate a single line with an ellipsis so it fits within maxWidth. */
function fitText(text: string, maxWidth: number, f: PDFFont, size: number): string {
  if (f.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

/** Characters the standard Helvetica (WinAnsi) fonts can encode; anything else becomes "?". */
const NON_WINANSI = /[^\u0020-\u007e\u00a0-\u00ff\u0152-\u0153\u0160-\u0161\u0178\u017d-\u017e\u0192\u02c6\u02dc\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039-\u203a\u20ac\u2122]/g;
function san(s: string): string {
  return String(s).replace(NON_WINANSI, "?");
}

// ---- Brand palette (glossy gold / black / white) ----
interface C {
  r: number;
  g: number;
  b: number;
}
const GOLD_MID: C = { r: 0.96, g: 0.77, b: 0.27 };
const GOLD_LIGHT: C = { r: 1.0, g: 0.88, b: 0.54 };
const BLACK: C = { r: 0.09, g: 0.09, b: 0.1 };
const INK: C = { r: 0.15, g: 0.16, b: 0.19 };
const GRAY: C = { r: 0.46, g: 0.49, b: 0.53 };
const LINE: C = { r: 0.88, g: 0.89, b: 0.91 };
const FILL: C = { r: 0.963, g: 0.966, b: 0.97 };
const WHITE: C = { r: 1, g: 1, b: 1 };

const col = (c: C) => rgb(c.r, c.g, c.b);

function hexToC(hex: string): C {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return GOLD_MID;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function lighten(c: C, amount: number): C {
  const mix = (v: number) => Math.min(1, v + (1 - v) * amount);
  return { r: mix(c.r), g: mix(c.g), b: mix(c.b) };
}

// ---- Rich text (item descriptions: HTML -> drawable runs) ----
interface Run {
  t: string;
  b: boolean;
  i: boolean;
  u: boolean;
}
interface Block {
  kind: "para" | "bullet" | "ordered";
  num?: number;
  runs: Run[];
}
interface Fonts {
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRich(html: string): Block[] {
  const blocks: Block[] = [];
  let runs: Run[] = [];
  let b = false;
  let i = false;
  let u = false;
  let listType: "ul" | "ol" | null = null;
  let olCount = 0;
  let kind: Block["kind"] = "para";
  let num: number | undefined;

  const flush = () => {
    if (runs.length) blocks.push({ kind, num, runs });
    runs = [];
    kind = "para";
    num = undefined;
  };

  const markList = () => {
    if (!runs.length && listType) {
      kind = listType === "ol" ? "ordered" : "bullet";
      num = listType === "ol" ? olCount : undefined;
    }
  };

  const emit = (t: string) => {
    if (!t) return;
    const parts = t.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) flush();
      if (!part) return;
      markList();
      runs.push({ t: part, b, i, u });
    });
  };

  const re = /<\/?(b|strong|i|em|u|br|ul|ol|li|p|div)(?:\s[^>]*)?\/?>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    emit(decodeEntities(html.slice(last, m.index)));
    const raw = m[0];
    const close = raw[1] === "/";
    const tag = raw.replace(/[<>\/]/g, "").trim().split(/\s/)[0].toLowerCase();
    if (tag === "b" || tag === "strong") b = !close;
    else if (tag === "i" || tag === "em") i = !close;
    else if (tag === "u") u = !close;
    else if (tag === "br") flush();
    else if (tag === "ul") listType = close ? null : "ul";
    else if (tag === "ol") {
      if (close) listType = null;
      else {
        listType = "ol";
        olCount = 0;
      }
    } else if (tag === "li") {
      if (close) flush();
      else {
        flush();
        if (listType === "ol") olCount++;
      }
    } else if (tag === "p" || tag === "div") flush();
    last = re.lastIndex;
  }
  emit(decodeEntities(html.slice(last)));
  flush();
  return blocks;
}

/** Greedy word wrap into lines of Runs, with character-level breaking for overlong words. */
function wrapRuns(runs: Run[], maxWidth: number, f: Fonts): Run[][] {
  const width = (r: Run) => (r.b && r.i ? f.boldItalic : r.b ? f.bold : r.i ? f.italic : f.font).widthOfTextAtSize(r.t, 9.5);
  const out: Run[][] = [];
  let line: Run[] = [];
  let lineW = 0;

  const pushWord = (w: Run) => {
    const wdt = width(w);
    const sep = line.length ? f.font.widthOfTextAtSize(" ", 9.5) : 0;
    if (line.length && lineW + sep + wdt > maxWidth) {
      out.push(line);
      line = [];
      lineW = 0;
    }
    if (line.length) lineW += sep;
    line.push(w);
    lineW += wdt;
  };

  for (const r of runs) {
    const words = r.t.split(/\s+/);
    for (const w of words) {
      if (!w) continue;
      if (width({ ...r, t: w }) > maxWidth) {
        if (line.length) {
          out.push(line);
          line = [];
          lineW = 0;
        }
        for (const ch of w) {
          const cw = f.font.widthOfTextAtSize(ch, 9.5);
          if (lineW + cw > maxWidth) {
            out.push(line);
            line = [];
            lineW = 0;
          }
          line.push({ t: ch, b: r.b, i: r.i, u: r.u });
          lineW += cw;
        }
      } else {
        pushWord({ ...r, t: w });
      }
    }
  }
  if (line.length) out.push(line);
  return out;
}

interface LoadedImage {
  bytes: Uint8Array;
  ratio: number;
  kind: "png" | "jpg";
}

function loadImage(file: string): LoadedImage | null {
  try {
    if (!fs.existsSync(file)) return null;
    const b = fs.readFileSync(file);
    const lower = file.toLowerCase();
    if (lower.endsWith(".png")) {
      const w = b.readUInt32BE(16);
      const h = b.readUInt32BE(20);
      return { bytes: b, ratio: h > 0 ? w / h : 1, kind: "png" };
    }
    let i = 2;
    let ratio = 1;
    while (i < b.length - 8) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) {
        const h = (b[i + 5] << 8) | b[i + 6];
        const w = (b[i + 7] << 8) | b[i + 8];
        if (h > 0 && w > 0) ratio = w / h;
        break;
      }
      if (m === 0xd8 || m === 0xd9) {
        i += 2;
        continue;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      i += 2 + len;
    }
    return { bytes: b, ratio, kind: "jpg" };
  } catch {
    return null;
  }
}

/** Uploaded brand logo stored under the uploads directory, if one exists. */
function resolveLogo(brand: Brand | null): LoadedImage | null {
  const uploaded = brand?.logoUrl?.startsWith("/uploads/") ? path.resolve(env.upload.dir, path.basename(brand.logoUrl)) : null;
  return uploaded && /\.(png|jpe?g)$/i.test(uploaded) ? loadImage(uploaded) : null;
}

export async function renderInvoicePdf({ invoice, client, brand, company }: InvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  const accentMid = invoice.color ? hexToC(invoice.color) : GOLD_MID;
  const accentLight = lighten(accentMid, 0.45);
  const runFont = (b: boolean, i: boolean) => (b && i ? boldItalic : b ? bold : i ? italic : font);
  const { width, height } = page.getSize();
  const margin = 48;
  const right = width - margin;
  const logoData = resolveLogo(brand);
  const logo: PDFImage | null = logoData
    ? logoData.kind === "png"
      ? await doc.embedPng(logoData.bytes)
      : await doc.embedJpg(logoData.bytes)
    : null;
  const logoRatio = logoData?.ratio ?? 2;

  const text = (s: string, x: number, yy: number, f: PDFFont, size: number, c: C) => page.drawText(san(s), { x, y: yy, size, font: f, color: col(c) });
  const rightText = (s: string, xRight: number, yy: number, f: PDFFont, size: number, c: C) =>
    page.drawText(san(s), { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color: col(c) });

  // ===================== Header band (matches footer: black + gold) =====================
  const bandH = 104;
  page.drawRectangle({ x: 0, y: height - bandH, width, height: bandH, color: col(BLACK) });
  page.drawRectangle({ x: 0, y: height - bandH, width, height: 3, color: col(accentMid) });

  // Logo on a white chip, natural aspect ratio (2:1 landscape)
  const logoH = 52;
  const logoW = Math.round(logoH * logoRatio);
  const chipX = margin;
  const chipY = height - bandH + (bandH - logoH) / 2;
  page.drawRectangle({ x: chipX, y: chipY, width: logoW, height: logoH, color: col(WHITE), borderColor: col(accentMid), borderWidth: 1.2 });
  if (logo) {
    const imgH = logoH - 10;
    const imgW = imgH * logoRatio;
    page.drawImage(logo, {
      x: chipX + (logoW - imgW) / 2,
      y: chipY + (logoH - imgH) / 2,
      width: imgW,
      height: imgH,
    });
  }

  // INVOICE wordmark on the right of the band
  rightText("INVOICE", right, height - bandH + 34, bold, 30, accentLight);
  rightText(`# ${invoice.number}`, right, height - bandH + 14, font, 11, accentMid);

  // Brand identity / editable header text (falls back to company details)
  const brandName = brand?.name || company.name;
  const brandEmail = brand?.email || company.email;
  const brandPhone = brand?.phone || company.phone;
  const headerLines: Array<{ t: string; f: PDFFont; s: number; c: C }> = [];
  if (brandName) headerLines.push({ t: brandName, f: bold, s: 15, c: WHITE });
  (brand?.pdfHeader || "").split("\n").forEach((l) => {
    if (l.trim()) headerLines.push({ t: l.trim(), f: font, s: 9, c: accentLight });
  });
  if (brandEmail) headerLines.push({ t: brandEmail, f: font, s: 9, c: accentLight });
  if (brandPhone) headerLines.push({ t: brandPhone, f: font, s: 9, c: accentLight });
  const headerLeft = chipX + logoW + 18;
  const headerMaxW = Math.max(120, right - 160 - headerLeft);
  let headerY = height - bandH + 64;
  for (const ln of headerLines.slice(0, 5)) {
    page.drawText(san(fitText(ln.t, headerMaxW, ln.f, ln.s)), { x: headerLeft, y: headerY, size: ln.s, font: ln.f, color: col(ln.c) });
    headerY -= ln.s + 5;
  }

  // ===================== BILL TO + INVOICE DETAILS =====================
  const secTop = height - bandH - 42;

  text("BILL TO", margin, secTop, bold, 8, GRAY);
  text(client.name, margin, secTop - 16, bold, 13, INK);
  const clientLines = [client.email, client.phone, client.address].filter(Boolean) as string[];
  clientLines.forEach((l, i) => text(l, margin, secTop - 33 - i * 14, font, 9.5, GRAY));

  const metaTop = secTop;
  rightText("INVOICE DETAILS", right, metaTop, bold, 8, GRAY);
  const meta = [
    ["Issue date", invoice.issueDate.toISOString().slice(0, 10)],
    ["Due date", invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "-"],
    ["Status", invoice.status],
  ];
  meta.forEach(([k, v], i) => {
    const yy = metaTop - 16 - i * 15;
    text(k.toUpperCase(), right - 190, yy + 2, bold, 7.5, GRAY);
    rightText(v, right, yy, font, 10, INK);
  });

  const bodyTop = Math.min(secTop - 33 - (clientLines.length - 1) * 14, metaTop - meta.length * 15) - 22;
  page.drawRectangle({ x: margin, y: bodyTop, width: width - margin * 2, height: 0.75, color: col(LINE) });
  let y = bodyTop - 22;

  // ===================== Items table =====================
  const cols = [margin, right - 330, right - 228, right - 128];
  const colRight = [right - 360, right - 260, right - 160, right];
  const headers = ["Description", "Qty", "Unit Price", "Amount"];
  const rowH = 24;
  const headH = 26;

  page.drawRectangle({ x: margin, y: y - headH, width: width - margin * 2, height: headH, color: col(FILL) });
  page.drawRectangle({ x: margin, y: y - headH, width: width - margin * 2, height: 0.75, color: col(LINE) });
  headers.forEach((h, i) => text(h, cols[i] + 6, y - 17, bold, 8.5, INK));
  y -= headH;

  const items = (invoice.items as Array<{ description: string; quantity: number; unitPrice: number }>) || [];
  const descX = cols[0] + 6;
  const descMaxW = colRight[0] - descX - 8;
  items.forEach((item) => {
    rightText(String(item.quantity), colRight[1], y - 15, font, 9.5, INK);
    rightText(money(item.unitPrice, invoice.currency), colRight[2], y - 15, font, 9.5, INK);
    rightText(money(item.quantity * item.unitPrice, invoice.currency), colRight[3], y - 15, font, 9.5, INK);

    const blocks = parseRich(item.description);
    let linesDrawn = 0;
    for (const block of blocks) {
      const prefix = block.kind === "bullet" ? "• " : block.kind === "ordered" ? `${block.num}. ` : "";
      const prefixW = font.widthOfTextAtSize(prefix, 9.5);
      const wrap = wrapRuns(block.runs, descMaxW - prefixW, { font, bold, italic, boldItalic });
      wrap.forEach((line, li) => {
        if (li === 0 && prefix) text(prefix, descX, y - 15, font, 9.5, INK);
        let x = descX + (li === 0 ? prefixW : 0);
        for (const run of line) {
          const f = runFont(run.b, run.i);
          const rt = san(run.t);
          const wdt = f.widthOfTextAtSize(rt, 9.5);
          page.drawText(rt, { x, y: y - 15, size: 9.5, font: f, color: col(INK) });
          if (run.u) page.drawRectangle({ x, y: y - 16.6, width: wdt, height: 0.7, color: col(INK) });
          x += wdt;
        }
        y -= 13;
        linesDrawn++;
      });
    }
    if (!linesDrawn) y -= 13;
    y -= Math.max(0, rowH - linesDrawn * 13);
    page.drawRectangle({ x: margin, y: y, width: width - margin * 2, height: 0.75, color: col(LINE) });
  });
  y -= 18;

  // ===================== Totals =====================
  const totalW = 220;
  const totalX = right - totalW;
  const totalRows: Array<[string, string, boolean]> = [
    ["Subtotal", money(invoice.subtotal, invoice.currency), false],
    [`Tax (${invoice.taxRate}%)`, money(invoice.taxAmount, invoice.currency), false],
  ];
  if (Number(invoice.discountAmount) > 0) {
    totalRows.push([`Discount`, `- ${money(invoice.discountAmount, invoice.currency)}`, false]);
  }
  totalRows.push(["TOTAL", money(invoice.total, invoice.currency), true]);

  for (const [k, v, isTotal] of totalRows) {
    if (isTotal) {
      y -= 6;
      page.drawRectangle({ x: totalX, y: y + 13, width: totalW, height: 1, color: col(INK) });
      text(k, totalX + 6, y, bold, 12, INK);
      rightText(v, right, y, bold, 12, INK);
      page.drawRectangle({ x: totalX, y: y - 11, width: totalW, height: 1, color: col(INK) });
      y -= 22;
    } else {
      text(k, totalX + 6, y, font, 9.5, GRAY);
      rightText(v, right, y, font, 10, INK);
      y -= 18;
    }
  }

  // ===================== Notes =====================
  if (invoice.notes) {
    y -= 12;
    text("NOTES", margin, y, bold, 8, GRAY);
    y -= 15;
    text(invoice.notes, margin, y, font, 9.5, GRAY);
  }

  // ===================== Footer band =====================
  const footH = 58;
  page.drawRectangle({ x: 0, y: 0, width, height: footH, color: col(BLACK) });
  page.drawRectangle({ x: 0, y: footH, width, height: 3, color: col(accentMid) });
  const footText = brand?.pdfFooter?.trim() || `Thank you for your business. ${brand?.name || company.name}`;
  const footLines = wrapText(footText, right - margin - 180, font, 10);
  const footContact = [brandEmail || company.email, brandPhone || company.phone, brand?.address || company.address]
    .filter(Boolean)
    .join("   |   ");
  text(san(footLines[0] || ""), margin, 38, font, 10, WHITE);
  if (footLines[1]) text(san(footLines[1]), margin, 24, font, 10, WHITE);
  const contactY = footLines[1] ? 10 : 24;
  if (footContact) text(fitText(san(footContact), right - margin - 180, font, 9), margin, contactY, font, 9, accentLight);
  rightText("MYZONIC  FINANCE  &  BILLING", right, 24, bold, 9, accentMid);

  return doc.save();
}
