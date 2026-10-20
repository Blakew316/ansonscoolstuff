/* From AppUpload's lib/formMaps.js (appupload main) — unchanged but for the import path. */
// Field-placement maps for each template form.
//
// Text spec:  { get, page, text, exact?, occ?, region?, place, dx?, dy?, size?, maxWidth?, absX?, absY?, pad? }
//   place 'below'  -> value below the label   (column-header forms: Citizens / Merrick)
//   place 'right'  -> value right of the label / anchored symbol
//   place 'leftOf' -> value right-aligned to end just before the anchor (numbers before a % symbol)
//   absX/absY      -> absolute PDF coordinate (overrides anchor x/y); still needs a found anchor
// Check spec: { on, page, text, exact?, occ?, region?, dx?, dy?, absX?, absY?, mark? }
//
// `get(record)` returns the string to draw; `on(record)` returns a boolean.
// Numbers that sit next to a preprinted $ or % are anchored on that symbol so they
// land cleanly inside the box (no doubled $/%).

import { priceFor, MODELS } from "./pricing.mjs";

const full = (o) => [o?.first, o?.last].filter(Boolean).join(" ").trim();
const raw = (v) => (v == null ? "" : String(v).trim());
// Team is shown without a trailing color word (e.g. "Ice Kannon Blue" -> "Ice Kannon").
const teamName = (v) => raw(v).replace(/\s*\bblue\b\s*$/i, "").trim();

// Owner #1 signature-block fields, auto-filled from Owner 1 when not entered in
// the Signatures section (so the printed name / title / date appear by the sign).
const sigName = (r) => raw(r.signatures?.printedName) || full(r.owners?.[0]);
const sigTitle = (r) => raw(r.signatures?.title) || raw(r.owners?.[0]?.title);
// Prefer the packet/cover date the user entered (matches the coversheet & PO);
// fall back to a date scraped from the source application's signature page.
const sigDate = (r) => raw(r._date) || raw(r.signatures?.date);
// Free-text organization/ownership type, lowercased for matching to a printed checkbox.
const orgType = (r) => raw(r.business?.organizationType).toLowerCase();
// Seasonal — one answer for every application in a packet: marked seasonal, or a
// high-volume month checked (the Pathward form's month boxes).
const SEASON_MONTHS = ["mJan", "mFeb", "mMar", "mApr", "mMay", "mJun", "mJul", "mAug", "mSep", "mOct", "mNov", "mDec"];
const isSeasonal = (r) => r.transaction?.seasonal === true || SEASON_MONTHS.some((k) => Boolean(r.pathward?.[k]));
// A seasonal question's "No" is ticked when the merchant isn't seasonal — on a form
// with something else on it: a completely blank form stays blank (the cover date the
// page stamps by the signer doesn't count, nor the signer's own date it prints over).
// Asked of the form's own map, with the same specs that print it, so it can't drift.
// (Its own spec is marked seasonNo.)
const formHasContent = (map, r) => {
  const r0 = { ...r, _date: "", ...(raw(r._date) ? { signatures: { ...(r.signatures || {}), date: "" } } : {}) };
  return map.text.some((t) => raw(t.get(r0))) || map.check.some((c) => !c.seasonNo && c.on(r0));
};

/* ----------------------------- Citizens ----------------------------- */
// The seasonal row's month boxes (Jan … Dec beside the question; FD North's are the
// same), measured from the page: [month, left, right] — each 6.8pt wide, on y 365.9–372.85.
const CITIZENS_MONTHS = [["mJan", 424.16, 430.96], ["mFeb", 437.11, 443.91], ["mMar", 450.97, 457.77], ["mApr", 464.92, 471.72], ["mMay", 478.58, 485.38], ["mJun", 491.83, 498.63], ["mJul", 505.79, 512.59], ["mAug", 519.14, 525.94], ["mSep", 533.0, 539.8], ["mOct", 546.85, 553.65], ["mNov", 560.21, 567.01], ["mDec", 573.86, 580.66]];
const citizens = {
  text: [
    // 1. General information
    { get: (r) => r.business.dba, page: 1, text: "Client’s Business Name", slot: [23.6, 305.2], absY: 726.16, dy: 0, by: { fd_north: { slot: [23.6, 305.4], absY: 726.16 } } },
    { get: (r) => r.business.legalName, page: 1, text: "Client’s Corporate/Legal Name", slot: [306.4, 588.2], absY: 726.16, dy: 0, by: { fd_north: { slot: [306.4, 587.9], absY: 726.16 } } },
    { get: (r) => r.business.locationAddress, page: 1, text: "Location Address", occ: 0, slot: [23.6, 305.3], absY: 707.88, dy: 0 },
    { get: (r) => r.business.corpAddress, page: 1, text: "Corporate Address (if Different", slot: [306.4, 588.2], absY: 707.88, dy: 0, by: { fd_north: { slot: [306.4, 587.9], absY: 707.88 } } },
    { get: (r) => r.business.locationCity, page: 1, text: "City", region: { yMin: 696, yMax: 704, xMax: 120 }, slot: [23.6, 158.9], absY: 690.41, dy: 0 },
    { get: (r) => r.business.locationState, page: 1, text: "State", region: { yMin: 696, yMax: 704, xMin: 140, xMax: 220 }, slot: [158.9, 243.3], absY: 690.41, dy: 0 },
    { get: (r) => r.business.locationZip, page: 1, text: "Zip", region: { yMin: 696, yMax: 704, xMin: 220, xMax: 300 }, slot: [243.3, 305], absY: 690.41, dy: 0, by: { fd_north: { slot: [243.3, 305.2], absY: 690.41 } } },
    { get: (r) => r.business.corpCity, page: 1, text: "City", region: { yMin: 696, yMax: 704, xMin: 300 }, slot: [306.4, 444.9], absY: 690.41, dy: 0 },
    { get: (r) => r.business.corpState, page: 1, text: "State", region: { yMin: 696, yMax: 704, xMin: 430, xMax: 500 }, slot: [444.9, 529.3], absY: 690.41, dy: 0 },
    { get: (r) => r.business.corpZip, page: 1, text: "Zip", region: { yMin: 696, yMax: 704, xMin: 510 }, slot: [529.3, 587.8], absY: 690.41, dy: 0, by: { fd_north: { slot: [529.3, 588], absY: 690.41 } } },
    { get: (r) => r.business.phone, page: 1, text: "Location Phone", slot: [23.6, 156.2], absY: 672.53, dy: 0 },
    { get: (r) => r.business.fax, page: 1, text: "Location Fax", slot: [156.2, 305.3], absY: 672.53, dy: 0, by: { fd_north: { slot: [156.2, 305.2], absY: 672.53 } } },
    { get: (r) => r.business.contactName, page: 1, text: "Contact Name", slot: [306.4, 437.6], absY: 672.53, dy: 0 },
    { get: (r) => r.business.contactPhone, page: 1, text: "Contact Phone", slot: [437.6, 588.1], absY: 672.53, dy: 0 },
    { get: (r) => r.business.customerServicePhone, page: 1, text: "Customer Service Phone", slot: [23.6, 188.8], absY: 654.66, dy: 0 },
    { get: (r) => r.business.email, page: 1, text: "Business Email", slot: [306.4, 461.6], absY: 654.66, dy: 0 },
    { get: (r) => r.business.dnb, page: 1, text: "D&B #", slot: [461.6, 587.9], absY: 654.66, dy: 0 },
    { get: (r) => r.business.website, page: 1, text: "Business Website Address", slot: [23.6, 305.2], absY: 636.78, dy: 0 },
    { get: (r) => r.business.federalTaxId, page: 1, text: "Fed Tax ID", slot: [306.4, 476], absY: 636.78, dy: 0, by: { fd_north: { slot: [306.4, 464.6], absY: 636.78 } } },
    { get: (r) => r.business.taxType, page: 1, text: "Tax Type", slot: [476, 588.1], absY: 636.78, dy: 0, by: { fd_north: { slot: [464.6, 587.9], absY: 636.78 } } },
    { get: (r) => r.business.taxFilingName, page: 1, text: "Tax Filing Name", slot: [306.4, 587.9], absY: 618.91, dy: 0, by: { fd_north: { slot: [306.4, 588], absY: 618.91 } } },
    { get: (r) => r.business.businessStarted, page: 1, text: "Business Started", slot: [306.4, 476.1], absY: 601.04, dy: 0 },
    { get: (r) => ownLen(r), page: 1, text: "Length Current Ownership", slot: [476.1, 587.8], absY: 601.04, dy: 0, by: { fd_north: { slot: [476.1, 588], absY: 601.03 } } },

    // 2. Owners / officers
    { get: (r) => full(r.owners[0]), page: 1, text: "Owner/Officer 1", slot: [23.8, 150.5], absY: 529.73, dy: 0, by: { fd_north: { slot: [23.8, 150.3], absY: 529.72 } } },
    { get: (r) => r.owners[0].homeAddress, page: 1, text: "Home Address", occ: 0, slot: [151.8, 305.9], absY: 529.73, dy: 0 },
    { get: (r) => r.owners[0].phone, page: 1, text: "Telephone", occ: 0, slot: [307.2, 459.2], absY: 529.73, dy: 0, by: { fd_north: { slot: [307.2, 459.1], absY: 529.72 } } },
    { get: (r) => r.owners[0].ssn, page: 1, text: "Social Security #", occ: 0, slot: [460.8, 588.2], absY: 529.73, dy: 0, by: { fd_north: { slot: [460.8, 588], absY: 529.72 } } },
    { get: (r) => r.owners[0].title, page: 1, text: "Title", occ: 0, slot: [23.8, 96.8], absY: 506.53, dy: 0 },
    { get: (r) => raw(r.owners[0].ownershipPct), page: 1, text: "% Ownership", occ: 0, slot: [96.8, 150.4], absY: 506.53, dy: 0 },
    { get: (r) => r.owners[0].city, page: 1, text: "City", region: { yMin: 516, yMax: 524, xMin: 150, xMax: 220 }, slot: [151.8, 229.5], absY: 506.53, dy: 0 },
    { get: (r) => r.owners[0].state, page: 1, text: "State", region: { yMin: 516, yMax: 524, xMin: 225, xMax: 260 }, slot: [229.5, 263.2], absY: 506.53, dy: 0, by: { fd_north: { slot: [229.5, 262.6], absY: 506.52 } } },
    { get: (r) => r.owners[0].zip, page: 1, text: "Zip", region: { yMin: 516, yMax: 524, xMin: 260 }, slot: [263.2, 306.2], absY: 506.53, dy: 0, by: { fd_north: { slot: [262.6, 306.1], absY: 506.52 } } },
    { get: (r) => r.owners[0].email, page: 1, text: "Email Address", occ: 0, slot: [307.2, 459.3], absY: 506.53, dy: 0, by: { fd_north: { slot: [307.2, 459], absY: 506.52 } } },
    { get: (r) => r.owners[0].dob, page: 1, text: "Birth Date", occ: 0, slot: [460.8, 588], absY: 506.53, dy: 0, by: { fd_north: { slot: [460.8, 587.9], absY: 506.52 } } },

    { get: (r) => full(r.owners[1]), page: 1, text: "Ownership", exact: true, region: { yMin: 480, yMax: 488, xMax: 55 }, slot: [23.8, 150.5], absY: 471.26, dy: 0, by: { fd_north: { slot: [23.8, 150.6], absY: 471.26 } } },
    { get: (r) => r.owners[1].homeAddress, page: 1, text: "Home Address", occ: 1, slot: [151.8, 305.9], absY: 471.26, dy: 0 },
    { get: (r) => r.owners[1].phone, page: 1, text: "Telephone", occ: 1, slot: [307.6, 459.2], absY: 471.26, dy: 0, by: { fd_north: { slot: [307.6, 459.1], absY: 471.26 } } },
    { get: (r) => r.owners[1].ssn, page: 1, text: "Social Security #", occ: 1, slot: [460.8, 588.2], absY: 471.26, dy: 0, by: { fd_north: { slot: [460.8, 588], absY: 471.26 } } },
    { get: (r) => r.owners[1].title, page: 1, text: "Title", occ: 1, slot: [23.8, 96.8], absY: 447.86, dy: 0 },
    { get: (r) => raw(r.owners[1].ownershipPct), page: 1, text: "% Ownership", occ: 1, slot: [96.8, 150.4], absY: 447.86, dy: 0 },
    { get: (r) => r.owners[1].city, page: 1, text: "City", region: { yMin: 457, yMax: 465, xMin: 150, xMax: 220 }, slot: [151.8, 229.5], absY: 447.86, dy: 0 },
    { get: (r) => r.owners[1].state, page: 1, text: "State", region: { yMin: 457, yMax: 465, xMin: 225, xMax: 260 }, slot: [229.5, 263.2], absY: 447.86, dy: 0, by: { fd_north: { slot: [229.5, 262.6], absY: 447.86 } } },
    { get: (r) => r.owners[1].zip, page: 1, text: "Zip", region: { yMin: 457, yMax: 465, xMin: 260 }, slot: [263.2, 306.2], absY: 447.86, dy: 0, by: { fd_north: { slot: [262.6, 306.1], absY: 447.86 } } },
    { get: (r) => r.owners[1].email, page: 1, text: "Email Address", occ: 1, slot: [307.2, 459.3], absY: 447.86, dy: 0, by: { fd_north: { slot: [307.6, 459], absY: 447.86 } } },
    { get: (r) => r.owners[1].dob, page: 1, text: "Birth Date", occ: 1, slot: [460.8, 588], absY: 447.86, dy: 0, by: { fd_north: { slot: [460.8, 587.9], absY: 447.86 } } },

    // 3. Transaction info — numbers anchored to the right of the printed "$"
    { get: (r) => raw(r.transaction.monthlyVolume), page: 1, text: "$", region: { yMin: 374, yMax: 382, xMin: 170, xMax: 185 }, slot: [181.2, 305], absY: 379.98, dy: 0, by: { fd_north: { slot: [180.8, 305], absY: 379.98 } } },
    { get: (r) => raw(r.transaction.avgTicket), page: 1, text: "$", region: { yMin: 357, yMax: 365, xMin: 170, xMax: 185 }, slot: [181.2, 305], absY: 363, dy: 0, by: { fd_north: { slot: [180.8, 305], absY: 363 } } },
    { get: (r) => raw(r.transaction.highTicket), page: 1, text: "$", region: { yMin: 340, yMax: 348, xMin: 170, xMax: 185 }, slot: [181.2, 305], absY: 346.02, dy: 0, by: { fd_north: { slot: [180.8, 305], absY: 346.02 } } },
    { get: (r) => r.transaction.previousProcessor, page: 1, text: "Previous Processor", slot: [86.8, 304.9], absY: 329.04, dy: 0, by: { fd_north: { slot: [82.1, 304.8], absY: 329.04 } } },
    { get: (r) => r.transaction.reasonForLeaving, page: 1, text: "Reason For Leaving", slot: [87.2, 304.7], absY: 312.07, dy: 0, by: { fd_north: { slot: [84.1, 304.8], absY: 312.07 } } },

    // 4. Nature of business
    { get: (r) => r.business.productsSold, page: 1, text: "Describe Product / Services Sold", slot: [410.9, 587.5], absY: 396.96, dy: 0, by: { fd_north: { slot: [403.6, 587.5], absY: 396.97 } } },
    { get: (r) => r.business.businessType, page: 1, text: "Business Type", slot: [358, 587.5], absY: 379.98, dy: 0, by: { fd_north: { slot: [355.4, 587.7], absY: 379.99 } } },
    { get: (r) => raw(r.transaction.swipePct), page: 1, text: "SWIPE % :", slot: [344.8, 444.4], absY: 346.02, dy: 0, by: { fd_north: { slot: [342.9, 444.4], absY: 346.02 } } },
    { get: (r) => raw(r.transaction.motoPct), page: 1, text: "MOTO % :", slot: [343.2, 444], absY: 329.05, dy: 0, by: { fd_north: { slot: [341.6, 444], absY: 329.05 } } },
    { get: (r) => raw(r.transaction.internetPct), page: 1, text: "INTERNET % :", slot: [354.8, 449.5], absY: 312.07, dy: 0, by: { fd_north: { slot: [353.6, 447.3], absY: 312.07 } } },

    // 5. Banking
    { get: (r) => r.banking.bankName, page: 1, text: "Deposit Bank Name", slot: [23.8, 129.3], absY: 278.26, dy: 0 },
    { get: (r) => r.banking.routing, page: 1, text: "Routing #", slot: [129.3, 225.7], absY: 278.26, dy: 0 },
    { get: (r) => raw(r.banking.account), page: 1, text: "Account #", slot: [225.7, 313.6], absY: 278.26, dy: 0 },
    { get: (r) => r.banking.bankPhone, page: 1, text: "Bank Phone", slot: [313.6, 385], absY: 278.29, dy: 0, size: 8.5 },

    // 6. Fee schedule — anchored to the right of each printed "$"
    { get: (r) => raw(r.fees.authVmcda), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 84, xMax: 95 }, slot: [95.6, 163.4], absY: 151.97, dy: 0, by: { fd_north: { slot: [95.2, 163.8], absY: 151.98 } } },
    { get: (r) => raw(r.fees.monthlyService), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 218, xMax: 230 }, slot: [229.6, 304.9], absY: 151.97, dy: 0, by: { fd_north: { slot: [229, 304.9], absY: 151.97 } } },
    { get: (r) => raw(r.fees.monthlyMinimum), page: 1, text: "$", region: { yMin: 130, yMax: 138, xMin: 225, xMax: 237 }, slot: [235.7, 304.8], absY: 134.99, dy: 0, by: { fd_north: { slot: [235.3, 304.8], absY: 134.99 } } },
    { get: (r) => raw(r.fees.annual), page: 1, text: "$", region: { yMin: 96, yMax: 104, xMin: 340, xMax: 355 }, slot: [353.6, 446.3], absY: 101.03, dy: 0, by: { fd_north: { slot: [353.2, 446.3], absY: 100.36 } } },
    // 6b. Remaining fee schedule (anchored to each printed "$")
    { get: (r) => raw(r.fees.fleet), page: 1, text: "$", region: { yMin: 130, yMax: 138, xMin: 56, xMax: 67 }, slot: [67.6, 163.5], absY: 134.99, dy: 0, by: { fd_north: { slot: [67.2, 163.5], absY: 134.99 } } },
    { get: (r) => raw(r.fees.pinDebit), page: 1, text: "$", region: { yMin: 113, yMax: 121, xMin: 54, xMax: 64 }, slot: [65.2, 100.1], absY: 118.01, dy: 0 },
    { get: (r) => raw(r.fees.pinDebitPct), page: 1, text: "%", region: { yMin: 114, yMax: 121, xMin: 99, xMax: 112 }, slot: [112.7, 163.2], absY: 118.01, dy: 0 },
    { get: (r) => raw(r.fees.ebt), page: 1, text: "$", region: { yMin: 96, yMax: 104, xMin: 38, xMax: 48 }, slot: [48.8, 163.5], absY: 101.03, dy: 0, by: { fd_north: { slot: [48.4, 163.4], absY: 101.03 } } },
    { get: (r) => raw(r.fees.salesTxn), page: 1, text: "$", region: { yMin: 79, yMax: 87, xMin: 89, xMax: 99 }, slot: [100.6, 163.7], absY: 84.05, dy: 0, by: { fd_north: { slot: [100.2, 163.7], absY: 84.06 } } },
    { get: (r) => raw(r.fees.wireless), page: 1, text: "$", region: { yMin: 113, yMax: 121, xMin: 208, xMax: 220 }, slot: [219.2, 304.7], absY: 118.01, dy: 0, by: { fd_north: { slot: [218.8, 304.7], absY: 118.01 } } },
    { get: (r) => raw(r.fees.pinDebitMonthly), page: 1, text: "$", region: { yMin: 96, yMax: 104, xMin: 223, xMax: 235 }, slot: [234.4, 305], absY: 101.03, dy: 0, by: { fd_north: { slot: [234, 305], absY: 101.03 } } },
    { get: (r) => raw(r.fees.industryCompliance), page: 1, text: "$", region: { yMin: 79, yMax: 87, xMin: 231, xMax: 243 }, slot: [242.4, 304.9], absY: 84.05, dy: 0, by: { fd_north: { slot: [242, 304.9], absY: 84.05 } } },
    // maxWidth 28: the blank ends ~29pt in, at the preprinted "(Per Occurrence)"
    { get: (r) => raw(r.fees.chargeback), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 345, xMax: 357 }, slot: [356, 386.9], absY: 151.97, dy: 0, by: { fd_north: { slot: [355.6, 386.5], absY: 151.61 } } },
    { get: (r) => raw(r.fees.retrieval), page: 1, text: "$", region: { yMin: 130, yMax: 138, xMin: 336, xMax: 348 }, slot: [347.4, 378.1], absY: 134.99, dy: 0, by: { fd_north: { slot: [347, 378.1], absY: 134.61 } } },
    { get: (r) => raw(r.fees.achReject), page: 1, text: "$", region: { yMin: 113, yMax: 121, xMin: 343, xMax: 355 }, slot: [354.4, 385.1], absY: 118.01, dy: 0, by: { fd_north: { slot: [354, 385.1], absY: 117.61 } } },
    { get: (r) => raw(r.fees.equipmentRental), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 529, xMax: 540 }, slot: [540, 587.5], absY: 151.97, dy: 0, by: { fd_north: { slot: [539.6, 587.4], absY: 151.97 } } },
    { get: (r) => raw(r.fees.monthToBill), page: 1, text: "Month to Bill:", slot: [492.8, 587.5], absY: 101.03, dy: 0, by: { fd_north: { slot: [488.8, 587.8], absY: 101.03 } } },
    // Early Termination Fee — fills the "$ ____ Early Termination Fee" blank in the recital line.
    { get: (r) => raw(r.fees.earlyTermination), page: 1, text: "Early Termination Fee", slot: [358.8, 393.6], absY: 50.89, dy: 0, size: 8, by: { fd_north: { slot: [355.2, 387.2], absY: 51, size: 8 } } },
    // Service acceptance — discount plan percentages, centered in the blank after each "%:" label
    { get: (r) => raw(r.serviceAcceptance.flatCreditPct), page: 1, text: "%", region: { yMin: 228, yMax: 236, xMin: 235, xMax: 247 }, slot: [250.8, 281.2], absY: 231.93, dy: 0, by: { fd_north: { slot: [250.8, 280.8], absY: 231.93 } } },
    { get: (r) => raw(r.serviceAcceptance.flatDebitPct), page: 1, text: "%", region: { yMin: 228, yMax: 236, xMin: 293, xMax: 305 }, slot: [307.8, 345], absY: 231.93, dy: 0 },
    { get: (r) => raw(r.serviceAcceptance.passCreditPct), page: 1, text: "%", region: { yMin: 228, yMax: 236, xMin: 430, xMax: 442 }, slot: [445.2, 473.6], absY: 231.93, dy: 0, by: { fd_north: { slot: [445.2, 473.2], absY: 231.93 } } },
    { get: (r) => raw(r.serviceAcceptance.passDebitPct), page: 1, text: "%", region: { yMin: 228, yMax: 236, xMin: 485, xMax: 497 }, slot: [500.8, 530.4], absY: 231.93, dy: 0, by: { fd_north: { slot: [500.4, 530.4], absY: 231.93 } } },
    { get: (r) => raw(r.serviceAcceptance.passAmexPct), page: 1, text: "%", region: { yMin: 228, yMax: 236, xMin: 544, xMax: 556 }, slot: [559.2, 587.6], absY: 231.93, dy: 0 },

    // 10. Signatures (page 2) — printed names / titles / dates (signature stays handwritten)
    // Principal/Officer block: left = signer 1, right = signer 2
    { get: sigName, page: 2, text: "Print Name", region: { yMin: 235, yMax: 243, xMax: 200 }, slot: [64.9, 200.8], absY: 235.52, dy: 0, by: { fd_north: { slot: [63, 200.9], absY: 235.52 } } },
    { get: sigTitle, page: 2, text: "Title", region: { yMin: 255, yMax: 263, xMax: 280 }, slot: [219.3, 304.8], absY: 259.02, dy: 0, by: { fd_north: { slot: [219.3, 304.7], absY: 259.02 } } },
    { get: sigDate, page: 2, text: "Date:", region: { yMin: 232, yMax: 240, xMax: 280 }, slot: [218.9, 304.7], absY: 235.52, dy: 0, by: { fd_north: { slot: [218, 304.7], absY: 235.52 } } },
    { get: (r) => r.signatures.printedName2, page: 2, text: "Print Name", region: { yMin: 235, yMax: 243, xMin: 250 }, slot: [346, 484.7], absY: 235.52, dy: 0, by: { fd_north: { slot: [344.1, 484.8], absY: 235.52 } } },
    { get: (r) => r.signatures.title2, page: 2, text: "Title", region: { yMin: 255, yMax: 263, xMin: 400 }, slot: [503.3, 587.6], absY: 259.02, dy: 0, by: { fd_north: { slot: [503.3, 587.5], absY: 259.02 } } },
    { get: (r) => r.signatures.date2, page: 2, text: "Date:", region: { yMin: 232, yMax: 240, xMin: 400 }, slot: [502.9, 587.5], absY: 235.52, dy: 0, by: { fd_north: { slot: [502, 587.5], absY: 235.52 } } },
    // Personal Guarantee block (same signers)
    { get: sigName, page: 2, text: "Print Name", region: { yMin: 120, yMax: 128, xMax: 200 }, slot: [64, 200.7], absY: 119.32, dy: 0, by: { fd_north: { slot: [62.1, 200.8], absY: 119.32 } } },
    { get: sigTitle, page: 2, text: "Title", region: { yMin: 139, yMax: 147, xMax: 280 }, slot: [219.3, 304.8], absY: 142.82, dy: 0, by: { fd_north: { slot: [219.3, 304.7], absY: 142.82 } } },
    { get: sigDate, page: 2, text: "Date:", region: { yMin: 115, yMax: 123, xMax: 280 }, slot: [218.9, 304.7], absY: 119.32, dy: 0, by: { fd_north: { slot: [218, 304.7], absY: 119.32 } } },
    { get: (r) => r.signatures.printedName2, page: 2, text: "Print Name", region: { yMin: 120, yMax: 128, xMin: 250 }, slot: [346, 484.7], absY: 119.32, dy: 0, by: { fd_north: { slot: [344.1, 484.8], absY: 119.32 } } },
    { get: (r) => r.signatures.title2, page: 2, text: "Title", region: { yMin: 139, yMax: 147, xMin: 400 }, slot: [503.3, 587.6], absY: 142.82, dy: 0, by: { fd_north: { slot: [503.3, 587.5], absY: 142.82 } } },
    { get: (r) => r.signatures.date2, page: 2, text: "Date:", region: { yMin: 115, yMax: 123, xMin: 400 }, slot: [502.9, 587.5], absY: 119.32, dy: 0, by: { fd_north: { slot: [502, 587.5], absY: 119.32 } } },

    // Confirmation page (page 3)
    { get: (r) => r.business.legalName, page: 3, text: "Print Client’s Business Legal Name", slot: [140.2, 587.7], absY: 259.88, dy: 0, by: { fd_north: { slot: [140, 587.5], absY: 259.88 } } },
    { get: sigTitle, page: 3, text: "Title:", slot: [376.4, 481.1], absY: 62.99, dy: 0, by: { fd_north: { slot: [375.2, 481.1], absY: 62.99 } } },
    { get: sigDate, page: 3, text: "Date:", slot: [499.2, 587.5], absY: 62.99, dy: 0, by: { fd_north: { slot: [498.3, 587.8], absY: 62.99 } } },
    { get: sigName, page: 3, text: "Print Name of Signer", slot: [96, 587.4], absY: 31.62, dy: 0, by: { fd_north: { slot: [95.8, 587.7], absY: 31.62 } } },
  ],
  check: [
    { on: (r) => r.banking.accountType === "checking", page: 1, text: "Checking", box: [503.99, 510.59, 280.29, 286.89] },
    { on: (r) => r.banking.accountType === "savings", page: 1, text: "Savings", box: [546.68, 553.28, 280.29, 286.89] },
    // Card types (boxes sit left of each label)
    { on: (r) => r.serviceAcceptance.cardVisaCredit, page: 1, text: "VISA CREDIT", box: [129.9, 138.1, 247.87, 256.47] },
    { on: (r) => r.serviceAcceptance.cardVisaDebit, page: 1, text: "VISA DEBIT", box: [190.3, 198.1, 247.87, 256.47] },
    { on: (r) => r.serviceAcceptance.cardMcCredit, page: 1, text: "MASTERCARD CREDIT", box: [245.98, 254.18, 247.87, 256.47] },
    { on: (r) => r.serviceAcceptance.cardMcDebit, page: 1, text: "MASTERCARD DEBIT", box: [335.12, 343.32, 247.87, 256.47] },
    { on: (r) => r.serviceAcceptance.cardDiscover, page: 1, text: "DISCOVER", region: { yMin: 244, yMax: 252 }, box: [419.54, 427.34, 247.87, 256.47] },
    { on: (r) => r.serviceAcceptance.cardAmex, page: 1, text: "AMEX CREDIT", box: [472.65, 480.85, 247.87, 256.47] },
    { on: (r) => r.serviceAcceptance.cardPin, page: 1, text: "PIN CREDIT", box: [535.83, 544.03, 247.87, 256.47] },
    // Discount plan + assessments + payment method
    { on: (r) => r.serviceAcceptance.discountPlan === "flat", page: 1, text: "Flat Rate", box: [173.86, 182.06, 231.8, 240.4] },
    { on: (r) => r.serviceAcceptance.discountPlan === "passthrough", page: 1, text: "Passthrough IC", box: [346.25, 354.45, 231.8, 240.4] },
    { on: (r) => r.serviceAcceptance.assessments === "included", page: 1, text: "Included", box: [124.21, 132.41, 215.89, 224.49] },
    { on: (r) => r.serviceAcceptance.assessments === "billed", page: 1, text: "Billed Separately", box: [173.92, 181.72, 215.89, 224.49] },
    { on: (r) => r.serviceAcceptance.paymentMethod === "daily", page: 1, text: "Daily", box: [430.2, 438, 215.89, 224.49] },
    { on: (r) => r.serviceAcceptance.paymentMethod === "monthly", page: 1, text: "Monthly", region: { yMin: 210, yMax: 220 }, box: [472.32, 480.12, 215.89, 224.49] },
    // Type of Organization — two printed rows (y≈591 top, y≈582 below). The free-text
    // organizationType is matched to one of the seven options.
    { on: (r) => /sole|individual|propriet/.test(orgType(r)), page: 1, text: "Sole Prop", region: { yMin: 588, yMax: 595 }, box: [381.5, 389.7, 589.57, 597.77] },
    { on: (r) => /partner/.test(orgType(r)) && !/ll[cp]|limited liab/.test(orgType(r)), page: 1, text: "Partnership", region: { yMin: 588, yMax: 595 }, box: [433, 441.2, 589.57, 597.77] },
    { on: (r) => /ll[cp]|limited liab/.test(orgType(r)), page: 1, text: "LLC/LLP", region: { yMin: 588, yMax: 595 }, box: [493, 500.8, 589.57, 597.77] },
    { on: (r) => /corp|\binc\b|incorporated/.test(orgType(r)) && !/s[-\s]?corp|ll[cp]|limited liab|non.?profit|501|govern|municip/.test(orgType(r)), page: 1, text: "C CORP", region: { yMin: 588, yMax: 595 }, box: [543, 551.2, 589.57, 597.77] },
    { on: (r) => /s[-\s]?corp/.test(orgType(r)), page: 1, text: "S CORP", region: { yMin: 579, yMax: 586 }, box: [309.8, 318, 582.68, 591.28] },
    { on: (r) => /govern|gov't|gov\b|municip/.test(orgType(r)), page: 1, text: "Local/State/Federal", region: { yMin: 579, yMax: 586 }, box: [354.3, 362.5, 582.68, 591.28] },
    { on: (r) => /non.?profit|501/.test(orgType(r)), page: 1, text: "501c", region: { yMin: 579, yMax: 586 }, box: [457.85, 466.05, 581.88, 589.28] },
    // Seasonal merchant — mark "Yes" only when flagged (single review checkbox).
    { on: isSeasonal, page: 1, text: "Seasonal Merchant", box: [371.8, 380, 362.27, 370.87] },
    // …and "N" when not seasonal (on a form with anything on it — see formHasContent)
    { on: (r) => !isSeasonal(r) && formHasContent(citizens, r), seasonNo: true, page: 1, text: "Seasonal Merchant", box: [392.7, 400.9, 362.27, 370.87] },
    // …and its high-volume / active months (any one checked also makes it seasonal)
    ...CITIZENS_MONTHS.map(([m, left, right]) => ({ on: (r) => Boolean(r.pathward?.[m]), page: 1, text: "Seasonal Merchant", box: [left, right, 365.9, 372.85] })),
  ],
  // Owner #1 "Sign Now" signature spots (x,y = bottom-left in PDF points; image
  // scaled to fit maxW x maxH). Page 2: the Principal/Officer + Personal Guarantee
  // blocks on the left; page 3: the Client's Business Principal's signature line.
  sign: [
    { page: 2, x: 64, y: 251.4, maxW: 133, maxH: 20.4, center: true, middle: true },
    { page: 2, x: 90, y: 135.8, maxW: 107, maxH: 20.4, center: true, middle: true },
    { page: 3, x: 152, y: 52, maxW: 203, maxH: 28.4, center: true, middle: true },
  ],
};

