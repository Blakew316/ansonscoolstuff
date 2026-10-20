/* Prospect list generator — Netlify Function.
   GET /.netlify/functions/prospect?zip=75790&max=150&limit=150
   GET /.netlify/functions/prospect?city=Pasco,%20WA&max=150&limit=150
   (with the signed-in user's Supabase token: Authorization: Bearer <token>)
   &team=<id>&agent=<id>: the list is for that agent — the places it holds
   are remembered for them (the last GIVEN_MAX). A new list for them:
   POST …&fresh=1 with { exclude: [{ n: name, a: address, p: phone }] }
   (the stops on their route now) — none of the places they've been given
   before, none of those stops; fewer when the area runs out.
   Searches Google Places (New) for small businesses in a ZIP or city (categories in
   parallel, paginated), keeps only places at or under the review cap, and
   best-effort reads each business's public website for a contact email /
   owner name. Only signed-in company accounts can run it, since every call
   bills Places requests. Requires the GOOGLE_PLACES_API_KEY environment
   variable (Netlify site settings -> Environment variables). */

import { resolve4, resolve6 } from "node:dns/promises";
import { getStore } from "@netlify/blobs";
import { isOwner } from "../au/common.mjs";

/* the same public project URL + publishable key the app itself uses */
const SB_URL = "https://xeevmevxjuawskugedds.supabase.co";
const SB_KEY = "sb_publishable_hYOu-5EyUkMyJ64UNBTnwQ_4ehY5Roc";
const COMPANY = /@wholesalepayments\.com$/i;

const CATEGORIES = [
  "auto repair shop",
  "tire shop",
  "family restaurant",
  "barber shop",
  "hair salon",
  "pet grooming",
  "boutique",
  "bakery",
  "coffee shop",
  "nail salon",
  "florist",
  "dry cleaner",
  "convenience store",
  "auto parts store",
  "gift shop",
  "gym",
];

/* second sweep when the category pass comes up short of the limit */
const FALLBACK_QUERIES = [
  "small business",
  "family owned business",
  "local shop",
  "local services",
];

const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress",
  "places.nationalPhoneNumber", "places.websiteUri",
  "places.userRatingCount", "places.businessStatus", "nextPageToken",
].join(",");

/* what an agent has been given (place ids), so a new list is new; kept per
   team + agent (both random ids) in the "prospect-given" store */
const GIVEN_MAX = 3000;
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const givenStore = () => getStore({ name: "prospect-given", consistency: "strong" });
async function givenIds(key) {
  try { const v = await givenStore().get(key, { type: "json" }); return v && Array.isArray(v.ids) ? v.ids : []; }
  catch (e) { return []; }                                   // no store (local runs) or trouble: nothing remembered
}
async function rememberGiven(key, ids) {
  if (!ids.length) return;
  let st;
  try { st = givenStore(); } catch (e) { return; }
  for (let i = 0; i < 5; i++) {
    let cur = null;
    try { cur = await st.getWithMetadata(key, { type: "json" }); } catch (e) { return; }
    const had = cur && cur.data && Array.isArray(cur.data.ids) ? cur.data.ids : [];
    const seen = new Set(had), all = had.concat(ids.filter(id => !seen.has(id)));
    const next = { ids: all.slice(-GIVEN_MAX) };
    let w = null;
    try { w = cur ? await st.setJSON(key, next, { onlyIfMatch: cur.etag }) : await st.setJSON(key, next, { onlyIfNew: true }); } catch (e) { return; }
    if (!w || w.modified !== false) return;
    await new Promise(r => setTimeout(r, 15 + Math.random() * 60 * (i + 1)));
  }
}
/* a business, however it was typed: its name + address, and its phone */
const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
function bizKeys(name, addr, phone) {
  const k = [], n = norm(name), d = String(phone || "").replace(/\D/g, "");
  if (n) k.push("n:" + n + "|" + norm(addr));
  if (d.length >= 10) k.push("p:" + d.slice(-10));
  return k;
}

/* warm-instance memo so a retry / double click doesn't re-bill ~50 Places
   calls; only complete searches are kept, for 10 minutes (a new list is
   never answered from it) */
