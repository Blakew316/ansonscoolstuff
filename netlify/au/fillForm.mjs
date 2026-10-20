/* From AppUpload's lib/fillForm.js (appupload main) — unchanged but for import paths; page backgrounds come from anchors.mjs (preloadForm). */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { loadAnchors, findLabel, renderedPageBytes } from "./anchors.mjs";
import { FORM_MAPS } from "./formMaps.mjs";
import { isClover } from "./pricing.mjs";

const INK = rgb(0.05, 0.1, 0.45); // dark blue so filled values read as the typed overlay
const DEFAULT_SIZE = 9;
const MIN_SIZE = 6;
const SLOT_PAD = 2; // minimum clearance between a slotted value and its blank's edges
const BELOW_DY = -11.5; // value sits this far below the label baseline on column-header forms
const MARK_CAP = 0.718; // cap height of Helvetica-Bold "X", as a fraction of its size

/**
 * Fill a template form by compositing the rendered page background with a text
 * overlay. (The source PDFs are encrypted and can't be edited directly, so we
 * draw onto a high-res image of each page instead.)
 * @returns {Promise<Uint8Array>}
 */
export async function fillForm(form, record) {
  const anchors = loadAnchors(form);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const map = FORM_MAPS[form];
  const pages = [];
  for (let i = 0; i < anchors.pages.length; i++) {
    const { width, height } = anchors.pages[i];
    const page = pdf.addPage([width, height]);
    const png = await pdf.embedPng(renderedPageBytes(form, i + 1));
    page.drawImage(png, { x: 0, y: 0, width, height });
    pages.push(page);
  }

  // White-out boxes drawn over the background to hide pre-printed template text we
  // want to relabel (e.g. "TSYS" -> "Merrick" on the coversheet).
  for (const cov of map.cover || []) {
    const page = pages[cov.page - 1];
    if (page) page.drawRectangle({ x: cov.x, y: cov.y, width: cov.w, height: cov.h, color: rgb(1, 1, 1) });
  }

  const measure = (text, size) => font.widthOfTextAtSize(text, size);
  for (const item of computePlacements(form, record, measure)) {
    const page = pages[item.page - 1];
    const f = item.bold ? fontBold : font;
    const opts = { x: item.x, y: item.y, size: item.size, font: f, color: item.color === "black" ? rgb(0, 0, 0) : INK };
    try {
      page.drawText(item.text, opts);
    } catch {
      // The standard PDF font is WinAnsi-only; a stray non-encodable character
      // (emoji, CJK, …) would otherwise throw and fail the whole document. Strip
      // unencodable characters and retry so the rest of the field still renders.
      const clean = item.text.replace(/[^\x20-\x7E -ÿ]/g, "");
      if (clean) { try { page.drawText(clean, opts); } catch { /* skip this field */ } }
    }
  }

  // "Sign Now": stamp Owner #1's signature image at each mapped signature spot.
  // Only a PNG data URL is accepted (the signature pad always emits PNG); any bad
  // or undecodable image is skipped so a stray signature never fails the packet.
  const sigData = record._signature;
  if (sigData && map.sign && map.sign.length && /^data:image\/png;base64,/.test(String(sigData))) {
    try {
      const b64 = String(sigData).replace(/^data:image\/png;base64,/, "");
      const png = await pdf.embedPng(Buffer.from(b64, "base64"));
      for (const s of map.sign) {
        // A spot may be conditional (e.g. only when its optional section is used).
        if (s.on && !s.on(record)) continue;
        const page = pages[s.page - 1];
        if (!page) continue;
        const d = png.scale(1);
        const k = Math.min(s.maxW / d.width, s.maxH / d.height);
        // center: true centers the scaled signature within the spot's maxW box;
        // middle: true also centers it vertically (signature boxes / cells rather than
        // lines, where it otherwise sits on the bottom edge like a baseline).
        const w = d.width * k, h = d.height * k;
        page.drawImage(png, { x: s.center ? s.x + (s.maxW - w) / 2 : s.x, y: s.middle ? s.y + (s.maxH - h) / 2 : s.y, width: w, height: h });
      }
    } catch (e) {
      console.warn("Signature embed failed, skipping:", String(e));
    }
  }

  return pdf.save();
}