/* ----------------------------- Merrick ----------------------------- */
// The seasonal row's month boxes (JAN … DEC under the question), measured from the
// page: [month, left, right] — each 3.5pt wide, on the row y 296.7–300.1.
const MERRICK_MONTHS = [["mJan", 28.69, 32.19], ["mFeb", 48.83, 52.33], ["mMar", 69.01, 72.51], ["mApr", 91.05, 94.55], ["mMay", 111.61, 115.11], ["mJun", 133.05, 136.55], ["mJul", 153.47, 156.97], ["mAug", 172.81, 176.31], ["mSep", 194.63, 198.13], ["mOct", 217.21, 220.71], ["mNov", 238.65, 242.15], ["mDec", 260.41, 263.91]];
const merrick = {
  text: [
    { get: (r) => r.business.dba, page: 1, text: "MERCHANT NAME", slot: [22.8, 309.8], absY: 701.22, dy: 0 },
    { get: (r) => r.business.legalName, page: 1, text: "CORPORATE / LEGAL NAME", slot: [310.6, 584.6], absY: 701.22, dy: 0 },
    { get: (r) => r.business.locationAddress, page: 1, text: "LOCATION ADDRESS", slot: [22.8, 309.6], absY: 679.14, dy: 0 },
    { get: (r) => r.business.corpAddress, page: 1, text: "CORPORATE ADDRESS", slot: [310.6, 584.2], absY: 679.14, dy: 0 },
    { get: (r) => r.business.locationCity, page: 1, text: "CITY", region: { yMin: 665, yMax: 673, xMax: 120 }, slot: [22.8, 182.6], absY: 656.94, dy: 0 },
    { get: (r) => r.business.locationState, page: 1, text: "STATE", region: { yMin: 665, yMax: 673, xMin: 160, xMax: 220 }, slot: [182.6, 236.9], absY: 656.94, dy: 0 },
    { get: (r) => r.business.locationZip, page: 1, text: "ZIP", region: { yMin: 665, yMax: 673, xMin: 220, xMax: 300 }, slot: [236.9, 309.6], absY: 656.94, dy: 0 },
    { get: (r) => r.business.corpCity, page: 1, text: "CITY", region: { yMin: 665, yMax: 673, xMin: 300 }, slot: [310.6, 470.3], absY: 656.94, dy: 0 },
    { get: (r) => r.business.corpState, page: 1, text: "STATE", region: { yMin: 665, yMax: 673, xMin: 450, xMax: 510 }, slot: [470.3, 524.7], absY: 656.94, dy: 0 },
    { get: (r) => r.business.corpZip, page: 1, text: "ZIP", region: { yMin: 665, yMax: 673, xMin: 510 }, slot: [524.7, 584.5], absY: 656.94, dy: 0 },
    { get: (r) => r.business.phone, page: 1, text: "PHONE NUMBER", slot: [22.8, 181.2], absY: 634.66, dy: 0 },
    { get: (r) => r.business.fax, page: 1, text: "FAX NUMBER", slot: [181.2, 309.6], absY: 634.66, dy: 0 },
    { get: (r) => r.business.contactName, page: 1, text: "CONTACT NAME", slot: [310.6, 430], absY: 634.66, dy: 0 },
    { get: (r) => r.business.contactPhone, page: 1, text: "CONTACT PHONE", slot: [430, 584.3], absY: 634.66, dy: 0 },
    { get: (r) => r.business.email, page: 1, text: "BUSINESS EMAIL", slot: [22.8, 187.3], absY: 612.78, dy: 0 },
    { get: (r) => r.business.website, page: 1, text: "WEBSITE", slot: [188.2, 309.6], absY: 612.78, dy: 0 },
    { get: (r) => r.business.federalTaxId, page: 1, text: "FEDERAL TAX ID", slot: [310.6, 584.4], absY: 612.78, dy: 0 },
    { get: (r) => r.business.stateIssued, page: 1, text: "STATE ISSUED", slot: [393.6, 442.3], absY: 591.5, dy: 0 },
    // Length of ownership: years / months placed just before each preprinted word
    { get: (r) => raw(r.business.lengthOwnershipYears), page: 1, text: "YEARS", slot: [453.3, 482.5], absY: 594.3, dy: 0 },
    { get: (r) => raw(r.business.lengthOwnershipMonths), page: 1, text: "MONTHS", slot: [520.7, 546.7], absY: 594.3, dy: 0 },

    // Owner 1
    { get: (r) => r.owners[0].first, page: 1, text: "FIRST", occ: 0, slot: [40.8, 137.2], absY: 557.46, dy: 0 },
    { get: (r) => r.owners[0].last, page: 1, text: "LAST", occ: 0, slot: [137.2, 228.1], absY: 557.46, dy: 0 },
    { get: (r) => r.owners[0].homeAddress, page: 1, text: "HOME ADDRESS", occ: 0, slot: [229, 406.7], absY: 557.46, dy: 0 },
    { get: (r) => r.owners[0].city, page: 1, text: "CITY", region: { yMin: 566, yMax: 574, xMin: 400, xMax: 500 }, slot: [407.8, 502], absY: 557.46, dy: 0 },
    { get: (r) => r.owners[0].state, page: 1, text: "STATE", region: { yMin: 566, yMax: 574, xMin: 500, xMax: 545 }, slot: [502, 550.2], absY: 557.46, dy: 0 },
    { get: (r) => r.owners[0].zip, page: 1, text: "ZIP", region: { yMin: 566, yMax: 574, xMin: 545 }, slot: [550.2, 584.5], absY: 557.46, dy: 0 },
    { get: (r) => r.owners[0].title, page: 1, text: "TITLE", occ: 0, slot: [40.8, 128.3], absY: 535.38, dy: 0 },
    { get: (r) => raw(r.owners[0].ownershipPct), page: 1, text: "OWNERSHIP", exact: true, occ: 0, slot: [128.3, 176.6], absY: 535.38, dy: 0 },
    { get: (r) => r.owners[0].phone, page: 1, text: "TELEPHONE", occ: 0, slot: [229, 406.6], absY: 535.38, dy: 0 },
    { get: (r) => r.owners[0].email, page: 1, text: "EMAIL", exact: true, occ: 0, slot: [407.8, 584.3], absY: 535.38, dy: 0 },
    { get: (r) => r.owners[0].ssn, page: 1, text: "SOCIAL", occ: 0, slot: [40.8, 228.2], absY: 513.1, dy: 0 },
    { get: (r) => r.owners[0].dob, page: 1, text: "DATE OF BIRTH", occ: 0, slot: [229, 406.8], absY: 513.1, dy: 0 },
    { get: (r) => r.owners[0].dlNumber, page: 1, text: "DRIVERS LICENSE", occ: 0, slot: [407.8, 502.1], absY: 513.1, dy: 0 },
    { get: (r) => r.owners[0].dlState, page: 1, text: "DRIVERS LICENSE", occ: 0, slot: [502.1, 547.4], absY: 513.1, dy: 0 },
    { get: (r) => r.owners[0].dlExp, page: 1, text: "EXP", occ: 0, slot: [547.4, 584.4], absY: 513.46, dy: 0, size: 8 },

    // Owner 2
    { get: (r) => r.owners[1].first, page: 1, text: "FIRST", occ: 1, slot: [40.8, 137.2], absY: 491.1, dy: 0 },
    { get: (r) => r.owners[1].last, page: 1, text: "LAST", occ: 1, slot: [137.2, 228.1], absY: 491.1, dy: 0 },
    { get: (r) => r.owners[1].homeAddress, page: 1, text: "HOME ADDRESS", occ: 1, slot: [229, 406.7], absY: 491.1, dy: 0 },
    { get: (r) => r.owners[1].city, page: 1, text: "CITY", region: { yMin: 500, yMax: 508, xMin: 400, xMax: 500 }, slot: [407.8, 502], absY: 491.1, dy: 0 },
    { get: (r) => r.owners[1].state, page: 1, text: "STATE", region: { yMin: 500, yMax: 508, xMin: 500, xMax: 545 }, slot: [502, 550.2], absY: 491.1, dy: 0 },
    { get: (r) => r.owners[1].zip, page: 1, text: "ZIP", region: { yMin: 500, yMax: 508, xMin: 545 }, slot: [550.2, 584.5], absY: 491.1, dy: 0 },
    { get: (r) => r.owners[1].title, page: 1, text: "TITLE", occ: 1, slot: [40.8, 137.4], absY: 469.02, dy: 0 },
    { get: (r) => raw(r.owners[1].ownershipPct), page: 1, text: "OWNERSHIP", exact: true, occ: 1, slot: [137.4, 174.2], absY: 469.02, dy: 0 },
    { get: (r) => r.owners[1].phone, page: 1, text: "TELEPHONE", occ: 1, slot: [229, 406.6], absY: 469.02, dy: 0 },
    { get: (r) => r.owners[1].email, page: 1, text: "EMAIL", exact: true, occ: 1, slot: [407.8, 584.3], absY: 469.02, dy: 0 },
    { get: (r) => r.owners[1].ssn, page: 1, text: "SOCIAL", occ: 1, slot: [40.8, 228.2], absY: 446.94, dy: 0 },
    { get: (r) => r.owners[1].dob, page: 1, text: "DATE OF BIRTH", occ: 1, slot: [229, 406.8], absY: 446.94, dy: 0 },
    { get: (r) => r.owners[1].dlNumber, page: 1, text: "DRIVERS LICENSE", occ: 1, slot: [407.8, 502.1], absY: 446.94, dy: 0 },
    { get: (r) => r.owners[1].dlState, page: 1, text: "DRIVERS LICENSE", occ: 1, slot: [502.1, 547.4], absY: 446.94, dy: 0 },
    { get: (r) => r.owners[1].dlExp, page: 1, text: "EXP", occ: 1, slot: [547.4, 584.4], absY: 447.3, dy: 0, size: 8 },

    // Banking
    { get: (r) => r.banking.bankName, page: 1, text: "BANK NAME", slot: [22.8, 141.3], absY: 406.86, dy: 0 },
    { get: (r) => r.banking.routing, page: 1, text: "TRANSIT", slot: [142.8, 277.5], absY: 406.86, dy: 0 },
    { get: (r) => raw(r.banking.account), page: 1, text: "ACCOUNT(DDA)", slot: [278.6, 415], absY: 406.86, dy: 0 },
    { get: (r) => r.banking.bankPhone, page: 1, text: "PHONE", region: { yMin: 415, yMax: 430 }, slot: [416.2, 509.3], absY: 406.86, dy: 0 },

    // Transaction — numbers right of "$"
    { get: (r) => r.business.businessType, page: 1, text: "BUSINESS TYPE", slot: [72, 169.9], absY: 374.64, dy: 0 },
    { get: (r) => r.transaction.reasonForLeaving, page: 1, text: "REASON FOR LEAVING:", slot: [391.3, 584], absY: 300, dy: 0 },
    { get: (r) => r.business.productsSold, page: 1, text: "PRODUCT/SERVICES SOLD", wrap: { y: [378.4, 371.8], size: 6.5 }, slot: [242.6, 323.2], absY: 374.64, dy: 0 },
    { get: (r) => raw(r.transaction.monthlyVolume), page: 1, text: "$", region: { yMin: 356, yMax: 364, xMin: 169, xMax: 180 }, slot: [178.4, 322.2], absY: 358.88, dy: 0 },
    { get: (r) => raw(r.transaction.amexVolume), page: 1, text: "$", region: { yMin: 341, yMax: 349, xMin: 169, xMax: 180 }, slot: [178.4, 322.6], absY: 343.6, dy: 0 },
    { get: (r) => raw(r.transaction.avgTicket), page: 1, text: "$", region: { yMin: 326, yMax: 334, xMin: 169, xMax: 180 }, slot: [178.4, 322.2], absY: 329.12, dy: 0 },
    { get: (r) => raw(r.transaction.highTicket), page: 1, text: "$", region: { yMin: 311, yMax: 319, xMin: 169, xMax: 180 }, slot: [178.4, 322.2], absY: 313.84, dy: 0 },

    // Nature of business — numbers just before each "%"
    { get: (r) => raw(r.transaction.swipePct), page: 1, text: "%", region: { yMin: 371, yMax: 379, xMin: 438, xMax: 450 }, slot: [419.8, 442.2], absY: 373.76, dy: 0 },
    { get: (r) => raw(r.transaction.motoPct), page: 1, text: "%", region: { yMin: 356, yMax: 364, xMin: 438, xMax: 450 }, slot: [420.1, 442.5], absY: 358.88, dy: 0 },
    { get: (r) => raw(r.transaction.internetPct), page: 1, text: "%", region: { yMin: 341, yMax: 349, xMin: 438, xMax: 450 }, slot: [419.9, 442.3], absY: 343.6, dy: 0 },
    { get: (r) => raw(r.transaction.salesToConsumerPct), page: 1, text: "%", region: { yMin: 371, yMax: 379, xMin: 570, xMax: 582 }, slot: [527.3, 574.1], absY: 373.76, dy: 0 },
    { get: (r) => raw(r.transaction.salesToBusinessPct), page: 1, text: "%", region: { yMin: 356, yMax: 364, xMin: 570, xMax: 582 }, slot: [527.3, 574.1], absY: 358.88, dy: 0 },
    { get: (r) => raw(r.transaction.salesToGovPct), page: 1, text: "%", region: { yMin: 341, yMax: 349, xMin: 570, xMax: 582 }, slot: [527.4, 574.2], absY: 343.6, dy: 0 },

    // Fee schedule — numbers anchored to each printed "$"
    { get: (r) => raw(r.fees.authVmcda), page: 1, text: "$", region: { yMin: 162, yMax: 170, xMin: 120, xMax: 132 }, slot: [129.6, 190.6], absY: 164.44, dy: 0 },
    { get: (r) => raw(r.fees.fleet), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 120, xMax: 132 }, slot: [129.6, 191], absY: 149.96, dy: 0 },
    { get: (r) => raw(r.fees.pinDebit), page: 1, text: "$", region: { yMin: 132, yMax: 140, xMin: 120, xMax: 132 }, slot: [129.6, 154.2], absY: 135.08, dy: 0 },
    { get: (r) => raw(r.fees.pinDebitPct), page: 1, text: "%", region: { yMin: 132, yMax: 140, xMin: 175, xMax: 187 }, slot: [155.9, 180.7], absY: 135.08, dy: 0 },
    { get: (r) => raw(r.fees.ebt), page: 1, text: "$", region: { yMin: 117, yMax: 125, xMin: 120, xMax: 132 }, slot: [129.6, 191], absY: 120.08, dy: 0 },
    { get: (r) => raw(r.fees.electronicAvs), page: 1, text: "$", region: { yMin: 102, yMax: 110, xMin: 120, xMax: 132 }, slot: [129.6, 191], absY: 104.8, dy: 0 },
    { get: (r) => raw(r.fees.voiceAuth), page: 1, text: "$", region: { yMin: 87, yMax: 95, xMin: 120, xMax: 132 }, slot: [129.6, 191], absY: 89.8, dy: 0 },
    { get: (r) => raw(r.fees.voiceAvs), page: 1, text: "$", region: { yMin: 72, yMax: 80, xMin: 120, xMax: 132 }, slot: [129.6, 191], absY: 75.08, dy: 0 },
    { get: (r) => raw(r.fees.monthlyService), page: 1, text: "$", region: { yMin: 162, yMax: 170, xMin: 261, xMax: 272 }, slot: [271, 315.7], absY: 164.44, dy: 0 },
    { get: (r) => raw(r.fees.monthlyMinimum), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 261, xMax: 272 }, slot: [271, 315.7], absY: 149.96, dy: 0 },
    { get: (r) => raw(r.fees.pinDebitMonthly), page: 1, text: "$", region: { yMin: 132, yMax: 140, xMin: 261, xMax: 272 }, slot: [270.9, 315.6], absY: 135.08, dy: 0 },
    { get: (r) => raw(r.fees.wireless), page: 1, text: "$", region: { yMin: 117, yMax: 125, xMin: 261, xMax: 272 }, slot: [271, 315.7], absY: 120.08, dy: 0 },
    { get: (r) => raw(r.fees.industryCompliance), page: 1, text: "$", region: { yMin: 102, yMax: 110, xMin: 261, xMax: 272 }, slot: [270.9, 315.6], absY: 104.8, dy: 0 },
    { get: (r) => raw(r.fees.basilPos), page: 1, text: "$", region: { yMin: 162, yMax: 170, xMin: 389, xMax: 400 }, slot: [399.2, 452.6], absY: 164.44, dy: 0 },
    { get: (r) => raw(r.fees.saasFee), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 389, xMax: 400 }, slot: [399.2, 452.2], absY: 149.96, dy: 0 },
    { get: (r) => raw(r.fees.inactivityFee), page: 1, text: "$", region: { yMin: 132, yMax: 140, xMin: 389, xMax: 400 }, slot: [399.2, 452.6], absY: 135.08, dy: 0 },
    { get: (r) => raw(r.fees.gatewayMonthly), page: 1, text: "$", region: { yMin: 117, yMax: 125, xMin: 389, xMax: 400 }, slot: [399.2, 452.2], absY: 120.08, dy: 0 },
    { get: (r) => raw(r.fees.monthlyMisc), page: 1, text: "$", region: { yMin: 102, yMax: 110, xMin: 389, xMax: 400 }, slot: [399.2, 452.2], absY: 104.8, dy: 0 },
    { get: (r) => raw(r.fees.batch), page: 1, text: "$", region: { yMin: 87, yMax: 95, xMin: 389, xMax: 400 }, slot: [399.2, 452.2], absY: 89.8, dy: 0 },
    { get: (r) => raw(r.fees.chargeback), page: 1, text: "$", region: { yMin: 162, yMax: 170, xMin: 527, xMax: 538 }, slot: [536.8, 584.1], absY: 164.44, dy: 0 },
    { get: (r) => raw(r.fees.retrieval), page: 1, text: "$", region: { yMin: 147, yMax: 155, xMin: 527, xMax: 538 }, slot: [536.8, 584.1], absY: 149.96, dy: 0 },
    { get: (r) => raw(r.fees.achReject), page: 1, text: "$", region: { yMin: 132, yMax: 140, xMin: 527, xMax: 538 }, slot: [536.8, 584.2], absY: 135.08, dy: 0 },
    { get: (r) => raw(r.fees.gatewayTxn), page: 1, text: "$", region: { yMin: 117, yMax: 125, xMin: 527, xMax: 538 }, slot: [536.6, 584], absY: 120.08, dy: 0 },
    { get: (r) => raw(r.fees.salesTxn), page: 1, text: "$", region: { yMin: 102, yMax: 110, xMin: 527, xMax: 538 }, slot: [536.6, 584.1], absY: 104.8, dy: 0 },
    { get: (r) => raw(r.fees.returnTxn), page: 1, text: "$", region: { yMin: 87, yMax: 95, xMin: 527, xMax: 538 }, slot: [536.8, 584.2], absY: 89.8, dy: 0 },
    { get: (r) => raw(r.fees.annual), page: 1, text: "$", region: { yMin: 72, yMax: 80, xMin: 390, xMax: 400 }, slot: [399.2, 452.2], absY: 75.08, dy: 0 },
    { get: (r) => r.fees.monthToBill, page: 1, text: "Month to Bill:", slot: [526.4, 584.8], absY: 74.96, dy: 0 },
    // Early Termination Fee — fills the "early termination fee of $____" blank in the recital line.
    { get: (r) => moneyStr(r.fees.earlyTermination), page: 1, text: "early termination fee of", slot: [304.6, 326], absY: 57.72, dy: 0, size: 7 },
    // Discount plan percentages (numbers before each "%")
    // Numbers go in the cell to the right of each printed "%", centered.
    { get: (r) => raw(r.serviceAcceptance.flatDebitPct), page: 1, text: "%", region: { yMin: 221, yMax: 229, xMin: 221, xMax: 233 }, slot: [231.6, 290.8], absY: 224.08, dy: 0 },
    { get: (r) => raw(r.serviceAcceptance.flatCreditPct), page: 1, text: "%", region: { yMin: 221, yMax: 229, xMin: 364, xMax: 376 }, slot: [374.6, 435.8], absY: 224.08, dy: 0 },
    { get: (r) => raw(r.serviceAcceptance.flatAmexPct), page: 1, text: "%", region: { yMin: 221, yMax: 229, xMin: 508, xMax: 520 }, slot: [518.6, 584.2], absY: 224.08, dy: 0 },
    { get: (r) => raw(r.serviceAcceptance.passDebitPct), page: 1, text: "%", region: { yMin: 236, yMax: 244, xMin: 221, xMax: 233 }, slot: [231.6, 290.8], absY: 239.16, dy: 0 },
    { get: (r) => raw(r.serviceAcceptance.passCreditPct), page: 1, text: "%", region: { yMin: 236, yMax: 244, xMin: 364, xMax: 376 }, slot: [374.6, 435.8], absY: 239.16, dy: 0 },
    { get: (r) => raw(r.serviceAcceptance.passAmexPct), page: 1, text: "%", region: { yMin: 236, yMax: 244, xMin: 508, xMax: 520 }, slot: [518.6, 584.2], absY: 239.16, dy: 0 },
    // Owner #1 printed name / title / date next to each signature (page 2, last page).
    // Guaranty block (Principal #1 line y≈549; print name + date y≈520).
    { get: sigName, page: 2, text: "Print Name:", region: { yMin: 516, yMax: 523, xMax: 120 }, slot: [22.2, 233.6], absY: 504.11, dy: 0 },
    { get: sigTitle, page: 2, text: "Title:", region: { yMin: 546, yMax: 552, xMin: 230, xMax: 300 }, slot: [233.6, 310.2], absY: 533.36, dy: 0 },
    { get: sigDate, page: 2, text: "Date:", region: { yMin: 516, yMax: 523, xMin: 230, xMax: 300 }, slot: [233.6, 310.2], absY: 504.11, dy: 0 },
    // Acceptance block (Principal #1 line y≈248; print name + date y≈219).
    { get: sigName, page: 2, text: "Print Name:", region: { yMin: 216, yMax: 222, xMax: 120 }, slot: [22.2, 233.6], absY: 203.11, dy: 0 },
    { get: sigTitle, page: 2, text: "Title:", region: { yMin: 245, yMax: 252, xMin: 230, xMax: 300 }, slot: [233.6, 310.2], absY: 232.56, dy: 0 },
    { get: sigDate, page: 2, text: "Date:", region: { yMin: 216, yMax: 222, xMin: 230, xMax: 300 }, slot: [233.6, 310.2], absY: 203.11, dy: 0 },
  ],
  check: [
    // The printed box glyph sits at x≈515.3-520.3 (center 517.8) for both rows.
    { on: (r) => r.banking.accountType === "checking", page: 1, text: "CHECKING", box: [516.4, 518.8, 419.03, 422.03] },
    { on: (r) => r.banking.accountType === "savings", page: 1, text: "SAVINGS", box: [516.4, 518.8, 405.19, 408.19] },
    { on: (r) => r.serviceAcceptance.discountPlan === "flat", page: 1, text: "Flat Rate", box: [28.6, 32, 225.91, 229.31] },
    { on: (r) => r.serviceAcceptance.discountPlan === "passthrough", page: 1, text: "Passthrough IC", box: [28.6, 32, 241.19, 244.59] },
    { on: (r) => r.serviceAcceptance.assessments === "included", page: 1, text: "INCLUDED", box: [127.99, 131.39, 211.11, 214.51] },
    { on: (r) => r.serviceAcceptance.assessments === "billed", page: 1, text: "BILLED SEPERATELY", box: [178.31, 181.71, 211.11, 214.51] },
    { on: (r) => r.serviceAcceptance.paymentMethod === "daily", page: 1, text: "DAILY", box: [442.75, 446.15, 211.11, 214.51] },
    { on: (r) => r.serviceAcceptance.paymentMethod === "monthly", page: 1, text: "MONTHLY", region: { yMin: 205, yMax: 215 }, box: [479.51, 482.91, 211.11, 214.51] },
    // Requested card types (boxes left of each label on the y≈270 row, centered)
    { on: (r) => r.serviceAcceptance.cardVisaCredit, page: 1, text: "VISA CREDIT", region: { yMin: 268, yMax: 273 }, box: [104.2, 107.6, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardVisaDebit, page: 1, text: "VISA DEBIT", region: { yMin: 268, yMax: 273 }, box: [155.9, 159.3, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardMcCredit, page: 1, text: "MASTERCARD CREDIT", region: { yMin: 268, yMax: 273 }, box: [204.2, 207.6, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardMcDebit, page: 1, text: "MASTERCARD DEBIT", region: { yMin: 268, yMax: 273 }, box: [279.8, 283.6, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardDiscover, page: 1, text: "DISCOVER", region: { yMin: 268, yMax: 273 }, box: [351.8, 355.2, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardAmex, page: 1, text: "AMERICAN EXPRESS", region: { yMin: 268, yMax: 273 }, box: [398.2, 401.6, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardPin, page: 1, text: "PIN DEBIT", region: { yMin: 268, yMax: 273 }, box: [470.2, 473.6, 270.75, 274.15] },
    { on: (r) => r.serviceAcceptance.cardEbt, page: 1, text: "EBT", region: { yMin: 268, yMax: 273 }, box: [515.1, 518.5, 270.75, 274.15] },
    // Type of Organization — boxes sit left of each label (one row, y≈592.7). The
    // free-text organizationType is matched to one of the six printed options.
    { on: (r) => /sole|individual|propriet/.test(orgType(r)), page: 1, text: "Sole Prop", region: { yMin: 589, yMax: 596 }, box: [28.7, 32.1, 593.55, 596.95] },
    { on: (r) => /partner/.test(orgType(r)) && !/ll[cp]|limited liab/.test(orgType(r)), page: 1, text: "Partnership", region: { yMin: 589, yMax: 596 }, box: [94.6, 98.2, 593.55, 596.95] },
    { on: (r) => /corp|\binc\b|incorporated/.test(orgType(r)) && !/ll[cp]|limited liab|non.?profit|501|govern|municip/.test(orgType(r)), page: 1, text: "Corporation", region: { yMin: 589, yMax: 596 }, box: [137.9, 141.3, 593.55, 596.95] },
    { on: (r) => /ll[cp]|limited liab/.test(orgType(r)), page: 1, text: "LLC", region: { yMin: 589, yMax: 596 }, box: [182.6, 186.4, 593.55, 596.95] },
    { on: (r) => /non.?profit|501/.test(orgType(r)), page: 1, text: "Non-Profit", region: { yMin: 589, yMax: 596 }, box: [204.7, 208.1, 593.55, 596.95] },
    { on: (r) => /govern|municip/.test(orgType(r)), page: 1, text: "Government", region: { yMin: 589, yMax: 596 }, box: [300.2, 303.6, 593.55, 596.95] },
    // Seasonal merchant — mark "Yes" only when flagged (single review checkbox).
    { on: isSeasonal, page: 1, text: "SEASONAL MERCHANT", box: [99, 102.4, 304.35, 307.75] },
    // …and "No" when not seasonal (on a form with anything on it — see formHasContent)
    { on: (r) => !isSeasonal(r) && formHasContent(merrick, r), seasonNo: true, page: 1, text: "SEASONAL MERCHANT", box: [125.9, 129.3, 304.35, 307.75] },
    // …and its high-volume / active months (any one checked also makes it seasonal)
    ...MERRICK_MONTHS.map(([m, left, right]) => ({ on: (r) => Boolean(r.pathward?.[m]), page: 1, text: "SEASONAL MERCHANT", box: [left, right, 296.7, 300.1] })),
  ],
  // Owner #1 "Sign Now" signature spots — both on page 2 (last page), left side:
  // the Guaranty "Principal #1" box and the Acceptance "Principal #1" box. Each is
  // centered in its box, below the "Principal #1:" caption.
  sign: [
    { page: 2, x: 24.4, y: 527.6, maxW: 207, maxH: 19.2, center: true, middle: true },
    { page: 2, x: 24.4, y: 226.8, maxW: 207, maxH: 19.2, center: true, middle: true },
  ],
};

/* ----------------------------- Coversheet ----------------------------- */
// Header value lines start at x=380; merchant-info lines start at x=60.
const cs = (r) => r.coversheet || {};
// Only equipment items flagged "Add to Cover Sheet" appear here, packed into the
// coversheet's three equipment rows in order.
const csEquip = (r) => (r.equipment || []).filter((e) => e && e.onCoversheet && (e.model || e.type));
const coversheet = {
  text: [
    // Header
    { get: (r) => r.sales.salesAgentName || r.sales.salesRep, page: 1, text: "Sales Partner Name:", slot: [380.4, 586.8], absY: 721.56, dy: 0 },
    { get: (r) => cs(r).territoryManager, page: 1, text: "Territory Manager:", slot: [380.4, 586.8], absY: 702, dy: 0 },
    { get: (r) => teamName(cs(r).teamColor), page: 1, text: "Team Color:", slot: [380.4, 586.8], absY: 682.44, dy: 0 },
    { get: (r) => r._date, page: 1, text: "Date:", region: { xMin: 260 }, slot: [380.4, 586.8], absY: 662.88, dy: 0 },
    // Merchant info
    { get: (r) => r.business.dba, page: 1, text: "DBA:", slot: [59.6, 266.4], absY: 623.52, dy: 0 },
    { get: (r) => r.business.email, page: 1, text: "Email:", region: { xMax: 120 }, slot: [59.6, 266], absY: 609, dy: 0 },
    { get: (r) => r.business.federalTaxId, page: 1, text: "Tax ID:", slot: [59.6, 266], absY: 594.48, dy: 0 },
    { get: (r) => r.owners[0].ssn, page: 1, text: "SSN:", region: { xMax: 120 }, slot: [59.6, 266.4], absY: 579.96, dy: 0 },
    // Boarding ($ amounts, anchored to each printed "$")
    { get: (r) => raw(cs(r).etf), page: 1, text: "$", region: { yMin: 511, yMax: 519, xMin: 160, xMax: 172 }, slot: [171.2, 266], absY: 515.4, dy: 0 },
    { get: (r) => raw(cs(r).annualFee), page: 1, text: "$", region: { yMin: 497, yMax: 505, xMin: 160, xMax: 172 }, slot: [171.2, 266], absY: 500.88, dy: 0 },
    { get: (r) => raw(cs(r).monthlyMin), page: 1, text: "$", region: { yMin: 482, yMax: 490, xMin: 160, xMax: 172 }, slot: [171.2, 266.4], absY: 486.36, dy: 0 },
    { get: (r) => raw(cs(r).svcFee), page: 1, text: "$", region: { yMin: 468, yMax: 476, xMin: 160, xMax: 172 }, slot: [171.2, 266], absY: 471.84, dy: 0 },
    { get: (r) => cs(r).cashDiscountTerminalRate, page: 1, text: "Cash Discount Terminal Rate", slot: [162.8, 266.4], absY: 443.76, dy: 0 },
    // Equipment rows (model + quantity) — only items checked "Add to Cover Sheet",
    // packed in order. Row 1 is the top row (y≈378).
    { get: (r) => (csEquip(r)[0] || {}).model || "", page: 1, text: "Model:", region: { yMin: 374, yMax: 382 }, slot: [59.6, 272], absY: 378.24, dy: 0 },
    { get: (r) => (csEquip(r)[0] || {}).quantity || "", page: 1, text: "Quantity:", region: { yMin: 374, yMax: 382 }, slot: [323.2, 375.2], absY: 378.24, dy: 0 },
    { get: (r) => (csEquip(r)[1] || {}).model || "", page: 1, text: "Model:", region: { yMin: 331, yMax: 339 }, slot: [59.6, 272], absY: 334.92, dy: 0 },
    { get: (r) => (csEquip(r)[1] || {}).quantity || "", page: 1, text: "Quantity:", region: { yMin: 331, yMax: 339 }, slot: [323.2, 375.2], absY: 334.92, dy: 0 },
    { get: (r) => (csEquip(r)[2] || {}).model || "", page: 1, text: "Model:", region: { yMin: 286, yMax: 294 }, slot: [59.6, 271.6], absY: 289.68, dy: 0 },
    { get: (r) => (csEquip(r)[2] || {}).quantity || "", page: 1, text: "Quantity:", region: { yMin: 286, yMax: 294 }, slot: [323.2, 374.8], absY: 289.68, dy: 0 },
    // File build / enablements / special prompts (text bits)
    { get: (r) => cs(r).fnsNumber, page: 1, text: "FNS #:", slot: [427.2, 535.2], absY: 275.16, dy: 0 },
    { get: (r) => cs(r).autoCloseTime, page: 1, text: "Time:", region: { yMin: 224, yMax: 232, xMin: 480 }, slot: [513.2, 567.6], absY: 228.3, dy: 0 },
    // "Other:" fill-ins (disambiguated by region)
    { get: (r) => cs(r).platformOther, page: 1, text: "Other:", region: { yMin: 561, yMax: 569, xMin: 430 }, slot: [465.2, 534.4], absY: 565.9, dy: 0 },
    { get: (r) => cs(r).shippingOther, page: 1, text: "Other:", region: { yMin: 482, yMax: 490, xMin: 270, xMax: 330 }, slot: [301.2, 410.3], absY: 486.36, dy: 0, wrap: { y: [486.36, 470.1, 455.7], slots: [[301.2, 410.3], [271.6, 427.2], [271.6, 427.2]] } },
    { get: (r) => cs(r).specialOther, page: 1, text: "Other:", region: { yMin: 181, yMax: 189, xMin: 480 }, slot: [514, 586.8], absY: 184.68, dy: 0, wrap: { y: [184.68, 168.1, 153.7], slots: [[514, 586.8], [484.4, 586.8], [484.4, 586.8]] } },
    // Notes and Special Instructions (user-entered, on the blank line below the header)
    { get: (r) => cs(r).notes, page: 1, text: "Notes and Special Instructions:", slot: [18.4, 586.8], absY: 101.5, dy: 0, wrap: { y: [101.5, 73.9, 46.3], slots: [[18.4, 586.8], [18.4, 586.8], [18.4, 586.8]] } },
  ],
  check: [
    // All boxes centered on the detected box mid-points (center: true).
    // Document checklist (boxes x≈412)
    { on: (r) => r.documents.hasVoidedCheck, page: 1, text: "Voided Check", box: [407.4, 416, 609.07, 617.67] },
    { on: (r) => r.documents.hasDriversLicense, page: 1, text: "Drivers License", box: [407.4, 416, 594.75, 602.95] },
    { on: (r) => cs(r).docPictures, page: 1, text: "Pictures Inside", box: [407.4, 416, 580.23, 588.83] },
    { on: (r) => cs(r).docStatements, page: 1, text: "Statements", box: [407.4, 416, 565.51, 573.71] },
    // Telemarketing / Re-Board (Yes x≈170.5 / No x≈219)
    { on: (r) => cs(r).telemarketing, page: 1, text: "Telemarketing Lead", box: [166.3, 174.9, 565.15, 573.75] },
    { on: (r) => !cs(r).telemarketing, page: 1, text: "Telemarketing Lead", box: [214.6, 223.2, 565.15, 573.75] },
    { on: (r) => cs(r).reBoard, page: 1, text: "Re-Board", box: [166.3, 174.9, 549.83, 558.43] },
    { on: (r) => !cs(r).reBoard, page: 1, text: "Re-Board", box: [214.6, 223.2, 549.83, 558.43] },
    // Requested platform (boxes far right x≈568)
    { on: (r) => cs(r).platform === "tsys", page: 1, text: "TSYS", box: [563.4, 572, 610.33, 618.53] },
    { on: (r) => cs(r).platform === "fdomaha", page: 1, text: "FD Omaha", box: [563.4, 572, 593.99, 602.19] },
    { on: (r) => cs(r).platform === "fdnorth", page: 1, text: "FD North", box: [563.4, 572, 579.95, 588.55] },
    { on: (r) => cs(r).platform === "other", page: 1, text: "Other:", region: { yMin: 561, yMax: 569, xMin: 430 }, box: [563.4, 572, 566.31, 574.91] },
    // Boarding Yes/No
    { on: (r) => cs(r).cashDiscount, page: 1, text: "Cash Discount:", region: { yMin: 453, yMax: 461 }, box: [98.3, 106.9, 455.99, 464.99] },
    { on: (r) => !cs(r).cashDiscount, page: 1, text: "Cash Discount:", region: { yMin: 453, yMax: 461 }, box: [145.5, 154.1, 455.99, 464.99] },
    { on: (r) => cs(r).bypassFee, page: 1, text: "Bypass Fee", box: [121.5, 130.1, 428.35, 437.35] },
    { on: (r) => !cs(r).bypassFee, page: 1, text: "Bypass Fee", box: [168.6, 177.2, 428.35, 437.35] },
    // Shipping (boxes x≈416)
    { on: (r) => cs(r).shipping === "dba", page: 1, text: "DBA Address", box: [411.4, 419.6, 515.47, 524.07] },
    { on: (r) => cs(r).shipping === "agent", page: 1, text: "Sales Agent Address", box: [411.4, 419.6, 501.15, 509.75] },
    { on: (r) => cs(r).shipping === "other", page: 1, text: "Other:", region: { yMin: 482, yMax: 490, xMin: 270, xMax: 330 }, box: [411.4, 419.6, 485.83, 494.43] },
    // Value added services (boxes far right x≈568)
    { on: (r) => cs(r).vasGiftCards, page: 1, text: "Gift Cards", box: [564.2, 572.8, 514.27, 522.87] },
    { on: (r) => cs(r).vasCheckServices, page: 1, text: "Check Services", box: [564.2, 572.8, 499.95, 508.55] },
    { on: (r) => cs(r).vasWpiRewards, page: 1, text: "WPI Rewards", box: [564.2, 572.8, 486.63, 495.23] },
    { on: (r) => cs(r).vasCustomerConnect, page: 1, text: "Customer Connect", box: [564.2, 572.8, 473.51, 481.71] },
    // File build — application type (boxes x≈470) + connection type (x≈568)
    { on: (r) => cs(r).fbAppType === "retail", page: 1, text: "Retail", box: [465.4, 473.6, 378.71, 387.31] },
    { on: (r) => cs(r).fbAppType === "restaurant", page: 1, text: "Restaurant", box: [465.4, 473.6, 363.99, 372.19] },
    { on: (r) => cs(r).fbAppType === "ecommerce", page: 1, text: "E-Commerce", box: [465.4, 473.6, 349.47, 358.07] },
    { on: (r) => cs(r).fbAppType === "moto", page: 1, text: "Moto", box: [465.4, 473.6, 334.39, 342.99] },
    { on: (r) => cs(r).fbConnection === "ethernet", page: 1, text: "Ethernet", box: [562.6, 571.2, 378.71, 387.31] },
    { on: (r) => cs(r).fbConnection === "dial", page: 1, text: "Dial", box: [562.6, 571.2, 363.99, 372.19] },
    { on: (r) => cs(r).fbConnection === "wifi", page: 1, text: "Wifi", box: [562.6, 571.2, 349.47, 358.07] },
    { on: (r) => cs(r).fbConnection === "wireless", page: 1, text: "Wireless 3g/4g", box: [562.6, 571.2, 334.39, 342.99] },
    // Enablements (boxes far right x≈568)
    { on: (r) => cs(r).enPinDebit, page: 1, text: "Pin Debit", region: { yMin: 300, yMax: 308 }, box: [562.6, 571.2, 304.67, 313.27] },
    { on: (r) => cs(r).enEbt, page: 1, text: "EBT", region: { yMin: 286, yMax: 294 }, box: [562.6, 571.2, 289.43, 298.03] },
    { on: (r) => cs(r).enWex, page: 1, text: "Wex/Voyager", box: [562.6, 571.2, 261.19, 269.39] },
    // Special prompts — auto close / server / avs / invoice (boxes x≈459)
    { on: (r) => cs(r).autoClose, page: 1, text: "Auto Close", box: [453.8, 462.4, 227.47, 236.07] },
    { on: (r) => cs(r).timezone === "pst", page: 1, text: "PST", box: [431.5, 440.1, 213.03, 222.03] },
    { on: (r) => cs(r).timezone === "mst", page: 1, text: "MST", box: [464.3, 472.9, 213.59, 222.19] },
    { on: (r) => cs(r).timezone === "cst", page: 1, text: "CST", box: [503.5, 512.1, 213.59, 222.19] },
    { on: (r) => cs(r).timezone === "est", page: 1, text: "EST", exact: true, box: [537.5, 545.7, 213.59, 222.19] },
    { on: (r) => cs(r).tips === "none", page: 1, text: "None", box: [426.6, 435.2, 198.35, 206.95] },
    { on: (r) => cs(r).tips === "tipline", page: 1, text: "Tip Line", box: [467.9, 476.5, 198.7, 207.3] },
    { on: (r) => cs(r).tips === "tipprompt", page: 1, text: "Tip Prompt", box: [515.5, 524.1, 198.7, 207.3] },
    { on: (r) => cs(r).serverNumbers, page: 1, text: "Server #", box: [453.8, 462.4, 183.15, 191.75] },
    { on: (r) => cs(r).avsCvv, page: 1, text: "AVS/CVV", box: [453.8, 462.4, 168.63, 177.23] },
    { on: (r) => cs(r).invoiceNumber, page: 1, text: "Invoice #", box: [453.8, 462.4, 153.91, 162.51] },
    // Equipment acquisition per row — ☐ Free ☐ Existing ☐ PO ☐ Rental ☐ Lease: the
    // measured box of each option on each of the three equipment rows.
    ...[
      [[27.5, 36.1], [65.5, 74.1], [118.7, 127.3], [191.5, 200.1], [282.3, 290.9], [357.97, 366.57]],
      [[27.1, 35.7], [65.1, 73.7], [118.3, 126.9], [191.1, 199.7], [281.9, 290.5], [313.97, 322.57]],
      [[26.7, 35.3], [64.7, 73.3], [117.9, 126.5], [191.1, 199.7], [281.5, 290.1], [269.57, 278.17]],
    ].flatMap((row, i) => {
      const [b0, b1] = row[5];
      return ["free", "existing", "po", "rental", "lease"].map((val, k) => ({
        on: (r) => (csEquip(r)[i] || {}).acquisition === val,
        page: 1, text: ["Free", "Existing", "PO", "Rental", "Lease"][k], region: { yMin: b0 - 6, yMax: b1 + 2 }, box: [row[k][0], row[k][1], b0, b1],
      }));
    }),
  ],
};

function ownLen(r) {
  const y = r.business.lengthOwnershipYears;
  const m = r.business.lengthOwnershipMonths;
  if (y && m) return `${y} yr ${m} mo`;
  if (y) return `${y} yr`;
  return r.business.businessStarted || "";
}

/* ----------------------------- Purchase Order ----------------------------- */
const po = (r) => r.po || {};
const eqItem = (r, i) => (r.equipment || [])[i] || {};
const eqHas = (r, i) => Boolean(eqItem(r, i).model || eqItem(r, i).type);
const eqName = (r, i) => {
  const e = eqItem(r, i);
  return [e.model, e.type && e.type !== e.model ? `(${e.type})` : ""].filter(Boolean).join(" ").trim();
};
function poSubtotal(r) {
  let s = 0;
  for (let i = 0; i < (r.equipment || []).length; i++) {
    if (!eqHas(r, i)) continue;
    const p = priceFor(eqItem(r, i).model || eqItem(r, i).type);
    // An explicit quantity of 0 zeroes the line; blank/garbage defaults to 1.
    const q = parseFloat(eqItem(r, i).quantity);
    s += (p ? p.price : 0) * (Number.isFinite(q) ? q : 1);
  }
  return s;
}
// User-entered dollar amounts may carry "$", commas, or spaces ("$1,250.50");
// strip them so the printed line and the computed total always agree.
const numOf = (v) => parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
const poTotal = (r) => poSubtotal(r) + (numOf(po(r).shCost) || 0) + (numOf(po(r).salesTax) || 0);
// Currency: round to cents and drop a trailing ".00" so totals never show binary
// float noise (e.g. 850 + 0.1 + 0.2 -> "850.30", not "850.3000000000001").
const money = (n) => { const r = Math.round((Number(n) || 0) * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2); };
// Print a cleaned dollar figure next to the template's preprinted "$" (no doubled
// symbols); non-numeric entries print as typed and add nothing to the total.
const moneyStr = (v) => { const n = numOf(v); return Number.isFinite(n) ? money(n) : raw(v); };
const poAddress = (r) => {
  const b = r.business;
  return [b.locationAddress, [b.locationCity, b.locationState].filter(Boolean).join(", "), b.locationZip].filter(Boolean).join("  ");
};
// Equipment table rows: baselines centered in each row, and the four column cells
// (between the table's vertical rules) that each value is centered in.
// Equipment table rows: baselines centered in each row, and the four column cells
// (between the table's vertical rules) that each value is centered in.
const ROWY = [559.06, 541.66, 524.26, 506.86];
const PO_COLS = [[56.3, 232.1], [232.1, 332.9], [332.9, 419.3], [419.3, 536.1]];

const purchase_order = {
  text: [
    { get: (r) => po(r).mid, page: 1, text: "Merchant MID:", slot: [130, 331.4], absY: 682.32, dy: 0 },
    { get: (r) => r._date, page: 1, text: "Date:", region: { yMin: 678, yMax: 686 }, slot: [361.2, 418.2], absY: 682.32, dy: 0 },
    { get: (r) => teamName(po(r).team || cs(r).teamColor), page: 1, text: "Team:", slot: [451.2, 534.9], absY: 682.32, dy: 0 },
    { get: (r) => r.business.dba, page: 1, text: "Merchant DBA:", slot: [130.4, 331.7], absY: 664.92, dy: 0 },
    { get: (r) => r.sales.salesAgentName || r.sales.salesRep, page: 1, text: "Sales Rep:", slot: [382.8, 534.6], absY: 664.92, dy: 0 },
    { get: (r) => r.business.phone, page: 1, text: "Phone Number:", slot: [132.1, 331.6], absY: 647.52, dy: 0 },
    { get: (r) => po(r).salesManager || cs(r).territoryManager, page: 1, text: "Sales Manager:", slot: [406.1, 534.8], absY: 647.52, dy: 0 },
    { get: (r) => poAddress(r), page: 1, text: "Address:", slot: [100, 534.9], absY: 630.12, dy: 0 },
    // Equipment line items (model | bill to | qty | price)
    ...ROWY.flatMap((y, i) => [
      { get: (r) => (eqHas(r, i) ? eqName(r, i) : ""), page: 1, text: "Equipment Type", slot: PO_COLS[0], absY: y, dy: 0 },
      { get: (r) => (eqHas(r, i) ? po(r).billTo || "Merchant" : ""), page: 1, text: "Bill To", slot: PO_COLS[1], absY: y, dy: 0 },
      { get: (r) => (eqHas(r, i) ? eqItem(r, i).quantity || "1" : ""), page: 1, text: "Quantity", slot: PO_COLS[2], absY: y, dy: 0 },
      { get: (r) => { if (!eqHas(r, i)) return ""; const p = priceFor(eqItem(r, i).model || eqItem(r, i).type); return p ? `$${p.price}` : ""; }, page: 1, text: "Price", slot: PO_COLS[3], absY: y, dy: 0 },
    ]),
    { get: (r) => (poSubtotal(r) ? money(poSubtotal(r)) : ""), page: 1, text: "Sub Total: $", slot: [479.2, 534.9], absY: 435.12, dy: 0 },
    // Shipping
    { get: (r) => po(r).shAttention || r.business.contactName || r.business.dba, page: 1, text: "Attention To:", slot: [121.2, 231], absY: 396.72, dy: 0 },
    { get: (r) => po(r).shipStreet || r.business.locationAddress, page: 1, text: "Street Address:", slot: [130.4, 534.9], absY: 379.32, dy: 0 },
    { get: (r) => po(r).shipCity || r.business.locationCity, page: 1, text: "City:", region: { yMin: 358, yMax: 366 }, slot: [80.9, 231.2], absY: 361.92, dy: 0 },
    { get: (r) => po(r).shipState || r.business.locationState, page: 1, text: "State:", region: { yMin: 341, yMax: 349 }, slot: [86.9, 231.2], absY: 344.52, dy: 0 },
    { get: (r) => po(r).shipZip || r.business.locationZip, page: 1, text: "Zip:", region: { yMin: 323, yMax: 331 }, slot: [77, 231.3], absY: 327.12, dy: 0 },
    // Billing (ACH from the voided check) — suppressed when paying by Credit Card.
    { get: (r) => (po(r).billingType === "cc" ? "" : r.banking.routing), page: 1, text: "Routing:", slot: [328.4, 534.7], absY: 205.32, dy: 0 },
    { get: (r) => (po(r).billingType === "cc" ? "" : raw(r.banking.account)), page: 1, text: "Account #:", slot: [338.4, 534.9], absY: 187.92, dy: 0 },
    { get: (r) => (po(r).billingType === "cc" ? "" : r.business.legalName || r.business.dba), page: 1, text: "Name on Account:", slot: [374.1, 534.8], absY: 170.52, dy: 0 },
    { get: (r) => (po(r).billingType === "cc" ? "" : r.banking.bankName), page: 1, text: "Name of Bank:", slot: [357.2, 534.6], absY: 155.28, dy: 0 },
    { get: (r) => (raw(po(r).shCost) ? moneyStr(po(r).shCost) : ""), page: 1, text: "S&H Cost: $", slot: [478.8, 535], absY: 137.88, dy: 0 },
    { get: (r) => (raw(po(r).salesTax) ? moneyStr(po(r).salesTax) : ""), page: 1, text: "Sales Tax: $", slot: [478, 534.6], absY: 120.48, dy: 0 },
    { get: (r) => (poTotal(r) ? money(poTotal(r)) : ""), page: 1, text: "Total Amount", slot: [427.1, 534.7], absY: 76, dy: 0 },
  ],
  check: [
    // All boxes centered on detected box mid-points; dy raises the mark to the box's vertical center.
    { on: (r) => po(r).payPlan === "3pay", page: 1, text: "3 Pay*", box: [93.9, 102.5, 436.69, 445.29] },
    { on: (r) => po(r).payPlan === "4pay", page: 1, text: "4 Pay*", box: [150.3, 158.9, 436.61, 445.21] },
    { on: (r) => (po(r).shipTo || "dba") === "dba", page: 1, text: "Merchant DBA", region: { yMin: 391, yMax: 403 }, box: [286.6, 295.2, 396.69, 405.29] },
    { on: (r) => po(r).shipTo === "rep", page: 1, text: "Sales Rep", region: { yMin: 391, yMax: 403 }, box: [384.6, 393.2, 396.69, 405.29] },
    { on: (r) => po(r).shipTo === "other", page: 1, text: "Other", region: { yMin: 391, yMax: 403 }, box: [475.1, 483.7, 397.09, 405.69] },
    { on: (r) => (po(r).shippingMethod || "ground") === "ground", page: 1, text: "Ground:", box: [238.3, 246.9, 362.69, 371.29] },
    { on: (r) => po(r).shippingMethod === "2day", page: 1, text: "2 Day:", box: [238.3, 246.9, 345.41, 354.01] },
    { on: (r) => po(r).shippingMethod === "overnight", page: 1, text: "Overnight:", box: [238.3, 246.9, 327.81, 336.41] },
    { on: (r) => po(r).billingType === "cc", page: 1, text: "Credit Card", box: [61.5, 70.1, 222.61, 231.21] },
    { on: (r) => (po(r).billingType || "ach") === "ach", page: 1, text: "ACH", region: { yMin: 219, yMax: 227 }, box: [293.1, 301.7, 222.61, 231.21] },
  ],
  // Owner #1 "Sign Now" signature — the merchant's "Authorizing Signature" line.
  // (The "2nd Authorizing Signature" and "WPI Authorized Signature" lines are left blank.)
  sign: [
    { page: 1, x: 164, y: 89.5, maxW: 167, maxH: 26.8, center: true, middle: true },
  ],
};

/* ----------------------------- Clover Addendum ----------------------------- */
const clover_addendum = {
  text: [
    { get: (r) => r.business.legalName || r.business.dba, page: 1, text: "Business Legal Name", slot: [145.6, 250.8], absY: 204.1, dy: 0 },
    { get: (r) => po(r).mid, page: 1, text: "Frontend Platform:", slot: [376.9, 576.2], absY: 184, dy: 0 },
    { get: sigName, page: 1, text: "Name:", region: { yMin: 146, yMax: 154 }, slot: [72.8, 257.6], absY: 150.5, dy: 0 },
    { get: sigTitle, page: 1, text: "Title:", slot: [64.8, 257.6], absY: 123.7, dy: 0 },
    { get: sigDate, page: 1, text: "Date:", region: { yMin: 93, yMax: 101 }, slot: [67.2, 257.6], absY: 97.3, dy: 0 },
    { get: (r) => r.business.email, page: 1, text: "Email:", region: { yMin: 201, yMax: 209 }, slot: [377.2, 573.2], absY: 205.2, dy: 0 },
  ],
  check: [
    // No printed checkbox on this row — mark an "X" hugging the chosen platform word.
    { on: (r) => (po(r).frontendPlatform || "omaha") === "omaha", page: 1, text: "Omaha", region: { yMin: 154, yMax: 162 }, dx: -9 },
    { on: (r) => po(r).frontendPlatform === "nashville", page: 1, text: "Nashville", region: { yMin: 154, yMax: 162 }, dx: -9 },
  ],
  // Owner #1 "Sign Now" signature — the "Signature:" line above Name/Title/Date.
  sign: [
    { page: 1, x: 97.6, y: 174.3, maxW: 157.6, maxH: 22, center: true },
  ],
};

/* ----------------------- Bank Account Change Request ----------------------- */
const bc = (r) => r.bankChange || {};
const bcAddress = (r) => {
  const b = r.business;
  return [b.locationAddress, [b.locationCity, b.locationState].filter(Boolean).join(", "), b.locationZip].filter(Boolean).join("  ");
};
const bank_change = {
  text: [
    // Merchant account information (reuses the application's merchant data)
    { get: (r) => r._date, page: 1, text: "DATE:", region: { yMin: 679, yMax: 687 }, slot: [108.4, 241.9], absY: 683.26, dy: 0 },
    { get: (r) => bc(r).merchantId || po(r).mid, page: 1, text: "MERCHANT ID NUMBER:", slot: [368.1, 538.8], absY: 683.26, dy: 0 },
    { get: (r) => full(r.owners[0]), page: 1, text: "ACCOUNT OWNER", slot: [212.9, 538.8], absY: 664.3, dy: 0 },
    { get: (r) => r.business.legalName || r.business.dba, page: 1, text: "BUSINESS NAME:", slot: [164.1, 538.8], absY: 641.62, dy: 0 },
    { get: (r) => bcAddress(r), page: 1, text: "BUSINESS ADDRESS:", slot: [183.6, 538.8], absY: 619.18, dy: 0 },
    { get: (r) => r.business.phone, page: 1, text: "PHONE NUMBER:", slot: [163.5, 539], absY: 593.86, dy: 0 },
    // Funding account (left column) vs Billing account (right column) — same labels,
    // disambiguated by x-region.
    { get: (r) => bc(r).fundBankName, page: 1, text: "BANK NAME:", region: { xMax: 300, yMin: 515, yMax: 523 }, slot: [140.7, 304.6], absY: 519.31, dy: 0 },
    { get: (r) => bc(r).fundRouting, page: 1, text: "ROUTING NUMBER:", region: { xMax: 300, yMin: 492, yMax: 500 }, slot: [174, 304.7], absY: 495.67, dy: 0 },
    { get: (r) => bc(r).fundAccount, page: 1, text: "ACCOUNT NUMBER:", region: { xMax: 300, yMin: 469, yMax: 477 }, slot: [177.4, 304.9], absY: 473.23, dy: 0 },
    { get: (r) => bc(r).billBankName, page: 1, text: "BANK NAME:", region: { xMin: 305, yMin: 515, yMax: 523 }, slot: [374.5, 538.8], absY: 519.31, dy: 0 },
    { get: (r) => bc(r).billRouting, page: 1, text: "ROUTING NUMBER:", region: { xMin: 305, yMin: 492, yMax: 500 }, slot: [407.8, 538.9], absY: 495.67, dy: 0 },
    { get: (r) => bc(r).billAccount, page: 1, text: "ACCOUNT NUMBER:", region: { xMin: 305, yMin: 469, yMax: 477 }, slot: [411.2, 538.7], absY: 473.23, dy: 0 },
  ],
  check: [
    // Business-address checkboxes (one row, y≈612)
    { on: (r) => bc(r).addrMatchesFile, page: 1, text: "Matches what is on file", box: [203.4, 206.4, 612.27, 615.67] },
    { on: (r) => bc(r).addrChangeLegal, page: 1, text: "Legal Entity address", box: [360.8, 363.6, 612.27, 615.67] },
    { on: (r) => bc(r).addrChangeDba, page: 1, text: "address on file, check here", box: [526.4, 529.2, 612.27, 615.67] },
    // TSYS-only: settle chargebacks/reversals to the funding account
    { on: (r) => bc(r).settleChargebacksToFunding, page: 1, text: "By selecting here", box: [79, 84.8, 447.07, 453.27] },
    // Validation documents provided (y≈409)
    { on: (r) => bc(r).docVoidedCheck, page: 1, text: "VOIDED CHECK", box: [79, 87.2, 401.87, 410.07] },
    { on: (r) => bc(r).docBankLetter, page: 1, text: "BANK LETTER", region: { yMin: 398, yMax: 406 }, box: [234.6, 242.8, 401.87, 410.07] },
    { on: (r) => bc(r).docBankStatement, page: 1, text: "BANK STATEMENT", region: { yMin: 398, yMax: 406 }, box: [390.6, 398.8, 401.87, 410.07] },
  ],
  // Owner #1 "Sign Now" signature — the "Merchant Owner's Signature:" line.
  sign: [
    { page: 1, x: 228, y: 111.9, maxW: 310, maxH: 24, center: true },
  ],
};

// FD North (Priority / Synovus Bank) uses a template that is layout-identical to the
// Citizens application across all three pages, so it reuses the Citizens field map
// verbatim (verified: every Citizens anchor resolves at the same coordinates on FD North).
// NOTE for future audits: the FD North PDF'S TEXT LAYER contains invisible amounts in
// several fee cells (Chargeback "25", Retrieval "10", ACH Reject "30", Annual "95",
// ETF "295", TIN "$49") — leftover artifacts that do NOT rasterize; the cells are
// visually blank on the rendered template, so filling them is correct. A text-layer
// overlap there is a false positive, not an overprint.
const fd_north = citizens;


/* ================= PB&T Bank (Priority PPS0622v3, 6 pages) ================= */
// Priority "Merchant Processing Application and Agreement" for The Pueblo Bank
// and Trust Company (PB&T Bank). Its own 6-page layout — not shared with any
// other template. Labels in this PDF are fragmented into word-pieces, so specs
// anchor on a distinctive fragment plus a tight region.
// Two-letter state for PB&T's small state boxes (a typed full name would not fit).
const US_STATES = { alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY" };
const stAbbr = (v) => { const s = raw(v); return US_STATES[s.toLowerCase().replace(/\./g, "").trim()] || s; };
const own = (r, i) => (r.owners || [])[i] || {};
const csz = (o) => [ [o.city, o.state].filter(Boolean).join(", "), o.zip ].filter(Boolean).join(" ");
const eqCat = (m) => { const p = priceFor(m); if (!p) return ""; const hit = MODELS.find((x) => x.model === p.model); return hit ? hit.category : ""; };
const bizType = (r) => raw(r.business.businessType).toLowerCase();
// PB&T business-type boxes: regex per printed option; unmatched non-empty -> Other.
const BIZ_RULES = [
  // [pattern, printed option, measured box [left, right, bottom, top]]
  [/retail/, "Retail", [97.5, 104.1, 282.67, 289.27]],
  [/restaurant|cafe|diner/, "Restaurant", [164.7, 172.5, 282.67, 288.87]],
  [/internet|e-?comm|online|web/, "Internet", [219.9, 227.7, 282.67, 288.87]],
  [/government|municip/, "Government", [285.9, 294.1, 281.87, 288.47]],
  [/lodging|hotel|motel/, "Lodging", [349.8, 358, 282.27, 287.67]],
  [/supermarket|grocery/, "Supermarket", [395.8, 404.4, 281.87, 288.47]],
  [/mail|telephone order|moto/, "Mail/Telephone Order", [489.8, 498, 282.67, 288.47]],
  [/petroleum|gas|fuel/, "Petroleum", [97.1, 104.9, 265.47, 272.07]],
  [/utilit/, "Utilities", [164, 171.8, 265.47, 273.27]],
  [/health|medical|clinic|dental/, "Healthcare", [217.8, 226, 265.47, 272.47]],
  [/education|school|tutor/, "Education", [285.9, 294.9, 265.47, 272.87]],
  [/qsr|quick serve|fast food/, "QSR", [350.6, 358.8, 265.87, 272.47]],
  [/charity|non.?profit/, "Charity/Non Profit", [396.6, 404.8, 265.87, 272.87]],
  [/b2b|business to business|wholesale/, "B2B", [491.5, 498.9, 265.87, 272.47]],
];
const bizMatched = (r) => BIZ_RULES.some(([re]) => re.test(bizType(r)));
const pbtLenOwn = (r) => {
  const y = raw(r.business.lengthOwnershipYears), m = raw(r.business.lengthOwnershipMonths);
  return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(" ");
};
const pbt = {
  text: [
    /* ---- p1 header ---- */
    { get: (r) => raw(r.sales.salesAgentName) || raw(r.sales.salesRep), page: 1, text: "Sales Rep Name", slot: [201.6, 305.2], absY: 727.32, dy: 0 },
    { get: sigDate, page: 1, text: "Application Date", slot: [380.8, 486.4], absY: 727.32, dy: 0 },
    /* ---- p1 sections 1-3 ---- */
    { get: (r) => r.business.dba, page: 1, text: "Client's Business Name", slot: [23.6, 310.6], absY: 684.07, dy: 0 },
    { get: (r) => r.business.legalName, page: 1, text: "Client's Corporate/Legal Name", slot: [311.6, 590.7], absY: 684.07, dy: 0 },
    { get: (r) => r.business.locationAddress, page: 1, text: "Location", region: { yMin: 669, yMax: 678, xMax: 60 }, slot: [23.6, 310.5], absY: 663.55, dy: 0 },
    { get: (r) => r.business.corpAddress, page: 1, text: "Corporate", region: { yMin: 669, yMax: 678, xMin: 315 }, slot: [311.6, 590.9], absY: 663.55, dy: 0 },
    { get: (r) => r.business.locationCity, page: 1, text: "City", region: { yMin: 649, yMax: 658, xMax: 50 }, slot: [23.6, 185.7], absY: 644.47, dy: 0 },
    { get: (r) => r.business.locationState, page: 1, text: "State", region: { yMin: 649, yMax: 658, xMin: 180, xMax: 212 }, slot: [185.7, 255.9], absY: 644.47, dy: 0 },
    { get: (r) => r.business.locationZip, page: 1, text: "Zip", region: { yMin: 649, yMax: 658, xMin: 250, xMax: 275 }, slot: [255.9, 310.4], absY: 644.47, dy: 0 },
    { get: (r) => r.business.corpCity, page: 1, text: "City", region: { yMin: 649, yMax: 658, xMin: 315, xMax: 340 }, slot: [311.7, 468], absY: 644.47, dy: 0 },
    { get: (r) => r.business.corpState, page: 1, text: "State", region: { yMin: 649, yMax: 658, xMin: 465, xMax: 492 }, slot: [468, 535.8], absY: 644.47, dy: 0 },
    { get: (r) => r.business.corpZip, page: 1, text: "Zip", region: { yMin: 649, yMax: 658, xMin: 530 }, slot: [535.8, 590.8], absY: 644.47, dy: 0 },
    { get: (r) => r.business.phone, page: 1, text: "Location", region: { yMin: 629, yMax: 638, xMax: 60 }, slot: [23.6, 185.7], absY: 624.91, dy: 0 },
    { get: (r) => r.business.fax, page: 1, text: "Location", region: { yMin: 629, yMax: 638, xMin: 180, xMax: 215 }, slot: [185.7, 310.6], absY: 624.91, dy: 0 },
    { get: (r) => r.business.contactName, page: 1, text: "Contact", region: { yMin: 629, yMax: 638, xMin: 315, xMax: 350 }, slot: [311.7, 468], absY: 624.91, dy: 0 },
    { get: (r) => r.business.contactPhone, page: 1, text: "Contact", region: { yMin: 629, yMax: 638, xMin: 465 }, slot: [468, 590.8], absY: 624.91, dy: 0 },
    { get: (r) => r.business.customerServicePhone, page: 1, text: "Customer", region: { yMin: 610, yMax: 619 }, slot: [23.6, 185.7], absY: 603.62, dy: 0 },
    { get: (r) => r.business.email, page: 1, text: "Business", region: { yMin: 610, yMax: 618, xMin: 315, xMax: 355 }, slot: [311.7, 468], absY: 603.3, dy: 0 },
    { get: (r) => raw(r.business.dnb), page: 1, text: "D&B#", slot: [468, 590.8], absY: 603.3, dy: 0 },
    { get: (r) => r.business.website, page: 1, text: "Business", region: { yMin: 589, yMax: 597, xMax: 60 }, slot: [23.6, 310.6], absY: 583.83, dy: 0 },
    { get: (r) => raw(r.business.federalTaxId), page: 1, text: "Fed", region: { yMin: 589, yMax: 597 }, slot: [311.2, 468], absY: 583.99, dy: 0 },
    { get: (r) => r.business.taxType, page: 1, text: "Tax Type", region: { yMin: 586, yMax: 595 }, slot: [468, 591.4], absY: 583.95, dy: 0, maxWidth: 56 },
    { get: (r) => r.business.taxFilingName, page: 1, text: "Tax Filing Name", slot: [311.8, 590.6], absY: 560.9, dy: 0 },
    { get: (r) => r.business.businessStarted, page: 1, text: "Date Business Started", slot: [311.6, 470.4], absY: 538.43, dy: 0 },
    { get: pbtLenOwn, page: 1, text: "Length Current Ownership", slot: [470.4, 590.7], absY: 538.43, dy: 0 },
    { get: (r) => stAbbr(r.business.stateIssued), page: 1, text: "State Filing:", slot: [567, 576], absY: 512.86, dy: 0, size: 6, pad: 0.4, minSize: 4.5 },
    /* ---- p1 section 4: owners ---- */
    { get: (r) => full(own(r, 0)), page: 1, text: "Name", region: { yMin: 447, yMax: 456, xMax: 50 }, slot: [23.6, 209.6], absY: 443.27, dy: 0 },
    { get: (r) => full(own(r, 1)), page: 1, text: "Name", region: { yMin: 447, yMax: 456, xMin: 210, xMax: 240 }, slot: [211.5, 399.1], absY: 443.27, dy: 0 },
    { get: (r) => own(r, 0).title, page: 1, text: "Title", region: { yMin: 428, yMax: 437, xMax: 45 }, slot: [41.9, 147], absY: 432.72, dy: 0 },
    { get: (r) => own(r, 1).title, page: 1, text: "Title", region: { yMin: 428, yMax: 437, xMin: 210, xMax: 232 }, slot: [228.6, 344.1], absY: 432.36, dy: 0 },
    { get: (r) => raw(own(r, 0).ownershipPct), page: 1, text: "Ownership", region: { yMin: 428, yMax: 437, xMin: 150, xMax: 195 }, slot: [191, 210], absY: 432.7, dy: 0, pad: 1, alt: { minSize: 7, slot: [147.2, 209.8], absY: 426.14, size: 6, pad: 2 } },
    { get: (r) => raw(own(r, 1).ownershipPct), page: 1, text: "Ownership", region: { yMin: 428, yMax: 437, xMin: 348, xMax: 392 }, slot: [388.4, 399.6], absY: 432.8, dy: 0, pad: 1, alt: { minSize: 7, slot: [344.6, 399.6], absY: 426.14, size: 6, pad: 2 } },
    { get: (r) => own(r, 0).homeAddress, page: 1, text: "Home", region: { yMin: 413, yMax: 421, xMax: 50 }, slot: [23.6, 209.6], absY: 408.95, dy: 0 },
    { get: (r) => own(r, 1).homeAddress, page: 1, text: "Home", region: { yMin: 413, yMax: 421, xMin: 210, xMax: 237 }, slot: [211.5, 399.1], absY: 408.95, dy: 0 },
    { get: (r) => own(r, 0).city, page: 1, text: "City", region: { yMin: 394, yMax: 403, xMax: 45 }, slot: [23.6, 124.8], absY: 390.11, dy: 0 },
    { get: (r) => own(r, 0).state, page: 1, text: "State", region: { yMin: 394, yMax: 403, xMin: 120, xMax: 150 }, slot: [124.8, 166.5], absY: 390.11, dy: 0 },
    { get: (r) => raw(own(r, 0).zip), page: 1, text: "Zip", region: { yMin: 394, yMax: 403, xMin: 163, xMax: 185 }, slot: [166.5, 209.5], absY: 390.11, dy: 0 },
    { get: (r) => own(r, 1).city, page: 1, text: "City", region: { yMin: 394, yMax: 403, xMin: 210, xMax: 230 }, slot: [211.5, 329.4], absY: 390.11, dy: 0 },
    { get: (r) => own(r, 1).state, page: 1, text: "State", region: { yMin: 394, yMax: 403, xMin: 328, xMax: 352 }, slot: [329.4, 360.3], absY: 390.11, dy: 0 },
    { get: (r) => raw(own(r, 1).zip), page: 1, text: "Zip", region: { yMin: 394, yMax: 403, xMin: 358, xMax: 378 }, slot: [360.3, 399.2], absY: 390.11, dy: 0 },
    { get: (r) => own(r, 0).phone, page: 1, text: "Telephone", region: { yMin: 374, yMax: 383, xMax: 65 }, slot: [23.6, 93.6], absY: 370.43, dy: 0 },
    { get: (r) => own(r, 1).phone, page: 1, text: "Telephone", region: { yMin: 374, yMax: 383, xMin: 210, xMax: 250 }, slot: [211.5, 280.3], absY: 370.43, dy: 0 },
    { get: (r) => raw(own(r, 0).dlNumber), page: 1, text: "DL/ID#", region: { yMin: 374, yMax: 383, xMax: 125 }, slot: [93.6, 129.8], absY: 370.43, dy: 0 },
    { get: (r) => raw(own(r, 1).dlNumber), page: 1, text: "DL/ID#", region: { yMin: 374, yMax: 383, xMin: 279, xMax: 308 }, slot: [280.3, 316.5], absY: 370.43, dy: 0 },
    { get: (r) => own(r, 0).dlState, page: 1, text: "Issued State", region: { yMin: 374, yMax: 383, xMax: 200 }, slot: [129.8, 175.3], absY: 370.39, dy: 0 },
    { get: (r) => own(r, 1).dlState, page: 1, text: "Issued State", region: { yMin: 374, yMax: 383, xMin: 315, xMax: 362 }, slot: [316.5, 362], absY: 370.39, dy: 0 },
    { get: (r) => own(r, 0).dlExp, page: 1, text: "Exp Date", region: { yMin: 374, yMax: 383, xMax: 210 }, slot: [175.3, 209.6], absY: 370.43, dy: 0 },
    { get: (r) => own(r, 1).dlExp, page: 1, text: "Exp Date", region: { yMin: 374, yMax: 383, xMin: 360, xMax: 397 }, slot: [362, 399.1], absY: 370.43, dy: 0, maxWidth: 30.3 },
    { get: (r) => raw(own(r, 0).ssn), page: 1, text: "Social", region: { yMin: 355, yMax: 364, xMax: 50 }, slot: [23.6, 149.4], absY: 351.07, dy: 0 },
    { get: (r) => raw(own(r, 1).ssn), page: 1, text: "Social", region: { yMin: 355, yMax: 364, xMin: 210, xMax: 236 }, slot: [211.5, 343.1], absY: 351.07, dy: 0 },
    { get: (r) => own(r, 0).dob, page: 1, text: "Date", region: { yMin: 355, yMax: 364, xMin: 148, xMax: 170 }, slot: [149.4, 209.5], absY: 351.07, dy: 0 },
    { get: (r) => own(r, 1).dob, page: 1, text: "Date", region: { yMin: 355, yMax: 364, xMin: 341, xMax: 364 }, slot: [343.1, 399.1], absY: 351.07, dy: 0 },
    { get: (r) => own(r, 0).email, page: 1, text: "Email", region: { yMin: 336, yMax: 345, xMax: 50 }, slot: [23.6, 209.6], absY: 332.93, dy: 0, size: 8.5 },
    { get: (r) => own(r, 1).email, page: 1, text: "Email", region: { yMin: 336, yMax: 345, xMin: 210, xMax: 235 }, slot: [211.5, 399.1], absY: 332.93, dy: 0, size: 8.5 },
    /* ---- p1 sections 6-7 ---- */
    { get: (r) => raw(r.transaction.monthlyVolume), page: 1, text: "Requested Monthly Payment Card Volume", slot: [236, 303.2], absY: 242, dy: 0 },
    { get: (r) => raw(r.transaction.avgTicket), page: 1, text: "Requested Average Payment Card Ticket", slot: [237.2, 304.4], absY: 226.4, dy: 0 },
    { get: (r) => raw(r.transaction.highTicket), page: 1, text: "Requested Highest Payment Card Ticket", slot: [236.8, 304], absY: 208, dy: 0 },
    { get: (r) => raw(r.transaction.swipePct), page: 1, text: "Card Present Swiped", slot: [432.4, 463.6], absY: 242.8, dy: 0 },
    { get: (r) => raw(r.transaction.motoPct), page: 1, text: "MOTO", region: { yMin: 205, yMax: 214, xMin: 315 }, slot: [432.4, 463.6], absY: 206.4, dy: 0 },
    { get: (r) => raw(r.transaction.internetPct), page: 1, text: "Internet (Ecommerce)", slot: [432.4, 462], absY: 186.8, dy: 0 },
    { get: (r) => raw(r.transaction.salesToConsumerPct), page: 1, text: "Sales to Consumers", slot: [562.8, 587.6], absY: 241.8, dy: 0 },
    { get: (r) => raw(r.transaction.salesToBusinessPct), page: 1, text: "Sales to Business", slot: [563.6, 588.4], absY: 225.2, dy: 0 },
    { get: (r) => raw(r.transaction.salesToGovPct), page: 1, text: "Sales to Govt.", slot: [563.4, 588], absY: 207.2, dy: 0 },
    { get: (r) => r.transaction.previousProcessor, page: 1, text: "Previous Processor", slot: [389, 590.5], absY: 171.72, dy: 0 },
    { get: (r) => r.transaction.reasonForLeaving, page: 1, text: "Leaving", region: { yMin: 147, yMax: 155 }, slot: [390, 591], absY: 150.96, dy: 0 },
    { get: (r) => r.business.productsSold, page: 1, text: "Description", region: { yMin: 137, yMax: 146 }, slot: [23.7, 590.8], absY: 129.58, dy: 0 },
    /* ---- p1 section 8 banking ---- */
    { get: (r) => r.banking.bankName, page: 1, text: "Deposit Bank Name", slot: [23.6, 231.4], absY: 66.46, dy: 0 },
    { get: (r) => raw(r.banking.routing), page: 1, text: "Routing#", region: { yMin: 73, yMax: 82, xMin: 230, xMax: 270 }, slot: [233.1, 318], absY: 66.46, dy: 0 },
    { get: (r) => raw(r.banking.account), page: 1, text: "Account#", region: { yMin: 73, yMax: 82, xMin: 315, xMax: 360 }, slot: [319.7, 446.9], absY: 66.46, dy: 0 },
    /* ---- p2 discount plan grid ---- */
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatCreditPct) : ""), page: 2, text: "Credit Qual", occ: 0, region: { yMin: 596, yMax: 605 }, slot: [106.8, 160.8], absY: 600.6, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatCreditPct) : ""), page: 2, text: "Credit Qual", occ: 1, region: { yMin: 596, yMax: 605 }, slot: [292.8, 346.8], absY: 600.6, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatCreditPct) : ""), page: 2, text: "Credit Qual", occ: 2, region: { yMin: 596, yMax: 605 }, slot: [484.8, 538.8], absY: 600.6, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatDebitPct) : ""), page: 2, text: "CheckCard Qual", occ: 0, slot: [106.8, 160.8], absY: 561, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatDebitPct) : ""), page: 2, text: "CheckCard Qual", occ: 1, slot: [292.8, 346.8], absY: 561, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatDebitPct) : ""), page: 2, text: "CheckCard Qual", occ: 2, slot: [484.8, 538.8], absY: 561, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passCreditPct) : ""), page: 2, text: "Credit Pass Through IC", occ: 0, region: { yMin: 500, yMax: 515 }, slot: [106.8, 160.8], absY: 506.16, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passCreditPct) : ""), page: 2, text: "Credit Pass Through IC", occ: 1, region: { yMin: 500, yMax: 515 }, slot: [292.8, 346.8], absY: 506.16, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passCreditPct) : ""), page: 2, text: "Credit Pass Through IC", occ: 2, region: { yMin: 500, yMax: 515 }, slot: [484.8, 538.8], absY: 506.16, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passDebitPct) : ""), page: 2, text: "CheckCard Pass", occ: 0, slot: [106.8, 160.8], absY: 490.36, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passDebitPct) : ""), page: 2, text: "CheckCard Pass", occ: 1, slot: [292.8, 346.8], absY: 490.36, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passDebitPct) : ""), page: 2, text: "CheckCard Pass", occ: 2, slot: [484.8, 538.8], absY: 490.36, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "flat" ? raw(r.serviceAcceptance.flatAmexPct) : ""), page: 2, text: "Credit Qual", region: { yMin: 370, yMax: 380 }, slot: [106.8, 160.8], absY: 374.76, dy: 0 },
    { get: (r) => (r.serviceAcceptance.discountPlan === "passthrough" ? raw(r.serviceAcceptance.passAmexPct) : ""), page: 2, text: "Credit Pass Through IC", region: { yMin: 316, yMax: 326 }, slot: [106.8, 160.8], absY: 321.12, dy: 0 },
    { get: (r) => raw(r.fees.pinDebitPct), page: 2, text: "%", region: { yMin: 651, yMax: 659, xMin: 235, xMax: 255 }, slot: [216.4, 238.8], absY: 658, dy: 0, pad: 1 },
    { get: (r) => raw(r.transaction.amexVolume), page: 2, text: "ard Volume", slot: [318, 402], absY: 391, dy: 0 },
    /* ---- p2 authorization fees ---- */
    { get: (r) => raw(r.fees.authVmcda), page: 2, text: "Visa/MC/Discover Network", slot: [134, 174.4], absY: 187.2, dy: 0 },
    { get: (r) => raw(r.fees.fleet), page: 2, text: "Amex/Fleet/Other", slot: [133.6, 175.2], absY: 172.2, dy: 0 },
    { get: (r) => raw(r.fees.pinDebit), page: 2, text: "Pin Debit Authorization", slot: [132, 175.6], absY: 157.2, dy: 0 },
    { get: (r) => raw(r.fees.ebt), page: 2, text: "EBT Authorization", slot: [134.8, 174.8], absY: 141.2, dy: 0 },
    { get: (r) => raw(r.fees.electronicAvs), page: 2, text: "Electronic AVS", slot: [270.4, 308.8], absY: 187.2, dy: 0 },
    { get: (r) => raw(r.fees.voiceAuth), page: 2, text: "Voice Authorization", slot: [269.6, 310], absY: 171.6, dy: 0 },
    { get: (r) => raw(r.fees.voiceAvs), page: 2, text: "Voice AVS", region: { yMin: 147, yMax: 156, xMin: 175 }, slot: [268.8, 308.8], absY: 154.8, dy: 0 },
    /* ---- p2 monthly fees ---- */
    { get: (r) => raw(r.fees.monthlyMinimum), page: 2, text: "Monthly Minimum", slot: [417.6, 456], absY: 183.2, dy: 0 },
    { get: (r) => raw(r.fees.wireless), page: 2, text: "Wireless Fee", slot: [416.8, 455.6], absY: 169.2, dy: 0 },
    { get: (r) => raw(r.fees.pinDebitMonthly), page: 2, text: "PIN Debit Fee", slot: [417.6, 456.4], absY: 155.6, dy: 0 },
    { get: (r) => raw(r.fees.industryCompliance), page: 2, text: "Industry Compliance", slot: [547.2, 587.6], absY: 183.4, dy: 0 },
    { get: (r) => raw(r.fees.monthlyService), page: 2, text: "Monthly Service Fee", slot: [548, 588.4], absY: 169.6, dy: 0 },
    { get: (r) => raw(r.fees.monthlyMisc), page: 2, text: "Misc Monthly Fee", slot: [548, 588.4], absY: 159.2, dy: 0 },
    /* ---- p2 miscellaneous fees ---- */
    { get: (r) => raw(r.fees.salesTxn), page: 2, text: "Sales Transaction Fee", slot: [132.8, 170.8], absY: 109, dy: 0 },
    { get: (r) => raw(r.fees.retrieval), page: 2, text: "(All card types)", region: { yMin: 82, yMax: 91 }, slot: [130.8, 170.8], absY: 89.6, dy: 0 },
    { get: (r) => raw(r.fees.batch), page: 2, text: "Batch Fee", region: { yMin: 69, yMax: 78 }, slot: [131.2, 171.6], absY: 75.6, dy: 0 },
    { get: (r) => raw(r.fees.achReject), page: 2, text: "ACH Reject", slot: [132, 172.4], absY: 57.8, dy: 0 },
    { get: (r) => raw(r.fees.chargeback), page: 2, text: "Chargeback Fee", slot: [283.6, 324], absY: 111.2, dy: 0 },
    { get: (r) => raw(r.fees.returnTxn), page: 2, text: "Return Transaction Fee", slot: [292.4, 332.4], absY: 91.6, dy: 0 },
    { get: (r) => raw(r.fees.annual), page: 2, text: "Annual Fee", region: { yMin: 68, yMax: 76, xMin: 210 }, slot: [292.8, 333.2], absY: 76.8, dy: 0 },
    { get: (r) => raw(r.fees.monthToBill), page: 2, text: "Annual Fee Bill Month", slot: [294.8, 335.2], absY: 63.2, dy: 0 },
    { get: (r) => moneyStr(r.fees.earlyTermination), page: 2, text: "early", region: { yMin: 37, yMax: 46, xMin: 285, xMax: 305 }, slot: [269.6, 288.8], absY: 42.3, dy: 0, size: 7, pad: 1 },
    /* ---- p3 equipment ---- */
    { get: (r) => cs(r).autoCloseTime, page: 3, text: "If yes, time?", slot: [507.6, 569.2], absY: 622.44, dy: 0 },
    { get: (r) => eqItem(r, 0).model || eqItem(r, 0).type || "", page: 3, text: "Terminal", occ: 0, region: { yMin: 519, yMax: 528 }, slot: [221.6, 299.6], absY: 523.7, dy: 0 },
    { get: (r) => eqItem(r, 1).model || eqItem(r, 1).type || "", page: 3, text: "Terminal", occ: 0, region: { yMin: 507, yMax: 516 }, slot: [221.6, 299.6], absY: 511.7, dy: 0 },
    { get: (r) => eqItem(r, 2).model || eqItem(r, 2).type || "", page: 3, text: "Terminal", occ: 0, region: { yMin: 495, yMax: 504 }, slot: [221.6, 299.6], absY: 499.7, dy: 0 },
    { get: (r) => eqItem(r, 3).model || eqItem(r, 3).type || "", page: 3, text: "Terminal", occ: 0, region: { yMin: 483, yMax: 492 }, slot: [221.6, 299.6], absY: 487.7, dy: 0 },
    { get: (r) => (eqHas(r, 0) ? raw(eqItem(r, 0).quantity) || "1" : ""), page: 3, text: "Terminal", occ: 0, region: { yMin: 519, yMax: 528 }, slot: [299.6, 353.6], absY: 523.7, dy: 0 },
    { get: (r) => (eqHas(r, 1) ? raw(eqItem(r, 1).quantity) || "1" : ""), page: 3, text: "Terminal", occ: 0, region: { yMin: 507, yMax: 516 }, slot: [299.6, 353.6], absY: 511.7, dy: 0 },
    { get: (r) => (eqHas(r, 2) ? raw(eqItem(r, 2).quantity) || "1" : ""), page: 3, text: "Terminal", occ: 0, region: { yMin: 495, yMax: 504 }, slot: [299.6, 353.6], absY: 499.7, dy: 0 },
    { get: (r) => (eqHas(r, 3) ? raw(eqItem(r, 3).quantity) || "1" : ""), page: 3, text: "Terminal", occ: 0, region: { yMin: 483, yMax: 492 }, slot: [299.6, 353.6], absY: 487.7, dy: 0 },
    /* ---- p4 signatures ---- */
    { get: (r) => raw(r.sales.salesAgentName) || raw(r.sales.salesRep), page: 4, text: "Sales Agent Name (printed)", slot: [147.2, 328], absY: 706.08, dy: 0 },
    { get: sigTitle, page: 4, text: "Title", region: { yMin: 317, yMax: 326 }, slot: [374.8, 477.6], absY: 322, dy: 0 },
    { get: sigName, page: 4, text: "Print", region: { yMin: 295, yMax: 304, xMax: 45 }, slot: [104.4, 354.4], absY: 299.6, dy: 0 },
    { get: sigDate, page: 4, text: "Date", region: { yMin: 295, yMax: 304, xMin: 350 }, slot: [373.6, 481.2], absY: 299.6, dy: 0 },
    { get: (r) => raw(r.signatures.title2) || raw(own(r, 1).title), page: 4, text: "Title", region: { yMin: 272, yMax: 281 }, slot: [374.8, 479.6], absY: 277.1, dy: 0 },
    { get: (r) => raw(r.signatures.printedName2) || full(own(r, 1)), page: 4, text: "Print", region: { yMin: 250, yMax: 259, xMax: 45 }, slot: [104.4, 354.4], absY: 254.6, dy: 0 },
    { get: (r) => (raw(r.signatures.printedName2) || full(own(r, 1)) ? raw(r.signatures.date2) || sigDate(r) : ""), page: 4, text: "Date", region: { yMin: 250, yMax: 259, xMin: 350 }, slot: [373.6, 481.2], absY: 254.6, dy: 0 },
    { get: sigName, page: 4, text: "Print Name:", region: { yMin: 158, yMax: 167 }, slot: [301.6, 434.8], absY: 162.9, dy: 0 },
    { get: sigDate, page: 4, text: "Date", region: { yMin: 158, yMax: 167, xMin: 430 }, slot: [451.6, 492.8], absY: 162.9, dy: 0 },
    { get: (r) => raw(r.signatures.printedName2) || full(own(r, 1)), page: 4, text: "Print Name:", region: { yMin: 122, yMax: 131 }, slot: [301.6, 434.8], absY: 126.5, dy: 0 },
    { get: (r) => (raw(r.signatures.printedName2) || full(own(r, 1)) ? raw(r.signatures.date2) || sigDate(r) : ""), page: 4, text: "Date", region: { yMin: 122, yMax: 131, xMin: 430 }, slot: [451.6, 492.8], absY: 126.5, dy: 0 },
    /* ---- p5 confirmation ---- */
    { get: (r) => r.business.legalName || r.business.dba, page: 5, text: "Legal Name:", place: "right", dx: 8, maxWidth: 400 },
    { get: sigName, page: 5, text: "Please", region: { yMin: 122, yMax: 131 }, slot: [36, 218.8], absY: 138.7, dy: 0 },
    { get: sigTitle, page: 5, text: "Please", region: { yMin: 122, yMax: 131 }, slot: [222.4, 343.6], absY: 138.7, dy: 0 },
    { get: sigDate, page: 5, text: "Please", region: { yMin: 122, yMax: 131 }, slot: [349.2, 400.4], absY: 138.7, dy: 0 },
    /* ---- p6 beneficial ownership ---- */
    { get: sigDate, page: 6, text: "Date Application Signed", slot: [490.4, 568], absY: 637.6, dy: 0, size: 8 },
    { get: (r) => r.business.legalName || r.business.dba, page: 6, text: "Merchant Legal Name:", slot: [94, 202.8], absY: 619.2, dy: 0, size: 8 },
    { get: (r) => raw(r.business.federalTaxId), page: 6, text: "Merchant Federal Tax ID", slot: [379.6, 430], absY: 619.2, dy: 0, size: 8 },
    { get: (r) => [r.business.locationAddress, csz({ city: r.business.locationCity, state: r.business.locationState, zip: r.business.locationZip })].filter(Boolean).join(", "), page: 6, text: "Address:", region: { yMin: 605, yMax: 613, xMax: 90 }, slot: [80.8, 430.4], absY: 610, dy: 0, size: 8 },
    { get: (r) => raw(r.business.organizationType), page: 6, text: "Merchant Entity Type", slot: [495.2, 569.2], absY: 610, dy: 0, size: 8 },
    // State of formation — same value as p1 "State Filing".
    { get: (r) => stAbbr(r.business.stateIssued), page: 6, text: "Merchant State of formation", slot: [552.4, 567.6], absY: 618.9, dy: 0, size: 8 },
    // owner block 1 (owners[0]) — labels y: name 535.3 / addr 516.4 / ssn 495.7 / id 475.0
    { get: (r) => full(own(r, 0)), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [28.2, 275.4], absY: 526.79, dy: 0 },
    { get: (r) => own(r, 0).title, page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 491.4], absY: 526.79, dy: 0 },
    { get: (r) => raw(own(r, 0).ownershipPct), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [533.6, 551.2], absY: 525.9, dy: 0, pad: 0.6 },
    { get: (r) => own(r, 0).homeAddress, page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [28.2, 275.4], absY: 505.99, dy: 0 },
    { get: (r) => csz(own(r, 0)), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 491.4], absY: 505.99, dy: 0 },
    { get: (r) => own(r, 0).dob, page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [491.4, 567.8], absY: 505.99, dy: 0 },
    { get: (r) => raw(own(r, 0).ssn), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 491.4], absY: 485.19, dy: 0 },
    { get: (r) => own(r, 0).dlState, page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 370], absY: 464.39, dy: 0 },
    { get: (r) => own(r, 0).dlExp, page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [424, 491.4], absY: 464.39, dy: 0 },
    { get: (r) => raw(own(r, 0).dlNumber), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [491.4, 567.8], absY: 464.39, dy: 0 },
    // owner block 2 (owners[1]) — labels y: name 453.9 / addr 434.9 / ssn 415.7 / id 393.5
    { get: (r) => full(own(r, 1)), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [28.2, 275.4], absY: 445.19, dy: 0 },
    { get: (r) => own(r, 1).title, page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 491.4], absY: 445.19, dy: 0 },
    { get: (r) => raw(own(r, 1).ownershipPct), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [533.6, 551.2], absY: 444.7, dy: 0, pad: 0.6 },
    { get: (r) => own(r, 1).homeAddress, page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [28.2, 275.4], absY: 425.99, dy: 0 },
    { get: (r) => csz(own(r, 1)), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 491.4], absY: 425.99, dy: 0 },
    { get: (r) => own(r, 1).dob, page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [491.4, 567.8], absY: 425.99, dy: 0 },
    { get: (r) => raw(own(r, 1).ssn), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 491.4], absY: 403.51, dy: 0 },
    { get: (r) => own(r, 1).dlState, page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [275.4, 370], absY: 383.19, dy: 0 },
    { get: (r) => own(r, 1).dlExp, page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [424, 491.4], absY: 383.19, dy: 0 },
    { get: (r) => raw(own(r, 1).dlNumber), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, slot: [491.4, 567.8], absY: 383.19, dy: 0 },
    // bottom certification
    { get: sigDate, page: 6, text: "Signed", region: { yMin: 24, yMax: 32, xMax: 175 }, slot: [136.8, 177.2], absY: 38, dy: 0, size: 8, pad: 1 },
    { get: sigName, page: 6, text: "Printed", region: { yMin: 24, yMax: 32, xMax: 275 }, slot: [189.6, 284.8], absY: 38, dy: 0, size: 8 },
  ],
  check: [
    /* p1 org type (boxes ~11pt left of labels, measured from template) */
    { on: (r) => /sole|individual|propriet/.test(orgType(r)), page: 1, text: "Sole Prop", box: [33.1, 41.3, 510.71, 518.11] },
    { on: (r) => /partner/.test(orgType(r)) && !/ll[cp]|limited liab/.test(orgType(r)), page: 1, text: "Partnership", region: { yMin: 508, yMax: 516 }, box: [98.3, 106.1, 510.71, 518.91] },
    { on: (r) => /ll[cp]|limited liab/.test(orgType(r)), page: 1, text: "LLC/LLP", box: [169.8, 177.6, 511.11, 518.51] },
    { on: (r) => /corp|\binc\b|incorporated/.test(orgType(r)) && !/s[-\s]?corp|ll[cp]|limited liab|non.?profit|501|govern|municip/.test(orgType(r)), page: 1, text: "C Corp", box: [236.6, 245.6, 511.11, 518.51] },
    { on: (r) => /s[-\s]?corp/.test(orgType(r)), page: 1, text: "S Corp", region: { yMin: 508, yMax: 516 }, box: [289.5, 297.7, 510.71, 518.51] },
    { on: (r) => /govern|gov't|gov\b|municip/.test(orgType(r)), page: 1, text: "Govt.", region: { yMin: 508, yMax: 516 }, box: [344.2, 352.6, 511.11, 518.91] },
    { on: (r) => /non.?profit|501/.test(orgType(r)), page: 1, text: "501c/Tax Ex.", box: [445.5, 454.1, 510.71, 519.31] },
    /* p1 seasonal + business type */
    { on: isSeasonal, page: 1, text: "Seasonal Merchant?", box: [123.4, 132.4, 191.07, 199.27] },
    // …and "No" when not seasonal (on a form with anything on it — see formHasContent)
    { on: (r) => !isSeasonal(r) && formHasContent(pbt, r), seasonNo: true, page: 1, text: "Seasonal Merchant?", box: [155.4, 164.4, 191.07, 198.9] },
    /* p1 business-type row is generated below via BIZ_RULES */
    /* p2 card types (boxes left of labels; dy tuned per measured box center) */
    { on: (r) => r.serviceAcceptance.cardVisaCredit, page: 2, text: "Visa Credit", box: [31.8, 40.4, 728.63, 736.03] },
    { on: (r) => r.serviceAcceptance.cardVisaDebit, page: 2, text: "Visa Non-PIN Debit", box: [89.8, 98, 729.13, 735.73] },
    { on: (r) => r.serviceAcceptance.cardMcCredit, page: 2, text: "MasterCard Credit", box: [178.7, 187.7, 728.63, 737.23] },
    { on: (r) => r.serviceAcceptance.cardMcDebit, page: 2, text: "MasterCard Non-PIN Debit", box: [264.7, 272.9, 728.73, 736.93] },
    { on: (r) => r.serviceAcceptance.cardDiscover, page: 2, text: "Discover Network", region: { yMin: 723, yMax: 731 }, box: [361.8, 369.6, 730.63, 737.23] },
    { on: (r) => r.serviceAcceptance.cardAmex, page: 2, text: "American Express", region: { yMin: 723, yMax: 731 }, box: [437.4, 446, 729.93, 736.93] },
    { on: (r) => r.serviceAcceptance.cardPin, page: 2, text: "PIN Debit", region: { yMin: 723, yMax: 731 }, box: [535.9, 544.5, 729.93, 736.53] },
    /* p2 discount plan + payment method + assessments */
    { on: (r) => r.serviceAcceptance.discountPlan === "flat", page: 2, text: "Flat Rate", region: { yMin: 695, yMax: 704 }, box: [182.2, 190.4, 702.31, 709.71] },
    { on: (r) => r.serviceAcceptance.discountPlan === "passthrough", page: 2, text: "Pass Through I/C", region: { yMin: 677, yMax: 686 }, box: [72.7, 81.3, 685.89, 693.69] },
    { on: (r) => r.serviceAcceptance.paymentMethod === "daily", page: 2, text: "Daily", center: true, absX: 450, dy: 0 },
    { on: (r) => r.serviceAcceptance.paymentMethod === "monthly", page: 2, text: "Monthly", region: { yMin: 706, yMax: 714 }, center: true, absX: 495.5 },
    { on: (r) => r.serviceAcceptance.assessments === "included", page: 2, text: "Included", region: { yMin: 689, yMax: 698 }, center: true, absX: 458 },
    { on: (r) => r.serviceAcceptance.assessments === "billed", page: 2, text: "Bill Separately", region: { yMin: 689, yMax: 698 }, center: true, absX: 514 },
    /* p3 other card types + processing */
    { on: (r) => r.serviceAcceptance.cardEbt, page: 3, text: "Accept EBT", region: { yMin: 740, yMax: 748 }, center: true, absX: 142.6, absY: 746.7 },
    { on: (r) => cs(r).enWex, page: 3, text: "Order Wright Express", box: [315.4, 324, 731.97, 739.77] },
    { on: (r) => cs(r).vasCheckServices, page: 3, text: "ACH/Check Services", box: [525.4, 534.8, 745.57, 753.77] },
    { on: (r) => cs(r).vasGiftCards, page: 3, text: "Gift Card", box: [525, 534, 718.27, 726.07] },
    { on: (r) => cs(r).fbAppType === "retail", page: 3, text: "Application Type", box: [150.2, 153.6, 661.87, 666.07] },
    { on: (r) => cs(r).fbAppType === "moto", page: 3, text: "Application Type", box: [263.8, 268, 661.17, 665.37] },
    { on: (r) => cs(r).fbAppType === "restaurant", page: 3, text: "Application Type", box: [348.2, 352.8, 661.97, 665.37] },
    { on: (r) => cs(r).avsCvv, page: 3, text: "AVS + CVV2", box: [149, 154.4, 622.27, 627.67] },
    { on: (r) => cs(r).serverNumbers, page: 3, text: "Server/Clerk #", box: [287.4, 292.4, 621.47, 627.67] },
    { on: (r) => cs(r).invoiceNumber, page: 3, text: "Invoice/Purchase Order #", box: [472.6, 479.2, 634.67, 640.47] },
    { on: (r) => cs(r).autoClose, page: 3, text: "Auto Close", box: [419.4, 424.4, 623.47, 628.07] },
    { on: (r) => cs(r).fbConnection === "ethernet", page: 3, text: "IP Connection?", box: [107.8, 112.8, 606.37, 609.77] },
    { on: (r) => cs(r).fbConnection === "wifi" || cs(r).fbConnection === "wireless", page: 3, text: "Wireless?", box: [107, 111.6, 587.87, 591.27] },
    /* p6 SSN-question Yes + Driver's License ID type per owner block */
    { on: (r) => Boolean(raw(own(r, 0).ssn)), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, box: [141, 145.2, 485.57, 491.77] },
    { on: (r) => Boolean(raw(own(r, 0).dlNumber)), page: 6, text: "Beneficial", occ: 0, region: { yMin: 280, yMax: 545, xMax: 40 }, box: [70.6, 73.6, 475.57, 478.57] },
    { on: (r) => Boolean(raw(own(r, 1).ssn)), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, box: [140.2, 145.8, 406.37, 410.97] },
    { on: (r) => Boolean(raw(own(r, 1).dlNumber)), page: 6, text: "Beneficial", occ: 1, region: { yMin: 280, yMax: 545, xMax: 40 }, center: true, absX: 71.8, absY: 393.9 },
  ],
  sign: [
    { page: 4, x: 73, y: 319.3, maxW: 279, maxH: 22, center: true },
    // right of the "Personal Guarantee" caption, which sits above the line's left end
    { page: 4, x: 106, y: 160.1, maxW: 150, maxH: 22, center: true },
    // right of the "Signature (Please sign below):" caption above the X line
    { page: 5, x: 140, y: 157.7, maxW: 76, maxH: 22, center: true },
    // only ~10pt between the certification text and the caption under this line
    { page: 6, x: 28.8, y: 34.8, maxW: 91.2, maxH: 9.6, center: true },
  ],
};
// Business-type boxes (p1 section 6): one check per printed option + Other fallback.
for (const [re, label, box] of BIZ_RULES) {
  pbt.check.push({ on: (r) => re.test(bizType(r)), page: 1, text: "Business Type:", box, _biz: label });
}
pbt.check.push({ on: (r) => Boolean(bizType(r)) && !bizMatched(r), page: 1, text: "Business Type:", box: [528.3, 536.5, 265.47, 272.07], _biz: "Other" });
// PB&T p3 equipment rows: type boxes (from the pricing category), deployment boxes.
{
  // Row label baselines; each row's boxes sit 1.47..5.27pt above its baseline.
  const ROWS = [523.7, 511.7, 499.7, 487.7];
  const COLS = [[65.8, 69.6], [113.9, 117.7], [162, 165.8], [395.9, 399.7], [569.9, 573.7]]; // Terminal, Pinpad, Printer, Existing, New Order
  ROWS.forEach((ry, i) => {
    const m = (r) => eqItem(r, i).model || eqItem(r, i).type || "";
    const box = (k) => [COLS[k][0], COLS[k][1], +(ry + 1.47).toFixed(2), +(ry + 5.27).toFixed(2)];
    pbt.check.push(
      { on: (r) => /terminal/i.test(eqCat(m(r))) || /terminal/i.test(raw(eqItem(r, i).type)), page: 3, text: "Terminal", occ: 0, region: { yMin: ry - 5, yMax: ry + 5 }, box: box(0) },
      { on: (r) => /pin pads/i.test(eqCat(m(r))) || /pin ?pad/i.test(raw(eqItem(r, i).type)), page: 3, text: "Pinpad", occ: 0, region: { yMin: ry - 5, yMax: ry + 5 }, box: box(1) },
      { on: (r) => /printer/i.test(m(r)) || /printer/i.test(raw(eqItem(r, i).type)), page: 3, text: "Printer", occ: 0, region: { yMin: ry - 5, yMax: ry + 5 }, box: box(2) },
      { on: (r) => eqHas(r, i) && eqItem(r, i).acquisition === "existing", page: 3, text: "Existing", occ: 0, region: { yMin: ry - 5, yMax: ry + 5 }, box: box(3) },
      { on: (r) => eqHas(r, i) && eqItem(r, i).acquisition !== "existing", page: 3, text: "Existing", occ: 0, region: { yMin: ry - 5, yMax: ry + 5 }, box: box(4) },
    );
  });
}