const CACHE = new Map();
const CACHE_MS = 10 * 60 * 1000;

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/* who is calling: the Supabase user behind the bearer token, remembered for
   a few minutes per token */
const USERS = new Map();
async function callerEmail(req) {
  const m = /^Bearer\s+(\S{20,4096})$/i.exec(req.headers.get("authorization") || "");
  if (!m) return { status: 401 };
  const token = m[1];
  const hit = USERS.get(token);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return { email: hit.email, id: hit.id, confirmed: hit.confirmed };
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
  if (!email) return { status: 401 };
  /* a proven mailbox: Supabase stamps this once the confirmation link is opened */
  const confirmed = !!(u.email_confirmed_at || u.confirmed_at);
  if (USERS.size > 200) USERS.clear();
  USERS.set(token, { at: Date.now(), email, id, confirmed });
  return { email, id, confirmed };
}

/* every search bills ~50 Places requests: a generous per-person cap keeps a
   runaway script (or a borrowed sign-in) from running up the bill; repeats
   answered from the 10-minute memo don't count. The count is updated with a
   conditional write, so parallel requests can't slip past it. */
const PER_HOUR = 30, PER_DAY = 150, HOUR_MS = 3600e3, DAY_MS = 24 * HOUR_MS;
async function overQuota(who) {
  let st;
  try { st = getStore({ name: "prospect-usage", consistency: "strong" }); } catch (e) { return false; }   // no store (local runs): no cap
  const key = "q/" + (who.id || who.email.toLowerCase());
  for (let i = 0; i < 6; i++) {
    let cur = null;
    try { cur = await st.getWithMetadata(key, { type: "json" }); } catch (e) { return false; }   // store trouble: don't block searching
    const now = Date.now();
    const t = (cur && cur.data && Array.isArray(cur.data.t) ? cur.data.t : []).filter(x => now - x < DAY_MS);
    if (t.filter(x => now - x < HOUR_MS).length >= PER_HOUR || t.length >= PER_DAY) return true;
    t.push(now);
    let w = null;
    try { w = cur ? await st.setJSON(key, { t }, { onlyIfMatch: cur.etag }) : await st.setJSON(key, { t }, { onlyIfNew: true }); } catch (e) { return false; }
    if (!w || w.modified !== false) return false;                // counted (or the store is failing: don't block)
    await new Promise(r => setTimeout(r, 15 + Math.random() * 60 * (i + 1)));
  }
  return true;                                                   // still colliding: a burst of parallel searches
}

/* `claim` is shared across every query in the request: a place only counts
   toward `want` (and toward pagination stopping) the first time any query
   collects it, so overlapping queries keep paginating until they find places
   that are actually new. `trouble` records a query that errored or timed
   out, so the client can tell "sparse area" from "searches failed". */
async function searchCategory(key, cat, where, max, want, pages, claim, t0, trouble, skip) {
  const found = [];
  let pageToken = null;
  for (let page = 0; page < pages && found.length < want; page++) {
    if (Date.now() - t0 > 7000) break;
    let data;
    try {
      const body = { textQuery: cat + " in " + where, maxResultCount: 20 };
      if (pageToken) body.pageToken = pageToken;
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        signal: AbortSignal.timeout(2600),
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        trouble.v = true;
        if (r.status === 400 || r.status === 401 || r.status === 403) trouble.key = true;
        break;
      }
      data = await r.json();
    } catch (e) { trouble.v = true; break; }
    for (const pl of data.places || []) {
      if ((pl.userRatingCount || 0) > max) continue;
      if (pl.businessStatus && pl.businessStatus !== "OPERATIONAL") continue;
      if (!pl.id || claim.has(pl.id)) continue;
      claim.add(pl.id);
      if (skip && skip(pl)) continue;                          // (a new list: given before, or on the route now)
      found.push({
        id: pl.id,
        name: (pl.displayName && pl.displayName.text) || "",
        phone: pl.nationalPhoneNumber || "",
        addr: pl.formattedAddress || "",
        website: pl.websiteUri || "",
      });
    }
    pageToken = data.nextPageToken || null;
    if (!pageToken) break;
  }
  return found;
}

