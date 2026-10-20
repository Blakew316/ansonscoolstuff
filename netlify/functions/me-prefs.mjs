/* A person's own settings, kept with their account so they follow them to
   every device and survive signing out: the page keeps its working copy in
   the browser and sends each change here; signing in (anywhere) brings them
   back. Only the signed-in person can read or change their own; only the
   settings named below are kept, as the browser holds them (strings).
     POST { pull: { key: knownAt } }
       → { at: { key: at }, ed: { key: editedMs }, values: { key: value|null } }
         (values only for what changed since knownAt)
     POST { set: { key: { v: value|null, edited: ms } } }
       → { at: { key: at }, ed: { key: editedMs }, stale: { key: { v, at, ed } } }
   The most recent edit wins: a change made earlier than the one already kept
   (made elsewhere, later) isn't applied — the newer value comes back in
   `stale` instead. `at` is when the server took a change (for "what's new
   since"); `ed` when the person made it.
   The settings live together in one record (value and stamps change as one
   write).
   (signed-in company accounts) */
import { getStore } from "@netlify/blobs";
import { json, requireUser, updateJSON } from "../au/common.mjs";

/* the settings that follow a person (see README → Your settings) */
const KEYS = new Set([
  "wp.theme", "wp.teamSel", "wp.routeSel", "wp.genMax", "wp.tipNav",
  "tm_add_agent",
  "appupload.rep", "appupload.manager",
]);
const MAX_SMALL = 64 * 1024;             /* each setting */
const MAX_BODY = 1024 * 1024 + 256 * 1024;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

let STORE = null;
const store = () => STORE || (STORE = getStore({ name: "prefs", consistency: "strong" }));
const recKey = (uid) => "p/" + encodeURIComponent(uid);
/* only the named settings, as plain data (never an inherited or special key) */
const pick = (o) => { const r = Object.create(null); if (o && typeof o === "object") for (const k of Object.keys(o)) if (KEYS.has(k)) r[k] = o[k]; return r; };
const plain = (r) => Object.assign({}, r);

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  if (req.method !== "POST") return json({ error: "Bad request." }, 405);
  const uid = auth.user.id;
  let st;
  try { st = store(); } catch (e) { return json({ error: "Settings can’t be saved on this site yet." }, 503); }
  let body;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "Those settings are too large to save." }, 413);
    body = JSON.parse(text);
  } catch (e) { return json({ error: "Bad request." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "Bad request." }, 400);

  try {
    if (body.set && typeof body.set === "object") {
      const now = Date.now();
      const set = Object.create(null);
      for (const [k, ch] of Object.entries(pick(body.set))) {
        if (!ch || typeof ch !== "object") continue;
        const v = ch.v;
        if (v !== null && typeof v !== "string") continue;
        if (v !== null && v.length > MAX_SMALL) return json({ error: "That setting is too large to save.", key: k }, 413);
        const e = Number(ch.edited);
        set[k] = { v, edited: Math.min(now, Number.isFinite(e) && e > 0 ? e : now) };   /* (never later than now) */
      }
      const at = Object.create(null), ed = Object.create(null), stale = Object.create(null);
      const small = Object.keys(set);
      if (small.length) {
        await updateJSON(st, recKey(uid), (cur) => {
          const rec = { at: plain(pick(cur && cur.at)), ed: plain(pick(cur && cur.ed)), v: plain(pick(cur && cur.v)) };
          let changed = false;
          for (const k of small) {
            const c = set[k], curAt = rec.at[k] || 0, curEd = rec.ed[k] || 0;
            delete at[k]; delete ed[k]; delete stale[k];
            if (c.edited < curEd) { stale[k] = { v: own(rec.v, k) ? rec.v[k] : null, at: curAt, ed: curEd }; continue; }
            const stamp = Math.max(now, curAt + 1);
            rec.at[k] = stamp; rec.ed[k] = c.edited; at[k] = stamp; ed[k] = c.edited; changed = true;
            if (c.v === null) delete rec.v[k]; else rec.v[k] = c.v;
          }
          return changed ? rec : undefined;
        });
      }
      return json({ at: plain(at), ed: plain(ed), stale: plain(stale) });
    }
    if (body.pull && typeof body.pull === "object") {
      const known = pick(body.pull);
      const rec = await st.get(recKey(uid), { type: "json" });
      const at = plain(pick(rec && rec.at)), ed = plain(pick(rec && rec.ed)), vals = pick(rec && rec.v), values = {};
      for (const k of Object.keys(at)) {
        if (Number(known[k]) >= at[k]) continue;
        values[k] = own(vals, k) && typeof vals[k] === "string" ? vals[k] : null;
      }
      return json({ at, ed, values });
    }
  } catch (e) {
    return json({ error: e && e.busy ? "Busy saving — try again in a moment." : "Couldn’t reach the settings store — try again in a minute.", retry: true }, 503);
  }
  return json({ error: "Bad request." }, 400);
};