/* ================= Change Request Form (CRF, MX-FD0915, 1 page) ================= */
// Standalone change-request document. Header fields fall back to the record's
// business/owner data; every change row's checkbox marks itself when its value
// is filled (toggle-only rows have explicit booleans). Row checkbox centers
// measured from the template pixels (x=67.2; sub-boxes 186.6 / 263.8).
const crfR = (r) => r.crf || {};
const crf = {
  text: [
    /* header */
    { get: sigDate, page: 1, text: "DATE:", region: { yMin: 689, yMax: 698 }, slot: [98.7, 304.5], absY: 693.62, dy: 0 },
    { get: (r) => raw(crfR(r).merchantId) || raw(po(r).mid), page: 1, text: "MERCHANT ID NUMBER:", slot: [406.5, 549.2], absY: 693.62, dy: 0 },
    { get: (r) => raw(crfR(r).ownerName) || full((r.owners || [])[0]), page: 1, text: "S NAME:", region: { yMin: 665, yMax: 674 }, slot: [176.6, 549.3], absY: 669.62, dy: 0 },
    { get: (r) => raw(crfR(r).dba) || r.business.dba, page: 1, text: "BUSINESS NAME (DBA):", slot: [163.5, 549], absY: 641.62, dy: 0 },
    { get: (r) => raw(crfR(r).legalName) || r.business.legalName || r.business.dba, page: 1, text: "CURRENT LEGAL NAME:", slot: [162.1, 549], absY: 615.62, dy: 0 },
    /* DBA change rows — value right of the label, inside the left column (divider ~x358) */
    { get: (r) => crfR(r).dbaName, page: 1, text: "DBA NAME:", slot: [120.1, 357.2], absY: 547.62, dy: 0 },
    { get: (r) => crfR(r).legalAddress, page: 1, text: "LEGAL ADDRESS:", slot: [138.2, 357.3], absY: 529.62, dy: 0, wrap: { y: [529.62, 516.6], slots: [[138.2, 357.3], [46, 357.3]] } },
    { get: (r) => crfR(r).dbaAddress, page: 1, text: "DBA ADDRESS:", slot: [131.7, 357.2], absY: 493.62, dy: 0, wrap: { y: [493.62, 480.6], slots: [[131.7, 357.2], [46, 357.2]] } },
    { get: (r) => crfR(r).emailAddress, page: 1, text: "EMAIL ADDRESS:", slot: [138.8, 357.1], absY: 457.62, dy: 0 },
    { get: (r) => crfR(r).dbaPhone, page: 1, text: "DBA PHONE NUMBER:", slot: [159, 357.3], absY: 439.62, dy: 0 },
    { get: (r) => crfR(r).dbaFax, page: 1, text: "DBA FAX NUMBER:", slot: [145.7, 357.2], absY: 421.62, dy: 0 },
    { get: (r) => crfR(r).website, page: 1, text: "WEBSITE ADDRESS:", slot: [148, 357.4], absY: 403.62, dy: 0 },
    /* pricing rows */
    { get: (r) => raw(crfR(r).amexOptBlueRate), page: 1, text: "RATE:", region: { yMin: 354, yMax: 363 }, slot: [386.4, 549.4], absY: 358.62, dy: 0 },
    { get: (r) => raw(crfR(r).amexDirectSe), page: 1, text: "AMEX DIRECT SE#", slot: [140.8, 549.1], absY: 343.62, dy: 0 },
    { get: (r) => raw(crfR(r).pinDebitRate), page: 1, text: "RATE:", region: { yMin: 309, yMax: 318 }, slot: [386.4, 549.4], absY: 313.62, dy: 0 },
    { get: (r) => raw(crfR(r).ebtFns), page: 1, text: "FNS#", slot: [240.4, 364.1], absY: 298.62, dy: 0 },
    { get: (r) => raw(crfR(r).ebtFee), page: 1, text: "TRANSACTION FEE:", slot: [434, 549.1], absY: 298.62, dy: 0 },
    { get: (r) => raw(crfR(r).myMerchantBenefitsRate), page: 1, text: "RATE:", region: { yMin: 264, yMax: 273 }, slot: [386.4, 549.4], absY: 268.62, dy: 0 },
    { get: (r) => raw(crfR(r).vmdNewRate), page: 1, text: "NEW RATE:", slot: [405.6, 549], absY: 253.62, dy: 0 },
    { get: (r) => raw(crfR(r).checkCardRate), page: 1, text: "RATE:", region: { yMin: 234, yMax: 243 }, slot: [386.4, 549.4], absY: 238.62, dy: 0 },
    { get: (r) => crfR(r).other1, page: 1, text: "OTHER:", occ: 0, region: { yMin: 204, yMax: 228 }, slot: [104.9, 364.8], absY: 223.62, dy: 0 },
    { get: (r) => raw(crfR(r).other1Rate), page: 1, text: "RATE:", region: { yMin: 219, yMax: 228 }, slot: [386.4, 549.4], absY: 223.62, dy: 0 },
    { get: (r) => crfR(r).other2, page: 1, text: "OTHER:", occ: 1, region: { yMin: 204, yMax: 228 }, slot: [104.9, 364.8], absY: 208.62, dy: 0 },
    { get: (r) => raw(crfR(r).other2Rate), page: 1, text: "RATE:", region: { yMin: 204, yMax: 213 }, slot: [386.4, 549.4], absY: 208.62, dy: 0 },
    /* notes + signature date */
    { get: (r) => crfR(r).notes, page: 1, text: "NOTES", slot: [62.2, 549], absY: 168.4, dy: 0, wrap: { y: [168.4, 157.4, 146.4], slots: [[62.2, 549], [62.2, 549], [62.2, 549]] } },
    { get: sigDate, page: 1, text: "DATE: _", region: { yMin: 82, yMax: 91 }, slot: [408.4, 507.6], absY: 86.7, dy: 0 },
  ],
  check: [
    { on: (r) => Boolean(raw(crfR(r).dbaName)), page: 1, text: "DBA NAME:", box: [65.9, 72.9, 548.39, 555.39] },
    { on: (r) => Boolean(raw(crfR(r).legalAddress)), page: 1, text: "LEGAL ADDRESS:", box: [65.9, 72.9, 530.39, 537.39] },
    { on: (r) => Boolean(raw(crfR(r).dbaAddress)), page: 1, text: "DBA ADDRESS:", box: [65.9, 72.9, 493.19, 500.19] },
    { on: (r) => Boolean(raw(crfR(r).emailAddress)), page: 1, text: "EMAIL ADDRESS:", box: [65.9, 72.9, 458.39, 465.39] },
    { on: (r) => Boolean(raw(crfR(r).dbaPhone)), page: 1, text: "DBA PHONE NUMBER:", box: [65.9, 72.9, 440.39, 447.39] },
    { on: (r) => Boolean(raw(crfR(r).dbaFax)), page: 1, text: "DBA FAX NUMBER:", box: [65.9, 72.9, 422.39, 429.39] },
    { on: (r) => Boolean(raw(crfR(r).website)), page: 1, text: "WEBSITE ADDRESS:", box: [65.9, 72.9, 404.39, 411.39] },
    { on: (r) => Boolean(crfR(r).amexOptBluePlan) || Boolean(raw(crfR(r).amexOptBlueRate)), page: 1, text: "AMEX OPT BLUE", box: [65.9, 72.9, 358.39, 365.39] },
    { on: (r) => crfR(r).amexOptBluePlan === "interchange", page: 1, text: "INTERCHANGE", box: [185, 188.6, 360.2, 364.2] },
    { on: (r) => crfR(r).amexOptBluePlan === "tiered", page: 1, text: "TIERED", box: [261.8, 265.6, 360.37, 364.17] },
    { on: (r) => Boolean(raw(crfR(r).amexDirectSe)), page: 1, text: "AMEX DIRECT SE#", box: [65.9, 72.9, 343.19, 350.19] },
    { on: (r) => crfR(r).addDiscover, page: 1, text: "ADD DISCOVER", box: [65.9, 72.9, 329.19, 336.19] },
    { on: (r) => crfR(r).pinDebitDiscount || Boolean(raw(crfR(r).pinDebitRate)), page: 1, text: "PIN DEBIT DISCOUNT", box: [65.9, 72.9, 314.39, 321.39] },
    { on: (r) => Boolean(raw(crfR(r).ebtFns)) || Boolean(raw(crfR(r).ebtFee)), page: 1, text: "EBT", exact: true, box: [65.9, 72.9, 298.39, 305.39] },
    { on: (r) => crfR(r).addCashBenefits, page: 1, text: "ADD CASH BENEFITS", box: [65.9, 72.9, 284.39, 291.39] },
    { on: (r) => crfR(r).myMerchantBenefits || Boolean(raw(crfR(r).myMerchantBenefitsRate)), page: 1, text: "ADD MY MERCHANT BENEFITS", box: [65.9, 72.9, 269.19, 276.19] },
    { on: (r) => crfR(r).vmdDiscount || Boolean(raw(crfR(r).vmdNewRate)), page: 1, text: "VISA/MASTERCARD/DISCOVER DISCOUNT", box: [65.9, 72.9, 254.39, 261.39] },
    { on: (r) => crfR(r).checkCardDiscount || Boolean(raw(crfR(r).checkCardRate)), page: 1, text: "CHECK CARD DISCOUNT", box: [65.9, 72.9, 239.19, 246.19] },
    { on: (r) => Boolean(raw(crfR(r).other1)) || Boolean(raw(crfR(r).other1Rate)), page: 1, text: "OTHER:", occ: 0, region: { yMin: 204, yMax: 228 }, box: [65.9, 72.9, 223.19, 230.19] },
    { on: (r) => Boolean(raw(crfR(r).other2)) || Boolean(raw(crfR(r).other2Rate)), page: 1, text: "OTHER:", occ: 1, region: { yMin: 204, yMax: 228 }, box: [65.9, 72.9, 208.39, 215.39] },
  ],
  sign: [{ page: 1, x: 170, y: 83.9, maxW: 172, maxH: 21, center: true }],
};


