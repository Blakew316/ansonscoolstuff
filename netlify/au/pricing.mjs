/* From AppUpload's lib/pricing.js (appupload main) — unchanged. */
// Equipment purchase prices from the Wholesale Payments Equipment Pricing Matrix (V5.261).
// Used to auto-fill the Purchase Order. price = upfront purchase price, rental = min monthly rental.
const MATRIX = [
  // Valor — [model, purchase price, min rental, category]
  ["VP100", 350, 25, "Terminals"], ["VP300 PRO", 300, 20, "Pin Pads"], ["VP350", 400, 35, "Terminals / Pin Pads"], ["Valor RCKT", 200, 15, "Mobile Swipers"],
  ["VP550", 425, 35, "Terminals"], ["VP550C", 375, 30, "Terminals"], ["VP550E", 400, 35, "Terminals"], ["VP800", 700, 65, "Terminals"], ["VP800 Multi Hub", 50, 5, "Accessories"],
  ["VL100 PRO", 350, 25, "Terminals"], ["VL110", 425, 35, "Terminals"], ["VL300", 300, 20, "Pin Pads"], ["VL550", 375, 30, "Terminals"], ["VL550 Magic Box", 50, 5, "Accessories"],
  ["Valore VP400 Rckt", 200, 15, "Mobile Swipers"],
  // PAX
  ["S920", 300, 25, "Terminals"], ["A920 PRO", 450, 40, "Terminals"], ["A920 MAX", 475, 45, "Terminals"], ["A77", 300, 25, "Terminals"], ["A80", 325, 25, "Terminals"],
  ["A30", 400, 35, "Pin Pads"], ["A35", 300, 25, "Pin Pads"], ["Q25", 250, 20, "Pin Pads"], ["Aries8", 500, 45, "Terminals / Pin Pads"], ["A800", 600, 55, "Terminals"],
  ["A920 Charging Dock", 125, 10, "Accessories"],
  // Elys
  ["Elys Tablet A3700", 450, 40, "Terminals / Pin Pads"], ["Elys Mini L3700", 750, 70, "Terminals / Pin Pads"], ["Elys Station L1400", 850, 80, "Terminals"],
  ["Elys T3180", 200, 15, "Accessories"], ["Elys Eye T3200", 200, 15, "Accessories"], ["Elys K21", 700, 65, "Accessories"], ["Elys PB20", 200, 15, "Accessories"],
  // Dejavoo
  ["Z8", 300, 25, "Terminals"], ["Z9", 500, 50, "Terminals"], ["Z11", 400, 35, "Terminals"], ["Z6", 275, 20, "Pin Pads"],
  ["QD1", 650, 60, "Terminals"], ["QD2", 500, 45, "Terminals"], ["QD3", 400, 35, "Pin Pads"], ["QD4", 400, 35, "Terminals"], ["QD5", 350, 30, "Pin Pads"],
  // Dejavoo / iPOSPay
  ["P1", 375, 35, "Terminals / Pin Pads"], ["P3", 450, 40, "Terminals"], ["P5", 350, 30, "Terminals / Pin Pads"], ["P8", 450, 40, "Terminals"], ["P8 Dual", 475, 45, "Terminals"],
  ["P12", 275, 25, "Mobile Swipers"], ["P17", 300, 25, "Pin Pads"], ["P18", 600, 55, "Terminals"], ["DejaPay Pro D1", 450, 40, "Terminals"],
  ["FD150", 400, 35, "Terminals"], ["RP10", 300, 25, "Pin Pads"],
  // Swipers
  ["MX C2X Iphone Swiper", 150, 10, "Mobile Swipers"], ["Swipe Simple B350", 150, 10, "Mobile Swipers"], ["MXM Magtek", 150, 10, "USB Swipers"],
  // Basil bundles
  ["Basil View", 950, 55, "Bundles"], ["Basil View Plus", 1350, 65, "Bundles"], ["Basil View Pro", 1700, 125, "Bundles"],
  // Clover
  ["Clover Solo", 1850, 180, "Bundles"], ["Clover Duo", 2150, 210, "Bundles"], ["Clover Mini Bundle", 1050, 95, "Bundles"],
  ["Clover Kiosk Bundle", 3600, 360, "Bundles"], ["Clover Flex Pocket", 550, 50, "Terminals"], ["Clover Flex", 850, 65, "Terminals"],
  ["Clover Mini", 975, 90, "Terminals"], ["Clover Go", 150, 10, "Mobile Swipers"], ["Clover Compact", 275, 25, "Pin Pads"],
  // POS accessories & peripherals
  ["Refurbished iPad 10.5", 400, 0, "Accessories"], ["Samsung Tablet", 300, 30, "Accessories"],
  ["Kitchen Printer BT", 400, 35, "Accessories"], ["Kitchen Printer", 375, 30, "Accessories"], ["Wired Kitchen Printer", 400, 40, "Accessories"],
  ["Hand Scanner BT", 150, 15, "Accessories"], ["Hand Scanner", 100, 10, "Accessories"],
  ["16\" Cash Drawer", 150, 10, "Accessories"], ["RJ11 Cash Drawer", 150, 10, "Accessories"], ["Cash Drawer", 150, 15, "Accessories"],
  ["22\" Kitchen Display Screen", 710, 70, "Accessories"],
  // Clover accessories
  ["Star Kitchen Printer ENG", 550, 50, "Accessories"], ["Thermal Kitchen Printer", 450, 40, "Accessories"],
  ["Zebra DS9308", 250, 20, "Accessories"], ["Zebra DS2208", 300, 25, "Accessories"], ["Weight Scale", 500, 50, "Accessories"],
  ["KDS 14\"", 600, 55, "Accessories"], ["KDS 24\"", 800, 70, "Accessories"], ["Bump Bar (KB9000)", 200, 20, "Accessories"],
  ["KDS Wall Mount", 55, 5, "Accessories"], ["KDS Countertop Stand", 85, 10, "Accessories"],
  ["Epson TM-L90 Label Printer", 675, 65, "Accessories"], ["Brother QL800 Label Printer", 475, 20, "Accessories"],
  ["Clover Mini Swivel", 95, 0, "Accessories"], ["Employee Login Cards", 25, 0, "Accessories"],
  ["Duo/Solo Bundle Starter Kit", 185, 0, "Accessories"], ["Mini Starter Kit", 75, 0, "Accessories"], ["Flex Starter Kit", 65, 0, "Accessories"],
  // Clover care plans (warranties)
  ["Clover Solo 3yr Care Plan", 140, 0, "Warranties"], ["Clover Duo 3yr Care Plan", 230, 0, "Warranties"],
  ["Clover Mini 3yr Care Plan", 100, 0, "Warranties"], ["Clover Flex 3yr Care Plan", 80, 0, "Warranties"],
  // POS systems
  ["ETAB Printer", 700, 70, "POS Systems"], ["Genius POS", 3000, 0, "POS Systems"], ["Union POS", 2850, 0, "POS Systems"], ["Paradise POS", 2000, 0, "POS Systems"],
];

