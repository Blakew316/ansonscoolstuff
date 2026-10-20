/* From AppUpload's lib/menu.js (appupload main) — unchanged but for the import path and the Clover template, which ships inside the function. */
import Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";
import { friendlyApiError } from "./apiError.mjs";

import TEMPLATE_B64 from "./data/clover-template.mjs";   // the Clover template ships inside the function
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const MENU_TOOL = {
  name: "menu_items",
  description: "Structured menu extracted from photos of a restaurant menu, for import into Clover.",
  input_schema: {
    type: "object",
    properties: {
      restaurantName: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Item name as printed" },
            description: { type: "string", description: "Item description, if shown" },
            price: { type: "string", description: "Price, digits only e.g. 12.99 (no $). Empty if market/variable." },
            category: { type: "string", description: "The menu section/category this item appears under" },
            alternateName: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    required: ["items"],
  },
};

const SYSTEM_PROMPT = `You are an expert at reading restaurant menus from photos and converting them into a \
clean item list for a point-of-sale system (Clover).

Rules:
- Extract EVERY distinct menu item you can see across all images.
- For each item capture: name, price (digits only, no currency symbol), a short description if one is printed,
  and the category/section it appears under (use the menu's own section headers, e.g. Appetizers, Entrees, Drinks).
- Do NOT invent items, prices, or categories. If a price is "market" or missing, leave price empty.
- If the same item has multiple sizes/prices, create one row per size and put the size in the name
  (e.g. "House Salad (Small)", "House Salad (Large)").
- Preserve the menu's spelling.
Return the result ONLY by calling the menu_items tool.`;

export async function extractMenu(images, opts = {}) {
  if (!Array.isArray(images) || images.length === 0) throw new Error("No images provided.");

  if (process.env.TRANSCRIBE_MOCK === "1") return normalizeMenu(mockMenu());

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error("ANTHROPIC_API_KEY is not set. Add it to your environment to enable menu extraction.");
    err.statusCode = 503;
    throw err;
  }
  const client = new Anthropic({ apiKey: apiKey.trim() });
  const model = opts.model || DEFAULT_MODEL;

  const content = [];
  images.forEach((img, i) => {
    if (img.mediaType === "application/pdf") {
      content.push({ type: "text", text: `Menu file ${i + 1} (PDF):` });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: img.data } });
    } else if (ALLOWED_MEDIA.has(img.mediaType)) {
      content.push({ type: "text", text: `Menu image ${i + 1}:` });
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } });
    } else {
      const err = new Error(`Unsupported file type: ${img.mediaType}`);
      err.statusCode = 415;
      throw err;
    }
  });
  content.push({ type: "text", text: "Extract the full menu by calling the menu_items tool." });

  let message;
  try {
    message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [MENU_TOOL],
      tool_choice: { type: "tool", name: MENU_TOOL.name },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    throw friendlyApiError(e);
  }
  const toolUse = message.content.find((b) => b.type === "tool_use" && b.name === MENU_TOOL.name);
  if (!toolUse) throw new Error("The model did not return menu data.");
  return normalizeMenu(toolUse.input);
}

export function normalizeMenu(raw = {}) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  return {
    restaurantName: raw.restaurantName || "",
    items: items
      .filter((it) => it && it.name && String(it.name).trim())
      .map((it) => ({
        name: String(it.name).trim(),
        description: (it.description || "").toString().trim(),
        price: cleanPrice(it.price),
        category: (it.category || "").toString().trim(),
        alternateName: (it.alternateName || "").toString().trim(),
      })),
  };
}

function cleanPrice(p) {
  if (p == null) return "";
  const m = String(p).replace(/[^0-9.]/g, "");
  // Collapse extra decimal points (e.g. "12.99.5" -> "12.99") so the value parses
  // to a finite number and never lands in Clover's Price column as a bad string.
  const dot = m.indexOf(".");
  return dot === -1 ? m : m.slice(0, dot + 1) + m.slice(dot + 1).replace(/\./g, "");
}

/**
 * Fill the Clover inventory template's Items + Categories sheets and return xlsx bytes.
 * Preserves the rest of the template (instructions, modifier groups, tax rates).
 */
export async function buildCloverWorkbook(menu) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(TEMPLATE_B64, "base64"));

  // Map header name -> column index on the Items sheet (robust to column reordering).
  const items = wb.getWorksheet("Items");
  const headerRow = items.getRow(1);
  const col = {};
  headerRow.eachCell({ includeEmpty: true }, (cell, c) => {
    const key = String(cell.value || "").trim();
    if (key && !(key in col)) col[key] = c;
  });

  let r = 2;
  for (const it of menu.items) {
    const row = items.getRow(r++);
    if (col["Name"]) row.getCell(col["Name"]).value = it.name;
    if (col["Alternate Name"] && it.alternateName) row.getCell(col["Alternate Name"]).value = it.alternateName;
    if (col["Description"] && it.description) row.getCell(col["Description"]).value = it.description;
    if (col["Price"] && it.price !== "") {
      const num = Number(it.price);
      row.getCell(col["Price"]).value = Number.isFinite(num) ? num : it.price;
    }
    if (col["Categories"] && it.category) row.getCell(col["Categories"]).value = it.category;
    row.commit();
  }

  // Categories sheet — mirror Clover's own export format: one block per category
  // with the Category Name on the block's first row and every item in that
  // category listed down the "Item Sort Order" column (one per row), then a blank
  // separator row before the next category.
  const catSheet = wb.getWorksheet("Categories");
  if (catSheet) {
    const catHeader = catSheet.getRow(1);
    const catCol = {};
    catHeader.eachCell({ includeEmpty: true }, (cell, c) => {
      const key = String(cell.value || "").trim();
      if (key && !(key in catCol)) catCol[key] = c;
    });
    const nameCol = catCol["Category Name"] || 2;
    const itemCol = catCol["Item Sort Order"] || 4;

    // Group item names by category, preserving first-seen order of both.
    const order = [];
    const byCat = new Map();
    for (const it of menu.items) {
      const cat = (it.category || "").trim();
      if (!cat || !it.name) continue;
      if (!byCat.has(cat)) { byCat.set(cat, []); order.push(cat); }
      byCat.get(cat).push(it.name);
    }

    let cr = 2;
    for (const cat of order) {
      const names = byCat.get(cat);
      // First row carries the category name alongside its first item.
      const first = catSheet.getRow(cr++);
      first.getCell(nameCol).value = cat;
      if (names[0]) first.getCell(itemCol).value = names[0];
      first.commit();
      // Remaining items, one per row, listed under "Item Sort Order".
      for (let i = 1; i < names.length; i++) {
        const row = catSheet.getRow(cr++);
        row.getCell(itemCol).value = names[i];
        row.commit();
      }
      cr++; // blank separator row between category blocks
    }
  }

  return wb.xlsx.writeBuffer();
}

function mockMenu() {
  return {
    restaurantName: "Sunrise Cafe",
    items: [
      { name: "Avocado Toast", description: "Sourdough, smashed avocado, chili flakes", price: "9.50", category: "Breakfast" },
      { name: "Two Egg Plate", description: "Eggs any style, toast, home fries", price: "8.95", category: "Breakfast" },
      { name: "Cappuccino", description: "", price: "4.25", category: "Drinks" },
      { name: "Cold Brew", description: "16oz", price: "4.75", category: "Drinks" },
      { name: "Turkey Club", description: "Triple decker, fries", price: "12.50", category: "Lunch" },
      { name: "Garden Salad", description: "Mixed greens, house vinaigrette", price: "7.00", category: "Lunch" },
    ],
  };
}