/* ========== Hemp & CBD Disclosure + CBD Amendment (Priority / PPS) ========== */
// Two standalone CBD documents. Both reference the underlying Merchant
// Agreement's date ("dated on or about ____, 20__"): cbd.agreementDate
// (MM/DD/YYYY preferred, free text accepted) falls back to the packet date.
const cbdR2 = (r) => r.cbd || {};
const CBD_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const cbdYn = (v) => {
  const s = raw(v).toLowerCase();
  return s === "yes" || s === "y" || s === "true" ? "Yes" : s === "no" || s === "n" || s === "false" ? "No" : raw(v);
};
const cbdAgmtParts = (r) => {
  const s = raw(cbdR2(r).agreementDate) || raw(r._date);
  if (!s) return { main: "", month: "", day: "", yy: "" };
  const m = s.match(/^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})\s*$/);
  if (m) {
    const month = CBD_MONTHS[Math.min(12, Math.max(1, parseInt(m[1], 10))) - 1];
    const day = String(parseInt(m[2], 10));
    return { main: `${month} ${day}`, month, day, yy: m[3].slice(-2) };
  }
  const ym = s.match(/(\d{4})\s*\.?\s*$/);
  const main = s.replace(/,?\s*\d{4}\s*\.?\s*$/, "").trim() || s;
  return { main, month: main, day: "", yy: ym ? ym[1].slice(-2) : "" };
};
const cbdLegalAndDba = (r) => {
  const ln = raw(r.business.legalName), db = raw(r.business.dba);
  return ln && db && ln.toLowerCase() !== db.toLowerCase() ? `${ln} / ${db}` : ln || db;
};
const cbdProduct = (r, i) => {
  const list = cbdR2(r).products;
  const arr = Array.isArray(list) ? list : list && typeof list === "object" ? Object.keys(list).sort((a, b) => a - b).map((k) => list[k]) : [];
  return arr[i] || {};
};

