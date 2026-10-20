/* AppUpload: the Clover inventory import spreadsheet for a reviewed menu
   (from AppUpload's /api/menu/xlsx).
   POST /.netlify/functions/au-menu-xlsx  { menu } */
import { json, requireUser, safeName } from "../au/common.mjs";
import { normalizeMenu, buildCloverWorkbook } from "../au/menu.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  try {
    let body = null;
    try { body = await req.json(); } catch (e) {}
    const menu = normalizeMenu((body && body.menu) || {});
    if (menu.items.length === 0) return json({ error: "No menu items to export." }, 400);
    const buffer = await buildCloverWorkbook(menu);
    const safe = safeName(menu.restaurantName, "menu");
    return new Response(Buffer.from(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${safe}-clover-import.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("Clover workbook failed:", e && e.message);
    return json({ error: (e && e.message) || "Failed to build workbook." }, 500);
  }
};
