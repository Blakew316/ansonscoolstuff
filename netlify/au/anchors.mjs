/* Prebuilt label coordinates and page backgrounds for each template form
   (AppUpload's lib/anchors.js), bundled with the functions instead of read
   from disk. A form's page backgrounds (the heavy part) are loaded only when
   that form is filled: call preloadForm(form) first — fillForm itself is
   unchanged and reads them synchronously. */
import citizensAnchors from "./data/anchors-citizens.mjs";
import merrickAnchors from "./data/anchors-merrick.mjs";
import coversheetAnchors from "./data/anchors-coversheet.mjs";
import purchase_orderAnchors from "./data/anchors-purchase_order.mjs";
import clover_addendumAnchors from "./data/anchors-clover_addendum.mjs";
import bank_changeAnchors from "./data/anchors-bank_change.mjs";
import fd_northAnchors from "./data/anchors-fd_north.mjs";
import pbtAnchors from "./data/anchors-pbt.mjs";
import crfAnchors from "./data/anchors-crf.mjs";
import hemp_cbdAnchors from "./data/anchors-hemp_cbd.mjs";
import cbd_amendmentAnchors from "./data/anchors-cbd_amendment.mjs";
import gift_cardAnchors from "./data/anchors-gift_card.mjs";
import cash_advanceAnchors from "./data/anchors-cash_advance.mjs";
import factor4Anchors from "./data/anchors-factor4.mjs";
import greenlightAnchors from "./data/anchors-greenlight.mjs";
import pathwardAnchors from "./data/anchors-pathward.mjs";
import pathward_guideAnchors from "./data/anchors-pathward_guide.mjs";

export const TEMPLATES = {
  citizens: { file: "citizens.pdf", pages: 3, label: "Citizens Bank — Merchant Processing Application" },
  merrick: { file: "merrick.pdf", pages: 2, label: "Merrick Bank — Merchant Application" },
  coversheet: { file: "coversheet.pdf", pages: 1, label: "Wholesale Payments — Required Set Up Form" },
  purchase_order: { file: "purchase_order.pdf", pages: 1, label: "Wholesale Payments — Purchase Order" },
  clover_addendum: { file: "clover_addendum.pdf", pages: 1, label: "Clover Equipment & Services Addendum" },
  bank_change: { file: "bank_change.pdf", pages: 1, label: "Bank Account Change Request" },
  fd_north: { file: "fd_north.pdf", pages: 3, label: "FD North — Merchant Processing Application (Synovus)" },
  pbt: { file: "pbt.pdf", pages: 6, label: "PB&T Bank — Merchant Processing Application (Pueblo Bank and Trust)" },
  crf: { file: "crf.pdf", pages: 1, label: "Change Request Form" },
  hemp_cbd: { file: "hemp_cbd.pdf", pages: 3, label: "Hemp and CBD Related Business Disclosure Form" },
  cbd_amendment: { file: "cbd_amendment.pdf", pages: 1, label: "CBD Merchant \u2014 Amendment to Merchant Agreement" },
  gift_card: { file: "gift_card.pdf", pages: 6, label: "Clover Gift Card Setup Forms" },
  cash_advance: { file: "cash_advance.pdf", pages: 1, label: "Cash Advance Application" },
  factor4: { file: "factor4.pdf", pages: 2, label: "Factor4 \u2014 Merchant Set-Up Form (Gift & Loyalty)" },
  greenlight: { file: "greenlight.pdf", pages: 11, label: "Greenlight Payments \u2014 CBD Merchant Processing Application" },
  pathward: { file: "pathward.pdf", pages: 2, label: "Pathward \u2014 Merchant Application and Agreement" },
  // (page 2 of the 44-page Program Guide, its Confirmation Page: the only page used)
  pathward_guide: { file: "pathward_guide.pdf", pages: 1, label: "Pathward \u2014 Program Guide Confirmation Page" },
};