const hemp_cbd = {
  text: [
    /* p1 — corporate & licensing info + product/services questions (values centered on the printed blanks) */
    { get: (r) => raw(r.business.legalName) || raw(r.business.dba), page: 1, text: "Business Legal Name:", slot: [165.6, 305.6], absY: 472.09, dy: 0 },
    { get: (r) => raw(cbdR2(r).stateHempLicense), page: 1, text: "Hemp retail license no", slot: [237.6, 367.6], absY: 451.57, dy: 0 },
    { get: (r) => cbdYn(cbdR2(r).growsHemp), page: 1, text: "growing or cultivation of Hemp plants?", slot: [345.6, 375.6], absY: 378.85, dy: 0 },
    { get: (r) => cbdYn(cbdR2(r).manufacturesHemp), page: 1, text: "Hemp plants/CBD?", slot: [380.8, 410.8], absY: 358.43, dy: 0 },
    { get: (r) => cbdYn(cbdR2(r).advertisesHemp), page: 1, text: "market or advertise Hemp or CBD products to the public?", slot: [351.6, 381.6], absY: 338.03, dy: 0 },
    /* p2 — certification: agreement date blanks + signer block */
    { get: (r) => cbdAgmtParts(r).main, page: 2, text: "________________", exact: true, slot: [57.6, 142.4], absY: 216.83, dy: 0 },
    { get: (r) => cbdAgmtParts(r).yy, page: 2, text: "_____", exact: true, slot: [160.4, 185.2], absY: 216.83, dy: 0 },
    { get: cbdLegalAndDba, page: 2, text: "(Merchant Business Legal Name and d/b/a)", place: "right", dx: 10, maxWidth: 320 },
    { get: sigName, page: 2, text: "Name:", region: { yMin: 128, yMax: 137 }, place: "right", dx: 8, maxWidth: 250 },
    { get: sigTitle, page: 2, text: "Title:", region: { yMin: 103, yMax: 112 }, place: "right", dx: 8, maxWidth: 250 },
    { get: sigDate, page: 2, text: "Date:", region: { yMin: 78, yMax: 88 }, place: "right", dx: 8, maxWidth: 120 },
    /* p3 — schedule of Hemp/CBD products: 20 numbered rows x 3 columns. Values are
       left-aligned under each column header; dx normalizes the differing "N." widths. */
    ...Array.from({ length: 20 }, (_, i) => {
      const rowLabel = `${i + 1}.`;
      const dxBase = i < 9 ? 15.1 : 10; // "1."-"9." are 5pt narrower than "10."-"20."
      return [
        { get: (r) => raw(cbdProduct(r, i).name), page: 3, text: rowLabel, exact: true, place: "right", dx: dxBase, maxWidth: 150 },
        { get: (r) => raw(cbdProduct(r, i).distributor), page: 3, text: rowLabel, exact: true, place: "right", dx: dxBase + 157.4, maxWidth: 168 },
        { get: (r) => raw(cbdProduct(r, i).state), page: 3, text: rowLabel, exact: true, place: "right", dx: dxBase + 337.4, maxWidth: 145 },
      ];
    }).flat(),
  ],
  check: [],
  // Owner 1 signs the certification on the open space right of "Signature:".
  sign: [{ page: 2, x: 106, y: 156, maxW: 215, maxH: 20 }],
};

const cbd_amendment = {
  text: [
    /* "dated on or about [month] [day], 20[yy]" blanks */
    { get: (r) => cbdAgmtParts(r).month, page: 1, text: "_____________", exact: true, slot: [260.8, 332], absY: 644.36, dy: 0 },
    { get: (r) => cbdAgmtParts(r).day, page: 1, text: "_____", exact: true, region: { yMin: 638, yMax: 648 }, slot: [342, 370.4], absY: 644.36, dy: 0 },
    { get: (r) => cbdAgmtParts(r).yy, page: 1, text: "___", exact: true, region: { yMin: 638, yMax: 648 }, slot: [388, 404.4], absY: 644.36, dy: 0 },
    /* merchant company name on the blank across from PRIORITY PAYMENT SYSTEMS LLC */
    { get: (r) => raw(r.business.legalName) || raw(r.business.dba), page: 1, text: "________________________________", exact: true, slot: [306.4, 482], absY: 190.76, dy: 0 },
    /* right (Merchant) signer column; the left Processor column stays blank */
    { get: sigName, page: 1, text: "Name:", region: { xMin: 300, yMin: 117, yMax: 126 }, slot: [338.4, 481.2], absY: 123.08, dy: 0 },
    { get: sigTitle, page: 1, text: "tle:", region: { xMin: 300, yMin: 95, yMax: 104 }, slot: [331.6, 479.6], absY: 100.76, dy: 0 },
    { get: sigDate, page: 1, text: "Date:", region: { xMin: 300, yMin: 72, yMax: 81 }, slot: [333.2, 481.2], absY: 78.2, dy: 0 },
  ],
  check: [],
  // Owner 1 signs the Merchant "By:" line (right column).
  sign: [{ page: 1, x: 325.2, y: 141.7, maxW: 159.6, maxH: 22, center: true }],
};


/* ========= Clover / Omaha Gift Card Program Setup (6-page packet) ========= */
// p1 is the application (anchored text layer). p2 (Additional Location Form) and
// p3 (Bank Affiliation Change) are scanned pages filled by absolute coordinates
// measured from the template pixels; each activates only when its data is present.
// p4-p6 are informational (procedures + fee schedules) and stay untouched.
const gcR = (r) => r.giftCard || {};
const gcList = (v, n) => {
  const arr = Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : [];
  return Array.from({ length: n }, (_, i) => arr[i] || {});
};
const gcEq = (r, i) => gcList(gcR(r).eq, 3)[i];
const gcLoc = (r, i) => gcList(gcR(r).locations, 2)[i];
const gcLocActive = (r) => gcList(gcR(r).locations, 2).some((l) => Object.values(l).some((v) => raw(v)));
const gcAffActive = (r) => Boolean(raw(gcR(r).affBank));
const gcDigits = (v) => raw(v).replace(/\D/g, "");
// Per-digit specs across a run of printed digit cells (measured cell centers).
const gcCells = (page, get, centers, absY) =>
  centers.map((cx, i) => ({ get: (r) => gcDigits(get(r)).slice(0, centers.length)[i] || "", page, place: "center", absX: cx, absY, maxWidth: 14 }));
const gcOwnerTitle = (r) => raw(own(r, 0).title).toLowerCase();

const gift_card = {
  text: [
    /* p1 — top "Tie To" lines (fill the row matching the chosen application kind) */
    { get: (r) => (gcR(r).appKind === "outlet" ? raw(gcR(r).tieTo) : ""), page: 1, slot: [295.6, 588], absY: 719, dy: 0 },
    { get: (r) => (gcR(r).appKind === "entitle" ? raw(gcR(r).tieTo) : ""), page: 1, slot: [424, 588], absY: 698, dy: 0 },
    /* p1 — client information */
    { get: (r) => raw(r.business.legalName) || raw(r.business.dba), page: 1, text: "(Business Legal Name):", slot: [110.8, 594], absY: 652.23, dy: 0 },
    { get: (r) => raw(r.business.dba), page: 1, text: "DBA / Outlet Name:", slot: [90.6, 400.1], absY: 628.23, dy: 0 },
    ...gcCells(1, (r) => r.business.federalTaxId, [457.2, 472.8, 488.8, 504.8, 520.4, 536.4, 552.0, 568.0, 583.6], 629.4),
    { get: (r) => raw(r.business.locationAddress), page: 1, text: "Street Address:", region: { yMin: 600, yMax: 609 }, slot: [79.2, 594], absY: 604.23, dy: 0 },
    { get: (r) => raw(r.business.locationCity), page: 1, text: "City:", region: { yMin: 576, yMax: 585 }, slot: [37.3, 304.8], absY: 580.23, dy: 0 },
    { get: (r) => raw(r.business.locationState), page: 1, text: "State:", region: { yMin: 576, yMax: 585 }, slot: [332.8, 379], absY: 580.23, dy: 0 },
    { get: (r) => raw(r.business.locationZip), page: 1, text: "Zip:", region: { yMin: 576, yMax: 585 }, slot: [400.2, 469.3], absY: 580.23, dy: 0 },
    { get: (r) => raw(gcR(r).numLocations), page: 1, text: "# of Locations:", slot: [532.8, 594], absY: 580.23, dy: 0 },
    { get: (r) => raw(r.business.contactName), page: 1, text: "Contact Name:", slot: [76.2, 304.8], absY: 556.23, dy: 0 },
    { get: (r) => raw(r.business.phone), page: 1, text: "Phone:", region: { yMin: 552, yMax: 561 }, slot: [337.6, 449.5], absY: 556.23, dy: 0 },
    { get: (r) => raw(r.business.fax), page: 1, text: "FAX:", slot: [472.5, 594], absY: 556.23, dy: 0 },
    { get: (r) => raw(r.business.email), page: 1, text: "E-Mail:", slot: [45.7, 594], absY: 532.23, dy: 0 },
    /* p1 — owner block */
    { get: (r) => full(own(r, 0)), page: 1, text: "Officer Name:", slot: [71.6, 304.9], absY: 490.23, dy: 0 },
    { get: (r) => (/pres|v\.?\s?p|vice|member|owner|partner/.test(gcOwnerTitle(r)) ? "" : raw(own(r, 0).title)), page: 1, place: "center", absX: 465.5, absY: 491.8, maxWidth: 66, size: 7 },
    { get: (r) => raw(own(r, 0).ownershipPct), page: 1, slot: [555.4, 594], absY: 490.2, dy: 0 },
    { get: (r) => raw(own(r, 0).homeAddress), page: 1, text: "Street Address:", region: { yMin: 462, yMax: 471 }, slot: [78.5, 440], absY: 466.23, dy: 0 },
    { get: (r) => raw(own(r, 0).phone), page: 1, text: "Home Phone:", slot: [497.3, 594], absY: 466.23, dy: 0 },
    { get: (r) => raw(own(r, 0).city), page: 1, text: "City:", region: { yMin: 438, yMax: 447 }, slot: [36.5, 230], absY: 442.23, dy: 0 },
    { get: (r) => raw(own(r, 0).state), page: 1, text: "State:", region: { yMin: 438, yMax: 447 }, slot: [257.7, 302], absY: 442.23, dy: 0 },
    { get: (r) => raw(own(r, 0).zip), page: 1, text: "Zip:", region: { yMin: 438, yMax: 447 }, slot: [322.2, 440.1], absY: 442.23, dy: 0 },
    { get: (r) => raw(own(r, 0).ssn), page: 1, text: "SSN:", slot: [464.8, 594], absY: 442.23, dy: 0 },
    /* p1 — equipment rows: each value centered in its grid cell (measured vertical rules)
       and vertically centered in its row */
    ...[378.06, 351.06, 324.46].flatMap((ry, i) => [
      { get: (r) => raw(gcEq(r, i).qty), page: 1, slot: [68.7, 110.7], absY: ry, dy: 0 },
      { get: (r) => raw(gcEq(r, i).terminalType), page: 1, slot: [110.7, 188.9], absY: ry, dy: 0 },
      { get: (r) => raw(gcEq(r, i).model), page: 1, slot: [375.9, 483.9], absY: ry, dy: 0 },
      { get: (r) => raw(gcEq(r, i).serial), page: 1, slot: [483.9, 593.7], absY: ry, dy: 0 },
    ]),
    /* p1 — service-provider section */
    ...gcCells(1, (r) => gcR(r).merchantProcessingNum, [84.0, 100.0, 115.6, 131.6, 147.2, 163.2, 178.8, 194.8, 210.4, 226.2, 242.0, 257.6, 273.6, 289.2, 305.2], 273.2),
    ...gcCells(1, (r) => gcR(r).giftCardMerchantNum, [416.8, 432.8, 448.4, 464.4, 480.0, 496.0, 511.6, 527.6, 543.2, 559.2, 574.8], 273.2),
    { get: (r) => raw(gcR(r).chain), page: 1, text: "CHAIN:", slot: [435, 592.9], absY: 248.1, dy: 0 },
    ...gcCells(1, (r) => gcR(r).omahaMerchantNum, [106.0, 122.0, 137.6, 153.2, 169.2, 184.8, 200.8, 216.4, 232.4, 248.0, 264.0, 279.6, 295.6, 311.2, 327.2, 342.8, 358.6], 225.2),
    ...gcCells(1, (r) => raw(gcR(r).mcc) || raw(r.greenlight?.mcc), [437.4, 453.2, 468.8, 484.8], 225.2), // the MCC is the merchant's: one typed on the Greenlight form fills in here
    /* p1 — client authorization */
    { get: sigDate, page: 1, text: "Date:_", slot: [503.6, 588.4], absY: 100.7, dy: 0 },
    { get: sigName, page: 1, text: "Print Name:", slot: [75.2, 390.4], absY: 76.67, dy: 0 },
    { get: sigTitle, page: 1, text: "Title: _", slot: [428.4, 588.4], absY: 76.67, dy: 0 },
    /* p2 — Additional Location Form (scanned; active only when a location is entered) */
    { get: (r) => (gcLocActive(r) ? raw(gcR(r).merchantProcessingNum) : ""), page: 2, slot: [99.1, 306.5], absY: 719.8, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(gcR(r).giftCardMerchantNum) : ""), page: 2, slot: [387.1, 593.3], absY: 719.8, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.legalName) : ""), page: 2, slot: [63.9, 306.5], absY: 701.8, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.dba) : ""), page: 2, slot: [347.1, 593.2], absY: 701.8, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.locationAddress) : ""), page: 2, slot: [72.3, 593.2], absY: 679.5, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.locationCity) : ""), page: 2, slot: [37.1, 359.2], absY: 659.5, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.locationState) : ""), page: 2, slot: [381.7, 427.7], absY: 659.5, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.locationZip) : ""), page: 2, slot: [503.1, 593.2], absY: 659.5, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.contactName) : ""), page: 2, slot: [72.1, 210.1], absY: 640.6, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.phone) : ""), page: 2, slot: [266.3, 359.3], absY: 640.6, dy: 0 },
    { get: (r) => (gcLocActive(r) ? raw(r.business.email) : ""), page: 2, slot: [411.7, 593.2], absY: 640.6, dy: 0 },
    // Fee grid: each amount centered in its value cell (between the measured rules),
    // baselines centered in each row.
    ...[["setUpFee", 0, 613.6], ["addlLocFee", 0, 600.2], ["activationFee", 0, 586.4],
        ["redemptionFee", 1, 613.6], ["reloadFee", 1, 600.2], ["voidFee", 1, 586.4], ["balanceFee", 1, 572.9],
        ["otherFee", 2, 613.6], ["monthlyMinFee", 2, 600.2], ["monthlyFee", 2, 586.4]]
      .map(([k, col, cy]) => ({ get: (r) => (gcLocActive(r) ? money(gcR(r)[k]) : ""), page: 2, slot: [[157.2, 210.4], [361.0, 403.2], [551.1, 593.2]][col], absY: cy, dy: 0, size: 8 })),
    ...[0, 1].flatMap((i) => {
      const dy = i * -94.4;
      const L = (r) => gcLoc(r, i);
      // Each value centered between its label (measured ink end) and the cell's right rule.
      return [
        { get: (r) => raw(L(r).dba), page: 2, slot: [60.3, 593.1], absY: 539 + dy, dy: 0 },
        { get: (r) => raw(L(r).street), page: 2, slot: [72.3, 306.3], absY: 521.8 + dy, dy: 0 },
        { get: (r) => raw(L(r).city), page: 2, slot: [323.3, 441.4], absY: 521.8 + dy, dy: 0 },
        { get: (r) => raw(L(r).state), page: 2, slot: [463.5, 494.7], absY: 521.8 + dy, dy: 0 },
        { get: (r) => raw(L(r).zip), page: 2, slot: [548.7, 593.2], absY: 521.8 + dy, dy: 0 },
        { get: (r) => raw(L(r).phone), page: 2, slot: [74.7, 306.5], absY: 503.4 + dy, dy: 0 },
        { get: (r) => raw(L(r).fax), page: 2, slot: [351.9, 593.3], absY: 503.4 + dy, dy: 0 },
        { get: (r) => raw(L(r).contact), page: 2, slot: [71.7, 306.5], absY: 485.8 + dy, dy: 0 },
        { get: (r) => raw(L(r).positionTitle), page: 2, slot: [353.5, 593.3], absY: 485.8 + dy, dy: 0 },
        { get: (r) => raw(L(r).email), page: 2, slot: [72.7, 306.6], absY: 468.2 + dy, dy: 0 },
        { get: (r) => raw(L(r).processingNum), page: 2, slot: [385.9, 593.3], absY: 468.2 + dy, dy: 0 },
      ];
    }),
    { get: (r) => (gcLocActive(r) ? raw(r.sales.salesAgentName) : ""), page: 2, slot: [96.7, 207.9], absY: 68.5, dy: 0 },
    /* p3 — Bank Affiliation Change (scanned; active only when a new bank is named) */
    { get: (r) => (gcAffActive(r) ? raw(r.business.legalName) || raw(r.business.dba) : ""), page: 3, slot: [202, 443.2], absY: 508.2, dy: 0 },
    { get: (r) => (gcAffActive(r) ? raw(gcR(r).affBank) : ""), page: 3, slot: [396, 466.4], absY: 476.2, dy: 0 },
    { get: (r) => (gcAffActive(r) ? raw(r.business.legalName) : ""), page: 3, slot: [232.8, 520.8], absY: 444.2, dy: 0 },
    { get: (r) => (gcAffActive(r) ? raw(r.business.dba) : ""), page: 3, slot: [190, 516.8], absY: 419.8, dy: 0 },
    { get: (r) => (gcAffActive(r) ? raw(gcR(r).affMerchantId) || raw(r.po.mid) : ""), page: 3, absX: 190, absY: 395.8, dy: 0, maxWidth: 250 },
    { get: (r) => (gcAffActive(r) ? raw(gcR(r).affAltId) : ""), page: 3, absX: 300, absY: 371.8, dy: 0, maxWidth: 220 },
    { get: (r) => (gcAffActive(r) ? raw(gcR(r).affExistingNum) : ""), page: 3, absX: 262, absY: 347.8, dy: 0, maxWidth: 258 },
    { get: (r) => (gcAffActive(r) ? raw(gcR(r).affPromoNumber) : ""), page: 3, absX: 193, absY: 323.4, dy: 0, maxWidth: 300 },
    { get: (r) => (gcAffActive(r) ? raw(r.business.email) : ""), page: 3, slot: [251.6, 516], absY: 299.4, dy: 0 },
    { get: (r) => (gcAffActive(r) ? sigTitle(r) : ""), page: 3, slot: [127.6, 487], absY: 148.2, dy: 0 },
    { get: (r) => (gcAffActive(r) ? sigDate(r) : ""), page: 3, slot: [128, 228.4], absY: 127.7, dy: 0 },
  ],
  check: [
    /* p1 top row + application kind */
    { on: (r) => gcR(r).resubmission, page: 1, box: [90.2, 96, 768.37, 773.77] },
    { on: (r) => gcR(r).additionalInfo, page: 1, box: [239.4, 244.8, 768.37, 773.77] },
    { on: (r) => gcR(r).appKind === "new", page: 1, box: [18.4, 24.4, 718, 723.6] },
    { on: (r) => gcR(r).appKind === "outlet", page: 1, box: [162.2, 168, 717.97, 723.77] },
    { on: (r) => gcR(r).appKind === "entitle", page: 1, box: [162.2, 168, 697.17, 702.57] },
    /* p1 ownership type (from the shared organizationType) */
    { on: (r) => /sole|individual|propriet/.test(orgType(r)), page: 1, box: [18.3, 23.3, 516.67, 521.67] },
    { on: (r) => /partner/.test(orgType(r)) && !/ll[cp]|limited liab/.test(orgType(r)), page: 1, box: [101.1, 106.1, 516.67, 521.67] },
    { on: (r) => /non.?profit|501/.test(orgType(r)), page: 1, box: [167.5, 172.1, 516.67, 521.67] },
    { on: (r) => /public/.test(orgType(r)) && /corp|\binc\b/.test(orgType(r)), page: 1, box: [278, 282.6, 516.67, 521.67] },
    { on: (r) => /corp|\binc\b|incorporated/.test(orgType(r)) && !/public|non.?profit|501|govern|municip|ll[cp]|limited liab/.test(orgType(r)), page: 1, box: [347, 352, 516.67, 521.67] },
    { on: (r) => /ll[cp]|limited liab/.test(orgType(r)), page: 1, box: [419.1, 424.1, 516.67, 521.67] },
    { on: (r) => /govern|municip/.test(orgType(r)), page: 1, box: [463.5, 468.1, 516.67, 521.67] },
    /* p1 owner title */
    { on: (r) => /pres/.test(gcOwnerTitle(r)), page: 1, box: [333.5, 338.1, 502.67, 507.67] },
    { on: (r) => /v\.?\s?p|vice/.test(gcOwnerTitle(r)), page: 1, box: [370.7, 375.3, 502.67, 507.67] },
    { on: (r) => /member/.test(gcOwnerTitle(r)), page: 1, box: [401.1, 405.7, 502.67, 507.67] },
    { on: (r) => /owner/.test(gcOwnerTitle(r)), page: 1, box: [333.5, 338.1, 490.67, 495.67] },
    { on: (r) => /partner/.test(gcOwnerTitle(r)), page: 1, box: [375.8, 380.8, 490.67, 495.67] },
    { on: (r) => Boolean(gcOwnerTitle(r)) && !/pres|v\.?\s?p|vice|member|owner|partner/.test(gcOwnerTitle(r)), page: 1, box: [421.4, 426.4, 490.67, 495.67] },
    /* p1 equipment business-type per row: measured boxes on the upper / lower option lines */
    ...[0, 1, 2].flatMap((i) => {
      const [u0, u1] = [[383.47, 388.47], [356.67, 361.27], [329.47, 334.47]][i];
      const [l0, l1] = [[371.47, 376.47], [344.67, 349.27], [317.47, 322.47]][i];
      const t = (r) => raw(gcEq(r, i).bizType).toLowerCase();
      return [
        { on: (r) => t(r) === "retail", page: 1, box: [195.9, 200.5, u0, u1] },
        { on: (r) => t(r) === "restaurant", page: 1, box: [235.1, 240.1, u0, u1] },
        { on: (r) => t(r) === "qsr", page: 1, box: [294.7, 299.7, u0, u1] },
        { on: (r) => t(r) === "lodging", page: 1, box: [329.9, 334.5, u0, u1] },
        { on: (r) => t(r) === "supermarket", page: 1, box: [204.7, 209.3, l0, l1] },
        { on: (r) => t(r) === "carrental", page: 1, box: [271, 276, l0, l1] },
        { on: (r) => t(r) === "moto", page: 1, box: [329.1, 333.7, l0, l1] },
      ];
    }),
  ],
  // Owner 1 signs the p1 authorization X line; the p3 principal line only when
  // the bank-affiliation section is in use.
  sign: [
    { page: 1, x: 225.2, y: 97.1, maxW: 241, maxH: 21, center: true },
    { page: 3, x: 102.8, y: 175.3, maxW: 232.8, maxH: 22, center: true, on: (r) => gcAffActive(r) },
  ],
};


