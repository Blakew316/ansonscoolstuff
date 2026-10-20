/* AppUpload: the filled documents as one PDF — AppUpload's /api/packet,
   unchanged but for the request/response plumbing, loading each form's
   page backgrounds before it is filled, the Factor4 set-up form, the
   Greenlight CBD packet, the Pathward application and the Pathward Program
   Guide's Confirmation Page.
   POST /.netlify/functions/au-packet  { record, form?, date?, kind?, kinds?, signature? }
   (or { record, defaults: true }: what the fields that fill in by themselves would print)
   (the page asks for one document per request and puts a multi-document
   packet together itself, so every request stays well inside Netlify's
   time and size limits) */
import { json, requireUser } from "../au/common.mjs";
import { normalizeRecord } from "../au/extract.mjs";
import { fillForm as fill, mergePdfs, prepareRecord, resolveForm, hasCloverEquipment } from "../au/fillForm.mjs";
import { preloadForm } from "../au/anchors.mjs";
import { formDefaults } from "../au/formMaps.mjs";

const fillForm = async (form, record) => { await preloadForm(form); return fill(form, record); };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  try {
    let reqBody = null;
    try { reqBody = await req.json(); } catch (e) {}
    const { record: raw, form: formOverride, date, kind = "combined", kinds, signature } = reqBody || {};
    if (!raw || typeof raw !== "object") return json({ error: "Missing record." }, 400);
    const record = normalizeRecord(raw);
    // { record, defaults: true }: no PDF — what each field that fills in by itself
    // would print, for the review form to show in it
    if (reqBody.defaults === true) return json({ defaults: formDefaults(prepareRecord(record, { date })) });
    const form = resolveForm(record, formOverride);
    const base = prepareRecord(record, { date, signature });

    let bytes;
    let name;
    let labelOverride = null;
    if (Array.isArray(kinds) && kinds.length) {
      // Multi-select: build the chosen documents in a fixed order and merge into one PDF.
      const order = ["coversheet", "application", "po", "clover", "bankchange", "crf", "hempcbd", "cbdamendment", "giftcard", "cashadvance", "factor4", "greenlight", "pathward", "pathward_guide"];
      // A Greenlight (or Pathward) application, or the Pathward Program Guide, is that form: picked both ways, it's printed once.
      const chosen = order.filter((k) => kinds.includes(k) && !(["greenlight", "pathward", "pathward_guide"].includes(k) && form === k && kinds.includes("application")));
      // Never silently drop a requested document: an Application needs a known type.
      if (chosen.includes("application") && !form) {
        return json({ error: "Application type is unknown — pick Citizens, Merrick, FD North, PB&T, Greenlight, Pathward or the Pathward Program Guide above." }, 400);
      }
      const parts = [];
      for (const k of chosen) {
        if (k === "coversheet") parts.push(await fillForm("coversheet", base));
        else if (k === "application") { if (form) parts.push(await fillForm(form, base)); }
        else if (k === "po") parts.push(await fillForm("purchase_order", base));
        else if (k === "clover") parts.push(await fillForm("clover_addendum", base));
        else if (k === "bankchange") parts.push(await fillForm("bank_change", base));
        else if (k === "crf") parts.push(await fillForm("crf", base));
        else if (k === "hempcbd") parts.push(await fillForm("hemp_cbd", base));
        else if (k === "cbdamendment") parts.push(await fillForm("cbd_amendment", base));
        else if (k === "giftcard") parts.push(await fillForm("gift_card", base));
        else if (k === "cashadvance") parts.push(await fillForm("cash_advance", base));
        else if (k === "factor4") parts.push(await fillForm("factor4", base));
        else if (k === "greenlight") parts.push(await fillForm("greenlight", base));
        else if (k === "pathward") parts.push(await fillForm("pathward", base));
        else if (k === "pathward_guide") parts.push(await fillForm("pathward_guide", base));
      }
      if (!parts.length) {
        return json({ error: "None of the selected documents could be generated. For the Application, choose Citizens, Merrick, FD North, PB&T, Greenlight, Pathward or the Pathward Program Guide above." }, 400);
      }
      bytes = parts.length === 1 ? parts[0] : await mergePdfs(parts);
      const labels = { coversheet: "Coversheet", application: "Application", po: "Purchase Order", clover: "Clover Addendum", bankchange: "Bank Account Change", crf: "Change Request", hempcbd: "Hemp & CBD Disclosure", cbdamendment: "CBD Amendment", giftcard: "Gift Card Setup", cashadvance: "Cash Advance Application", factor4: "Factor4 Merchant Set-Up", greenlight: "Greenlight CBD Application", pathward: "Pathward Application", pathward_guide: "Pathward Program Guide" };
      labelOverride = chosen.length === 1 ? labels[chosen[0]] : "Packet";
      name = chosen.length === 1 ? chosen[0] : "packet";
    } else if (kind === "coversheet") {
      bytes = await fillForm("coversheet", base);
      name = "coversheet";
    } else if (kind === "application") {
      if (!form) return json({ error: "Application type is unknown — pick Citizens, Merrick, FD North, PB&T, Greenlight, Pathward or the Pathward Program Guide." }, 400);
      bytes = await fillForm(form, base);
      name = `${form}-application`;
    } else if (kind === "po") {
      bytes = await fillForm("purchase_order", base);
      name = "purchase-order";
    } else if (kind === "clover") {
      bytes = await fillForm("clover_addendum", base);
      name = "clover-addendum";
    } else if (kind === "bankchange") {
      bytes = await fillForm("bank_change", base);
      name = "bank-change";
    } else if (kind === "crf") {
      bytes = await fillForm("crf", base);
      name = "change-request";
    } else if (kind === "hempcbd") {
      bytes = await fillForm("hemp_cbd", base);
      name = "hemp-cbd-disclosure";
    } else if (kind === "cbdamendment") {
      bytes = await fillForm("cbd_amendment", base);
      name = "cbd-amendment";
    } else if (kind === "giftcard") {
      bytes = await fillForm("gift_card", base);
      name = "gift-card-setup";
    } else if (kind === "cashadvance") {
      bytes = await fillForm("cash_advance", base);
      name = "cash-advance-application";
    } else if (kind === "factor4") {
      bytes = await fillForm("factor4", base);
      name = "factor4-merchant-setup";
    } else if (kind === "greenlight") {
      bytes = await fillForm("greenlight", base);
      name = "greenlight-cbd-application";
    } else if (kind === "pathward") {
      bytes = await fillForm("pathward", base);
      name = "pathward-application";
    } else if (kind === "pathward_guide") {
      bytes = await fillForm("pathward_guide", base);
      name = "pathward-program-guide";
    } else {
      // combined packet: coversheet + application (+ Clover addendum when Clover equipment is present)
      const parts = [await fillForm("coversheet", base)];
      if (form) parts.push(await fillForm(form, base));
      if (hasCloverEquipment(record)) parts.push(await fillForm("clover_addendum", base));
      bytes = await mergePdfs(parts);
      name = `${form || "application"}-packet`;
    }

    // Lead the file name with the Doing-Business-As name so it's auto-labeled for easy finding.
    const labels = { coversheet: "Coversheet", application: "Application", po: "Purchase Order", clover: "Clover Addendum", bankchange: "Bank Account Change", crf: "Change Request", hempcbd: "Hemp & CBD Disclosure", cbdamendment: "CBD Amendment", giftcard: "Gift Card Setup", cashadvance: "Cash Advance Application", factor4: "Factor4 Merchant Set-Up", greenlight: "Greenlight CBD Application", pathward: "Pathward Application", pathward_guide: "Pathward Program Guide", combined: "Packet" };
    const dba = (record.business.dba || record.business.legalName || "").trim();
    const safeDba = dba.replace(/[\/\\:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Application";
    const fileName = `${safeDba} - ${labelOverride || labels[kind] || name}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        // (a header can't carry characters like ’ — the live server fails on
        // them; the name also goes along encoded, and the page names the file itself)
        "content-disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("Packet generation failed:", e.message);
    return json({ error: e.message || "Failed to generate PDF." }, 500);
  }
};
