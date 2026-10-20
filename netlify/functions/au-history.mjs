/* AppUpload: the shared submission history — AppUpload's /api/history
   routes, with the same answers and status codes, read and written as the
   signed-in person (see ../au/db.mjs).
   GET    ?                -> { backend, items }        (newest 50, no data)
   GET    ?export=1        -> { backend, items }        (up to 500, with data)
   GET    ?id=<uuid>       -> { record }
   POST   { id?, dba, appType, rep, data } -> { id }
   DELETE ?id=<uuid>       -> { ok } */
import { json, requireUser } from "../au/common.mjs";
import { historyFor } from "../au/db.mjs";

// Supabase rows use uuid ids; validate before querying so a malformed id is a clean
// 404 instead of a Postgres 22P02 → 500. `str` bounds free-text history fields.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v, max = 255) => (typeof v === "string" ? v.slice(0, max) : "");

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  if (auth.user.owner) return json({ error: "On this site the history is kept in the browser." }, 404);
  const db = historyFor(auth.token);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (req.method === "GET" && url.searchParams.has("export")) {
    try {
      return json({ backend: "supabase", items: await db.listAllSubmissions() });
    } catch (e) {
      console.error("History export failed:", e.message);
      return json({ error: "Could not export history." }, 500);
    }
  }
  if (req.method === "GET" && id != null) {
    if (!UUID_RE.test(id)) return json({ error: "Not found." }, 404);
    try {
      const record = await db.getSubmission(id);
      if (!record) return json({ error: "Not found." }, 404);
      return json({ record });
    } catch (e) {
      console.error("History fetch failed:", e.message);
      return json({ error: "Could not load submission." }, 500);
    }
  }
  if (req.method === "GET") {
    try {
      return json({ backend: "supabase", items: await db.listSubmissions() });
    } catch (e) {
      console.error("History list failed:", e.message);
      return json({ error: "Could not load history." }, 500);
    }
  }
  if (req.method === "POST") {
    try {
      let body = null;
      try { body = await req.json(); } catch (e) {}
      const { id: rowId, dba, appType, rep, data } = body || {};
      if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Missing data." }, 400);
      const savedId = await db.upsertSubmission({
        id: typeof rowId === "string" && UUID_RE.test(rowId) ? rowId : undefined,
        dba: str(dba), appType: str(appType, 32), rep: str(rep), data,
      });
      return json({ id: savedId });
    } catch (e) {
      console.error("History save failed:", e.message);
      return json({ error: "Could not save submission." }, 500);
    }
  }
  if (req.method === "DELETE") {
    if (!UUID_RE.test(id || "")) return json({ ok: true }); // nothing to delete
    try {
      await db.deleteSubmission(id);
      return json({ ok: true });
    } catch (e) {
      console.error("History delete failed:", e.message);
      return json({ error: "Could not delete submission." }, 500);
    }
  }
  return json({ error: "Method not allowed." }, 405);
};
