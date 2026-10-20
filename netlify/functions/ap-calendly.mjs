/* Appointments: a person's own Calendly, on their calendar. Their Calendly
   personal access token is kept here on the server, under their sign-in
   only: it is never sent back to any browser (theirs included), and no one
   else on the team can read it or their Calendly events. Only
   https://api.calendly.com is ever contacted, with that token.
     GET  ?status=1                       → { connected, who }
     GET  ?min=<ISO>&max=<ISO>            → { connected, who, events, partial }
     POST { action: "connect", token }    → { connected, who }
     POST { action: "disconnect" }        → { connected: false }
   (signed-in company accounts) */
import { getStore } from "@netlify/blobs";
import { json, requireUser } from "../au/common.mjs";

const API = "https://api.calendly.com";
const TOKEN_RE = /^[A-Za-z0-9._~+/=-]{20,4096}$/;
const UUID_RE = /^[A-Za-z0-9-]{6,64}$/;
const USER_URI = /^https:\/\/api\.calendly\.com\/users\/[A-Za-z0-9-]{6,64}$/;
const MAX_SPAN_MS = 200 * 86400000;
const MAX_EVENTS = 600;
const MAX_INVITEES = 10;                  // listed per event (the rest are counted)
const MAX_QA = 8;
const CACHE_MAX = 2500;                   // events whose invitees are remembered
const INV_TTL_MS = 12 * 3600000;          // …looked up again after this
const FAIL_TTL_MS = 15 * 60000;           // a lookup Calendly refused: not asked again before this
/* Netlify stops a function at 10 s: this answers inside it with what it has
   (the page asks again for the rest). */
const BUDGET_MS = Number(process.env.AP_CALENDLY_BUDGET_MS) || 8500;

const REJECTED = "Calendly didn’t accept that token — copy it again from Calendly (Integrations → API & Webhooks). It’s only shown once, so you may need to generate a new one.";
const REVOKED = "Calendly no longer accepts your saved token — connect again in Settings with a new one.";
const BUSY = "Calendly is busy right now — try again in a minute.";
const UNREACHABLE = "Couldn’t reach Calendly — try again in a minute.";

let STORE = null;
const store = () => STORE || (STORE = getStore({ name: "calendly", consistency: "strong" }));
const keyOf = (id) => "u/" + encodeURIComponent(id);
const cacheKey = (id) => "c/" + encodeURIComponent(id);