/**
 * Compute every overlay placement (page, x, y, text, size) for a record.
 * Shared by fillForm and the verification tooling so they can't drift.
 * @param {(text:string,size:number)=>number} measure  text-width measuring fn
 */
export function computePlacements(form, record, measure) {
  const map = FORM_MAPS[form];
  if (!map) throw new Error(`No field map for form: ${form}`);
  const anchors = loadAnchors(form);
  const out = [];

  // Scanned pages have no text layer to anchor on; specs may omit `text` and
  // position purely by absX/absY (both required in that case).
  const NO_ANCHOR = { x: 0, y: 0, w: 0, h: 0, x2: 0 };
  for (const base of map.text || []) {
    // A spec shared by two templates (e.g. Citizens / FD North) may carry
    // template-specific geometry under by[form].
    let spec = base.by && base.by[form] ? { ...base, ...base.by[form] } : base;
    const value = safe(spec.get(record));
    if (!value) continue;
    const anchor = spec.text == null ? NO_ANCHOR : findLabel(anchors, { page: spec.page, text: spec.text, occ: spec.occ, region: spec.region, exact: spec.exact });
    if (!anchor) continue;

    // alt: a second blank for a value too long for the first one (it would print
    // below alt.minSize there, or be cut) — e.g. a narrow "% Ownership" gap with
    // roomier space under its label.
    if (spec.alt && spec.slot) {
      const w0 = spec.slot[1] - spec.slot[0] - 2 * (spec.pad ?? SLOT_PAD);
      const fit = fitText(value, measure, spec.size ?? DEFAULT_SIZE, w0);
      if (fit.text !== value || fit.size < (spec.alt.minSize ?? MIN_SIZE)) spec = { ...spec, ...spec.alt };
    }
    // slot: [left, right] edges of the value's blank (measured from the page):
    // the value is centered between them and shrinks to keep SLOT_PAD clear of each edge.
    const slotMax = spec.slot ? spec.slot[1] - spec.slot[0] - 2 * (spec.pad ?? SLOT_PAD) : null;
    const maxWidth = slotMax != null ? Math.min(slotMax, spec.maxWidth ?? Infinity) : spec.maxWidth;
    // wrap: { y: [baselines], slots: [[left, right], ...] } — a run of ruled lines
    // (e.g. "Notes"): words fill each line in turn, every line centered on its rule.
    if (spec.wrap && spec.wrap.slots) {
      const pad = spec.pad ?? SLOT_PAD;
      const lines = fillLines(value, measure, spec.wrap.size ?? spec.size ?? DEFAULT_SIZE, spec.wrap.slots.map(([l, r]) => r - l - 2 * pad));
      lines.forEach((ln, k) => {
        const [l, r] = spec.wrap.slots[k];
        out.push({ page: spec.page, x: (l + r) / 2 - measure(ln.text, ln.size) / 2, y: spec.wrap.y[k], text: ln.text, size: ln.size, bold: spec.bold || false, color: spec.color });
      });
      continue;
    }
    // wrap: { y: [top, bottom], size } — a blank tall enough for two lines: a value
    // that would print smaller than wrap.size on one line breaks onto two centered lines.
    if (spec.wrap && spec.slot) {
      const lines = wrapTwo(value, measure, spec.size ?? DEFAULT_SIZE, maxWidth, spec.wrap.size);
      if (lines) {
        lines.forEach((ln, k) => {
          const x = (spec.slot[0] + spec.slot[1]) / 2 - measure(ln.text, ln.size) / 2;
          out.push({ page: spec.page, x, y: spec.wrap.y[k], text: ln.text, size: ln.size, bold: spec.bold || false, color: spec.color });
        });
        continue;
      }
    }
    const { text, size } = fitText(value, measure, spec.size ?? DEFAULT_SIZE, maxWidth, spec.minSize);
    const isBelow = spec.place !== "right" && spec.place !== "leftOf" && spec.place !== "center";
    const y = (spec.absY != null ? spec.absY : anchor.y) + (spec.dy ?? (isBelow ? BELOW_DY : 0));
    let x;
    if (spec.slot) {
      x = (spec.slot[0] + spec.slot[1]) / 2 - measure(text, size) / 2;
    } else if (spec.place === "center") {
      // Center the text horizontally on absX (or the anchor's mid-point) — used to
      // sit a value neatly on a printed line or inside a box.
      const cx = spec.absX != null ? spec.absX : (anchor.x + anchor.x2) / 2;
      x = cx - measure(text, size) / 2 + (spec.dx ?? 0);
    } else if (spec.absX != null) x = spec.absX + (spec.dx ?? 0);
    else if (spec.place === "right") x = anchor.x2 + (spec.dx ?? 4);
    else if (spec.place === "leftOf") x = anchor.x - measure(text, size) - (spec.pad ?? 2) + (spec.dx ?? 0);
    else x = anchor.x + (spec.dx ?? 0);
    out.push({ page: spec.page, x, y, text, size, bold: spec.bold || false, color: spec.color });
  }

  for (const spec of map.check || []) {
    if (!spec.on(record)) continue;
    const anchor = spec.text == null ? NO_ANCHOR : findLabel(anchors, { page: spec.page, text: spec.text, occ: spec.occ, region: spec.region, exact: spec.exact });
    if (!anchor) continue;
    const mark = spec.mark || "X";
    // box: [left, right, bottom, top] — the printed box's inner edges (measured). The
    // mark is sized to leave a clear margin inside it and centered both ways.
    if (spec.box) {
      const [l, r, b, t] = spec.box;
      let size = spec.size ?? 8;
      while (size > 3.5 && (measure(mark, size) > r - l - 1.2 || MARK_CAP * size > t - b - 1.2)) size -= 0.25;
      out.push({ page: spec.page, x: (l + r) / 2 - measure(mark, size) / 2, y: (b + t) / 2 - (MARK_CAP * size) / 2, text: mark, size, bold: true });
      continue;
    }
    const size = spec.size ?? 8; // checkbox marks are small to fit the printed boxes
    // center: true treats absX as the box center and centers the mark on it.
    let x;
    if (spec.center) x = (spec.absX != null ? spec.absX : (anchor.x + anchor.x2) / 2) - measure(mark, size) / 2 + (spec.dx ?? 0);
    else x = (spec.absX != null ? spec.absX : (spec.fromRight ? anchor.x2 : anchor.x)) + (spec.dx ?? 0);
    const y = (spec.absY != null ? spec.absY : anchor.y) + (spec.dy ?? 0);
    out.push({ page: spec.page, x, y, text: mark, size, bold: true });
  }
  return out;
}