const ANCHORS = { citizens: citizensAnchors, merrick: merrickAnchors, coversheet: coversheetAnchors, purchase_order: purchase_orderAnchors, clover_addendum: clover_addendumAnchors, bank_change: bank_changeAnchors, fd_north: fd_northAnchors, pbt: pbtAnchors, crf: crfAnchors, hemp_cbd: hemp_cbdAnchors, cbd_amendment: cbd_amendmentAnchors, gift_card: gift_cardAnchors, cash_advance: cash_advanceAnchors, factor4: factor4Anchors, greenlight: greenlightAnchors, pathward: pathwardAnchors, pathward_guide: pathward_guideAnchors };
const PAGE_LOADERS = {
  citizens: () => Promise.all([import("./data/page-citizens-1.mjs"), import("./data/page-citizens-2.mjs"), import("./data/page-citizens-3.mjs")]),
  merrick: () => Promise.all([import("./data/page-merrick-1.mjs"), import("./data/page-merrick-2.mjs")]),
  coversheet: () => Promise.all([import("./data/page-coversheet-1.mjs")]),
  purchase_order: () => Promise.all([import("./data/page-purchase_order-1.mjs")]),
  clover_addendum: () => Promise.all([import("./data/page-clover_addendum-1.mjs")]),
  bank_change: () => Promise.all([import("./data/page-bank_change-1.mjs")]),
  fd_north: () => Promise.all([import("./data/page-fd_north-1.mjs"), import("./data/page-fd_north-2.mjs"), import("./data/page-fd_north-3.mjs")]),
  pbt: () => Promise.all([import("./data/page-pbt-1.mjs"), import("./data/page-pbt-2.mjs"), import("./data/page-pbt-3.mjs"), import("./data/page-pbt-4.mjs"), import("./data/page-pbt-5.mjs"), import("./data/page-pbt-6.mjs")]),
  crf: () => Promise.all([import("./data/page-crf-1.mjs")]),
  hemp_cbd: () => Promise.all([import("./data/page-hemp_cbd-1.mjs"), import("./data/page-hemp_cbd-2.mjs"), import("./data/page-hemp_cbd-3.mjs")]),
  cbd_amendment: () => Promise.all([import("./data/page-cbd_amendment-1.mjs")]),
  gift_card: () => Promise.all([import("./data/page-gift_card-1.mjs"), import("./data/page-gift_card-2.mjs"), import("./data/page-gift_card-3.mjs"), import("./data/page-gift_card-4.mjs"), import("./data/page-gift_card-5.mjs"), import("./data/page-gift_card-6.mjs")]),
  cash_advance: () => Promise.all([import("./data/page-cash_advance-1.mjs")]),
  factor4: () => Promise.all([import("./data/page-factor4-1.mjs"), import("./data/page-factor4-2.mjs")]),
  greenlight: () => Promise.all([import("./data/page-greenlight-1.mjs"), import("./data/page-greenlight-2.mjs"), import("./data/page-greenlight-3.mjs"), import("./data/page-greenlight-4.mjs"), import("./data/page-greenlight-5.mjs"), import("./data/page-greenlight-6.mjs"), import("./data/page-greenlight-7.mjs"), import("./data/page-greenlight-8.mjs"), import("./data/page-greenlight-9.mjs"), import("./data/page-greenlight-10.mjs"), import("./data/page-greenlight-11.mjs")]),
  pathward: () => Promise.all([import("./data/page-pathward-1.mjs"), import("./data/page-pathward-2.mjs")]),
  pathward_guide: () => Promise.all([import("./data/page-pathward_guide-1.mjs")]),
};
const pageCache = new Map(); // form -> [base64 per page]

/** Load a form's page backgrounds (once per warm instance). */
export async function preloadForm(form) {
  if (pageCache.has(form)) return;
  const load = PAGE_LOADERS[form];
  if (!load) throw new Error(`Unknown template: ${form}`);
  pageCache.set(form, (await load()).map((m) => m.default));
}

export function renderedPageBytes(form, page) {
  const pages = pageCache.get(form);
  const b64 = pages && pages[page - 1];
  if (!b64) throw new Error(`Missing page background for "${form}" page ${page} (preloadForm first).`);
  return Buffer.from(b64, "base64");
}

/** Prebuilt anchor data (see AppUpload's scripts/build-templates.mjs). */
export function loadAnchors(form) {
  const data = ANCHORS[form];
  if (!data) throw new Error(`Missing anchor data for "${form}".`);
  return data;
}

const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Find a label on a page.
 * @returns {{x,y,w,h,x2}|null}
 */
export function findLabel(anchors, q) {
  const page = anchors.pages[(q.page || 1) - 1];
  if (!page) return null;
  const needle = norm(q.text);
  const matches = page.items.filter((it) => {
    const s = norm(it.str);
    const hit = q.exact ? s === needle : s.includes(needle);
    if (!hit) return false;
    if (q.region) {
      const r = q.region;
      if (r.xMin != null && it.x < r.xMin) return false;
      if (r.xMax != null && it.x > r.xMax) return false;
      if (r.yMin != null && it.y < r.yMin) return false;
      if (r.yMax != null && it.y > r.yMax) return false;
    }
    return true;
  });
  matches.sort((a, b) => b.y - a.y || a.x - b.x); // reading order: top first, then left
  const m = matches[q.occ || 0];
  if (!m) return null;
  return { x: m.x, y: m.y, w: m.w, h: m.h, x2: m.x + m.w };
}