const str = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n) : "");
function httpsUrl(v) {
  if (typeof v !== "string" || v.length > 600) return "";
  try { const u = new URL(v.trim()); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch (e) { return ""; }
}
const who = (rec) => ({ name: rec.name || "", email: rec.email || "" });

/* one Calendly request; err.status carries its HTTP status */
async function cal(token, url, deadline) {
  if (!url.startsWith(API + "/")) throw Object.assign(new Error("bad url"), { status: 0 });
  const left = deadline - Date.now();
  if (left < 400) throw Object.assign(new Error("budget"), { budget: true });
  let r;
  try {
    r = await fetch(url, { headers: { authorization: "Bearer " + token, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(Math.min(left, 6000)) });
  } catch (e) {
    throw Object.assign(new Error("unreachable"), { status: 0, budget: e && e.name === "TimeoutError" && deadline - Date.now() < 800 });
  }
  if (!r.ok) { try { await r.body?.cancel(); } catch (e) {} throw Object.assign(new Error("http " + r.status), { status: r.status }); }
  try { return await r.json(); } catch (e) { throw Object.assign(new Error("not json"), { status: 502 }); }
}

async function me(token, deadline) {
  const d = await cal(token, API + "/users/me", deadline);
  const u = d && d.resource;
  if (!u || !USER_URI.test(String(u.uri || ""))) throw Object.assign(new Error("no user"), { status: 502 });
  return { user: u.uri, name: str(u.name, 120), email: str(u.email, 200), tz: str(u.timezone, 64) };
}

function where(loc) {
  loc = loc && typeof loc === "object" ? loc : {};
  const type = String(loc.type || "");
  const text = str(loc.location, 300);
  const join = httpsUrl(loc.join_url) || (/^https:\/\//i.test(text) ? httpsUrl(text) : "");
  const LABEL = { zoom: "Zoom", zoom_conference: "Zoom", google_conference: "Google Meet", microsoft_teams_conference: "Microsoft Teams",
    webex_conference: "Webex", gotomeeting: "GoTo Meeting", gotomeeting_conference: "GoTo Meeting" };
  if (LABEL[type]) return { where: LABEL[type], join };
  if (type === "outbound_call") return { where: "Phone call — you call them", phone: text, join: "" };
  if (type === "inbound_call") return { where: "Phone call — they call " + (text || "you"), join: "" };
  if (type === "physical") return { where: text || "In person", address: text, join: "" };
  return { where: join ? "Online" : text, join };
}

function invitee(p) {
  const qa = (Array.isArray(p.questions_and_answers) ? p.questions_and_answers : [])
    .filter((q) => q && q.question && q.answer)
    .slice(0, MAX_QA)
    .map((q) => [str(q.question, 140), str(q.answer, 400)]);
  return {
    name: str(p.name, 120) || str([p.first_name, p.last_name].filter(Boolean).join(" "), 120),
    email: str(p.email, 200),
    phone: str(p.text_reminder_number, 40),
    tz: str(p.timezone, 64),
    status: p.status === "canceled" ? "canceled" : "active",
    noShow: !!(p.no_show && p.no_show.uri),
    qa,
  };
}

async function listEvents(rec, min, max, deadline) {
  const q = new URLSearchParams({ user: rec.user, min_start_time: min, max_start_time: max, sort: "start_time:asc", count: "100" });
  let url = API + "/scheduled_events?" + q, out = [], partial = false;
  for (let page = 0; url && page < 10; page++) {
    let d;
    try { d = await cal(rec.token, url, deadline); } catch (e) {
      if (page && (e.budget || e.status === 429)) { partial = true; break; }
      throw e;
    }
    for (const ev of Array.isArray(d && d.collection) ? d.collection : []) {
      const id = String(ev.uri || "").split("/").pop();
      const start = Date.parse(ev.start_time), end = Date.parse(ev.end_time);
      if (!UUID_RE.test(id) || !isFinite(start)) continue;
      out.push({ ev, id, start, end: isFinite(end) && end > start ? end : null });
    }
    if (out.length >= MAX_EVENTS) { out = out.slice(0, MAX_EVENTS); break; }   // (a range this full is cut, not retried)
    const next = d && d.pagination && d.pagination.next_page;
    url = typeof next === "string" && next.startsWith(API + "/scheduled_events?") ? next : "";
  }
  return { list: out, partial };
}

/* what the page shows for an event, invitees included where known */
function shape(item, inv) {
  const ev = item.ev, loc = where(ev.location);
  const c = ev.invitees_counter || {};
  const canceled = ev.status === "canceled";
  const o = {
    id: item.id,
    name: str(ev.name, 160) || "Calendly event",
    status: canceled ? "canceled" : "active",
    start: new Date(item.start).toISOString(),
    end: item.end ? new Date(item.end).toISOString() : null,
    where: loc.where || "",
    join: canceled ? "" : loc.join || "",
    address: loc.address || "",
    phone: loc.phone || "",
    count: Math.max(0, Math.min(100000, Number(canceled ? c.total : c.active) || 0)),
  };
  if (canceled && ev.cancellation) {
    o.canceledBy = str(ev.cancellation.canceled_by, 120);
    o.reason = str(ev.cancellation.reason, 300);
  }
  if (inv) { o.invitees = inv.list; o.count = Math.max(o.count, inv.n); }
  return o;
}
const sig = (ev) => [ev.updated_at, ev.status, ev.invitees_counter && ev.invitees_counter.total, ev.invitees_counter && ev.invitees_counter.active].join("|");

async function events(rec, userId, min, max, deadline) {
  const { list, partial: cut } = await listEvents(rec, min, max, deadline);
  let cache = null;
  try { cache = await store().get(cacheKey(userId), { type: "json" }); } catch (e) {}
  const inv = cache && cache.inv && typeof cache.inv === "object" ? cache.inv : {};
  const now = Date.now();
  const need = list.filter((it) => { const h = inv[it.id]; return !h || h.s !== sig(it.ev) || now - (h.at || 0) > (h.fail ? FAIL_TTL_MS : INV_TTL_MS); });
  let changed = false, partial = cut, stop = false, i = 0;
  // the soonest first: today's and tomorrow's interviews get their names before next month's
  need.sort((a, b) => Math.abs(a.start - now) - Math.abs(b.start - now));
  async function worker() {
    while (!stop && i < need.length) {
      const it = need[i++];
      try {
        const d = await cal(rec.token, API + "/scheduled_events/" + it.id + "/invitees?count=100", deadline);
        const rows = Array.isArray(d && d.collection) ? d.collection : [];
        const more = d && d.pagination && d.pagination.next_page ? 1 : 0;
        const active = rows.filter((p) => p && p.status !== "canceled");
        const shown = (it.ev.status === "canceled" ? rows : active).slice(0, MAX_INVITEES).map(invitee);
        inv[it.id] = { s: sig(it.ev), at: now, t: it.start, list: shown, n: (it.ev.status === "canceled" ? rows : active).length + more };
        changed = true;
      } catch (e) {
        if (e.status === 401) { stop = true; throw e; }
        // out of time, or Calendly asking to slow down: the page asks again for the rest
        if (e.budget || e.status === 429) { stop = true; partial = true; continue; }
        // anything else (not found, refused, down): not asked again for a while
        const h = inv[it.id];
        inv[it.id] = { s: sig(it.ev), at: now, t: it.start, list: h ? h.list : [], n: h ? h.n : 0, fail: true };
        changed = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, need.length) }, worker));
  if (changed) {
    let keys = Object.keys(inv);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => (inv[b].t || 0) - (inv[a].t || 0)).slice(CACHE_MAX).forEach((k) => delete inv[k]);
    }
    // only while this connection still stands (a Disconnect meanwhile deleted it all)
    try {
      const cur = await store().get(keyOf(userId), { type: "json" });
      if (cur && cur.token === rec.token) await store().setJSON(cacheKey(userId), { v: 1, inv });
    } catch (e) {}
  }
  return { events: list.map((it) => shape(it, inv[it.id])), partial };
}