/* ============ Wholesale Payments Cash Advance Application (1 page) ============ */
// A scanned page (no text layer): every blank is placed by absolute coordinates
// measured from the template pixels. Each value is centered in its blank and
// sits level with the printed labels: 0.6pt above the underline (the serif
// signature-row labels sit higher, 1.2pt).
const caR = (r) => r.cashAdvance || {};
const caLine = (get, y, x0, x1, extra = {}) => ({
  get, page: 1, place: "center", absX: (x0 + x1) / 2, absY: y + 0.6, dy: 0,
  maxWidth: x1 - x0 - (x1 - x0 < 40 ? 2 : 6), // narrow blanks keep just 1pt clear each side
  ...extra,
});
// Digit slots (SSN / DOB / start-date pieces) share one 8pt size so a 4-digit
// year fits its slot at the same size as the month and day beside it.
const caSlot = (get, y, x0, x1) => caLine(get, y, x0, x1, { size: 8, maxWidth: x1 - x0 - 1 });
// Parse a whole-string dollar amount ("$1,234.56", "50k", "1.5M", "(500)", "-$20").
// Anything else — ranges, words, mixed text — returns null and prints as typed.
const caAmount = (v) => {
  let t = raw(v).replace(/\s+/g, " ");
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1).trim(); }
  t = t.replace(/^\$\s*/, "");
  if (t.startsWith("-")) { neg = !neg; t = t.slice(1).trim(); }
  const m = t.match(/^(\d{1,3}(?:,\d{3})+|\d+)?(\.\d+)?\s*(k|thousand|m|mm|mil|million)?$/i);
  if (!m || (!m[1] && !m[2])) return null;
  let n = parseFloat((m[1] || "0").replace(/,/g, "") + (m[2] || ""));
  const suf = (m[3] || "").toLowerCase();
  if (suf === "k" || suf === "thousand") n *= 1e3;
  else if (suf) n *= 1e6;
  n = Math.round(n * 100) / 100;
  return neg && n !== 0 ? -n : n;
};
const caFmt = (n, whole) => {
  const v = whole ? Math.round(n) : n;
  const a = Math.abs(v);
  const cents = !whole && Math.round(a * 100) % 100 !== 0;
  const body = a.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return (v < 0 && a !== 0 ? "-" : "") + "$" + body;
};
const caMoney = (v) => { const n = caAmount(v); return n == null ? raw(v) : caFmt(n, false); };
// The Current Positions amount/balance blanks are tiny (the balance blank is 32pt):
// show whole dollars there so a full balance fits at a legible size.
const caMoneyWhole = (v) => { const n = caAmount(v); return n == null ? raw(v) : caFmt(n, true); };
// Balance blank (32pt): a million or more prints compact ("$1.25M") so it never truncates.
const caMoneyBalance = (v) => {
  const n = caAmount(v);
  if (n == null) return raw(v);
  if (Math.abs(n) >= 1e6) return (n < 0 ? "-" : "") + "$" + (Math.abs(n) / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  return caFmt(n, true);
};
const caWeb = (v) => raw(v).replace(/^https?:\/\//i, "").replace(/\/$/, "");
const caPct = (v) => (/^\d+(\.\d+)?$/.test(raw(v)) ? raw(v) + "%" : raw(v));
const CA_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Split a free-text date into { m, d, y } for the printed ___/___/____ slots.
// Anything unparseable comes back as { whole } and prints across the full blank.
const caDate = (v) => {
  const t = raw(v);
  if (!t) return {};
  const pad = (n) => String(n).padStart(2, "0");
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return { m: pad(m[2]), d: pad(m[3]), y: m[1] };
  if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/))) return { m: pad(m[1]), d: pad(m[2]), y: m[3] };
  if ((m = t.match(/^(\d{1,2})[\/.-](\d{4})$/))) return { m: pad(m[1]), y: m[2] };
  if ((m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i)) && CA_MONTHS[m[1].toLowerCase()]) return { m: pad(CA_MONTHS[m[1].toLowerCase()]), d: pad(m[2]), y: m[3] };
  if ((m = t.match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/i)) && CA_MONTHS[m[1].toLowerCase()]) return { m: pad(CA_MONTHS[m[1].toLowerCase()]), y: m[2] };
  if ((m = t.match(/^(\d{4})$/))) return { y: m[1] };
  return { whole: t };
};
// SSN into its three printed groups; anything not 9 digits prints across the blank.
const caSsn = (v) => {
  const t = raw(v), dg = t.replace(/\D/g, "");
  if (!t) return {};
  return dg.length === 9 ? { a: dg.slice(0, 3), b: dg.slice(3, 5), c: dg.slice(5) } : { whole: t };
};
const caHasOwner2 = (r) => Boolean(raw(own(r, 1).first) || raw(own(r, 1).last));

// Blank geometry: [underline y, x start, x end] (measured).
const CA_OWNER = [
  { first: [536.8, 374.8, 450.0], last: [536.8, 494.0, 591.2], addr: [515.6, 366.8, 588.0],
    city: [493.6, 350.0, 438.4], state: [493.6, 465.6, 535.6], zip: [493.6, 552.0, 586.0],
    home: [468.8, 387.2, 464.0], mobile: [468.8, 497.6, 586.4], email: [448.0, 359.2, 586.4],
    ssnY: 424.0, ssn: [[394.0, 419.6], [424.4, 456.0], [460.8, 486.8]], dob: [[504.4, 530.4], [536.0, 562.0], [567.6, 588.0]],
    pct: [400.0, 442.8, 579.6], score: [376.0, 411.2, 566.0] },
  { first: [278.4, 374.8, 450.0], last: [278.4, 493.6, 590.8], addr: [256.8, 366.4, 587.6],
    city: [235.2, 349.6, 438.0], state: [235.2, 464.8, 535.2], zip: [235.2, 551.2, 585.6],
    home: [211.2, 386.0, 462.8], mobile: [211.2, 496.4, 585.2], email: [189.6, 358.8, 586.0],
    ssnY: 165.6, ssn: [[393.2, 419.2], [424.0, 455.6], [460.0, 486.4]], dob: [[504.0, 530.0], [535.6, 561.6], [567.2, 587.6]],
    pct: [141.6, 442.4, 579.2], score: [117.6, 410.0, 564.8] },
];
const caOwnerSpecs = (i) => {
  const G = CA_OWNER[i];
  const o = (r) => own(r, i);
  const on = (f) => (r) => (i === 0 || caHasOwner2(r) ? f(r) : "");
  const ssnSpan = [G.ssn[0][0], G.ssn[2][1]];
  const dobSpan = [G.dob[0][0], G.dob[2][1]];
  return [
    caLine(on((r) => raw(o(r).first)), ...G.first),
    caLine(on((r) => raw(o(r).last)), ...G.last),
    caLine(on((r) => raw(o(r).homeAddress)), ...G.addr),
    caLine(on((r) => raw(o(r).city)), ...G.city),
    caLine(on((r) => raw(o(r).state)), ...G.state),
    caLine(on((r) => raw(o(r).zip)), ...G.zip),
    caLine(on((r) => raw(o(r).phone)), ...G.home),
    caLine(on((r) => raw(caR(r)[`owner${i + 1}Mobile`])), ...G.mobile),
    caLine(on((r) => raw(o(r).email)), ...G.email),
    ...["a", "b", "c"].map((k, j) => caSlot(on((r) => caSsn(o(r).ssn)[k] || ""), G.ssnY, ...G.ssn[j])),
    caSlot(on((r) => caSsn(o(r).ssn).whole || ""), G.ssnY, ...ssnSpan),
    ...["m", "d", "y"].map((k, j) => caSlot(on((r) => caDate(o(r).dob)[k] || ""), G.ssnY, ...G.dob[j])),
    caSlot(on((r) => caDate(o(r).dob).whole || ""), G.ssnY, ...dobSpan),
    caLine(on((r) => caPct(o(r).ownershipPct)), ...G.pct),
    caLine(on((r) => raw(caR(r)[`owner${i + 1}CreditScore`])), ...G.score),
  ];
};
const CA_POS_Y = [367.2, 356.8, 346.8];
const caPos = (r, i) => {
  const p = caR(r).positions;
  const arr = Array.isArray(p) ? p : p && typeof p === "object" ? Object.keys(p).sort((a, b) => a - b).map((k) => p[k]) : [];
  return arr[i] || {};
};
const START = [[239.6, 253.2], [256.0, 269.6], [272.0, 290.8]];
// Tested in priority order; the first match is the ONLY box checked, anything
// unmatched (non-profit, government, trust, ...) is "Other".
const CA_ENTITY = [
  [(t) => /\bp?llc\b|l\.l\.c|limited liability co/.test(t), 33.6],
  [(t) => /corp|\binc\b|(?<!un)incorporated|\bp\.?c\b/.test(t) && !/unincorporated|non.?profit|501|govern|municip/.test(t), 64.8],
  [(t) => /partner|\bl?l?p\b|\bgp\b/.test(t), 124.2],
  [(t) => /sole|individual|propriet/.test(t), 182.2],
];
const caEntityIdx = (r) => {
  const t = orgType(r);
  if (!t) return -1;
  const i = CA_ENTITY.findIndex(([test]) => test(t));
  return i < 0 ? CA_ENTITY.length : i; // CA_ENTITY.length = "Other"
};

const cash_advance = {
  text: [
    /* ISO / agent / request */
    caLine((r) => raw(caR(r).isoName), 643.2, 92.8, 293.2),
    caLine((r) => raw(caR(r).agentName) || raw(r.sales?.salesAgentName), 642.4, 349.2, 582.4),
    caLine((r) => caMoney(caR(r).requestedAmount), 619.6, 140.0, 293.6),
    caLine((r) => raw(caR(r).useOfFunds), 619.2, 391.2, 582.0),
    /* business */
    caLine((r) => raw(r.business.legalName), 540.8, 117.6, 280.8),
    caLine((r) => raw(r.business.dba), 519.6, 49.2, 282.4),
    caLine((r) => raw(r.business.federalTaxId), 498.0, 56.4, 140.0),
    caLine((r) => raw(r.business.contactPhone) || raw(r.business.phone), 498.4, 205.2, 288.8),
    caLine((r) => raw(r.business.locationAddress), 478.0, 72.4, 282.0),
    caLine((r) => raw(r.business.locationCity), 455.2, 49.2, 104.8),
    caLine((r) => raw(r.business.locationState), 455.2, 132.8, 202.0),
    caLine((r) => raw(r.business.locationZip), 455.2, 215.6, 285.6),
    caLine((r) => raw(r.business.phone), 432.4, 100.0, 188.0),
    ...["m", "d", "y"].map((k, j) => caSlot((r) => caDate(r.business.businessStarted)[k] || "", 432.0, ...START[j])),
    caSlot((r) => caDate(r.business.businessStarted).whole || "", 432.0, START[0][0], START[2][1]),
    caLine((r) => caWeb(r.business.website), 412.8, 106.4, 278.8),
    caLine((r) => raw(r.business.email), 393.6, 90.8, 281.6),
    /* current positions: lender / amount / balance */
    ...CA_POS_Y.flatMap((y, i) => [
      caLine((r) => raw(caPos(r, i).lender), y, 58.0, 136.4),
      caLine((r) => caMoneyWhole(caPos(r, i).amount), y, 153.6, 222.8),
      caLine((r) => caMoneyBalance(caPos(r, i).balance), y, 256.0, 288.0),
    ]),
    caLine((r) => {
      const given = raw(caR(r).bankruptcy) || raw(r.greenlight?.bankruptcy); // answered once, on either form
      const b = given.toLowerCase();
      const yn = b === "yes" ? "Yes" : b === "no" ? "No" : given;
      const det = raw(caR(r).bankruptcyDetails);
      return [yn, det].filter(Boolean).join(" - ");
    }, 326.4, 164.8, 285.6),
    caLine((r) => caMoney(caR(r).rent), 296.8, 71.2, 145.6),
    caLine((r) => caMoney(caR(r).mortgage), 296.8, 188.4, 262.4),
    /* credit card processing / financial */
    caLine((r) => caMoney(raw(caR(r).totalCcSales) || raw(r.transaction?.monthlyVolume)), 200.4, 120.8, 284.0),
    caLine((r) => caMoney(caR(r).totalGrossDeposits), 178.0, 112.8, 289.6),
    caLine((r) => caMoney(caR(r).avgBankBalance), 155.6, 102.4, 288.8),
    caLine((r) => raw(caR(r).avgNsf), 132.0, 131.6, 290.0),
    /* owners */
    ...caOwnerSpecs(0),
    ...caOwnerSpecs(1),
    /* certification dates (the owner lines themselves are for signatures) */
    caLine(sigDate, 38.0, 388.0, 577.6, { absY: 38.0 + 1.2 }),
    caLine((r) => (caHasOwner2(r) ? raw(r.signatures?.date2) : ""), 19.6, 388.0, 577.6, { absY: 19.6 + 1.2 }),
  ],
  check: [
    /* documents-attached checklist (4.4pt boxes) */
    ...[["docCcStatements", 734.2], ["docBankStatements", 721.8], ["docDriversLicense", 711.4], ["docVoidedCheck", 700.6]]
      .map(([k, cy]) => ({ on: (r) => Boolean(caR(r)[k]), page: 1, center: true, absX: 359.0, absY: cy - 1.37, size: 3.8 })), // box interior is ~2.8pt inside a thick outline
    /* entity type (8pt boxes); any type matching none of the four is "Other" */
    ...[...CA_ENTITY.map(([, cx]) => cx), 256.4].map((cx, i) => ({ on: (r) => caEntityIdx(r) === i, page: 1, center: true, absX: cx, absY: 566.6 - 2.72, size: 7.5 })),
  ],
  // Owner 1's "Sign now" signature, centered on the Owner 1 line.
  sign: [{ page: 1, x: 62, y: 38.6, maxW: 297, maxH: 15.5, center: true }],
};

