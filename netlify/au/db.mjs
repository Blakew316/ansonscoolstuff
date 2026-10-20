/* From AppUpload's lib/db.js (appupload main): the same shared submission
   history — Supabase table public.app_submissions — with the same queries,
   but run as the signed-in person (their sign-in token + the public key)
   instead of with a service-role key. Row-level security on the table lets
   only confirmed company accounts read or write it (see README), so no
   secret is needed here. */
import { createClient } from "@supabase/supabase-js";
import { SB_URL, SB_KEY } from "./common.mjs";

const TABLE = "app_submissions";

export const dbEnabled = true;

export function historyFor(token) {
  let client = null;
  function db() {
    if (!client) client = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: "Bearer " + token } },
    });
    return client;
  }

  async function listSubmissions(limit = 50) {
    const { data, error } = await db()
      .from(TABLE)
      .select("id, dba, app_type, rep, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({ id: r.id, dba: r.dba, appType: r.app_type, rep: r.rep || "", savedAt: r.updated_at }));
  }

  async function listAllSubmissions(limit = 500) {
    const { data, error } = await db()
      .from(TABLE)
      .select("id, dba, app_type, rep, updated_at, data")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({ id: r.id, dba: r.dba, appType: r.app_type, rep: r.rep || "", savedAt: r.updated_at, record: r.data }));
  }

  async function getSubmission(id) {
    // maybeSingle() returns null (not an error) when the row is absent, so the
    // caller's "not found -> 404" path works instead of surfacing a DB 500.
    const { data, error } = await db().from(TABLE).select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data.data : null;
  }

  async function upsertSubmission({ id, dba, appType, rep, data }) {
    const row = { dba: dba || null, app_type: appType || null, rep: rep || null, data, updated_at: new Date().toISOString() };
    if (id) {
      const { data: out, error } = await db().from(TABLE).update(row).eq("id", id).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (out) return out.id;
      // row was deleted elsewhere — fall through to insert
    }
    const { data: out, error } = await db().from(TABLE).insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return out.id;
  }

  async function deleteSubmission(id) {
    const { error } = await db().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  return { listSubmissions, listAllSubmissions, getSubmission, upsertSubmission, deleteSubmission };
}