function failure(e) {
  if (e && e.status === 401) return json({ error: REVOKED, reconnect: true }, 409);
  if (e && e.status === 403) return json({ error: "Calendly won’t share these events with this token — check your Calendly plan and role, then connect again.", reconnect: true }, 409);
  if (e && (e.status === 429 || e.budget)) return json({ error: BUSY, retry: true }, 503);
  return json({ error: UNREACHABLE, retry: true }, 502);
}

export default async (req) => {
  const deadline = Date.now() + BUDGET_MS;
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const uid = auth.user.id;
  let st;
  try { st = store(); } catch (e) { return json({ error: "Calendly sync isn’t available on this site yet." }, 503); }

  if (req.method === "POST") {
    let body = null;
    try {
      const text = await req.text();
      if (text.length > 16384) return json({ error: "That’s too long for a Calendly token." }, 413);
      body = JSON.parse(text);
    } catch (e) { return json({ error: "Bad request." }, 400); }
    const action = body && body.action;
    if (action === "disconnect") {
      await Promise.all([st.delete(keyOf(uid)), st.delete(cacheKey(uid))]);
      return json({ connected: false });
    }
    if (action !== "connect") return json({ error: "Bad request." }, 400);
    const token = String((body && body.token) || "").replace(/^\s*bearer\s+/i, "").replace(/\s+/g, "");
    if (!TOKEN_RE.test(token)) return json({ error: "That doesn’t look like a Calendly personal access token — copy the whole token and paste it again." }, 400);
    let rec;
    try { rec = await me(token, deadline); } catch (e) {
      if (e.status === 401 || e.status === 403) return json({ error: REJECTED }, 400);
      return failure(e);
    }
    const prev = await st.get(keyOf(uid), { type: "json" }).catch(() => null);
    await st.setJSON(keyOf(uid), { token, ...rec, at: Date.now() });
    // a new connection or another Calendly account: whatever was remembered before goes
    if (!prev || prev.user !== rec.user) await st.delete(cacheKey(uid)).catch(() => {});
    return json({ connected: true, who: who(rec) });
  }
  if (req.method !== "GET") return json({ error: "Bad request." }, 405);

  let rec = null;
  try { rec = await st.get(keyOf(uid), { type: "json" }); } catch (e) { return json({ error: UNREACHABLE, retry: true }, 503); }
  if (!rec || !rec.token || !USER_URI.test(String(rec.user || ""))) return json({ connected: false });
  const q = new URL(req.url).searchParams;
  if (q.get("status")) return json({ connected: true, who: who(rec) });

  const min = Date.parse(q.get("min") || ""), max = Date.parse(q.get("max") || "");
  if (!isFinite(min) || !isFinite(max) || max <= min || max - min > MAX_SPAN_MS) return json({ error: "Bad date range." }, 400);
  try {
    const out = await events(rec, uid, new Date(min).toISOString(), new Date(max).toISOString(), deadline);
    return json({ connected: true, who: who(rec), min: new Date(min).toISOString(), max: new Date(max).toISOString(), ...out });
  } catch (e) { return failure(e); }
};