/* ======== Factor4 Merchant Set-Up Form (gift & loyalty program, 2 pages) ======== */
// The template's own form fields and ruled rows give each blank's exact extent
// (measured from the page): a value is centered between the end of its label's
// ink and the row's right rule, and its baseline centered between the row's
// rules (level with the printed labels). Values on an underline (# of Cards,
// Pricing, the signature row) sit on it like the label beside or under it.
const f4R = (r) => r.factor4 || {};
const F4_HALF_CAP = (0.718 * 9) / 2; // half the cap height of the 9pt value text
const f4Row = (get, page, slot, [b, t], extra = {}) => ({ get, page, slot, absY: (b + t) / 2 - F4_HALF_CAP, dy: 0, ...extra });
const f4Line = (get, page, slot, y, extra = {}) => ({ get, page, slot, absY: y, dy: 0, ...extra });
// A value too long for one line at `size` breaks onto two, both centered in the
// row: baselines placed so the pair sits in the middle between the rules.
const f4Two = ([b, t], size = 7) => {
  const g = 1.2 * size, top = (b + t) / 2 + (g - 0.718 * size) / 2;
  return { wrap: { y: [top, top - g], size } };
};
// Ruled lines inside a box: words fill each line in turn (see fillForm's wrap).
const f4Box = (get, page, [l, r], ys, size) => ({ get, page, wrap: { y: ys, slots: ys.map(() => [l, r]), size }, size });
const f4Web = (v) => raw(v).replace(/^https?:\/\//i, "").replace(/\/$/, "");
const f4Money = (v) => { const n = caAmount(v); return n == null ? raw(v) : caFmt(n, false); };
const f4Same = (a, b) => raw(a).toLowerCase().replace(/\s+/g, " ") === raw(b).toLowerCase().replace(/\s+/g, " ");
// Primary contact — one person, never one person's name with another's details:
// typed in here; else the business contact (with the business contact phone and
// email); else Owner 1 (with Owner 1's). A business phone / email fills in for
// a missing one (it reaches whoever the contact is).
const f4Primary = (r) => {
  const f = f4R(r), b = r.business || {}, o = own(r, 0);
  const pick = raw(f.primaryContact) ? { name: raw(f.primaryContact) }
    : raw(b.contactName) ? { name: raw(b.contactName), phone: raw(b.contactPhone) }
    : full(o) ? { name: full(o), phone: raw(o.phone), email: raw(o.email) } : { name: "" };
  return { name: pick.name, phone: raw(f.primaryPhone) || pick.phone || raw(b.phone), email: raw(f.primaryEmail) || pick.email || raw(b.email) };
};
// Secondary contact: typed in; else Owner 2 — or Owner 1 when Owner 2 is the
// primary contact or there's no Owner 2 and Owner 1 isn't the primary — with
// their own phone and email. Never the primary contact again.
const f4Second = (r) => {
  const f = f4R(r);
  if (raw(f.secondaryContact)) return { name: raw(f.secondaryContact), phone: raw(f.secondaryPhone), email: raw(f.secondaryEmail) };
  const primary = f4Primary(r).name;
  const o = [own(r, 1), own(r, 0)].find((x) => full(x) && !f4Same(full(x), primary));
  if (!o) return { name: "", phone: raw(f.secondaryPhone), email: raw(f.secondaryEmail) };
  return { name: full(o), phone: raw(f.secondaryPhone) || raw(o.phone), email: raw(f.secondaryEmail) || raw(o.email) };
};
// Terminals / tablets among the equipment rows: accessories, care plans, pin pads
// and starter kits aren't terminals (a Clover pin pad — the Compact — is; so are
// tablets and any model not in the price list). A quantity of 0 is left out.
const f4Equip = (r) => (Array.isArray(r.equipment) ? r.equipment : []).filter((e) => {
  const m = raw(e && (e.model || e.type));
  if (!m || raw(e.quantity) === "0") return false;
  const c = eqCat(m);
  if (c === "Accessories") return /tablet|ipad/i.test(m);
  if (c === "Pin Pads") return /clover/i.test(m);
  return c !== "Warranties" && c !== "USB Swipers";
});
const f4Terminal = (r) => raw(f4R(r).terminalType) || [...new Set(f4Equip(r).map((e) => raw(e.model || e.type)))].join(", ");
// a row with no quantity is one (as on the purchase order); any quantity that
// isn't a number leaves the count to be typed
const f4Count = (r) => {
  if (raw(f4R(r).numTerminals)) return raw(f4R(r).numTerminals);
  const q = f4Equip(r).map((e) => raw(e.quantity) || "1");
  return q.length && q.every((x) => /^\d+$/.test(x)) ? String(q.reduce((s, x) => s + Number(x), 0)) : "";
};
const f4IpDial = (r) => {
  const v = raw(f4R(r).ipOrDial).toLowerCase();
  if (v === "ip") return "IP";
  if (v === "dial") return "Dial";
  if (v) return raw(f4R(r).ipOrDial);
  const c = raw(r.coversheet?.fbConnection).toLowerCase();
  return c === "dial" ? "Dial" : /^(ethernet|wifi|wireless)$/.test(c) ? "IP" : "";
};
// What the form prints for each of its own fields that fills in by itself — the
// map prints it, and the review form shows it in the field (see formDefaults).
const F4_PRINT = {
  companyName: (r) => raw(f4R(r).companyName) || raw(r.business.dba) || raw(r.business.legalName),
  numLocations: (r) => raw(f4R(r).numLocations) || raw(r.giftCard?.numLocations),
  primaryContact: (r) => f4Primary(r).name, primaryPhone: (r) => f4Primary(r).phone, primaryEmail: (r) => f4Primary(r).email,
  secondaryContact: (r) => f4Second(r).name, secondaryPhone: (r) => f4Second(r).phone, secondaryEmail: (r) => f4Second(r).email,
  ipOrDial: (r) => f4IpDial(r), terminalType: (r) => f4Terminal(r), numTerminals: (r) => f4Count(r),
};
// Row geometry [bottom rule, top rule] and blanks [label ink end, right rule] (measured).
const F4 = {
  legal: [589.81, 611.41], dba: [568.2, 589.8], company: [545.8, 567.4], address: [524.19, 545.79],
  city: [501.82, 523.42], phone: [480.07, 501.67], ext: [480.2, 501.4], web: [458.03, 479.63],
  contact1: [400.92, 423.72], contact2: [378.82, 400.82],
  ipDial: [328.28, 360.28], terminal: [302.64, 327.84], terminals: [302.24, 327.84], processor: [276.49, 302.09],
  bank: [491.6, 513.6], branch: [469.6, 491.6], bankCity: [447.6, 469.6], routing: [425.6, 447.6], account: [403.6, 425.6],
};

const factor4 = {
  text: [
    /* p1 — merchant information */
    f4Row((r) => raw(r.business.legalName), 1, [84.4, 390.4], F4.legal, f4Two(F4.legal, 7.5)),
    f4Row((r) => raw(r.business.dba), 1, [88.9, 390.4], F4.dba, f4Two(F4.dba, 7.5)),
    f4Row(F4_PRINT.companyName, 1, [74.3, 319.7], F4.company, f4Two(F4.company, 7.5)),
    f4Row(F4_PRINT.numLocations, 1, [360.9, 390.4], F4.company),
    f4Row((r) => raw(r.business.locationAddress), 1, [74.3, 390.4], F4.address, f4Two(F4.address, 7.5)),
    f4Row((r) => raw(r.business.locationCity), 1, [55.6, 242.9], F4.city),
    f4Row((r) => stAbbr(r.business.locationState), 1, [267.6, 308.0], F4.city),
    f4Row((r) => raw(r.business.locationZip), 1, [326.1, 390.4], F4.city),
    f4Row((r) => raw(r.business.phone), 1, [74.3, 242.9], F4.phone),
    f4Row((r) => raw(f4R(r).phoneExt), 1, [269.9, 308.0], F4.ext),
    f4Row((r) => raw(r.business.fax), 1, [327.4, 390.4], F4.ext),
    f4Row((r) => f4Web(r.business.website), 1, [70.6, 390.4], F4.web),
    /* p1 — per location pricing / monthly (the box: ruled lines top down) */
    f4Box((r) => f4Money(f4R(r).perLocationPricing), 1, [408.0, 575.2], [619.5, 608.5, 597.5, 586.5, 575.5, 564.5]),
    /* p1 — cards / starter kit pricing */
    f4Line((r) => raw(f4R(r).numCards), 1, [466.4, 567.2], 511.4, { wrap: { y: [519.8, 511.4], size: 7 } }),
    f4Line((r) => f4Money(f4R(r).cardPricing), 1, [452.4, 566.4], 485.8, { wrap: { y: [494.2, 485.8], size: 7 } }),
    f4Box((r) => raw(f4R(r).cardNotes), 1, [408.0, 575.2], [466.5, 456.5, 446.5, 436.5], 8),
    /* p1 — contact information */
    f4Row(F4_PRINT.primaryContact, 1, [69.9, 171.4], F4.contact1, f4Two(F4.contact1)),
    f4Row(F4_PRINT.primaryPhone, 1, [201.0, 306.7], F4.contact1),
    f4Row(F4_PRINT.primaryEmail, 1, [332.8, 577.6], F4.contact1),
    f4Row(F4_PRINT.secondaryContact, 1, [78.3, 171.4], F4.contact2, f4Two(F4.contact2)),
    f4Row(F4_PRINT.secondaryPhone, 1, [201.0, 306.7], F4.contact2),
    f4Row(F4_PRINT.secondaryEmail, 1, [332.8, 577.6], F4.contact2),
    /* p1 — equipment */
    f4Row(F4_PRINT.ipOrDial, 1, [437.6, 556.8], F4.ipDial),
    f4Row(F4_PRINT.terminalType, 1, [102.2, 386.1], F4.terminal, f4Two(F4.terminal, 7.5)),
    f4Row(F4_PRINT.numTerminals, 1, [456.3, 556.8], F4.terminals),
    f4Row((r) => raw(f4R(r).ccProcessor), 1, [77.0, 556.8], F4.processor, f4Two(F4.processor, 7.5)),
    /* p2 — electronic funds transfer */
    f4Row((r) => raw(r.banking.bankName), 2, [83.3, 574.8], F4.bank, f4Two(F4.bank, 7.5)),
    f4Row((r) => raw(f4R(r).bankBranch), 2, [67.3, 574.8], F4.branch, f4Two(F4.branch, 7.5)),
    f4Row((r) => raw(f4R(r).bankCity), 2, [55.3, 362.2], F4.bankCity, f4Two(F4.bankCity, 7.5)),
    f4Row((r) => stAbbr(f4R(r).bankState), 2, [387.3, 574.8], F4.bankCity),
    f4Row((r) => raw(r.banking.routing), 2, [146.4, 574.8], F4.routing),
    f4Row((r) => raw(r.banking.account), 2, [102.4, 574.8], F4.account),
    /* p2 — signature row (values on the line, above their labels) */
    f4Line(sigTitle, 2, [201.2, 287.2], 280.6, { wrap: { y: [289.0, 280.6], size: 7 } }),
    f4Line(sigName, 2, [309.2, 468.2], 280.6, { wrap: { y: [289.0, 280.6], size: 7 } }),
    f4Line(sigDate, 2, [471.2, 575.2], 280.6),
  ],
  check: [
    /* p1 — equipment: standalone (gift only) or integrate with credit card */
    { on: (r) => f4R(r).integration === "standalone", page: 1, box: [41.0, 60.6, 335.14, 354.74], size: 12 },
    { on: (r) => f4R(r).integration === "integrated", page: 1, box: [177.22, 196.81, 335.31, 354.91], size: 12 },
    /* p1 — the program */
    { on: (r) => f4R(r).program === "gift", page: 1, box: [75.94, 94.34, 255.06, 273.46], size: 12 },
    { on: (r) => f4R(r).program === "loyalty", page: 1, box: [246.18, 263.78, 255.88, 273.49], size: 12 },
    { on: (r) => f4R(r).program === "both", page: 1, box: [424.24, 441.04, 256.23, 272.63], size: 12 },
    /* p1 — loyalty program option */
    { on: (r) => f4R(r).loyaltyOption === "points", page: 1, box: [97.78, 114.58, 181.29, 198.09], size: 12 },
    { on: (r) => f4R(r).loyaltyOption === "threshold", page: 1, box: [357.98, 372.78, 182.85, 197.65], size: 12 },
    { on: (r) => f4R(r).loyaltyOption === "cashback", page: 1, box: [76.85, 92.45, 115.94, 131.55], size: 12 },
    { on: (r) => f4R(r).loyaltyOption === "punch", page: 1, box: [358.29, 373.09, 115.62, 130.42], size: 12 },
  ],
  // Owner 1's "Sign now" signature on the Principal line.
  sign: [{ page: 2, x: 39.24, y: 279.4, maxW: 159, maxH: 24, center: true }],
};

/* ===== Greenlight Payments — CBD Merchant Processing Program packet (11 pages) ===== */
// Pages 1-4 are the program's checklist and letter (nothing to fill). Page 5
// and 6 are acknowledgements (company / date / print name & title on their
// lines), page 7 the document checklist, page 8 the Cannabinoid Addendum, and
// pages 9-11 the Merchant Application. Every blank is placed by the template's
// own form fields and its rendered rules (measured): GL_T = [page, left, right,
// baseline] — a value is centered in its blank, under the cell's label and
// centered between the row's rules; GL_B = [page, left, right, bottom, top] —
// a box's inner edges.
const GL_T = {"iso":[9,23.28,232.94,714.34],"agent":[9,234.72,430.86,714.34],"program":[9,432.78,588.58,714.34],"legalName":[9,23.28,282.4,669.67],"dba":[9,284.04,588.44,669.67],"legalAddr":[9,23.28,282.4,648.07],"dbaAddr":[9,284.04,588.44,648.07],"ein":[9,284.04,412.92,604.87],"started":[9,414.78,588.58,604.87],"contact":[9,23.28,250.94,583.27],"phone":[9,252.72,399.28,583.27],"email":[9,401.28,588.46,583.27],"web":[9,23.28,250.94,561.67],"csPhone":[9,252.72,399.28,561.67],"fax":[9,401.28,588.46,561.67],"products":[9,23.28,285.62,517.32],"description":[9,287.28,486.14,517.32],"mcc":[9,487.98,588.58,517.32],"fulfillment":[9,23.28,285.62,495.72],"fulfillmentContact":[9,287.28,588.46,495.72],"prevProc":[9,23.28,285.62,474.12],"refund":[9,171.72,255.38,452.52],"days":[9,257.28,336.46,452.52],"depositPct":[9,423.72,588.48,452.52],"monthlyVol":[10,292.8,388.0,643.43],"avgTicket":[10,293.06,388.06,620.27],"highTicket":[10,292.34,387.74,597.11],"amexVol":[10,292.34,387.74,573.89],"bankName":[10,23.28,196.94,494.01],"routing":[10,198.72,345.28,494.01],"account":[10,347.28,498.46,494.01],"cdRate":[10,240.44,332.15,452.92],"flatPer":[10,150.87,237.64,438.37],"flatRate":[10,240.44,332.15,438.22],"icPer":[10,151.12,237.69,423.87],"icRate":[10,240.74,332.05,423.82],"qualPer":[10,150.78,237.74,409.75],"qualRate":[10,240.39,332.05,409.19],"midQual":[10,240.44,332.15,395.32],"nonQual":[10,240.78,332.1,380.62],"pinPer":[10,150.19,237.68,366.35],"pinRate":[10,240.78,332.07,366.57],"auth":[10,150.46,237.73,351.79],"batch":[10,150.02,237.68,337.04],"avs":[10,149.97,237.69,322.69],"ebt":[10,149.86,237.78,308.75],"underwriting":[10,150.37,237.63,294.54],"annual":[10,150.17,237.64,280.54],"annualStart":[10,70.95,147.25,280.49],"monthlySvc":[10,468.78,588.58,452.57],"compliance":[10,468.78,588.58,438.17],"risk":[10,468.78,588.58,394.97],"merlink":[10,468.78,588.58,322.97],"monthlyMin":[10,468.78,588.58,294.17],"etf":[10,468.78,588.58,280.21],"sig1Title":[11,383.28,502.94,234.91],"sig1Date":[11,504.72,588.46,234.91],"sig2Title":[11,383.28,502.94,213.31],"sig2Date":[11,504.72,588.46,213.31],"sig3Title":[11,383.28,502.94,191.71],"sig3Date":[11,504.72,588.46,191.71],"g1Title":[11,383.28,502.94,119.04],"g1Date":[11,504.72,588.46,119.04],"g2Title":[11,383.28,502.94,97.44],"g2Date":[11,504.72,588.46,97.44],"o1Title":[9,374.28,495.64,314.46],"o1Pct":[9,497.52,588.5,314.46],"o1Addr":[9,23.28,250.94,292.86],"o1City":[9,252.78,461.38,292.86],"o1State":[9,462.96,495.78,292.86],"o1Zip":[9,497.52,588.5,292.86],"o1Email":[9,23.28,250.94,271.26],"o1Phone":[9,252.76,422.16,271.26],"o1Ssn":[9,423.72,588.4,271.26],"o1Dl":[9,23.28,250.94,249.7],"o1DlState":[9,252.76,422.16,249.7],"o1Dob":[9,423.72,588.4,249.7],"o2Title":[9,374.28,495.64,207.3],"o2Pct":[9,497.52,588.5,207.3],"o2Addr":[9,23.28,250.94,185.7],"o2City":[9,252.78,461.38,185.7],"o2State":[9,462.96,495.78,185.7],"o2Zip":[9,497.52,588.5,185.7],"o2Email":[9,23.28,250.94,164.1],"o2Phone":[9,252.76,422.16,164.1],"o2Ssn":[9,423.72,588.4,164.1],"o2Dl":[9,23.28,354.46,142.44],"o2DlState":[9,356.34,422.14,142.44],"o2Dob":[9,423.72,588.4,142.44],"o3Title":[9,374.28,495.64,102.82],"o3Pct":[9,497.52,588.5,102.82],"o3Addr":[9,23.28,250.94,81.22],"o3City":[9,252.78,461.38,81.22],"o3State":[9,462.96,495.78,81.22],"o3Zip":[9,497.52,588.5,81.22],"o3Email":[9,23.28,250.94,59.62],"o3Phone":[9,252.76,422.16,59.62],"o3Ssn":[9,423.72,588.4,59.62],"o3Dl":[10,23.28,354.46,736.44],"o3DlState":[10,356.34,422.14,736.44],"o3Dob":[10,423.72,588.4,736.44],"o1Name":[9,23.28,372.58,314.46],"o2Name":[9,23.16,372.47,207.24],"o3Name":[9,23.16,372.03,102.88],"sig1Name":[11,190.11,381.39,234.87],"sig2Name":[11,190.14,381.22,213.26],"sig3Name":[11,190.14,381.22,191.66],"g1Name":[11,190.14,381.22,118.99],"g2Name":[11,190.14,381.22,97.39],"legalCsz":[9,23.28,282.4,626.47],"dbaCsz":[9,284.04,588.44,626.47]};
const GL_B = {"mailCorp":[9,80.5,87.0,701.74,708.24],"mailDba":[9,172.14,178.64,701.74,708.24],"llc":[9,31.36,37.86,604.54,611.04],"corp":[9,69.8,76.3,604.54,611.04],"nonProfit":[9,139.74,146.24,604.54,611.04],"soleProp":[9,206.1,212.6,604.54,611.04],"bkYes":[9,296.14,303.04,473.72,480.22],"bkNo":[9,336.52,343.42,473.72,480.22],"matchYes":[9,441.78,448.68,473.72,480.22],"matchNo":[9,482.12,489.02,473.72,480.22],"purchase":[9,30.18,37.08,452.12,458.62],"shipment":[9,93.8,100.3,452.12,458.62],"depYes":[9,343.34,349.84,452.12,458.62],"depNo":[9,379.3,386.2,452.12,458.62],"mktSocial":[9,28.14,35.04,430.52,437.02],"mktSms":[9,100.52,107.42,430.52,437.02],"mktEmail":[9,160.12,167.02,430.52,437.02],"mktAffiliate":[9,206.14,213.04,430.52,437.02],"mktOnlineAds":[9,260.94,267.84,430.52,437.02],"mktDirectMail":[9,326.56,333.06,430.52,437.02],"mktRadioTv":[9,464.5,471.5,430.52,437.02],"mtCashDiscount":[10,28.14,35.04,691.76,698.26],"mtRetail":[10,28.14,35.04,680.12,686.62],"mtEcommerce":[10,28.14,35.04,668.54,675.04],"mtMoto":[10,28.14,35.04,656.96,663.46],"eqPos":[10,419.7,426.3,691.76,698.26],"eqGateway":[10,419.7,426.3,656.96,663.46],"eqVirtual":[10,419.7,426.3,633.8,640.3],"eqSoftware":[10,419.7,426.3,610.52,617.02],"svcVisaMc":[10,28.14,35.04,622.16,628.66],"svcDiscover":[10,28.14,35.04,610.52,617.02],"svcAmexOptBlue":[10,28.14,35.04,598.9,605.5],"svcAmexDirect":[10,28.14,35.04,587.36,593.86],"svcPin":[10,28.14,35.04,575.72,582.22],"svcEbt":[10,28.14,35.04,564.2,570.7],"svcFoodStamps":[10,28.14,35.04,552.56,559.46],"crmYes":[10,494.14,501.04,575.72,582.22],"crmNo":[10,526.56,533.06,575.72,582.22],"checking":[10,505.34,511.84,506.14,513.04],"savings":[10,505.34,511.84,494.6,501.4],"freeYes":[7,60.8,66.8,135.2,140.8],"freeNo":[7,88.8,94.4,136.0,141.6],"doc1":[7,49.3,65.1,659.4,675.5],"doc2":[7,49.3,65.1,628.2,644.3],"doc3":[7,49.3,65.1,595.8,611.5],"doc4":[7,49.3,65.1,572.5,588.6],"doc5":[7,49.3,65.1,550.2,566.3],"doc6":[7,49.3,65.1,526.6,542.7],"doc7":[7,48.9,65.1,481.3,497.5],"doc8":[7,48.9,65.1,449.3,465.4],"doc9":[7,48.9,65.1,417.3,433.4],"doc10":[7,49.3,65.1,346.9,363.0],"doc11":[7,49.3,65.1,314.9,331.0],"doc12":[7,48.9,65.1,190.6,206.2],"doc13":[7,48.9,65.1,163.7,179.5]};
const glR = (r) => r.greenlight || {};
// [page, left, right, baseline] -> a text spec
const glT = (k, get, extra = {}) => { const [page, l, rr, y] = GL_T[k]; return { get, page, slot: [l, rr], absY: y, dy: 0, ...extra }; };
// a value on a printed line (the acknowledgement / addendum lines, the
// underlined blanks on page 10): its baseline `y`, centered between x0 and x1
const glL = (get, page, x0, x1, y, extra = {}) => ({ get, page, slot: [x0, x1], absY: y, dy: 0, ...extra });
const glX = (k, on, size = 8) => { const [page, l, rr, b, t] = GL_B[k]; return { on, page, box: [l, rr, b, t], size }; };
const glYes = (v) => /^(y|yes|true|1)$/i.test(raw(v));
const glNo = (v) => /^(n|no|false|0)$/i.test(raw(v));
// amounts: $ is printed beside the box ("25,000", "45.50"); per item: "0.10",
// "0.075" (its own decimals, at least two, never rounded to cents);
// rate: "2.49" (the column says %); a month-end fee: "$29.95" like the printed ones
const glAmt = (v) => { const n = caAmount(v); return n == null ? raw(v) : caFmt(n, false).replace("$", ""); };
const glPer = (v) => {
  const t = raw(v).replace(/[$,\s]/g, "");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return raw(v);
  const n = Number(t), d = (t.split(".")[1] || "").length;
  return (n < 0 ? "-" : "") + Math.abs(n).toFixed(Math.max(2, Math.min(4, d)));
};
const glRate = (v) => raw(v).replace(/\s*%$/, "");
const glFee = (v) => { const n = caAmount(v); return n == null ? raw(v) : (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2); };
const glPct = (v) => raw(v).replace(/\s*%$/, "");
// the legal (corporate) address: its own when given, else the location's
const glLegal = (r) => {
  const b = r.business || {};
  const corp = [b.corpAddress, b.corpCity, b.corpState, b.corpZip].some((v) => raw(v));
  return corp ? { addr: raw(b.corpAddress), city: raw(b.corpCity), state: raw(b.corpState), zip: raw(b.corpZip) }
    : { addr: raw(b.locationAddress), city: raw(b.locationCity), state: raw(b.locationState), zip: raw(b.locationZip) };
};
const glCsz = (city, state, zip) => [[raw(city), stAbbr(state)].filter(Boolean).join(", "), raw(zip)].filter(Boolean).join(" ");
const glOrg = (r) => orgType(r);
// principals 1-2 are the application's owners; principal 3 is typed in here
const glOwn = (r, i) => {
  if (i < 2) { const o = own(r, i); return { ...o, name: full(o) }; }
  const g = glR(r);
  return { first: raw(g.o3First), last: raw(g.o3Last), name: [g.o3First, g.o3Last].map(raw).filter(Boolean).join(" "), title: g.o3Title, ownershipPct: g.o3Pct,
    homeAddress: g.o3Address, city: g.o3City, state: g.o3State, zip: g.o3Zip, email: g.o3Email, phone: g.o3Phone, ssn: g.o3Ssn, dlNumber: g.o3Dl, dlState: g.o3DlState, dob: g.o3Dob };
};
// signer rows: 1 = the signer (Owner 1), 2 = signer 2 or Owner 2, 3 = principal 3
const glSigName = (r, i) => (i === 0 ? sigName(r) : i === 1 ? raw(r.signatures?.printedName2) || glOwn(r, 1).name : glOwn(r, 2).name);
const glSigTitle = (r, i) => (i === 0 ? sigTitle(r) : i === 1 ? raw(r.signatures?.title2) || raw(glOwn(r, 1).title) : raw(glOwn(r, 2).title));
const glSigDate = (r, i) => (i === 0 ? sigDate(r) : i === 1 ? (glSigName(r, 1) ? raw(r.signatures?.date2) : "") : "");
const glNameTitle = (r) => [sigName(r), sigTitle(r)].filter(Boolean).join(", ");
const glInitials = (r) => sigName(r).split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("");
const glCompany = (r) => raw(r.business.legalName) || raw(r.business.dba);
// answered once for both forms: the cash advance form's "ever filed for bankruptcy?"
const glBk = (r) => raw(glR(r).bankruptcy) || raw(r.cashAdvance?.bankruptcy);
// merchant type rows: a percentage defaults from the application's mix (the
// card-present share goes on the Cash Discount row for a cash-discount merchant)
const glCd = (r) => Boolean(glR(r).mtCashDiscount) || Boolean(r.coversheet?.cashDiscount);
const glMix = (r) => {
  const g = glR(r), t = r.transaction || {};
  const cdSwipe = raw(g.cdSwipe) || (glCd(r) && !g.mtRetail ? raw(t.swipePct) : "");
  return {
    cdSwipe, cdKeyed: raw(g.cdKeyed),
    retailSwipe: raw(g.retailSwipe) || (glCd(r) && !g.mtRetail ? "" : raw(t.swipePct)), retailKeyed: raw(g.retailKeyed),
    ecomInternet: raw(g.ecomInternet) || raw(t.internetPct), ecomPhone: raw(g.ecomPhone),
    motoMail: raw(g.motoMail), motoPhone: raw(g.motoPhone) || raw(t.motoPct),
  };
};
// equipment: the terminals listed (as on the Factor4 form), by maker
const glBrand = (m) => {
  const p = priceFor(m), k = (p ? p.model : raw(m)).toLowerCase();
  if (/clover/.test(k)) return "Clover";
  if (/^(vp|vl)\d|valor|rckt/.test(k)) return "Valor PayTech";
  if (/^(s920|a\d{2,3}\b|a920|q25|aries|elys)/.test(k)) return "PAX";
  if (/^(z\d|qd\d|p\d|dejapay|fd150|rp10)/.test(k)) return "Dejavoo";
  if (/basil/.test(k)) return "Basil";
  if (/ipad/.test(k)) return "Apple";
  if (/samsung/.test(k)) return "Samsung";
  return "";
};
const glModels = (r) => [...new Set(f4Equip(r).map((e) => raw(e.model || e.type)))];
// What the form prints for each of its own fields that fills in by itself — the
// map prints it, and the review form shows it in the field (see formDefaults).
const GL_PRINT = {
  isoOffice: (r) => raw(glR(r).isoOffice) || "Wholesale Payments",
  program: (r) => raw(glR(r).program) || "CBD",
  description: (r) => raw(glR(r).description) || raw(r.business.businessType),
  mcc: (r) => raw(glR(r).mcc) || raw(r.giftCard?.mcc),
  bankruptcy: (r) => { const b = glBk(r).toLowerCase(); return b === "yes" ? "Yes" : b === "no" ? "No" : ""; },
  cdSwipe: (r) => glPct(glMix(r).cdSwipe), retailSwipe: (r) => glPct(glMix(r).retailSwipe),
  ecomInternet: (r) => glPct(glMix(r).ecomInternet), motoPhone: (r) => glPct(glMix(r).motoPhone),
  eqManufacturer: (r) => raw(glR(r).eqManufacturer) || [...new Set(glModels(r).map(glBrand).filter(Boolean))].join(", "),
  eqModel: (r) => raw(glR(r).eqModel) || glModels(r).join(", "),
  cdRate: (r) => glRate(glR(r).cdRate) || (r.coversheet?.cashDiscount ? glRate(r.coversheet?.cashDiscountTerminalRate) : ""),
};
const glPlan = (r) => {
  const sa = r.serviceAcceptance || {};
  const plan = raw(sa.discountPlan);
  if (plan) return plan;
  if (raw(sa.flatCreditPct) && !raw(sa.passCreditPct)) return "flat";
  if (raw(sa.passCreditPct) && !raw(sa.flatCreditPct)) return "passthrough";
  return "";
};

const greenlight = {
  text: [
    /* ---- p5: merchant acknowledgement (lines: company 245.4, signature/date 184.6, print name & title 124.2) ---- */
    glL(glCompany, 5, 72.8, 273.2, 247.6),
    glL(sigDate, 5, 317.2, 494.8, 186.8),
    glL(glNameTitle, 5, 72.8, 376.4, 126.4),
    /* ---- p6: quarterly compliance acknowledgement (146.6 / 103.0 / 59.4) ---- */
    glL(glCompany, 6, 72.0, 281.2, 148.8),
    glL(sigDate, 6, 327.2, 512.8, 105.2),
    glL(glNameTitle, 6, 72.0, 388.8, 61.6),
    /* ---- p8: cannabinoid addendum (underscored blanks beside their labels) ---- */
    glL(glCompany, 8, 143.6, 401.2, 205.2),
    glL((r) => [raw(r.business.locationAddress), glCsz(r.business.locationCity, r.business.locationState, r.business.locationZip)].filter(Boolean).join(", "), 8, 153.2, 394.0, 178.3),
    glL(sigName, 8, 143.6, 400.8, 151.5),
    glL(sigDate, 8, 96.4, 216.0, 84.3),
    /* ---- p9: agent / entity ---- */
    glT("iso", GL_PRINT.isoOffice),
    glT("agent", (r) => raw(r.sales?.salesAgentName) || raw(r.sales?.salesRep)),
    glT("program", GL_PRINT.program),
    glT("legalName", (r) => raw(r.business.legalName)),
    glT("dba", (r) => raw(r.business.dba)),
    glT("legalAddr", (r) => glLegal(r).addr),
    glT("dbaAddr", (r) => raw(r.business.locationAddress)),
    glT("legalCsz", (r) => { const l = glLegal(r); return glCsz(l.city, l.state, l.zip); }),
    glT("dbaCsz", (r) => glCsz(r.business.locationCity, r.business.locationState, r.business.locationZip)),
    glT("ein", (r) => raw(r.business.federalTaxId)),
    glT("started", (r) => raw(r.business.businessStarted)),
    glT("contact", (r) => raw(r.business.contactName) || full(own(r, 0))),
    glT("phone", (r) => raw(r.business.phone)),
    glT("email", (r) => raw(r.business.email)),
    glT("web", (r) => f4Web(r.business.website)),
    glT("csPhone", (r) => raw(r.business.customerServicePhone) || raw(r.business.phone)),
    glT("fax", (r) => raw(r.business.fax)),
    /* ---- p9: business information ---- */
    glT("products", (r) => raw(r.business.productsSold)),
    glT("description", GL_PRINT.description),
    glT("mcc", GL_PRINT.mcc),
    glT("fulfillment", (r) => raw(glR(r).fulfillmentCenter)),
    glT("fulfillmentContact", (r) => raw(glR(r).fulfillmentContact)),
    glT("prevProc", (r) => raw(r.transaction?.previousProcessor)),
    glT("refund", (r) => raw(glR(r).refundPolicy)),
    glT("days", (r) => raw(glR(r).daysToDelivery)),
    glT("depositPct", (r) => { const v = glPct(glR(r).depositPct); return /^\d+(\.\d+)?$/.test(v) ? v + "%" : v; }),
    /* ---- p9-10: principals / officers ---- */
    ...[0, 1, 2].flatMap((i) => {
      const n = i + 1, o = (r) => glOwn(r, i);
      return [
        glT(`o${n}Name`, (r) => o(r).name),
        glT(`o${n}Title`, (r) => raw(o(r).title)),
        glT(`o${n}Pct`, (r) => glPct(o(r).ownershipPct)),
        glT(`o${n}Addr`, (r) => raw(o(r).homeAddress)),
        glT(`o${n}City`, (r) => raw(o(r).city)),
        glT(`o${n}State`, (r) => stAbbr(o(r).state)),
        glT(`o${n}Zip`, (r) => raw(o(r).zip)),
        glT(`o${n}Email`, (r) => raw(o(r).email)),
        glT(`o${n}Phone`, (r) => raw(o(r).phone)),
        glT(`o${n}Ssn`, (r) => raw(o(r).ssn)),
        glT(`o${n}Dl`, (r) => raw(o(r).dlNumber)),
        glT(`o${n}DlState`, (r) => stAbbr(o(r).dlState)),
        glT(`o${n}Dob`, (r) => raw(o(r).dob)),
      ];
    }),
    /* ---- p10: merchant type percentages, business type (underlined blanks, level with their labels) ---- */
    glL(GL_PRINT.cdSwipe, 10, 145.6, 176.5, 691.7),
    glL((r) => glPct(glMix(r).cdKeyed), 10, 211.9, 242.8, 691.7),
    glL(GL_PRINT.retailSwipe, 10, 145.3, 176.4, 680.1),
    glL((r) => glPct(glMix(r).retailKeyed), 10, 211.7, 242.6, 680.1),
    glL(GL_PRINT.ecomInternet, 10, 145.3, 176.0, 668.5),
    glL((r) => glPct(glMix(r).ecomPhone), 10, 212.5, 243.2, 668.5),
    glL((r) => glPct(glMix(r).motoMail), 10, 144.4, 175.2, 656.9),
    glL(GL_PRINT.motoPhone, 10, 211.6, 242.4, 656.9),
    glL((r) => glPct(r.transaction?.salesToConsumerPct), 10, 300.7, 318.1, 691.7),
    glL((r) => glPct(r.transaction?.salesToBusinessPct), 10, 343.6, 361.0, 691.7),
    /* ---- p10: processing volumes (boxes; the $ is printed beside them) ---- */
    glT("monthlyVol", (r) => glAmt(r.transaction?.monthlyVolume)),
    glT("avgTicket", (r) => glAmt(r.transaction?.avgTicket)),
    glT("highTicket", (r) => glAmt(r.transaction?.highTicket)),
    glT("amexVol", (r) => glAmt(r.transaction?.amexVolume)),
    /* ---- p10: requested services, equipment ---- */
    glL((r) => raw(glR(r).amexSe), 10, 155.4, 249.6, 587.3),
    glL((r) => raw(r.coversheet?.fnsNumber), 10, 117.5, 247.4, 552.5),
    glL(GL_PRINT.eqManufacturer, 10, 470.4, 568.9, 680.1),
    glL(GL_PRINT.eqModel, 10, 443.2, 564.2, 668.5),
    glL((r) => raw(glR(r).gatewayProvider), 10, 452.5, 564.6, 645.3),
    glL((r) => raw(glR(r).virtualProvider), 10, 450.7, 567.0, 622.1),
    glL((r) => raw(glR(r).softwareProvider), 10, 450.7, 567.0, 598.8),
    glL((r) => raw(glR(r).crmName), 10, 419.4, 567.4, 552.5),
    /* ---- p10: settlement bank ---- */
    glT("bankName", (r) => raw(r.banking.bankName)),
    glT("routing", (r) => raw(r.banking.routing)),
    glT("account", (r) => raw(r.banking.account)),
    /* ---- p10: pricing (per item $ / rate %) and month-end fees ---- */
    glT("cdRate", GL_PRINT.cdRate),
    glT("flatRate", (r) => (glPlan(r) !== "passthrough" ? glRate(r.serviceAcceptance?.flatCreditPct) : "")),
    glT("flatPer", (r) => (glPlan(r) === "flat" ? glPer(r.fees?.salesTxn) : "")),
    glT("icRate", (r) => (glPlan(r) !== "flat" ? glRate(r.serviceAcceptance?.passCreditPct) : "")),
    glT("icPer", (r) => (glPlan(r) === "passthrough" ? glPer(r.fees?.salesTxn) : "")),
    glT("qualPer", (r) => glPer(glR(r).qualPerItem)),
    glT("qualRate", (r) => glRate(glR(r).qualRate)),
    glT("midQual", (r) => glRate(glR(r).midQualRate)),
    glT("nonQual", (r) => glRate(glR(r).nonQualRate)),
    glT("pinPer", (r) => glPer(r.fees?.pinDebit)),
    glT("pinRate", (r) => glRate(r.fees?.pinDebitPct)),
    glT("auth", (r) => glPer(r.fees?.authVmcda)),
    glT("batch", (r) => glPer(r.fees?.batch)),
    glT("avs", (r) => glPer(r.fees?.electronicAvs)),
    glT("ebt", (r) => glPer(r.fees?.ebt)),
    glT("underwriting", (r) => glPer(glR(r).underwritingFee)),
    glT("annual", (r) => glPer(r.fees?.annual)),
    glT("annualStart", (r) => raw(r.fees?.monthToBill)),
    glT("monthlySvc", (r) => glFee(r.fees?.monthlyService)),
    glT("compliance", (r) => glFee(r.fees?.industryCompliance)),
    glT("risk", (r) => glFee(glR(r).riskMonitoringFee)),
    glT("merlink", (r) => glFee(glR(r).merlinkFee)),
    glT("monthlyMin", (r) => glFee(r.fees?.monthlyMinimum)),
    glT("etf", (r) => glFee(r.fees?.earlyTermination)),
    /* ---- p11: initials, signer rows, personal guaranty ---- */
    glL(glInitials, 11, 26.2, 86.0, 277.6),
    ...[0, 1, 2].flatMap((i) => [
      glT(`sig${i + 1}Name`, (r) => glSigName(r, i)),
      glT(`sig${i + 1}Title`, (r) => glSigTitle(r, i)),
      glT(`sig${i + 1}Date`, (r) => glSigDate(r, i)),
    ]),
    glT("g1Name", (r) => glSigName(r, 0)),
    glT("g1Title", (r) => glSigTitle(r, 0)),
    glT("g1Date", (r) => glSigDate(r, 0)),
    glT("g2Name", (r) => glSigName(r, 1)),
    glT("g2Title", (r) => glSigTitle(r, 1)),
    glT("g2Date", (r) => glSigDate(r, 1)),
  ],
  check: [
    /* p7: the documents included */
    ...["docApplication", "docVoidedCheck", "docArticles", "docBankExisting", "docBankNew", "docProcessing", "docLicense", "docDomain", "docWebsite", "docProducts", "docCoa", "docDropShip", "docAffiliate"]
      .map((k, i) => glX(`doc${i + 1}`, (r) => Boolean(glR(r)[k]) || (k === "docVoidedCheck" && Boolean(r.documents?.hasVoidedCheck)) || (k === "docLicense" && Boolean(r.documents?.hasDriversLicense)), 12)),
    glX("freeYes", (r) => glYes(glR(r).freeTrial)),
    glX("freeNo", (r) => glNo(glR(r).freeTrial)),
    /* p9 */
    glX("mailCorp", (r) => glR(r).sendMailTo === "corporate"),
    glX("mailDba", (r) => glR(r).sendMailTo === "dba"),
    glX("llc", (r) => /\bp?llc\b|l\.l\.c|limited liab/.test(glOrg(r))),
    glX("corp", (r) => /corp|\binc\b|incorporated/.test(glOrg(r)) && !/non.?profit|501|\bp?llc\b|limited liab/.test(glOrg(r))),
    glX("nonProfit", (r) => /non.?profit|501/.test(glOrg(r))),
    glX("soleProp", (r) => /sole|individual|propriet/.test(glOrg(r))),
    glX("bkYes", (r) => glYes(glBk(r))),
    glX("bkNo", (r) => glNo(glBk(r))),
    glX("matchYes", (r) => glYes(glR(r).match)),
    glX("matchNo", (r) => glNo(glR(r).match)),
    glX("purchase", (r) => glR(r).chargedAt === "purchase"),
    glX("shipment", (r) => glR(r).chargedAt === "shipment"),
    glX("depYes", (r) => glYes(glR(r).depositRequired)),
    glX("depNo", (r) => glNo(glR(r).depositRequired)),
    ...["mktSocial", "mktSms", "mktEmail", "mktAffiliate", "mktOnlineAds", "mktDirectMail", "mktRadioTv"].map((k) => glX(k, (r) => Boolean(glR(r)[k]))),
    /* p10: merchant type (chosen, or a row with a percentage on it) */
    glX("mtCashDiscount", (r) => glCd(r) || Boolean(glMix(r).cdSwipe || glMix(r).cdKeyed)),
    glX("mtRetail", (r) => Boolean(glR(r).mtRetail) || Boolean(glMix(r).retailSwipe || glMix(r).retailKeyed)),
    glX("mtEcommerce", (r) => Boolean(glR(r).mtEcommerce) || Boolean(glMix(r).ecomInternet || glMix(r).ecomPhone)),
    glX("mtMoto", (r) => Boolean(glR(r).mtMoto) || Boolean(glMix(r).motoMail || glMix(r).motoPhone)),
    /* p10: requested services (from the application's card types) */
    glX("svcVisaMc", (r) => ["cardVisaCredit", "cardVisaDebit", "cardMcCredit", "cardMcDebit"].some((k) => r.serviceAcceptance?.[k])),
    glX("svcDiscover", (r) => Boolean(r.serviceAcceptance?.cardDiscover)),
    glX("svcAmexOptBlue", (r) => Boolean(r.serviceAcceptance?.cardAmex) && !raw(glR(r).amexSe)),
    glX("svcAmexDirect", (r) => Boolean(raw(glR(r).amexSe))),
    glX("svcPin", (r) => Boolean(r.serviceAcceptance?.cardPin)),
    glX("svcEbt", (r) => Boolean(r.serviceAcceptance?.cardEbt)),
    glX("svcFoodStamps", (r) => Boolean(raw(r.coversheet?.fnsNumber))),
    /* p10: equipment */
    glX("eqPos", (r) => Boolean(glR(r).eqPos) || glModels(r).length > 0 || Boolean(raw(glR(r).eqModel))),
    glX("eqGateway", (r) => Boolean(glR(r).eqGateway) || Boolean(raw(glR(r).gatewayProvider))),
    glX("eqVirtual", (r) => Boolean(glR(r).eqVirtual) || Boolean(raw(glR(r).virtualProvider))),
    glX("eqSoftware", (r) => Boolean(glR(r).eqSoftware) || Boolean(raw(glR(r).softwareProvider))),
    glX("crmYes", (r) => glYes(glR(r).crm) || (!glNo(glR(r).crm) && Boolean(raw(glR(r).crmName)))),
    glX("crmNo", (r) => glNo(glR(r).crm)),
    /* p10: settlement account type */
    glX("checking", (r) => raw(r.banking.accountType).toLowerCase() === "checking"),
    glX("savings", (r) => raw(r.banking.accountType).toLowerCase() === "savings"),
  ],
  // Owner 1's "Sign now" signature: the acknowledgements (p5, p6), the
  // addendum (p8), the first Principal / Officer row and the first guarantor (p11)
  sign: [
    { page: 5, x: 72.8, y: 185.4, maxW: 200.4, maxH: 26, center: true },
    { page: 6, x: 72.0, y: 103.8, maxW: 209.2, maxH: 24, center: true },
    { page: 8, x: 118.4, y: 110.2, maxW: 218.4, maxH: 22, center: true },
    { page: 11, x: 23.3, y: 232.5, maxW: 164.8, maxH: 11.2, center: true },
    { page: 11, x: 23.3, y: 116.6, maxW: 164.8, maxH: 11.2, center: true },
  ],
};

/* ----------------------------- Pathward ----------------------------- */
// Wholesale Payments' "Merchant Application and Agreement" for Pathward, N.A.
// (VERSION 10.8.2026): two pages without form fields — every blank and box below
// was measured from the page's own rules. PW_T: [page, left, right, baseline];
// PW_B: each box's printed square [page, left, right, bottom, top].
const PW_T = {"merchantNo":[1,364.6,589.4,745.56],"mcc":[1,337.4,589.4,730.68],"dba":[1,22.2,305.8,696.81],"legalName":[1,305.8,589.4,696.81],"locAddr":[1,22.2,305.8,678.31],"corpAddr":[1,305.8,589.4,678.31],"locCity":[1,22.2,184.2,659.67],"locState":[1,184.2,238.6,659.67],"locZip":[1,238.6,305.8,659.67],"corpCity":[1,305.8,467.6,659.67],"corpState":[1,467.6,521.9,659.67],"corpZip":[1,521.9,589.4,659.67],"phone":[1,22.2,182.9,641.23],"fax":[1,182.9,305.8,641.23],"contact":[1,305.8,427.2,641.23],"contactPhone":[1,427.2,589.4,641.23],"email":[1,22.2,140.6,622.79],"web":[1,140.6,265.6,622.79],"taxId":[1,265.6,422.6,622.79],"stateIssued":[1,503.8,589.4,622.79],"startM":[1,458.8,486.4,603.2],"startD":[1,489.6,517.2,603.2],"startY":[1,520.8,566.8,603.2],"startAll":[1,458.8,566.8,603.2],"bankName":[1,22.2,162.0,573.73],"routing":[1,162.0,265.6,573.73],"account":[1,265.6,367.4,573.73],"bankPhone":[1,367.4,476.2,573.73],"bizType":[1,72.4,300.6,513.57],"products":[1,380.0,589.4,513.57],"monthlyVol":[1,173.4,300.6,498.77],"amexVol":[1,173.4,300.6,483.97],"avgTicket":[1,173.4,300.6,468.97],"highTicket":[1,173.4,300.6,453.97],"swipe":[1,372.6,433.8,498.77],"moto":[1,372.6,433.8,483.97],"internet":[1,372.6,433.8,468.97],"consumer":[1,517.0,578.6,498.77],"business":[1,517.0,578.6,483.97],"gov":[1,517.0,578.6,468.97],"days":[1,517.0,589.4,453.97],"processor":[1,370.4,444.6,439.17],"reason":[1,513.2,589.4,439.17],"locOther":[1,387.2,442.8,396.6],"occOther":[1,218.4,248.6,348.4],"employees":[1,424.4,487.8,347.6],"registers":[1,552.6,589.4,347.6],"vName":[1,45.8,305.8,319.97],"vPhone":[1,332.8,589.4,319.97],"vAddr":[1,54.8,305.8,305.17],"vCity":[1,325.0,400.4,305.17],"vState":[1,423.4,494.8,305.17],"vZip":[1,511.2,589.4,305.17],"agent":[1,79.2,266.8,274.0],"pinPct":[1,524.2,579.0,230.57],"debitPct":[1,116.6,200.2,215.57],"creditPct":[1,305.4,389.3,215.57],"amexPct":[1,494.8,578.6,215.57],"authVmcda":[1,101.6,162.0,163.17],"fleet":[1,101.6,162.0,148.37],"ebt":[1,101.6,162.0,118.37],"eAvs":[1,101.6,162.0,103.57],"voiceAuth":[1,101.6,162.0,88.57],"voiceAvs":[1,101.6,162.0,73.57],"pinDebit":[1,101.6,126.4,133.37],"pinDebitPct":[1,126.4,151.2,133.37],"monthlySvc":[1,239.6,300.6,163.17],"monthlyMin":[1,239.6,300.6,148.37],"pinMonthly":[1,239.6,300.6,133.37],"wireless":[1,239.6,300.6,118.37],"compliance":[1,239.6,300.6,103.57],"basil":[1,378.4,436.4,163.17],"saas":[1,378.4,436.4,148.37],"inactivity":[1,378.4,436.4,133.37],"gwMonthly":[1,378.4,436.4,118.37],"monthlyMisc":[1,378.4,436.4,103.57],"batch":[1,378.4,436.4,88.57],"annual":[1,378.4,436.4,73.57],"chargeback":[1,517.4,589.4,163.17],"retrieval":[1,517.4,589.4,148.37],"achReject":[1,517.4,589.4,133.37],"gwTxn":[1,517.4,589.4,118.37],"salesTxn":[1,517.4,589.4,103.57],"returnTxn":[1,517.4,589.4,88.57],"monthToBill":[1,509.0,589.4,73.57],"etf":[1,83.2,118.8,60.6],"eq1Make":[2,188.6,252.6,732.77],"eq1Model":[2,252.6,358.0,732.77],"eq1Qty":[2,358.0,392.6,732.77],"eq2Make":[2,188.6,252.6,717.77],"eq2Model":[2,252.6,358.0,717.77],"eq2Qty":[2,358.0,392.6,717.77],"eq3Make":[2,188.6,252.6,702.77],"eq3Model":[2,252.6,358.0,702.77],"eq3Qty":[2,358.0,392.6,702.77],"payApp":[2,164.6,281.0,690.4],"payVer":[2,451.6,589.4,690.4],"tppName":[2,46.8,135.0,662.17],"tppAddr":[2,170.4,265.4,662.17],"tppPhone":[2,293.8,358.0,662.17],"tppEmail":[2,382.8,589.4,662.17],"o1First":[2,40.2,139.0,628.79],"o1Last":[2,139.0,223.0,628.79],"o1Addr":[2,223.0,405.8,628.79],"o1City":[2,405.8,503.6,628.79],"o1State":[2,503.6,539.6,628.79],"o1Zip":[2,539.6,589.4,628.79],"o1Title":[2,40.2,130.2,610.35],"o1Pct":[2,130.2,156.2,610.35],"o1Phone":[2,223.0,405.8,610.35],"o1Email":[2,405.8,589.4,610.35],"o1Ssn":[2,40.2,223.0,591.71],"o1Dob":[2,223.0,405.8,591.71],"o1Dl":[2,405.8,503.6,591.71],"o1DlState":[2,503.6,539.6,591.71],"o2First":[2,40.2,139.0,573.19],"o2Last":[2,139.0,223.0,573.19],"o2Addr":[2,223.0,405.8,573.19],"o2City":[2,405.8,503.6,573.19],"o2State":[2,503.6,539.6,573.19],"o2Zip":[2,539.6,589.4,573.19],"o2Title":[2,40.2,130.2,554.75],"o2Pct":[2,130.2,167.6,554.75],"o2Phone":[2,223.0,405.8,554.75],"o2Email":[2,405.8,589.4,554.75],"o2Ssn":[2,40.2,223.0,536.11],"o2Dob":[2,223.0,405.8,536.11],"o2Dl":[2,405.8,503.6,536.11],"o2DlState":[2,503.6,539.6,536.11],"o3First":[2,40.2,139.0,517.59],"o3Last":[2,139.0,223.0,517.59],"o3Addr":[2,223.0,405.8,517.59],"o3City":[2,405.8,503.6,517.59],"o3State":[2,503.6,539.6,517.59],"o3Zip":[2,539.6,589.4,517.59],"o3Title":[2,40.2,130.2,499.15],"o3Pct":[2,130.2,167.6,499.15],"o3Phone":[2,223.0,405.8,499.15],"o3Email":[2,405.8,589.4,499.15],"o3Ssn":[2,40.2,223.0,480.51],"o3Dob":[2,223.0,405.8,480.51],"o3Dl":[2,405.8,503.6,480.51],"o3DlState":[2,503.6,539.6,480.51],"o4First":[2,40.2,139.0,462.39],"o4Last":[2,139.0,223.0,462.39],"o4Addr":[2,223.0,405.8,462.39],"o4City":[2,405.8,503.6,462.39],"o4State":[2,503.6,539.6,462.39],"o4Zip":[2,539.6,589.4,462.39],"o4Title":[2,40.2,130.2,443.95],"o4Pct":[2,130.2,167.6,443.95],"o4Phone":[2,223.0,405.8,443.95],"o4Email":[2,405.8,589.4,443.95],"o4Ssn":[2,40.2,223.0,425.31],"o4Dob":[2,223.0,405.8,425.31],"o4Dl":[2,405.8,503.6,425.31],"o4DlState":[2,503.6,539.6,425.31],"g1Title":[2,212.2,306.4,354.51],"g1Name":[2,22.2,212.2,336.07],"g1Date":[2,212.2,306.4,336.07],"g2Title":[2,494.8,589.4,354.51],"g2Name":[2,306.4,494.8,336.07],"g2Date":[2,494.8,589.4,336.07],"g3Title":[2,212.2,306.4,317.71],"g3Name":[2,22.2,212.2,299.27],"g3Date":[2,212.2,306.4,299.27],"g4Title":[2,494.8,589.4,317.71],"g4Name":[2,306.4,494.8,299.27],"g4Date":[2,494.8,589.4,299.27],"m1Title":[2,212.2,306.4,106.91],"m1Name":[2,22.2,212.2,88.47],"m1Date":[2,212.2,306.4,88.47],"m2Title":[2,494.8,589.4,106.91],"m2Name":[2,306.4,494.8,88.47],"m2Date":[2,494.8,589.4,88.47],"m3Title":[2,212.2,306.4,62.91],"m3Name":[2,22.2,212.2,44.47],"m3Date":[2,212.2,306.4,44.47],"m4Title":[2,494.8,589.4,62.91],"m4Name":[2,306.4,494.8,44.47],"m4Date":[2,494.8,589.4,44.47]};
const PW_B = {"ein":[1,440.4,445.2,624.8,629.6],"ssn":[1,467.2,472.0,624.8,629.6],"soleProp":[1,28.4,32.8,604.8,609.6],"partnership":[1,96.8,101.6,604.8,609.6],"corporation":[1,141.6,146.0,604.8,609.6],"llc":[1,187.6,192.4,604.8,609.6],"nonProfit":[1,210.8,215.6,604.8,609.6],"government":[1,308.8,313.6,604.8,609.6],"checking":[1,482.0,485.2,584.8,588.0],"savings":[1,482.0,485.2,573.2,576.4],"optIn":[1,28.0,32.8,552.4,556.8],"optOut":[1,28.0,32.8,537.6,542.0],"depYes":[1,401.2,405.6,455.2,459.6],"depNo":[1,420.4,424.4,455.2,459.6],"cardsYes":[1,203.6,208.0,440.4,445.2],"cardsNo":[1,231.2,236.0,440.4,445.2],"seasonYes":[1,98.8,103.2,425.6,430.0],"seasonNo":[1,125.2,129.6,425.6,430.0],"jan":[1,287.6,292.0,425.6,430.0],"feb":[1,311.2,315.6,425.6,430.0],"mar":[1,335.2,339.6,425.6,430.0],"apr":[1,361.2,365.2,425.6,430.0],"may":[1,385.6,390.0,425.6,430.0],"jun":[1,410.8,415.2,425.6,430.0],"jul":[1,434.8,439.2,425.6,430.0],"aug":[1,457.6,462.0,425.6,430.0],"sept":[1,483.6,487.6,425.6,430.0],"oct":[1,510.4,514.8,425.6,430.0],"nov":[1,535.6,540.0,425.6,430.0],"dec":[1,561.2,565.6,425.6,430.0],"locApartment":[1,62.8,66.8,396.0,400.0],"locHome":[1,112.8,116.8,396.0,400.0],"locIsolated":[1,156.4,160.4,396.0,400.0],"locMall":[1,208.4,212.4,396.0,400.0],"locOffice":[1,250.0,254.0,396.0,400.0],"locShopping":[1,296.4,300.4,396.0,400.0],"locOther":[1,363.2,367.2,396.0,400.0],"zoneBusiness":[1,48.0,52.0,381.2,385.2],"zoneIndustrial":[1,88.8,92.8,381.2,385.2],"zoneResidential":[1,133.6,137.6,381.2,385.2],"nameStoreFront":[1,366.0,370.0,381.2,385.2],"nameDoor":[1,411.2,415.2,381.2,385.2],"nameWindow":[1,438.0,442.0,381.2,385.2],"sq0":[1,98.8,102.8,366.4,370.4],"sq251":[1,124.0,128.0,366.4,370.4],"sq501":[1,154.0,158.0,366.4,370.4],"sq2000":[1,188.4,192.4,366.4,370.4],"licYes":[1,439.6,443.6,366.4,370.4],"licNo":[1,458.8,462.8,366.4,370.4],"fl1":[1,28.4,32.4,348.0,352.0],"fl2":[1,41.6,45.6,348.0,352.0],"fl5":[1,60.0,64.0,348.0,352.0],"fl11":[1,80.8,84.8,348.0,352.0],"occGround":[1,141.6,145.6,348.0,352.0],"occOther":[1,193.6,197.6,348.0,352.0],"remResidential":[1,254.8,258.8,348.0,352.0],"remCommercial":[1,296.0,300.0,348.0,352.0],"remCombination":[1,338.4,342.4,348.0,352.0],"fulDirect":[1,161.6,165.6,336.4,340.4],"fulVendor":[1,190.0,194.0,336.4,340.4],"fulOther":[1,221.6,225.6,336.4,340.4],"cVisaCredit":[1,111.2,116.0,246.4,251.2],"cVisaDebit":[1,158.4,163.2,246.4,251.2],"cMcCredit":[1,202.8,207.6,246.4,251.2],"cMcDebit":[1,274.8,279.6,246.4,251.2],"cDiscover":[1,342.4,347.2,246.4,251.2],"cAmex":[1,384.8,389.6,246.4,251.2],"cPin":[1,452.8,457.6,246.4,251.2],"cEbt":[1,493.2,498.0,246.4,251.2],"cFleet":[1,522.0,526.4,246.4,251.2],"planPass":[1,163.2,167.6,232.0,236.8],"planFlat":[1,216.4,221.2,232.0,236.8],"pinPass":[1,431.2,436.0,232.0,236.8],"pinFlat":[1,484.4,489.2,232.0,236.8],"core":[1,77.6,82.8,201.6,206.4],"growth":[1,111.6,116.4,201.6,206.4],"included":[1,254.4,258.8,202.0,206.8],"billed":[1,298.4,303.2,202.0,206.8],"daily":[1,502.4,506.8,202.0,206.8],"monthly":[1,539.2,544.0,202.0,206.8],"e1Terminal":[2,28.4,32.8,734.0,738.8],"e1PinPad":[2,72.4,77.2,734.0,738.8],"e1Var":[2,113.6,118.4,734.0,738.8],"e1Gateway":[2,146.4,150.8,734.0,738.8],"e1New":[2,398.8,403.6,734.0,738.8],"e1Existing":[2,438.4,443.2,734.0,738.8],"e1Dial":[2,478.0,482.8,734.0,738.8],"e1Ethernet":[2,502.4,507.2,734.0,738.8],"e1Wireless":[2,537.6,542.4,734.0,738.8],"e2Terminal":[2,28.4,32.8,718.8,723.6],"e2PinPad":[2,72.4,77.2,718.8,723.6],"e2Var":[2,113.6,118.4,718.8,723.6],"e2Gateway":[2,146.4,150.8,718.8,723.6],"e2New":[2,398.8,403.6,718.8,723.6],"e2Existing":[2,438.4,443.2,718.8,723.6],"e2Dial":[2,478.0,482.8,718.8,723.6],"e2Ethernet":[2,502.4,507.2,718.8,723.6],"e2Wireless":[2,537.6,542.4,718.8,723.6],"e3Terminal":[2,28.4,32.8,704.0,708.8],"e3PinPad":[2,72.4,77.2,704.0,708.8],"e3Var":[2,113.6,118.4,704.0,708.8],"e3Gateway":[2,146.4,150.8,704.0,708.8],"e3New":[2,398.8,403.6,704.0,708.8],"e3Existing":[2,438.4,443.2,704.0,708.8],"e3Dial":[2,478.0,482.8,704.0,708.8],"e3Ethernet":[2,502.4,507.2,704.0,708.8],"e3Wireless":[2,537.6,542.4,704.0,708.8],"tppYes":[2,274.8,279.2,676.0,680.8],"tppNo":[2,296.4,301.2,676.0,680.8],"cp1Yes":[2,179.2,184.0,612.0,616.8],"cp1No":[2,198.4,203.2,612.0,616.8],"cp2Yes":[2,179.2,184.0,556.4,561.2],"cp2No":[2,198.4,203.2,556.4,561.2],"cp3Yes":[2,179.2,184.0,500.8,505.6],"cp3No":[2,198.4,203.2,500.8,505.6],"cp4Yes":[2,179.2,184.0,445.2,450.0],"cp4No":[2,198.4,203.2,445.2,450.0]};
const pwR = (r) => r.pathward || {};
const pwT = (k, get, extra = {}) => { const [page, l, rr, y] = PW_T[k]; return { get, page, slot: [l, rr], absY: y, dy: 0, ...extra }; };
const pwX = (k, on) => { const [page, l, rr, b, t] = PW_B[k]; return { on, page, box: [l, rr, b, t], size: 8 }; };
const pwIs = (v, ...codes) => codes.includes(raw(v).toLowerCase());
const pwYN = (v) => (glYes(v) ? "yes" : glNo(v) ? "no" : "");
const pwWord = (v, words) => words[raw(v).toLowerCase()] || "";
const YES_NO = { yes: "Yes", no: "No" };
// principals 1-2 are the application's owners; 3 is the same principal 3 as on the
// Greenlight form (typed on either one), 4 is typed in here
const PW_OWN = ["First", "Last", "Title", "Pct", "Address", "City", "State", "Zip", "Phone", "Email", "Ssn", "Dob", "Dl", "DlState"];
const pwO3 = (r, k) => raw(pwR(r)[`o3${k}`]) || raw(glR(r)[`o3${k}`]);
const pwOwn = (r, i) => {
  if (i < 2) { const o = own(r, i); return { ...o, name: full(o) }; }
  const v = (k) => (i === 2 ? pwO3(r, k) : raw(pwR(r)[`o4${k}`]));
  return { first: v("First"), last: v("Last"), name: [v("First"), v("Last")].filter(Boolean).join(" "), title: v("Title"), ownershipPct: v("Pct"),
    homeAddress: v("Address"), city: v("City"), state: v("State"), zip: v("Zip"), phone: v("Phone"), email: v("Email"), ssn: v("Ssn"), dob: v("Dob"), dlNumber: v("Dl"), dlState: v("DlState") };
};
// the signer rows: 1 = the signer (Owner 1), 2 = signer 2 or Owner 2, 3-4 = principals 3-4
const pwSigName = (r, i) => (i < 2 ? glSigName(r, i) : pwOwn(r, i).name);
const pwSigTitle = (r, i) => (i < 2 ? glSigTitle(r, i) : raw(pwOwn(r, i).title));
const pwSigDate = (r, i) => (i < 2 ? glSigDate(r, i) : "");
// "Business start date  __/__/____": a full date fills the three blanks; anything else spans them
const pwStart = (r) => {
  const v = raw(r.business?.businessStarted);
  let m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) return { m: m[1].padStart(2, "0"), d: m[2].padStart(2, "0"), y: m[3] };
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return { m: m[2].padStart(2, "0"), d: m[3].padStart(2, "0"), y: m[1] };
  m = v.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) return { m: m[1].padStart(2, "0"), d: "", y: m[2] };
  return /^\d{4}$/.test(v) ? { m: "", d: "", y: v } : { all: v };
};
// TIN type: chosen, or from the tax type written on the application
const pwTin = (r) => {
  const v = raw(pwR(r).tinType).toLowerCase();
  if (v === "ein" || v === "ssn") return v;
  const t = raw(r.business?.taxType).toLowerCase();
  return /\bssn\b|social/.test(t) ? "ssn" : /\b(ein|fein)\b|employer/.test(t) ? "ein" : "";
};
// The discount rate row prints the chosen plan's rates
const pwRates = (r) => {
  const sa = r.serviceAcceptance || {};
  const plan = glPlan(r);
  const pass = plan === "passthrough" || (!plan && !["flatDebitPct", "flatCreditPct", "flatAmexPct"].some((k) => raw(sa[k])));
  return pass ? { debit: sa.passDebitPct, credit: sa.passCreditPct, amex: sa.passAmexPct } : { debit: sa.flatDebitPct, credit: sa.flatCreditPct, amex: sa.flatAmexPct };
};
const PW_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sept", "oct", "nov", "dec"];
const pwMonthKey = (m) => `m${m[0].toUpperCase()}${m.slice(1, 3)}`; // mJan … mSep … mDec
const pwSeasonal = isSeasonal; // (the same answer as every other application's)
// equipment rows: the devices among the equipment (as on the Factor4 form, pin pads too)
const pwEquip = (r) => (Array.isArray(r.equipment) ? r.equipment : []).filter((e) => {
  const m = raw(e && (e.model || e.type));
  if (!m || raw(e.quantity) === "0") return false;
  const c = eqCat(m);
  if (c === "Accessories") return /tablet|ipad/i.test(m);
  return c !== "Warranties";
}).slice(0, 3);
const pwConn = (r) => {
  const c = raw(r.coversheet?.fbConnection).toLowerCase();
  return c === "dial" ? "dial" : c === "ethernet" ? "ethernet" : c === "wifi" || c === "wireless" ? "wireless" : "";
};
// each row's own choice, else what its equipment line says
const pwEq = (r, n) => {
  const p = pwR(r), e = pwEquip(r)[n - 1] || {}, model = raw(e.model || e.type);
  const cat = model ? eqCat(model) : "";
  const acq = raw(e.acquisition).toLowerCase();
  return {
    type: raw(p[`eq${n}Type`]).toLowerCase() || (model ? (cat === "Pin Pads" && !/clover/i.test(model) ? "pinpad" : "terminal") : ""),
    make: raw(p[`eq${n}Make`]) || (model ? glBrand(model) : ""),
    model: raw(p[`eq${n}Model`]) || model,
    qty: model ? raw(e.quantity) || "1" : "",
    deploy: raw(p[`eq${n}Deploy`]).toLowerCase() || (!model ? "" : acq === "existing" ? "existing" : acq ? "new" : ""),
    conn: raw(p[`eq${n}Conn`]).toLowerCase() || (model ? pwConn(r) : ""),
  };
};
const pwCount = (r) => {
  const q = pwEquip(r).map((e) => raw(e.quantity) || "1");
  return q.length && q.every((x) => /^\d+$/.test(x)) ? String(q.reduce((s, x) => s + Number(x), 0)) : "";
};
const pwPctSign = (v) => { const t = glPct(v); return /^\d+(\.\d+)?$/.test(t) ? t + "%" : t; };
const EQ_TYPES = { terminal: "Terminal", pinpad: "Pin Pad", var: "VAR", gateway: "Gateway" };
const EQ_DEPLOY = { new: "New order", existing: "Existing" };
const EQ_CONN = { dial: "Dial", ethernet: "Ethernet", wireless: "Wireless" };
// What the form prints for each of its own fields that fills in by itself (formDefaults).
const PW_PRINT = {
  merchantNumber: (r) => raw(pwR(r).merchantNumber) || raw(r.po?.mid),
  mcc: (r) => raw(pwR(r).mcc) || raw(r.greenlight?.mcc) || raw(r.giftCard?.mcc),
  tinType: (r) => ({ ein: "EIN", ssn: "SSN" })[pwTin(r)] || "",
  acceptsCards: (r) => pwWord(pwYN(pwR(r).acceptsCards) || (raw(r.transaction?.previousProcessor) ? "yes" : ""), YES_NO),
  deposits: (r) => pwWord(pwYN(pwR(r).deposits) || pwYN(r.greenlight?.depositRequired), YES_NO),
  daysToDelivery: (r) => raw(pwR(r).daysToDelivery) || raw(r.greenlight?.daysToDelivery),
  registers: (r) => raw(pwR(r).registers) || pwCount(r),
  ...Object.fromEntries([1, 2, 3].flatMap((n) => [
    [`eq${n}Type`, (r) => pwWord(pwEq(r, n).type, EQ_TYPES)],
    [`eq${n}Make`, (r) => pwEq(r, n).make],
    [`eq${n}Model`, (r) => pwEq(r, n).model],
    [`eq${n}Deploy`, (r) => pwWord(pwEq(r, n).deploy, EQ_DEPLOY)],
    [`eq${n}Conn`, (r) => pwWord(pwEq(r, n).conn, EQ_CONN)],
  ])),
  ...Object.fromEntries(PW_OWN.map((k) => [`o3${k}`, (r) => pwO3(r, k)])),
};
const pwAnswer = (k) => (r) => raw(PW_PRINT[k](r)).toLowerCase();
const pwOrg = (r) => orgType(r);

