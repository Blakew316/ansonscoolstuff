/* Shared by the AppUpload functions: who is calling (a signed-in company
   account whose mailbox is confirmed, checked with Supabase), JSON replies, and the short-lived job
   store. Photos and read-back data live there only while a job runs: photos
   are deleted as soon as they've been read, results as soon as they're
   collected, and anything left over within the hour (au-cleanup, every 15
   minutes, removes jobs older than 40 minutes). */
import { getStore } from "@netlify/blobs";

/* the same public project URL + publishable key the app itself uses */
export const SB_URL = "https://xeevmevxjuawskugedds.supabase.co";
export const SB_KEY = "sb_publishable_hYOu-5EyUkMyJ64UNBTnwQ_4ehY5Roc";
const COMPANY = /@wholesalepayments\.com$/i;

/* a one-person site: there's no sign-in, and the page sends OWNER_TOKEN as
   its owner. Anyone with the site's address can use these functions, so the
   per-person hourly limits are the site's limits. (OWNER_MODE=0 in the
   Netlify environment turns it off.) */
export const OWNER_MODE = process.env.OWNER_MODE !== "0";
export const OWNER_TOKEN = "ice-kannon-personal-site";
const OWNER = { id: "owner", email: "owner", confirmed: true, owner: true };
export const isOwner = (req) => OWNER_MODE && /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")?.[1] === OWNER_TOKEN;

export const MAX_FILES = 15;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;      /* per file, as in AppUpload */
export const MAX_PART_BYTES = 4 * 1024 * 1024;       /* a request body can't be much larger */
export const JOB_TTL_MS = 40 * 60 * 1000;          /* + the 15-minute sweep: gone within the hour */
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

export const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/* the Supabase user behind the bearer token, remembered for a few minutes per token */
const USERS = new Map();
async function caller(req) {
  const m = /^Bearer\s+(\S{20,4096})$/i.exec(req.headers.get("authorization") || "");
  if (!m) return { status: 401 };
  const token = m[1];
  const hit = USERS.get(token);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.user;
  let r;
  try {
    r = await fetch(SB_URL + "/auth/v1/user", {
      headers: { apikey: SB_KEY, authorization: "Bearer " + token },
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) { return { status: 503 }; }
  if (r.status === 401 || r.status === 403) return { status: 401 };
  if (!r.ok) return { status: 503 };
  let u = null;
  try { u = await r.json(); } catch (e) {}
  const email = String((u && u.email) || ""), id = String((u && u.id) || "");
  if (!email || !id) return { status: 401 };
  if (USERS.size > 200) USERS.clear();
  /* a proven mailbox: Supabase stamps this once the confirmation link is opened */
  const user = { id, email, confirmed: !!(u.email_confirmed_at || u.confirmed_at) };
  USERS.set(token, { at: Date.now(), user });
  return user;
}

/* { user, token } for a signed-in company account, otherwise { res } to send back */
export async function requireUser(req) {
  if (isOwner(req)) return { user: OWNER, token: "" };
  const who = await caller(req);
  if (who.status === 503) return { res: json({ error: "Couldn’t confirm your sign-in — try again in a minute." }, 503) };
  if (!who.email) return { res: json({ error: "Your sign-in has expired — sign out and back in, then try again." }, 401) };
  if (!COMPANY.test(who.email)) return { res: json({ error: "This email address isn’t authorized." }, 403) };
  if (!who.confirmed) return { res: json({ error: "Confirm your email address first — open the link we sent to your inbox, then try again." }, 403) };
  return { user: who, token: /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") || "")[1] };
}

export const jobStore = () => getStore({ name: "appupload-jobs", consistency: "strong" });

/* a read-modify-write that holds up when requests run in parallel: the write
   only lands on the exact value that was read (retried on a collision).
   `change` returns the new value, or undefined to leave it as it is. A
   conditional write that fails any other way comes back with no etag. */
export async function updateJSON(st, key, change, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const cur = await st.getWithMetadata(key, { type: "json" });
    const next = change(cur ? cur.data : null);
    if (next === undefined) return { value: cur ? cur.data : null, written: false };
    const w = cur ? await st.setJSON(key, next, { onlyIfMatch: cur.etag }) : await st.setJSON(key, next, { onlyIfNew: true });
    if (w && w.modified && w.etag) return { value: next, written: true };
    if (!w || w.modified !== false) throw new Error("storage write failed");
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (i + 1)));
  }
  throw Object.assign(new Error("storage busy"), { busy: true });
}
export const readMeta = (st, id) => st.get(`job/${id}/meta`, { type: "json" });
export async function deleteJob(st, id) {
  const { blobs } = await st.list({ prefix: `job/${id}/` });
  await Promise.all(blobs.map((b) => st.delete(b.key)));
}

/* a download name made only of safe characters */
export const safeName = (s, fallback) => (String(s || "") || fallback).replace(/[^a-z0-9-_]+/gi, "_").slice(0, 50);