/* interleave result lists so every day gets a mix (places are already
   unique request-wide via `claim`) */
function interleave(results, out, limit) {
  const depth = Math.max(...results.map(r => r.length), 0);
  for (let i = 0; i < depth && out.length < limit; i++) {
    for (const r of results) {
      if (out.length >= limit) break;
      if (r[i]) out.push(r[i]);
    }
  }
}

const intParam = (v, dflt, lo, hi) => {
  if (v == null || v === "") return dflt;
  if (!/^\d{1,7}$/.test(v)) return NaN;
  return Math.min(hi, Math.max(lo, parseInt(v, 10)));
};

export default async (req) => {
  const t0 = Date.now();
  const url = new URL(req.url);
  const zip = (url.searchParams.get("zip") || "").trim();
  const city = (url.searchParams.get("city") || "").trim().replace(/\s+/g, " ");
  const max = intParam(url.searchParams.get("max"), 150, 0, 100000);
  const limit = intParam(url.searchParams.get("limit"), 150, 1, 160);
  if (Number.isNaN(max)) return json({ error: "bad_max", hint: "The review cap must be a whole number" }, 400);
  if (Number.isNaN(limit)) return json({ error: "bad_limit", hint: "The list size must be a whole number" }, 400);

  /* (a one-person site: its owner, no sign-in — see ../au/common.mjs) */
  const who = isOwner(req) ? { id: "owner", email: "owner" } : await callerEmail(req);
  if (!isOwner(req)) {
    if (who.status === 503) return json({ error: "auth_unavailable", hint: "Couldn’t confirm your sign-in — try again in a minute" }, 503);
    if (!who.email) return json({ error: "auth", hint: "Your sign-in has expired — sign out and back in, then try again" }, 401);
    if (!COMPANY.test(who.email)) return json({ error: "forbidden", hint: "This email address isn’t authorized" }, 403);
    if (!who.confirmed) return json({ error: "unconfirmed", hint: "Confirm your email address first — open the link we sent to your inbox" }, 403);
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return json({ error: "missing_key", hint: "Auto-generate needs the Google Places key set on the site" }, 500);
  /* one of the two is enough: a 5-digit ZIP, or a city like "Pasco, WA" */
  let where;
  if (zip) {
    if (!/^\d{5}$/.test(zip)) return json({ error: "bad_zip", hint: "ZIP codes are 5 digits" }, 400);
    where = zip;
  } else if (city) {
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .,'’-]{1,79}$/u.test(city) || !/\p{L}.*\p{L}/u.test(city))
      return json({ error: "bad_city", hint: "Enter a city like Pasco, WA" }, 400);
    where = city;
  } else {
    return json({ error: "missing_area", hint: "Enter a ZIP code or a city" }, 400);
  }

  /* whose list, and whether it's a new one */
  const team = (url.searchParams.get("team") || "").trim(), agent = (url.searchParams.get("agent") || "").trim();
  const memKey = ID_RE.test(team) && ID_RE.test(agent) ? "g/" + team + "/" + agent : null;
  const fresh = url.searchParams.get("fresh") === "1";
  let skip = null;
  if (fresh) {
    const exIds = new Set(memKey ? await givenIds(memKey) : []), exKeys = new Set();
    if (req.method === "POST") {
      let b;
      try {
        const text = await req.text();
        if (text.length > 600000) return json({ error: "too_big", hint: "That route is too long to search around" }, 413);
        b = text ? JSON.parse(text) : {};
      } catch (e) { return json({ error: "bad_body", hint: "Bad request" }, 400); }
      const ex = b && Array.isArray(b.exclude) ? b.exclude.slice(0, 3000) : [];
      for (const x of ex) if (x && typeof x === "object") for (const k of bizKeys(String(x.n || "").slice(0, 200), String(x.a || "").slice(0, 300), String(x.p || "").slice(0, 40))) exKeys.add(k);
    }
    skip = pl => exIds.has(pl.id) || bizKeys(pl.displayName && pl.displayName.text, pl.formattedAddress, pl.nationalPhoneNumber).some(k => exKeys.has(k));
  }

  const ck = where.toLowerCase() + "|" + max + "|" + limit;
  const hit = fresh ? null : CACHE.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (memKey) await rememberGiven(memKey, hit.ids || []);
    return json(hit.body);
  }
  if (await overQuota(who)) return json({ error: "rate_limited", hint: "That’s a lot of searches in a short time — try again a little later" }, 429);

  const claim = new Set();
  const trouble = { v: false, key: false };
  const perCat = Math.ceil(limit / CATEGORIES.length) + 10;
  const results = await Promise.all(
    CATEGORIES.map(cat => searchCategory(key, cat, where, max, perCat, 3, claim, t0, trouble, skip).catch(() => []))
  );

  const out = [];
  interleave(results, out, limit);

  /* still short of a full week? sweep generic queries for whatever's left
     (skipped when the category wave already used most of the time budget) */
  if (out.length < limit && Date.now() - t0 < 5500 && !trouble.key) {
    const wantMore = limit - out.length;
    const fallback = await Promise.all(
      FALLBACK_QUERIES.map(q => searchCategory(key, q, where, max, wantMore, 3, claim, t0, trouble, skip).catch(() => []))
    );
    interleave(fallback, out, limit);
  }

  if (!out.length && trouble.v) {
    return json(trouble.key
      ? { error: "places_rejected", hint: "Google Places rejected the search — check that the key is valid and Places API (New) is enabled with billing" }
      : { error: "search_failed", hint: "The business search didn’t respond — try again in a minute" }, 502);
  }

  /* best-effort owner info from public websites — sampled evenly across the
     whole list so every day's stops get a share, and never at the cost of
     the response (the function has a 10s budget) */
  const msLeft = 9200 - (Date.now() - t0);
  if (msLeft > 1500) {
    const withSite = out.filter(b => b.website);
    const stride = Math.max(1, Math.ceil(withSite.length / 60));
    const picks = withSite.filter((_, i) => i % stride === 0).slice(0, 60);
    const perSite = Math.min(3500, msLeft - 700);
    await Promise.allSettled(
      picks.map(async b => {
        const info = await ownerFromSite(b.website, perSite);
        if (info.email) b.oemail = info.email;
        if (info.owner) b.owner = info.owner;
      })
    );
  }

  const businesses = out.map(({ website, id, ...rest }) => rest);
  const ids = out.map(b => b.id);
  const body = { where, by: zip ? "zip" : "city", max, count: businesses.length, businesses, partial: trouble.v, fresh };
  if (!trouble.v && !fresh) {
    if (CACHE.size > 50) CACHE.clear();
    CACHE.set(ck, { at: Date.now(), body, ids });
  }
  if (memKey) await rememberGiven(memKey, ids);
  return json(body);
};