/**
 * Which application template to fill: the one chosen (when it is one), else the
 * detected type, else null.
 */
export function resolveForm(record, formOverride) {
  const APPS = ["citizens", "merrick", "fd_north", "pbt", "greenlight", "pathward", "pathward_guide"];
  if (formOverride && APPS.includes(formOverride)) return formOverride;
  return APPS.includes(record.appType) ? record.appType : null;
}

/** True if any equipment line is a Clover device (drives the Clover addendum). */
export function hasCloverEquipment(record) {
  return (record.equipment || []).some((e) => e && isClover(e.model || e.type));
}

/**
 * Prepare a fill-ready record: stamp the date and derive the coversheet boarding
 * fees from the application's fee schedule when not entered directly (and, for a
 * Greenlight application, its platform).
 */
export function prepareRecord(record, opts = {}) {
  const c = record.coversheet || {};
  const f = record.fees || {};
  return {
    ...record,
    _date: opts.date || "",
    _signature: opts.signature || "",
    coversheet: {
      ...c,
      // a Greenlight application boards on Greenlight's own platform
      ...(record.appType === "greenlight" && !c.platform ? { platform: "other", platformOther: c.platformOther || "Greenlight Payments" } : {}),
      etf: c.etf || f.earlyTermination || "",
      annualFee: c.annualFee || f.annual || "",
      monthlyMin: c.monthlyMin || f.monthlyMinimum || "",
      svcFee: c.svcFee || f.monthlyService || "",
    },
  };
}