/** Full model list for the equipment dropdown. */
export const MODELS = MATRIX.map(([model, price, rental, category]) => ({ model, price, rental, category }));

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
// brand words to strip so "PAX A920" matches "A920 ..."
const BRANDS = /\b(pax|valor|valorpaytech|dejavoo|clover|elys|paytech)\b/gi;

// Longest model names first so "Clover Flex Pocket" wins over "Clover Flex".
const ENTRIES = MATRIX.map(([model, price, rental]) => ({ model, price, rental, key: norm(model) }))
  .sort((a, b) => b.key.length - a.key.length);

/**
 * Look up the purchase price (and min rental) for an equipment model string.
 * Tolerant of brand prefixes and spacing. Returns null if no confident match.
 */
export function priceFor(modelStr) {
  if (!modelStr) return null;
  const cands = [norm(modelStr), norm(String(modelStr).replace(BRANDS, ""))].filter(Boolean);
  // 1. exact
  for (const e of ENTRIES) if (cands.includes(e.key)) return e;
  // 2. the query contains a full model key — most specific (longest) key wins.
  // Short keys (Z9, P8, A30…) are only trusted when they appear as their own word
  // in the original text; bare containment would false-match custom names like
  // "XYZ-9000" (contains "z9") and put a wrong price on the purchase order.
  const words = new Set(String(modelStr).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let best = null;
  for (const e of ENTRIES) for (const c of cands) {
    if (!c.includes(e.key)) continue;
    if (e.key.length < 5 && !words.has(e.key)) continue;
    if (!best || e.key.length > best.key.length) best = e;
  }
  if (best) return best;
  // 3. a model key starts with the query — the closest (shortest) such model wins,
  // but if several models tie at that shortest length the query is ambiguous
  // (e.g. "A920" -> PRO vs MAX, "VP" -> VP100/VP350/...), so decline rather than
  // guess a price the sales rep didn't intend.
  let bestLen = Infinity, matches = [];
  for (const e of ENTRIES) for (const c of cands) if (e.key.startsWith(c)) {
    if (e.key.length < bestLen) { bestLen = e.key.length; matches = [e]; }
    else if (e.key.length === bestLen && !matches.includes(e)) matches.push(e);
  }
  return matches.length === 1 ? matches[0] : null;
}

/** True if the model string refers to a Clover point-of-sale device. */
export function isClover(modelStr) {
  return /clover/i.test(String(modelStr || ""));
}