/* ------------------------------------------------------------------ website contact scrape
   Only public http(s) hosts by name that resolve to public addresses (no IP
   literals, internal names or private networks), at most two redirects
   (each re-checked), HTML only, first ~200KB. */
function publicUrl(u, base) {
  let x;
  try { x = new URL(u, base); } catch (e) { return null; }
  if (x.protocol !== "http:" && x.protocol !== "https:") return null;
  if (x.username || x.password) return null;
  if (x.port && x.port !== "80" && x.port !== "443") return null;
  const h = x.hostname.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || h.startsWith("[") || h.includes(":")) return null;
  if (/^[\d.]+$/.test(h) || /^0x/i.test(h)) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|in-addr\.arpa|ip6\.arpa)$/.test(h)) return null;
  return x;
}

function privateIp(a) {
  a = a.toLowerCase();
  const v4 = a.startsWith("::ffff:") ? a.slice(7) : a;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(v4);
  if (m) {
    const x = +m[1], y = +m[2];
    return x === 0 || x === 10 || x === 127 || (x === 100 && y >= 64 && y < 128) || (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y < 32) || (x === 192 && y === 168) || x >= 224;
  }
  return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a);
}
/* straight DNS queries (not the OS resolver's small thread pool, which the
   page fetches themselves use) */