/** Merge several PDFs (Uint8Array) into one, in order. */
export async function mergePdfs(parts) {
  const out = await PDFDocument.create();
  for (const bytes of parts) {
    if (!bytes) continue;
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
  }
  return out.save();
}

function safe(v) {
  if (v == null) return "";
  // The standard PDF font (Helvetica) is WinAnsi-only and throws on characters it
  // can't encode — even while measuring. Transliterate common smart punctuation and
  // drop anything outside the encodable set so one exotic glyph can't fail the fill.
  return String(v)
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E -ÿ…€]/g, "") // keep ASCII, Latin-1, ellipsis, euro
    .replace(/\s+/g, " ")
    .trim();
}

/** Shrink the font (then truncate) so text fits within maxWidth. `measure(text,size)->width`. */
/**
 * Two-line layout for a value that would otherwise print below `twoSize` on one
 * line. Returns null when one line is as legible (or the value is a single word);
 * otherwise the word break that balances the two lines, both at one shared size.
 */
function wrapTwo(value, measure, size, maxWidth, twoSize) {
  const one = fitText(value, measure, size, maxWidth);
  const cut = one.text !== value;
  if (one.size >= twoSize && !cut) return null;
  const words = value.split(" ");
  if (words.length < 2) return null;
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const w = Math.max(measure(a, twoSize), measure(b, twoSize));
    if (!best || w < best.w) best = { a, b, w };
  }
  let s = twoSize;
  while (s > MIN_SIZE && Math.max(measure(best.a, s), measure(best.b, s)) > maxWidth) s -= 0.5;
  // Wrap only when it prints larger than one line would, or shows text one line cuts;
  // at the minimum size the second line keeps any remaining overflow as "…".
  if (!cut && s <= one.size) return null;
  return [fitText(best.a, measure, s, maxWidth), fitText(best.b, measure, s, maxWidth)].map((l) => ({ text: l.text, size: s }));
}

/**
 * Fill words across ruled lines of the given widths, largest size first: a value
 * wraps onto the next line before it shrinks. At the minimum size anything still
 * left over is cut with "…" on the last line.
 */
function fillLines(value, measure, size, widths) {
  const words = value.split(" ");
  for (let s = size; s >= MIN_SIZE; s -= 0.5) {
    const lines = [];
    let i = 0;
    for (let k = 0; k < widths.length && i < words.length; k++) {
      if (measure(words[i], s) > widths[k]) break;
      let line = words[i++];
      while (i < words.length && measure(line + " " + words[i], s) <= widths[k]) line += " " + words[i++];
      lines.push(line);
    }
    if (i >= words.length) return lines.map((text) => ({ text, size: s }));
  }
  const lines = [];
  let i = 0;
  for (let k = 0; k < widths.length && i < words.length; k++) {
    const last = k === widths.length - 1;
    let line = words[i++];
    while (i < words.length && (last || measure(line + " " + words[i], MIN_SIZE) <= widths[k])) line += " " + words[i++];
    lines.push(fitText(line, measure, MIN_SIZE, widths[k]).text);
  }
  return lines.map((text) => ({ text, size: MIN_SIZE }));
}

function fitText(text, measure, size, maxWidth, minSize = MIN_SIZE) {
  if (!maxWidth) return { text, size };
  let s = size;
  while (s > minSize && measure(text, s) > maxWidth) s -= 0.5;
  if (measure(text, s) <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && measure(t + "…", s) > maxWidth) t = t.slice(0, -1);
  // In a very small box even one letter plus "…" may not fit: never spill out.
  return { text: measure(t + "…", s) <= maxWidth ? t + "…" : t, size: s };
}
