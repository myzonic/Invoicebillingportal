import fs from "node:fs";
import path from "node:path";
import { PDFDocument, PDFImage, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { Invoice, Client, Brand } from "@prisma/client";
import { env } from "../config/env";
import { resolveInvoiceDesign, InvoiceDesign } from "./invoiceDesign";
import { effectiveInvoiceStatus, statusLabel } from "./invoiceStatus";
import { normalizeBuilderData, type BuilderData } from "./invoiceBuilder";

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

/** PDF status label, including read-time Overdue calculation. SENT prints as ACTIVE. */
function invoiceStatusText(invoice: Invoice): string {
  const payments = ((invoice as Invoice & { payments?: unknown[] }).payments || []) as Parameters<typeof effectiveInvoiceStatus>[1];
  return statusLabel(effectiveInvoiceStatus(invoice, payments));
}

const A4_SIZE: [number, number] = [595.28, 841.89];
const LETTER_SIZE: [number, number] = [612, 792];

/** Item amount after its own line discount. */
function itemNet(item: { quantity: number; unitPrice: number; discount?: number }): number {
  return Math.max(0, Number(item.quantity) * Number(item.unitPrice) - Number(item.discount || 0));
}

/** Insert Shipping before the final TOTAL row when present. */
function withShipping(rows: Array<[string, string, boolean]>, builder: BuilderData, currency: string) {
  if (builder.shipping > 0) rows.splice(rows.length - 1, 0, ["Shipping", money(builder.shipping, currency), false]);
  return rows;
}

function pageSize(invoice: Invoice): [number, number] {
  return normalizeBuilderData((invoice as Invoice & { builderData?: unknown }).builderData).paperSize === "LETTER"
    ? LETTER_SIZE
    : A4_SIZE;
}

/** Typography choice from the builder; defaults to the original Helvetica. */
function fontSet(invoice: Invoice) {
  const kind = normalizeBuilderData((invoice as Invoice & { builderData?: unknown }).builderData).typography;
  if (kind === "serif") {
    return {
      regular: StandardFonts.TimesRoman,
      bold: StandardFonts.TimesRomanBold,
      italic: StandardFonts.TimesRomanItalic,
      boldItalic: StandardFonts.TimesRomanBoldItalic,
    };
  }
  if (kind === "mono") {
    return {
      regular: StandardFonts.Courier,
      bold: StandardFonts.CourierBold,
      italic: StandardFonts.CourierOblique,
      boldItalic: StandardFonts.CourierBoldOblique,
    };
  }
  return {
    regular: StandardFonts.Helvetica,
    bold: StandardFonts.HelveticaBold,
    italic: StandardFonts.HelveticaOblique,
    boldItalic: StandardFonts.HelveticaBoldOblique,
  };
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
function flat(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function fitText(text: string, maxWidth: number, f: PDFFont, size: number): string {
  const source = flat(text);
  if (f.widthOfTextAtSize(source, size) <= maxWidth) return source;
  let t = source;
  while (t.length > 1 && f.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

/** Characters the standard Helvetica (WinAnsi) fonts can encode; anything else becomes "?". */
const NON_WINANSI = /[^\u0020-\u007e\u00a0-\u00ff\u0152-\u0153\u0160-\u0161\u0178\u017d-\u017e\u0192\u02c6\u02dc\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039-\u203a\u20ac\u2122]/g;
function san(s: string): string {
  // Newlines/tabs become spaces rather than "?" so multi-line addresses and
  // notes stay readable (and never break WinAnsi width measurement).
  return flat(s).replace(NON_WINANSI, "?");
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

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const design = resolveInvoiceDesign(data.invoice, data.brand);
  if (design && design.layout !== "legacy") return renderDesignedInvoicePdf({ ...data, design });

  const { invoice, client, brand, company } = data;
  const doc = await PDFDocument.create();
  // Page size and typography come from additive builder data; A4/Helvetica by default.
  const page = doc.addPage(pageSize(invoice));
  const fonts = fontSet(invoice);
  const font = await doc.embedFont(fonts.regular);
  const bold = await doc.embedFont(fonts.bold);
  const italic = await doc.embedFont(fonts.italic);
  const boldItalic = await doc.embedFont(fonts.boldItalic);
  const builder = normalizeBuilderData((invoice as Invoice & { builderData?: unknown }).builderData);
  const accentSource = brand?.color || invoice.color;
  const accentMid = accentSource ? hexToC(accentSource) : GOLD_MID;
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
  const brandName = brand?.businessName || brand?.name || company.name;
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
    ["Status", invoiceStatusText(invoice)],
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
    rightText(money(itemNet(item), invoice.currency), colRight[3], y - 15, font, 9.5, INK);

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
  withShipping(totalRows, builder, invoice.currency);

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

  // Customer-facing builder fields. Internal notes are NEVER printed.
  const extraSections: Array<[string, string]> = [
    ["PAYMENT TERMS", builder.paymentTerms],
    ["PAYMENT INSTRUCTIONS", builder.paymentInstructions],
    ["TERMS & CONDITIONS", builder.terms],
  ];
  for (const [label, value] of extraSections) {
    if (!value.trim()) continue;
    const lines = wrapText(value, width - margin * 2 - 10, font, 9);
    y -= 12;
    text(label, margin, y, bold, 8, GRAY);
    y -= 14;
    lines.slice(0, 4).forEach((l, i) => text(l, margin, y - i * 12, font, 9, GRAY));
    y -= 12 * Math.min(4, lines.length);
  }

  // ===================== Footer band =====================
  const footH = 58;
  page.drawRectangle({ x: 0, y: 0, width, height: footH, color: col(BLACK) });
  page.drawRectangle({ x: 0, y: footH, width, height: 3, color: col(accentMid) });
  const footText = brand?.pdfFooter?.trim() || `Thank you for your business. ${brandName}`;
  const footLines = wrapText(footText, right - margin - 180, font, 10);
  const footContact = [
    brand?.website || company.website,
    brandEmail || company.email,
    brandPhone || company.phone,
    brand?.address || company.address,
  ]
    .filter(Boolean)
    .join("   |   ");
  text(san(footLines[0] || ""), margin, 38, font, 10, WHITE);
  if (footLines[1]) text(san(footLines[1]), margin, 24, font, 10, WHITE);
  const contactY = footLines[1] ? 10 : 24;
  if (footContact) text(fitText(san(footContact), right - margin - 180, font, 9), margin, contactY, font, 9, accentLight);
  rightText(brandName.toUpperCase(), right, 24, bold, 9, accentMid);

  return doc.save();
}

interface DesignedPdfInput extends InvoicePdfData {
  design: InvoiceDesign;
}

/**
 * Premium renderer used when a brand (or invoice) has a saved design config.
 * The legacy black/gold renderer remains the fallback for brands that have
 * never been configured, preserving the historical look of old invoices.
 */
async function renderDesignedInvoicePdf({ invoice, client, brand, company, design }: DesignedPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage(pageSize(invoice));
  const fonts = fontSet(invoice);
  const font = await doc.embedFont(fonts.regular);
  const bold = await doc.embedFont(fonts.bold);
  const italic = await doc.embedFont(fonts.italic);
  const boldItalic = await doc.embedFont(fonts.boldItalic);

  const mix = (a: C, b: C, t: number): C => ({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
  const WHITE: C = { r: 1, g: 1, b: 1 };
  const primary = hexToC(design.colors.primary);
  const secondary = hexToC(design.colors.secondary);
  const accent = hexToC(design.colors.accent);
  const supporting = hexToC(design.colors.supporting);
  const ink: C = { r: 0.1, g: 0.12, b: 0.16 };
  const muted: C = { r: 0.38, g: 0.42, b: 0.48 };
  const line: C = mix(primary, WHITE, 0.86);
  const softFill: C = mix(supporting, WHITE, 0.55);
  const builder = normalizeBuilderData((invoice as Invoice & { builderData?: unknown }).builderData);
  const headerDark = design.layout === "corporate" || design.layout === "premium";
  const compact = design.layout === "compact";
  const minimal = design.layout === "minimal";
  const runFont = (b: boolean, i: boolean) => (b && i ? boldItalic : b ? bold : i ? italic : font);

  const { width, height } = page.getSize();
  const margin = compact ? 36 : 48;
  const right = width - margin;
  const logoData = resolveLogo(brand);
  const logo: PDFImage | null = logoData
    ? logoData.kind === "png"
      ? await doc.embedPng(logoData.bytes)
      : await doc.embedJpg(logoData.bytes)
    : null;
  const logoRatio = logoData?.ratio ?? 2;
  const logoMaxH = minimal ? 44 : compact ? 52 : 60;
  const logoMaxW = design.layout === "creative" ? 190 : 170;
  let logoH = logoMaxH;
  let logoW = logoH * logoRatio;
  if (logoW > logoMaxW) {
    logoW = logoMaxW;
    logoH = logoW / logoRatio;
  }

  const text = (s: string, x: number, yy: number, f: PDFFont, size: number, c: C) =>
    page.drawText(san(s), { x, y: yy, size, font: f, color: col(c) });
  const rightText = (s: string, xRight: number, yy: number, f: PDFFont, size: number, c: C) =>
    page.drawText(san(s), { x: xRight - f.widthOfTextAtSize(san(s), size), y: yy, size, font: f, color: col(c) });

  const brandName = brand?.businessName || brand?.name || company.name;
  const brandEmail = brand?.email || company.email;
  const brandPhone = brand?.phone || company.phone;
  const brandAddress = brand?.address || company.address;
  const brandWebsite = brand?.website || company.website;

  // ===================== Header =====================
  const bandH = compact ? 88 : minimal ? 84 : 112;
  const topY = height - bandH;
  if (headerDark) {
    page.drawRectangle({ x: 0, y: topY, width, height: bandH, color: col(primary) });
    page.drawRectangle({ x: 0, y: topY, width, height: 3, color: col(design.layout === "corporate" ? secondary : accent) });
    page.drawRectangle({ x: 0, y: topY + bandH - 3, width, height: 3, color: col(design.layout === "corporate" ? accent : secondary) });
  } else if (design.layout === "creative") {
    page.drawRectangle({ x: 0, y: topY, width: Math.min(250, width * 0.42), height: bandH, color: col(mix(accent, supporting, 0.35)) });
    page.drawRectangle({ x: 0, y: topY + bandH - 4, width, height: 4, color: col(accent) });
  } else if (!minimal) {
    const ruleH = design.layout === "elegant" ? 2 : 4;
    page.drawRectangle({ x: 0, y: topY + bandH - ruleH, width, height: ruleH, color: col(design.layout === "elegant" ? accent : primary) });
    page.drawRectangle({ x: 0, y: topY, width, height: 1, color: col(line) });
  } else {
    page.drawRectangle({ x: margin, y: topY + 8, width: right - margin, height: 1, color: col(line) });
  }

  const logoX = margin;
  const logoY = topY + (bandH - logoH) / 2;
  if (headerDark || design.layout === "creative") {
    page.drawRectangle({
      x: logoX,
      y: logoY,
      width: logoW,
      height: logoH,
      color: col(WHITE),
      borderColor: col(headerDark ? secondary : accent),
      borderWidth: 1,
    });
  } else {
    page.drawRectangle({ x: logoX, y: logoY, width: logoW, height: logoH, color: col(softFill), borderColor: col(line), borderWidth: 0.7 });
  }
  if (logo) {
    const imgH = logoH - 10;
    const imgW = imgH * logoRatio;
    page.drawImage(logo, { x: logoX + (logoW - imgW) / 2, y: logoY + (logoH - imgH) / 2, width: imgW, height: imgH });
  }

  const headerLeft = logoX + logoW + 18;
  const headerMaxW = Math.max(130, right - 170 - headerLeft);
  const titleColor = headerDark ? WHITE : primary;
  const detailColor = headerDark ? mix(WHITE, primary, 0.72) : muted;
  let headerY = topY + bandH - (compact ? 42 : 54);
  text(fitText(brandName, headerMaxW, bold, compact ? 13 : 15), headerLeft, headerY, bold, compact ? 13 : 15, titleColor);
  headerY -= compact ? 16 : 19;
  const headerDetails = [
    ...String(brandAddress || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    [brandEmail, brandPhone].filter(Boolean).join("  |  "),
  ]
    .filter(Boolean)
    .slice(0, 3);
  headerDetails.slice(0, 3).forEach((lineText) => {
    text(fitText(lineText, headerMaxW, font, 8.5), headerLeft, headerY, font, 8.5, detailColor);
    headerY -= 12;
  });

  rightText("INVOICE", right, topY + bandH - (compact ? 40 : 52), bold, compact ? 24 : 30, headerDark ? mix(accent, WHITE, 0.35) : secondary);
  rightText(`# ${invoice.number}`, right, topY + bandH - (compact ? 58 : 72), font, 10.5, headerDark ? mix(WHITE, primary, 0.7) : muted);

  // ===================== Bill to / details =====================
  const secTop = topY - 42;
  text("BILL TO", margin, secTop, bold, 8, secondary);
  text(fitText(client.name, 230, bold, 13), margin, secTop - 17, bold, 13, ink);
  const clientLines = [
    client.email,
    client.phone,
    ...String(client.address || "")
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  ].filter(Boolean) as string[];
  clientLines.slice(0, 4).forEach((l, i) => text(fitText(l, 250, font, 9.5), margin, secTop - 34 - i * 14, font, 9.5, muted));

  const metaTop = secTop;
  rightText("INVOICE DETAILS", right, metaTop, bold, 8, secondary);
  const meta: Array<[string, string]> = [
    ["Issue date", invoice.issueDate.toISOString().slice(0, 10)],
    ["Due date", invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "-"],
    ["Status", invoiceStatusText(invoice)],
    ["Currency", invoice.currency],
  ];
  meta.forEach(([k, v], i) => {
    const yy = metaTop - 16 - i * 15;
    text(k.toUpperCase(), right - 190, yy + 2, bold, 7.5, muted);
    rightText(v, right, yy, font, 10, ink);
  });

  const bodyTop = Math.min(secTop - 34 - (clientLines.length - 1) * 14, metaTop - meta.length * 15) - 20;
  page.drawRectangle({ x: margin, y: bodyTop, width: right - margin, height: 0.8, color: col(line) });
  let y = bodyTop - 22;

  // ===================== Items table =====================
  const cols = [margin, right - 330, right - 228, right - 128];
  const colRight = [right - 360, right - 260, right - 160, right];
  const headers = ["Description", "Qty", "Unit Price", "Amount"];
  const rowH = compact ? 22 : 24;
  const headH = compact ? 24 : 26;
  const tableHeaderFill = minimal ? WHITE : mix(supporting, primary, 0.08);

  page.drawRectangle({ x: margin, y: y - headH, width: right - margin, height: headH, color: col(tableHeaderFill) });
  page.drawRectangle({ x: margin, y: y - headH, width: right - margin, height: 0.8, color: col(line) });
  headers.forEach((h, i) => text(h, cols[i] + 6, y - 17, bold, 8.5, primary));
  y -= headH;

  /** Starts a fresh page when the current one runs out of room. */
  const ensureSpace = (needed: number, repeatHeader = true) => {
    if (y - needed >= 92) return;
    page = doc.addPage(pageSize(invoice));
    y = height - 60;
    if (!repeatHeader) return;
    page.drawRectangle({ x: margin, y: y - headH, width: right - margin, height: headH, color: col(tableHeaderFill) });
    page.drawRectangle({ x: margin, y: y - headH, width: right - margin, height: 0.8, color: col(line) });
    headers.forEach((h, i) => text(h, cols[i] + 6, y - 17, bold, 8.5, primary));
    y -= headH;
  };

  const items = (invoice.items as Array<{ description: string; quantity: number; unitPrice: number }>) || [];
  const descX = cols[0] + 6;
  const descMaxW = colRight[0] - descX - 8;

  items.forEach((item, itemIndex) => {
    const displayLines: Array<{ prefix: string; runs: Run[] }> = [];
    const blocks = parseRich(item.description);
    for (const block of blocks) {
      const prefix = block.kind === "bullet" ? "• " : block.kind === "ordered" ? `${block.num}. ` : "";
      const prefixW = font.widthOfTextAtSize(prefix, 9.5);
      const wrapped = wrapRuns(block.runs, descMaxW - prefixW, { font, bold, italic, boldItalic });
      wrapped.forEach((runs, li) => displayLines.push({ prefix: li === 0 ? prefix : "", runs }));
      if (!wrapped.length) displayLines.push({ prefix, runs: block.runs });
    }
    if (!displayLines.length) displayLines.push({ prefix: "", runs: [{ t: "", b: false, i: false, u: false }] });

    const rowHeight = Math.max(rowH, displayLines.length * 13 + 10);
    ensureSpace(rowHeight);
    if (!minimal && design.layout !== "elegant" && itemIndex % 2 === 1) {
      page.drawRectangle({ x: margin, y: y - rowHeight, width: right - margin, height: rowHeight, color: col(softFill) });
    }

    rightText(String(item.quantity), colRight[1], y - 15, font, 9.5, ink);
    rightText(money(item.unitPrice, invoice.currency), colRight[2], y - 15, font, 9.5, ink);
    rightText(money(itemNet(item), invoice.currency), colRight[3], y - 15, font, 9.5, ink);

    displayLines.forEach((lineItem, li) => {
      const prefixW = lineItem.prefix ? font.widthOfTextAtSize(lineItem.prefix, 9.5) : 0;
      if (lineItem.prefix) text(lineItem.prefix, descX, y - 15 - li * 13, font, 9.5, ink);
      let x = descX + prefixW;
      for (const run of lineItem.runs) {
        const f = runFont(run.b, run.i);
        const rt = san(run.t);
        const wdt = f.widthOfTextAtSize(rt, 9.5);
        page.drawText(rt, { x, y: y - 15 - li * 13, size: 9.5, font: f, color: col(ink) });
        if (run.u) page.drawRectangle({ x, y: y - 16.6 - li * 13, width: wdt, height: 0.7, color: col(ink) });
        x += wdt;
      }
    });

    y -= rowHeight;
    page.drawRectangle({ x: margin, y, width: right - margin, height: 0.7, color: col(line) });
  });

  y -= 18;
  // Keep the totals block together instead of splitting it across pages.
  ensureSpace(150);

  // ===================== Totals =====================
  const totalW = compact ? 200 : 220;
  const totalX = right - totalW;
  const totalRows: Array<[string, string, boolean]> = [
    ["Subtotal", money(invoice.subtotal, invoice.currency), false],
    [`Tax (${invoice.taxRate}%)`, money(invoice.taxAmount, invoice.currency), false],
  ];
  if (Number(invoice.discountAmount) > 0) totalRows.push(["Discount", `- ${money(invoice.discountAmount, invoice.currency)}`, false]);
  totalRows.push(["TOTAL", money(invoice.total, invoice.currency), true]);
  withShipping(totalRows, builder, invoice.currency);

  for (const [k, v, isTotal] of totalRows) {
    if (isTotal) {
      y -= 8;
      const panelH = compact ? 34 : 38;
      const isPremiumPanel = design.layout === "premium";
      const isCorporatePanel = design.layout === "corporate";
      const panelFill = isPremiumPanel ? primary : isCorporatePanel ? mix(supporting, primary, 0.12) : mix(accent, WHITE, 0.86);
      const panelText = isPremiumPanel ? WHITE : primary;
      page.drawRectangle({ x: totalX, y: y - panelH + 16, width: totalW, height: panelH, color: col(panelFill) });
      if (isCorporatePanel) {
        page.drawRectangle({ x: totalX, y: y - panelH + 16, width: totalW, height: panelH, borderColor: col(primary), borderWidth: 0.8 });
      }
      text(k, totalX + 10, y - 8, bold, 12, panelText);
      rightText(v, right - 10, y - 8, bold, 13, panelText);
      y -= panelH - 4;
    } else {
      text(k, totalX + 6, y, font, 9.5, muted);
      rightText(v, right, y, font, 10, ink);
      y -= 18;
    }
  }

  // ===================== Notes =====================
  if (invoice.notes) {
    ensureSpace(90, false);
    y -= 10;
    text("NOTES", margin, y, bold, 8, secondary);
    y -= 15;
    const noteLines = wrapText(invoice.notes, right - margin - 40, font, 9.5);
    noteLines.slice(0, 4).forEach((lineText, i) => text(lineText, margin, y - i * 13, font, 9.5, muted));
  }

  // Customer-facing builder fields. Internal notes are NEVER printed.
  const extraSections: Array<[string, string]> = [
    ["PAYMENT TERMS", builder.paymentTerms],
    ["PAYMENT INSTRUCTIONS", builder.paymentInstructions],
    ["TERMS & CONDITIONS", builder.terms],
  ];
  for (const [label, value] of extraSections) {
    if (!value.trim()) continue;
    ensureSpace(80, false);
    const lines = wrapText(value, width - margin * 2 - 10, font, 9);
    y -= 12;
    text(label, margin, y, bold, 8, secondary);
    y -= 14;
    lines.slice(0, 5).forEach((l, i) => text(l, margin, y - i * 12, font, 9, muted));
    y -= 12 * Math.min(5, lines.length);
  }

  // ===================== Footer =====================
  const footH = compact ? 48 : 56;
  const footTop = footH;
  if (headerDark) {
    page.drawRectangle({ x: 0, y: 0, width, height: footH, color: col(primary) });
    page.drawRectangle({ x: 0, y: footH - 3, width, height: 3, color: col(design.layout === "corporate" ? secondary : accent) });
  } else {
    page.drawRectangle({ x: 0, y: footH - 1, width, height: 1, color: col(line) });
    page.drawRectangle({ x: 0, y: footH - 4, width, height: 3, color: col(accent) });
  }
  const footText = brand?.pdfFooter?.trim() || `Thank you for your business. ${brandName}`;
  const footLines = wrapText(footText, right - margin - 180, font, 9.5);
  const footContact = [brandWebsite, brandEmail, brandPhone, brandAddress].filter(Boolean).join("   |   ");
  const footTextColor = headerDark ? WHITE : ink;
  const footMutedColor = headerDark ? mix(WHITE, primary, 0.72) : muted;
  text(fitText(footLines[0] || "", right - margin - 180, font, 9.5), margin, footTop - 20, font, 9.5, footTextColor);
  if (footLines[1]) text(fitText(footLines[1], right - margin - 180, font, 9.5), margin, footTop - 34, font, 9.5, footTextColor);
  if (footContact) text(fitText(footContact, right - margin - 180, font, 8.5), margin, 12, font, 8.5, footMutedColor);
  rightText(brandName.toUpperCase(), right, 18, bold, 8.5, headerDark ? mix(accent, WHITE, 0.35) : secondary);

  return doc.save();
}