async function resolvesPublic(host) {
  const got = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const addrs = got.flatMap(r => (r.status === "fulfilled" ? r.value : []));
  return addrs.length > 0 && addrs.every(a => !privateIp(a));
}
/* a DNS query can't be cancelled, so it races the site's deadline */
const beforeDeadline = (p, signal) => new Promise(res => {
  if (signal.aborted) return res(false);
  signal.addEventListener("abort", () => res(false), { once: true });
  p.then(res, () => res(false));
});

async function readCapped(r, cap) {
  if (!r.body || !r.body.getReader) return (await r.text()).slice(0, cap);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let s = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    s += dec.decode(value, { stream: true });
    if (s.length >= cap) { reader.cancel().catch(() => {}); break; }
  }
  return s.slice(0, cap);
}

const NOT_NAME = new Set(("operated occupied owned managed since family business company services service contact about " +
  "home team store shop our the and info welcome local veteran woman women minority locally independent independently " +
  "call email phone hours open read more view meet message letter story profile bio group inc llc co dba " +
  "customer customers quality free best new great professional certified licensed insured " +
  "studio salon spa bakery cafe coffee repair auto tire tires pet pets nail nails hair barber florist cleaners " +
  "boutique gym fitness market grill kitchen restaurant bar pizza shop").split(" "));
const nameOk = n => n.length <= 40 && n.split(/\s+/).every(w => !NOT_NAME.has(w.toLowerCase()));
const NAME = "([A-Z][a-z]+(?:[A-Z][a-z]+)?(?:\\s+[A-Z]\\.)?\\s+[A-Z][a-z]+(?:[A-Z][a-z]+)?(?:-[A-Z][a-z]+)?)";
const ROLE = "(?:[Oo]wner|OWNER|[Pp]roprietor|[Ff]ounder|[Cc]o-[Oo]wner)";
const OWNER_BEFORE = new RegExp("\\b" + ROLE + "(?:\\s*(?:&|and)\\s*[A-Za-z]+)?\\s*(?:[:\\-–—,]|\\s+is)\\s*" + NAME);
const OWNER_AFTER = new RegExp(NAME + "\\s*[,\\-–—|]\\s*(?:the\\s+)?" + ROLE + "\\b");
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
const BAD_EMAIL = /(example\.|sentry|wixpress|godaddy|domain\.com|yourdomain|email\.com|@[0-9]|no-?reply|\.(png|jpe?g|gif|webp|svg)$)/i;

async function ownerFromSite(site, budgetMs) {
  const res = { email: "", owner: "" };
  let html = "";
  let at = publicUrl(site);
  if (!at) return res;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), budgetMs || 3500);
  try {
    let r = null;
    for (let hop = 0; hop < 3; hop++) {
      if (!(await beforeDeadline(resolvesPublic(at.hostname), ctrl.signal))) return res;
      r = await fetch(at, {
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; RoutePlanner/1.0)", accept: "text/html" },
        redirect: "manual",
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        if (hop === 2) return res;
        at = publicUrl(r.headers.get("location"), at);
        if (!at) return res;
        continue;
      }
      break;
    }
    if (!r.ok) return res;
    if (!/html/i.test(r.headers.get("content-type") || "")) return res;
    /* the abort timer stays armed through the body read, so a slow-drip
       response can't hold the whole request hostage */
    html = await readCapped(r, 200000);
  } catch (e) { return res; }
  finally { clearTimeout(t); }

  const host = at.hostname.toLowerCase().replace(/^www\./, "");
  const mailto = [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map(m => { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } });
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                   .replace(/<style[\s\S]*?<\/style>/gi, " ")
                   .replace(/<[^>]+>/g, " ")
                   .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&")
                   .replace(/&#8211;|&ndash;/gi, "–").replace(/&#8212;|&mdash;/gi, "—")
                   .replace(/[ \t\r\n]+/g, " ");
  const emails = [...mailto, ...(text.match(EMAIL) || [])]
    .map(e => e.trim()).filter(e => /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,24}$/.test(e) && e.length <= 80 && !BAD_EMAIL.test(e));
  res.email = emails.find(e => e.toLowerCase().endsWith("@" + host)) || emails[0] || "";
  for (const re of [OWNER_BEFORE, OWNER_AFTER]) {
    const m = text.match(re);
    if (m && nameOk(m[1])) { res.owner = m[1]; break; }
  }
  return res;
}