const pathward = {
  text: [
    /* ---- p1 header ---- */
    pwT("merchantNo", PW_PRINT.merchantNumber),
    pwT("mcc", PW_PRINT.mcc),
    /* ---- p1 business information ---- */
    pwT("dba", (r) => raw(r.business.dba)),
    pwT("legalName", (r) => raw(r.business.legalName)),
    pwT("locAddr", (r) => raw(r.business.locationAddress)),
    pwT("corpAddr", (r) => raw(r.business.corpAddress)),
    pwT("locCity", (r) => raw(r.business.locationCity)),
    pwT("locState", (r) => stAbbr(r.business.locationState)),
    pwT("locZip", (r) => raw(r.business.locationZip)),
    pwT("corpCity", (r) => raw(r.business.corpCity)),
    pwT("corpState", (r) => stAbbr(r.business.corpState)),
    pwT("corpZip", (r) => raw(r.business.corpZip)),
    pwT("phone", (r) => raw(r.business.phone)),
    pwT("fax", (r) => raw(r.business.fax)),
    pwT("contact", (r) => raw(r.business.contactName) || full(own(r, 0))),
    pwT("contactPhone", (r) => raw(r.business.contactPhone)),
    pwT("email", (r) => raw(r.business.email)),
    pwT("web", (r) => f4Web(r.business.website)),
    pwT("taxId", (r) => raw(r.business.federalTaxId)),
    pwT("stateIssued", (r) => stAbbr(r.business.stateIssued)),
    pwT("startM", (r) => pwStart(r).m),
    pwT("startD", (r) => pwStart(r).d),
    pwT("startY", (r) => pwStart(r).y),
    pwT("startAll", (r) => pwStart(r).all, { absY: 612.2, size: 8 }), // (above the blanks, clear of their slashes)
    /* ---- p1 banking ---- */
    pwT("bankName", (r) => raw(r.banking.bankName)),
    pwT("routing", (r) => raw(r.banking.routing)),
    pwT("account", (r) => raw(r.banking.account)),
    pwT("bankPhone", (r) => raw(r.banking.bankPhone)),
    /* ---- p1 transaction information / nature of business ---- */
    pwT("bizType", (r) => raw(r.business.businessType)),
    pwT("products", (r) => raw(r.business.productsSold), { wrap: { y: [518.2, 511.6], size: 6.2 } }),
    pwT("monthlyVol", (r) => glAmt(r.transaction?.monthlyVolume)),
    pwT("amexVol", (r) => glAmt(r.transaction?.amexVolume)),
    pwT("avgTicket", (r) => glAmt(r.transaction?.avgTicket)),
    pwT("highTicket", (r) => glAmt(r.transaction?.highTicket)),
    pwT("swipe", (r) => glPct(r.transaction?.swipePct)),
    pwT("moto", (r) => glPct(r.transaction?.motoPct)),
    pwT("internet", (r) => glPct(r.transaction?.internetPct)),
    pwT("consumer", (r) => glPct(r.transaction?.salesToConsumerPct)),
    pwT("business", (r) => glPct(r.transaction?.salesToBusinessPct)),
    pwT("gov", (r) => glPct(r.transaction?.salesToGovPct)),
    pwT("days", PW_PRINT.daysToDelivery),
    pwT("processor", (r) => raw(r.transaction?.previousProcessor), { wrap: { y: [443.2, 437.0], size: 6.5 } }),
    pwT("reason", (r) => raw(r.transaction?.reasonForLeaving), { wrap: { y: [443.2, 437.0], size: 6.5 } }),
    /* ---- p1 site inspection ---- */
    // (written on its line after "OTHER:", running on to the row's end when long)
    { get: (r) => raw(pwR(r).siteLocationOther), page: 1, absX: 388.4, absY: PW_T.locOther[3], dy: 0, size: 8, maxWidth: 198 },
    pwT("occOther", (r) => raw(pwR(r).occupiesOther), { size: 7 }),
    pwT("employees", (r) => raw(pwR(r).employees)),
    pwT("registers", PW_PRINT.registers),
    pwT("vName", (r) => raw(pwR(r).vendorName)),
    pwT("vPhone", (r) => raw(pwR(r).vendorPhone)),
    pwT("vAddr", (r) => raw(pwR(r).vendorAddress)),
    pwT("vCity", (r) => raw(pwR(r).vendorCity)),
    pwT("vState", (r) => stAbbr(pwR(r).vendorState)),
    pwT("vZip", (r) => raw(pwR(r).vendorZip)),
    pwT("agent", (r) => raw(r.sales?.salesAgentName) || raw(r.sales?.salesRep)),
    /* ---- p1 service acceptance ---- */
    pwT("pinPct", (r) => glRate(pwR(r).pinPlanPct)),
    pwT("debitPct", (r) => glRate(pwRates(r).debit)),
    pwT("creditPct", (r) => glRate(pwRates(r).credit)),
    pwT("amexPct", (r) => glRate(pwRates(r).amex)),
    /* ---- p1 authorization / monthly / miscellaneous fees (the $ is printed) ---- */
    pwT("authVmcda", (r) => glPer(r.fees?.authVmcda)),
    pwT("fleet", (r) => glPer(r.fees?.fleet)),
    pwT("pinDebit", (r) => glPer(r.fees?.pinDebit)),
    pwT("pinDebitPct", (r) => glRate(r.fees?.pinDebitPct)),
    pwT("ebt", (r) => glPer(r.fees?.ebt)),
    pwT("eAvs", (r) => glPer(r.fees?.electronicAvs)),
    pwT("voiceAuth", (r) => glPer(r.fees?.voiceAuth)),
    pwT("voiceAvs", (r) => glPer(r.fees?.voiceAvs)),
    pwT("monthlySvc", (r) => glPer(r.fees?.monthlyService)),
    pwT("monthlyMin", (r) => glPer(r.fees?.monthlyMinimum)),
    pwT("pinMonthly", (r) => glPer(r.fees?.pinDebitMonthly)),
    pwT("wireless", (r) => glPer(r.fees?.wireless)),
    pwT("compliance", (r) => glPer(r.fees?.industryCompliance)),
    pwT("basil", (r) => glPer(r.fees?.basilPos)),
    pwT("saas", (r) => glPer(r.fees?.saasFee)),
    pwT("inactivity", (r) => glPer(r.fees?.inactivityFee)),
    pwT("gwMonthly", (r) => glPer(r.fees?.gatewayMonthly)),
    pwT("monthlyMisc", (r) => glPer(r.fees?.monthlyMisc)),
    pwT("batch", (r) => glPer(r.fees?.batch)),
    pwT("annual", (r) => glPer(r.fees?.annual)),
    pwT("chargeback", (r) => glPer(r.fees?.chargeback)),
    pwT("retrieval", (r) => glPer(r.fees?.retrieval)),
    pwT("achReject", (r) => glPer(r.fees?.achReject)),
    pwT("gwTxn", (r) => glPer(r.fees?.gatewayTxn)),
    pwT("salesTxn", (r) => glPer(r.fees?.salesTxn)),
    pwT("returnTxn", (r) => glPer(r.fees?.returnTxn)),
    pwT("monthToBill", (r) => raw(r.fees?.monthToBill)),
    pwT("etf", (r) => glPer(r.fees?.earlyTermination), { size: 7 }),
    /* ---- p2 equipment ---- */
    ...[1, 2, 3].flatMap((n) => [
      pwT(`eq${n}Make`, (r) => pwEq(r, n).make),
      pwT(`eq${n}Model`, (r) => pwEq(r, n).model),
      pwT(`eq${n}Qty`, (r) => pwEq(r, n).qty),
    ]),
    pwT("payApp", (r) => raw(pwR(r).payAppName)),
    pwT("payVer", (r) => raw(pwR(r).payAppVersion)),
    pwT("tppName", (r) => raw(pwR(r).tppName)),
    pwT("tppAddr", (r) => raw(pwR(r).tppAddress)),
    pwT("tppPhone", (r) => raw(pwR(r).tppPhone)),
    pwT("tppEmail", (r) => raw(pwR(r).tppEmail)),
    /* ---- p2 principals / beneficial owners (1's "%" is printed) ---- */
    ...[0, 1, 2, 3].flatMap((i) => {
      const n = i + 1, o = (r) => pwOwn(r, i);
      return [
        pwT(`o${n}First`, (r) => raw(o(r).first)),
        pwT(`o${n}Last`, (r) => raw(o(r).last)),
        pwT(`o${n}Addr`, (r) => raw(o(r).homeAddress)),
        pwT(`o${n}City`, (r) => raw(o(r).city)),
        pwT(`o${n}State`, (r) => stAbbr(o(r).state)),
        pwT(`o${n}Zip`, (r) => raw(o(r).zip)),
        pwT(`o${n}Title`, (r) => raw(o(r).title)),
        pwT(`o${n}Pct`, (r) => (i === 0 ? glPct(o(r).ownershipPct) : pwPctSign(o(r).ownershipPct))),
        pwT(`o${n}Phone`, (r) => raw(o(r).phone)),
        pwT(`o${n}Email`, (r) => raw(o(r).email)),
        pwT(`o${n}Ssn`, (r) => raw(o(r).ssn)),
        pwT(`o${n}Dob`, (r) => raw(o(r).dob)),
        pwT(`o${n}Dl`, (r) => raw(o(r).dlNumber)),
        pwT(`o${n}DlState`, (r) => stAbbr(o(r).dlState)),
      ];
    }),
    /* ---- p2 personal guarantee and agreement approval: title / print name / date ---- */
    ...["g", "m"].flatMap((b) => [0, 1, 2, 3].flatMap((i) => [
      pwT(`${b}${i + 1}Title`, (r) => pwSigTitle(r, i)),
      pwT(`${b}${i + 1}Name`, (r) => pwSigName(r, i)),
      pwT(`${b}${i + 1}Date`, (r) => pwSigDate(r, i)),
    ])),
  ],
  check: [
    /* p1 business information */
    pwX("ein", (r) => pwTin(r) === "ein"),
    pwX("ssn", (r) => pwTin(r) === "ssn"),
    pwX("soleProp", (r) => /sole|individual|propriet/.test(pwOrg(r))),
    pwX("partnership", (r) => /partner/.test(pwOrg(r)) && !/ll[cp]|limited liab/.test(pwOrg(r))),
    pwX("corporation", (r) => /corp|\binc\b|incorporated/.test(pwOrg(r)) && !/ll[cp]|limited liab|non.?profit|501|govern|municip/.test(pwOrg(r))),
    pwX("llc", (r) => /ll[cp]|limited liab/.test(pwOrg(r))),
    pwX("nonProfit", (r) => /non.?profit|501/.test(pwOrg(r))),
    pwX("government", (r) => /govern|municip/.test(pwOrg(r))),
    /* p1 banking, marketing consent */
    pwX("checking", (r) => raw(r.banking.accountType).toLowerCase() === "checking"),
    pwX("savings", (r) => raw(r.banking.accountType).toLowerCase() === "savings"),
    pwX("optIn", (r) => pwIs(pwR(r).optIn, "in")),
    pwX("optOut", (r) => pwIs(pwR(r).optIn, "out")),
    /* p1 transaction information */
    pwX("depYes", (r) => pwAnswer("deposits")(r) === "yes"),
    pwX("depNo", (r) => pwAnswer("deposits")(r) === "no"),
    pwX("cardsYes", (r) => pwAnswer("acceptsCards")(r) === "yes"),
    pwX("cardsNo", (r) => pwAnswer("acceptsCards")(r) === "no"),
    pwX("seasonYes", pwSeasonal),
    // "No": not marked seasonal and no month checked — on a form with anything on it (formHasContent)
    { ...pwX("seasonNo", (r) => !pwSeasonal(r) && formHasContent(pathward, r)), seasonNo: true },
    ...PW_MONTHS.map((m) => pwX(m, (r) => Boolean(pwR(r)[pwMonthKey(m)]))),
    /* p1 site inspection */
    ...[["locApartment", "apartment"], ["locHome", "home"], ["locIsolated", "isolated"], ["locMall", "mall"], ["locOffice", "office"], ["locShopping", "shopping"]]
      .map(([k, v]) => pwX(k, (r) => pwIs(pwR(r).siteLocation, v))),
    pwX("locOther", (r) => pwIs(pwR(r).siteLocation, "other") || (!raw(pwR(r).siteLocation) && Boolean(raw(pwR(r).siteLocationOther)))),
    ...[["zoneBusiness", "business"], ["zoneIndustrial", "industrial"], ["zoneResidential", "residential"]].map(([k, v]) => pwX(k, (r) => pwIs(pwR(r).zone, v))),
    pwX("nameStoreFront", (r) => Boolean(pwR(r).nameStoreFront)),
    pwX("nameDoor", (r) => Boolean(pwR(r).nameDoor)),
    pwX("nameWindow", (r) => Boolean(pwR(r).nameWindow)),
    ...[["sq0", "0-250"], ["sq251", "251-500"], ["sq501", "501-2000"], ["sq2000", "2000+"]].map(([k, v]) => pwX(k, (r) => pwIs(pwR(r).sqFootage, v))),
    pwX("licYes", (r) => pwYN(pwR(r).licenseVisible) === "yes"),
    pwX("licNo", (r) => pwYN(pwR(r).licenseVisible) === "no"),
    ...[["fl1", "1"], ["fl2", "2-4"], ["fl5", "5-10"], ["fl11", "11+"]].map(([k, v]) => pwX(k, (r) => pwIs(pwR(r).floors, v))),
    pwX("occGround", (r) => pwIs(pwR(r).occupies, "ground")),
    pwX("occOther", (r) => pwIs(pwR(r).occupies, "other") || (!raw(pwR(r).occupies) && Boolean(raw(pwR(r).occupiesOther)))),
    ...[["remResidential", "residential"], ["remCommercial", "commercial"], ["remCombination", "combination"]].map(([k, v]) => pwX(k, (r) => pwIs(pwR(r).remainingFloors, v))),
    pwX("fulDirect", (r) => pwIs(pwR(r).fulfillment, "direct")),
    pwX("fulVendor", (r) => pwIs(pwR(r).fulfillment, "vendor") || (!raw(pwR(r).fulfillment) && Boolean(raw(pwR(r).vendorName)))),
    pwX("fulOther", (r) => pwIs(pwR(r).fulfillment, "other")),
    /* p1 service acceptance */
    ...[["cVisaCredit", "cardVisaCredit"], ["cVisaDebit", "cardVisaDebit"], ["cMcCredit", "cardMcCredit"], ["cMcDebit", "cardMcDebit"], ["cDiscover", "cardDiscover"],
      ["cAmex", "cardAmex"], ["cPin", "cardPin"], ["cEbt", "cardEbt"]].map(([k, f]) => pwX(k, (r) => Boolean(r.serviceAcceptance?.[f]))),
    pwX("cFleet", (r) => Boolean(pwR(r).cardFleet)),
    pwX("planPass", (r) => glPlan(r) === "passthrough"),
    pwX("planFlat", (r) => glPlan(r) === "flat"),
    pwX("pinPass", (r) => pwIs(pwR(r).pinPlan, "passthrough")),
    pwX("pinFlat", (r) => pwIs(pwR(r).pinPlan, "flat")),
    pwX("core", (r) => pwIs(pwR(r).servicePlan, "core")),
    pwX("growth", (r) => pwIs(pwR(r).servicePlan, "growth")),
    pwX("included", (r) => r.serviceAcceptance?.assessments === "included"),
    pwX("billed", (r) => r.serviceAcceptance?.assessments === "billed"),
    pwX("daily", (r) => r.serviceAcceptance?.paymentMethod === "daily"),
    pwX("monthly", (r) => r.serviceAcceptance?.paymentMethod === "monthly"),
    /* p2 equipment rows */
    ...[1, 2, 3].flatMap((n) => [
      ...[["Terminal", "terminal"], ["PinPad", "pinpad"], ["Var", "var"], ["Gateway", "gateway"]].map(([k, v]) => pwX(`e${n}${k}`, (r) => pwEq(r, n).type === v)),
      pwX(`e${n}New`, (r) => pwEq(r, n).deploy === "new"),
      pwX(`e${n}Existing`, (r) => pwEq(r, n).deploy === "existing"),
      ...[["Dial", "dial"], ["Ethernet", "ethernet"], ["Wireless", "wireless"]].map(([k, v]) => pwX(`e${n}${k}`, (r) => pwEq(r, n).conn === v)),
    ]),
    /* p2 third-party provider, control prong */
    pwX("tppYes", (r) => pwYN(pwR(r).tpp) === "yes" || (!pwYN(pwR(r).tpp) && ["tppName", "tppAddress", "tppPhone", "tppEmail"].some((k) => raw(pwR(r)[k])))),
    pwX("tppNo", (r) => pwYN(pwR(r).tpp) === "no"),
    ...[1, 2, 3, 4].flatMap((n) => [
      pwX(`cp${n}Yes`, (r) => pwYN(pwR(r)[`cp${n}`]) === "yes"),
      pwX(`cp${n}No`, (r) => pwYN(pwR(r)[`cp${n}`]) === "no"),
    ]),
  ],
  // Owner 1's "Sign now" signature: Principal #1 of the personal guarantee and of
  // the agreement approval (right of the "Principal #1:" caption, inside the box)
  sign: [
    { page: 2, x: 61.4, y: 353.0, maxW: 149.2, maxH: 17.0, center: true, middle: true },
    { page: 2, x: 61.4, y: 105.0, maxW: 149.2, maxH: 17.4, center: true, middle: true },
  ],
};

/* What each field that fills in by itself would print if left blank — for the
   review form, which shows it in the empty field so nothing already in the
   application is typed again (typing there overrides it). The same functions
   print the PDFs, so what's shown is what prints. Selects come back as the
   printed word ("Yes", "IP"). */
const PRINTED = {
  ...Object.fromEntries(Object.entries(GL_PRINT).map(([k, f]) => [`greenlight.${k}`, f])),
  ...Object.fromEntries(Object.entries(F4_PRINT).map(([k, f]) => [`factor4.${k}`, f])),
  ...Object.fromEntries(Object.entries(PW_PRINT).map(([k, f]) => [`pathward.${k}`, f])),
  // answered once for two forms
  "giftCard.mcc": (r) => raw(gcR(r).mcc) || raw(r.greenlight?.mcc),
  "cashAdvance.bankruptcy": (r) => { const b = (raw(caR(r).bankruptcy) || raw(r.greenlight?.bankruptcy)).toLowerCase(); return b === "yes" ? "Yes" : b === "no" ? "No" : ""; },
  // a Greenlight application's coversheet: Greenlight's platform (prepareRecord)
  "coversheet.platform": (r) => (r.appType === "greenlight" ? "Other" : ""),
  "coversheet.platformOther": (r) => (r.appType === "greenlight" && ["", "other"].includes(raw(cs(r).platform)) ? "Greenlight Payments" : ""),
};
export function formDefaults(record) {
  const out = {};
  for (const [path, print] of Object.entries(PRINTED)) {
    const [sec, key] = path.split(".");
    const v = print({ ...record, [sec]: { ...(record[sec] || {}), [key]: "" } });
    if (v) out[path] = String(v);
  }
  return out;
}

/* ========= Pathward — Program Guide: its Confirmation Page ========= */
// Page 2 of the 44-page Merchant Services Program Guide, the only page used: the
// client's business legal name, then the principal's signature, title and date on one
// row and the signer's printed name under it. Every blank measured from the page's
// own rules (300 dpi).
const pathward_guide = {
  text: [
    { get: (r) => raw(r.business.legalName) || raw(r.business.dba), page: 1, text: "Print Client's Business Legal Name:", slot: [193.4, 473.3], absY: 172.8, dy: 0 },
    { get: sigTitle, page: 1, text: "Title", exact: true, region: { yMin: 70, yMax: 76 }, slot: [315.4, 476.2], absY: 84.6, dy: 0 },
    { get: sigDate, page: 1, text: "Date", exact: true, region: { yMin: 70, yMax: 76 }, slot: [489.6, 583.2], absY: 84.6, dy: 0 },
    { get: sigName, page: 1, text: "Please Print Name of Signer", slot: [37.7, 303.8], absY: 60.1, dy: 0 },
  ],
  check: [],
  // Owner 1 signs on the "X" line.
  sign: [{ page: 1, x: 42, y: 83.8, maxW: 258, maxH: 18.5 }],
};

export const FORM_MAPS = { citizens, merrick, coversheet, purchase_order, clover_addendum, bank_change, fd_north, pbt, crf, hemp_cbd, cbd_amendment, gift_card, cash_advance, factor4, greenlight, pathward, pathward_guide };
