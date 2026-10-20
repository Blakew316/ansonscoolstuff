/* ============================================================
   Team Ice Kannon · Appointments — Wholesale Payments
   Google-Calendar-style client. Zero dependencies.
   Runs as the Appointments section of Ice Kannon Route: its markup lives in
   #sec-appointments with ap- prefixed ids, the site owns the theme, and the
   Apps Script feed is a team setting (a device can still override it).
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- Storage keys ---------------- */
  var APP_VERSION = 'v37';

  var LS = {
    url: 'tm_url', theme: 'tm_theme', demo: 'tm_demo',
    cache: 'tm_cache', view: 'tm_view',
    lastSync: 'tm_lastsync',
    volUrl: 'tm_vol_url',        // optional separate merchant-volume feed
    transport: 'tm_transport',   // which fetch path worked last ('fetch'|'proxy')
    volState: 'tm_volstate',     // last seen volume per merchant
    milestones: 'tm_milestones', // recorded $1K/$5K payout crossings,
    addAgent: 'tm_add_agent',
    calendly: 'tm_calendly',     // this person's Calendly events (the token itself stays on the server)
  };

  var SCRIPT_URL_RE = /^https:\/\/script\.google(usercontent)?\.com\//;
  var HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

  // Light hues drawn from the Wholesale Payments logo family only —
  // blues, skies, greens, mints, and blends between them.
  var AGENT_PALETTE = [
    '#1E8FE8', '#2EB875', '#18A0E8', '#43CD9A',
    '#0E76C4', '#1E9E63', '#4FB3F0', '#71DC8B',
    '#3D64D8', '#23B89E', '#7FB4E8', '#2E8F5B',
    '#35C4E0', '#63C96B', '#5A7BEF', '#98E0AC',
  ];

  // The roster — always available to filter, even before data loads.
  // Order and colors are stable (color = index into AGENT_PALETTE).
  var ROSTER = ['Anson Salazar'];

  // Feed spellings that should collapse into one roster agent. Keys are
  // lowercased with spaces squeezed; values are the roster spelling.
  var AGENT_ALIASES = Object.create(null);

  // Business names are NEVER agents. If a feed's rep field carries an entity
  // (LLC/Inc/Corp/…), the row is attributed to no one rather than guessed
  // onto a person.
  var ENTITY_RE = /\b(llc|l\.l\.c\.?|inc|incorporated|corp|corporation|ltd|llp|pllc|holdings|enterprises)\b/i;
  function isBusinessName(name) { return ENTITY_RE.test(String(name == null ? '' : name)); }
  var ROSTER_BY_KEY = Object.create(null);
  ROSTER.forEach(function (n) { ROSTER_BY_KEY[n.toLowerCase().replace(/\s+/g, ' ')] = n; });

  // Snap a feed agent name onto the roster: alias map first, then a
  // case/spacing-insensitive roster match, otherwise pass it through as-is.
  function canonicalAgent(name) {
    var s = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    if (!s) return s;
    var k = s.toLowerCase();
    return AGENT_ALIASES[k] || ROSTER_BY_KEY[k] || s;
  }

  // Former team members whose rows should be dropped everywhere. Currently
  // empty — misspelled duplicates are handled by AGENT_ALIASES above instead.
  var REMOVED_AGENTS = Object.create(null);
  function isRemovedAgent(name) {
    return !!REMOVED_AGENTS[String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase()];
  }

  // Null-prototype so untrusted status strings can't reach Object.prototype.
  var STATUS_COLORS = Object.assign(Object.create(null), {
    confirmed: '#2EB875', completed: '#2EB875', done: '#2EB875', closed: '#2EB875', signed: '#2EB875', won: '#2EB875',
    pending: '#E0932F', tentative: '#E0932F', rescheduled: '#E0932F', hold: '#E0932F',
    followup: '#1E8FE8', 'follow-up': '#1E8FE8', 'follow up': '#1E8FE8', new: '#1E8FE8', scheduled: '#1E8FE8', open: '#1E8FE8',
    cancelled: '#d9544f', canceled: '#d9544f', 'no-show': '#d9544f', noshow: '#d9544f', 'no show': '#d9544f', lost: '#d9544f',
    payout: '#D4A017', paid: '#D4A017', bonus: '#D4A017',
  });

  var HOUR_H = 52;                 // px per hour in time grid
  var DEFAULT_DUR_MIN = 60;

  var state = {
    view: 'month',                 // day | week | month | schedule
    date: new Date(),              // anchor date
    miniAnchor: new Date(),        // month shown in the mini calendar
    query: '',
    feedEvents: [],                // the feed's appointments + payouts (or demo data)
    events: [],                    // …plus the team's hand-entered entries: what every view shows
    agents: [],
    milestones: [],
    loading: false,
    error: null,
    updatedAt: null,
    skipped: 0,
  };

  var reqSeq = 0;                  // guards against out-of-order refresh() results

  /* ---------------- Helpers ---------------- */
  var ROOT = document.getElementById('sec-appointments');
  function $(id) { return document.getElementById('ap-' + id); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeColor(c) { return (typeof c === 'string' && HEX_RE.test(c)) ? c : '#A7ABB3'; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = startOfDay(d); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function startOfWeek(d) { return addDays(d, -d.getDay()); } // Sunday-first
  function getStore(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function setStore(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function fmtTime(d) {
    if (!d) return '';
    var h = d.getHours(), m = d.getMinutes();
    var ap = h < 12 ? 'AM' : 'PM'; var h12 = h % 12 || 12;
    return h12 + (m ? ':' + pad2(m) : '') + ' ' + ap;
  }
  function fmtHourLabel(h) {
    if (h === 0) return '12 AM'; if (h === 12) return '12 PM';
    return (h % 12) + (h < 12 ? ' AM' : ' PM');
  }
  function fmtDayLabel(d) {
    var now = new Date(); var o = { weekday: 'long', month: 'long', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('en-US', o);
  }
  function fmtMonthLabel(d) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }

  /* ---------------- Theme ---------------- */
  // One theme for the whole site: Ice Kannon Route owns it (its header switch and
  // this section's Appearance picker both set it).
  var urlParams = new URLSearchParams(location.search);

  // Installed PWA (home-screen app)? It always launches on today's Day view.
  var IS_STANDALONE = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;

  function isNarrow() { return window.innerWidth <= 640; }
  function weekCols() { return isNarrow() ? 3 : 7; }  // phone week = readable 3-day
  function themePref() { return window.WPI ? WPI.theme.pref() : 'system'; }
  function resolvedTheme() { return window.WPI ? WPI.theme.effective() : 'light'; }
  function applyTheme() {
    var t = resolvedTheme();
    // the drawer's brand header uses the site logo for the theme in effect
    var logos = ROOT.querySelectorAll('.brand-logo-img');
    var want = t === 'dark' ? 'img/logo-dark.webp' : 'img/logo-light.webp';
    for (var li = 0; li < logos.length; li++) {
      if (logos[li].getAttribute('src') !== want) logos[li].setAttribute('src', want);
    }
    var picks = ROOT.querySelectorAll('[data-theme-pick]');
    for (var j = 0; j < picks.length; j++)
      picks[j].classList.toggle('is-active', picks[j].getAttribute('data-theme-pick') === themePref());
  }
  window.addEventListener('wpi:theme', applyTheme);

  /* ---------------- Normalization ---------------- */
  function firstArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return null;
    var keys = ['events', 'appointments', 'appts', 'tasks', 'data', 'items', 'rows', 'records', 'result', 'results', 'values'];
    for (var i = 0; i < keys.length; i++) if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    for (var k in payload) {
      if (payload[k] && typeof payload[k] === 'object' && !Array.isArray(payload[k])) {
        var inner = firstArray(payload[k]); if (inner) return inner;
      }
    }
    return null;
  }

  function pick(obj, names) {
    for (var i = 0; i < names.length; i++)
      if (Object.prototype.hasOwnProperty.call(obj, names[i]) && obj[names[i]] != null && obj[names[i]] !== '')
        return obj[names[i]];
    var lower = Object.create(null);
    for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) lower[k.toLowerCase().replace(/[\s_-]/g, '')] = obj[k];
    for (var j = 0; j < names.length; j++) {
      var key = names[j].toLowerCase().replace(/[\s_-]/g, '');
      if (lower[key] != null && lower[key] !== '') return lower[key];
    }
    return null;
  }

  function hasTZ(s) { return /(?:[zZ])$/.test(s) || /[+\-]\d{2}:?\d{2}$/.test(s); }

  // Convert various numeric encodings to a local-midnight Date, or null.
  function numberToDate(n) {
    if (!isFinite(n)) return null;
    if (n >= 1e12) { var d1 = new Date(n); return isNaN(d1) ? null : startOfDay(d1); }        // epoch ms
    if (n >= 1e9) { var d2 = new Date(n * 1000); return isNaN(d2) ? null : startOfDay(d2); }   // epoch seconds
    if (n >= 1 && n < 1e5) {                                                                    // Google Sheets serial
      var ms = Math.round(n) * 86400000 + Date.UTC(1899, 11, 30, 0, 0, 0);
      var d3 = new Date(ms);
      return isNaN(d3) ? null : new Date(d3.getUTCFullYear(), d3.getUTCMonth(), d3.getUTCDate());
    }
    return null;
  }

  // A "date" field is a wall-date: read calendar digits, ignore any time/offset.
  function parseDateOnly(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : startOfDay(v);
    if (typeof v === 'number') return numberToDate(v);
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[1] - 1, +m[2]); }
    var d = new Date(s); return isNaN(d) ? null : startOfDay(d);
  }

  // A "time of day" -> { h, m } or null. Handles AM/PM, 24h, Sheets 1899 sentinel, day fraction.
  function parseTimeOfDay(t) {
    if (t == null || t === '') return null;
    if (t instanceof Date) return { h: t.getHours(), m: t.getMinutes() };
    if (typeof t === 'number') {
      if (t > 0 && t < 1) { var mins = Math.round(t * 1440); return { h: Math.floor(mins / 60), m: mins % 60 }; }
      return null;
    }
    var s = String(t).trim();
    if (/^18(99|00)|^1900/.test(s)) { var d = new Date(s); if (!isNaN(d)) return { h: d.getUTCHours(), m: d.getUTCMinutes() }; }
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AaPp])?\.?[Mm]?\.?$/);
    if (m) {
      var h = parseInt(m[1], 10), mm = m[2] ? parseInt(m[2], 10) : 0, ap = m[3] ? m[3].toLowerCase() : null;
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      if (h >= 0 && h < 24 && mm >= 0 && mm < 60) return { h: h, m: mm };
    }
    return null;
  }

  // Resolve a single datetime value into a local Date + whether it carries a time.
  function parseDateTime(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : { date: v, hasTime: true };
    if (typeof v === 'number') { var nd = numberToDate(v); return nd ? { date: nd, hasTime: false } : null; }
    var s = String(v).trim();
    // date only
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) {
      var d0 = parseDateOnly(s); return d0 ? { date: d0, hasTime: false } : null;
    }
    // has explicit timezone -> absolute instant, convert to local
    if (hasTZ(s)) { var da = new Date(s); return isNaN(da) ? null : { date: da, hasTime: true }; }
    // naive datetime: read digits as local wall-clock
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?[Mm]\.?)?(?![A-Za-z])/);
    if (m) {
      var ih = +m[4], iap = m[6] ? m[6].toLowerCase() : null;
      if (iap === 'p' && ih < 12) ih += 12;
      if (iap === 'a' && ih === 12) ih = 0;
      return { date: new Date(+m[1], +m[2] - 1, +m[3], ih, +m[5]), hasTime: true };
    }
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})[T ,]+(\d{1,2}):(\d{2})\s*([AaPp])?/);
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      var hh = +m[4]; var ap = m[6] ? m[6].toLowerCase() : null;
      if (ap === 'p' && hh < 12) hh += 12; if (ap === 'a' && hh === 12) hh = 0;
      return { date: new Date(y, +m[1] - 1, +m[2], hh, +m[5]), hasTime: true };
    }
    var dg = new Date(s); return isNaN(dg) ? null : { date: dg, hasTime: true };
  }

  // Field aliases the normalizer maps into named event properties. Anything
  // ELSE the Apps Script sends is preserved verbatim in event.extra so the
  // detail panel can show every column that comes in.
  var ALIASES = {
    agent: ['agent', 'agentName', 'agent_name', 'rep', 'salesRep', 'sales_rep', 'owner', 'assignedTo', 'assigned_to', 'employee', 'teamMember', 'user', 'name'],
    title: ['title', 'task', 'subject', 'summary', 'appointment', 'merchant', 'business', 'client', 'customer', 'company', 'description'],
    notes: ['notes', 'note', 'details', 'comments', 'comment'],
    location: ['location', 'address', 'place', 'city', 'venue'],
    status: ['status', 'state', 'outcome'],
    // 'contact' is NOT a phone alias: the board's CONTACT column is a person's
    // name ("ask for Maria") and belongs in the details, not behind a tel: link.
    phone: ['phone', 'phoneNumber', 'phone_number', 'tel', 'telephone', 'mobile', 'cell', 'contactNumber', 'contact_number'],
    start: ['start', 'startTime', 'start_time', 'startDateTime', 'start_datetime', 'when', 'datetime', 'dateTime', 'timestamp'],
    date: ['date', 'day', 'apptDate', 'appointmentDate', 'appt_date'],
    time: ['time', 'apptTime', 'appointmentTime', 'appt_time', 'hour'],
    end: ['end', 'endTime', 'end_time', 'endDateTime', 'end_datetime'],
    ignore: ['id', 'rowid', 'row_id', '_i', 'ok', 'uid', 'guid'],
  };
  var KNOWN_KEYS = Object.create(null);
  (function () {
    for (var g in ALIASES) {
      ALIASES[g].forEach(function (a) { KNOWN_KEYS[a.toLowerCase().replace(/[\s_-]/g, '')] = true; });
    }
  })();

  function prettyLabel(k) {
    return String(k)
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Collect every field the feed sent that we didn't map to a named property.
  function extraFields(raw) {
    var out = [];
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      if (KNOWN_KEYS[k.toLowerCase().replace(/[\s_-]/g, '')]) continue;
      var v = raw[k];
      if (v == null || v === '') continue;
      if (typeof v === 'object') { try { v = JSON.stringify(v); } catch (e) { continue; } }
      v = String(v).trim();
      if (!v) continue;
      out.push([prettyLabel(k), v.length > 300 ? v.slice(0, 300) + '…' : v]);
      if (out.length >= 20) break;
    }
    return out;
  }

  function normalizeOne(raw, idx) {
    if (!raw || typeof raw !== 'object') return null;

    var agent = pick(raw, ALIASES.agent);
    if (isRemovedAgent(agent)) return null;
    var title = pick(raw, ALIASES.title);
    var notes = pick(raw, ALIASES.notes);
    if (notes === title) notes = null;
    if (!title) { title = notes || 'Appointment'; if (notes === title) notes = null; }
    var location = pick(raw, ALIASES.location);
    var status = pick(raw, ALIASES.status);
    var phone = pick(raw, ALIASES.phone);
    var startRaw = pick(raw, ALIASES.start);
    var dateRaw = pick(raw, ALIASES.date);
    var timeRaw = pick(raw, ALIASES.time);
    var endRaw = pick(raw, ALIASES.end);

    var day = null, start = null, hasTime = false;

    if (dateRaw != null && dateRaw !== '') {
      // Explicit wall-date wins; time comes from an explicit time field or naive start digits.
      day = parseDateOnly(dateRaw);
      if (!day) return null;
      var tp = parseTimeOfDay(timeRaw);
      if (!tp && typeof startRaw === 'string' && !hasTZ(startRaw)) {
        // a bare time ("10:00 AM"), or the time in "2026-09-27 1:30 PM"
        tp = parseTimeOfDay(startRaw);
        var mt = !tp && startRaw.match(/[T ](\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?[Mm]\.?)?(?![A-Za-z])/);
        if (mt) {
          var th = +mt[1], tap = mt[3] ? mt[3].toLowerCase() : null;
          if (tap === 'p' && th < 12) th += 12;
          if (tap === 'a' && th === 12) th = 0;
          tp = { h: th, m: +mt[2] };
        }
      }
      if (tp) { start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), tp.h, tp.m); hasTime = true; }
    } else if (startRaw != null && startRaw !== '') {
      var dt = parseDateTime(startRaw);
      if (!dt) return null;
      day = startOfDay(dt.date);
      if (dt.hasTime) { start = dt.date; hasTime = true; }
    } else {
      return null;
    }

    var end = null;
    if (start) {
      var tpe = parseTimeOfDay(endRaw);
      if (tpe) end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), tpe.h, tpe.m);
      else if (endRaw != null && endRaw !== '') {
        var de = parseDateTime(endRaw);
        if (de && de.hasTime) end = de.date;
      }
      if (end && end <= start) end = null;
    }

    // A "phone" that isn't dialable (fewer than 7 digits) is not a phone.
    if (phone && String(phone).replace(/\D/g, '').length < 7) phone = null;

    return {
      id: 'ev' + idx,
      agent: canonicalAgent(agent) || 'Unassigned',
      title: String(title).trim(),
      notes: notes ? String(notes).trim() : '',
      location: location ? String(location).trim() : '',
      status: status ? String(status).trim() : '',
      phone: phone ? String(phone).trim() : '',
      extra: extraFields(raw),
      day: day, key: dateKey(day),
      start: start, end: end, allDay: !hasTime,
    };
  }

  function normalize(payload) {
    var arr = firstArray(payload);
    state.skipped = 0;
    if (!arr) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var ev = normalizeOne(arr[i], i);
      if (ev) out.push(ev); else if (arr[i] != null) state.skipped++;
    }
    out.sort(function (a, b) {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      var ta = a.start ? a.start.getTime() : 0, tb = b.start ? b.start.getTime() : 0;
      return ta - tb || a.agent.localeCompare(b.agent);
    });
    return out;
  }

  /* ============================================================
     MERCHANT VOLUME MILESTONES — $1K / $5K payout events
     ============================================================ */
  var MILESTONE_LEVELS = [1000, 5000];

  function milestoneLabel(level) { return level >= 5000 ? '$5K' : '$1K'; }

  // Find a merchants array inside a payload (object key or, for the dedicated
  // volume feed, a bare array of merchant rows).
  function extractMerchants(payload, bareArrayIsMerchants) {
    if (Array.isArray(payload)) return bareArrayIsMerchants ? payload : null;
    if (!payload || typeof payload !== 'object') return null;
    var keys = ['merchants', 'merchantVolume', 'merchant_volume', 'volumes', 'volume', 'accounts'];
    for (var i = 0; i < keys.length; i++) {
      if (Array.isArray(payload[keys[i]])) return payload[keys[i]];
    }
    return null;
  }

  function parseMoney(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : null;
  }

  function normalizeMerchant(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var merchant = pick(raw, ['merchant', 'merchantName', 'business', 'dba', 'company', 'client', 'account', 'name']);
    if (!merchant) return null;
    var agent = pick(raw, ['agent', 'agentName', 'rep', 'salesRep', 'owner', 'assignedTo', 'employee']);
    if (isRemovedAgent(agent)) return null;
    if (isBusinessName(agent)) agent = null;   // entity in the rep field → Unassigned, never a person
    var volume = parseMoney(pick(raw, ['volume', 'totalVolume', 'total_volume', 'monthlyVolume', 'mtdVolume', 'processed', 'amount', 'sales']));
    var d1 = parseDateOnly(pick(raw, ['date1k', 'date1000', 'crossed1k', 'crossed1000', 'hit1k', 'hit1000']));
    var d5 = parseDateOnly(pick(raw, ['date5k', 'date5000', 'crossed5k', 'crossed5000', 'hit5k', 'hit5000']));
    if (volume == null && !d1 && !d5) return null;
    var dates = {}; dates[1000] = d1; dates[5000] = d5;
    return {
      merchant: String(merchant).trim(),
      agent: canonicalAgent(agent) || 'Unassigned',
      volume: volume,
      dates: dates,
    };
  }

  function loadMilestones() {
    try {
      var l = JSON.parse(getStore(LS.milestones) || '[]');
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  }

  // Detect $1K/$5K crossings and persist them as payout milestones.
  // Rules: an explicit DateNK column from the feed always wins (stable across
  // devices). Otherwise, the first-ever sync only baselines volumes (no
  // invented dates); after that, a merchant seen crossing a level — or a new
  // merchant arriving already over it — is stamped on the day it was observed.
  function processMerchants(rows) {
    if (!rows || !rows.length) return;
    var normd = [];
    for (var i = 0; i < rows.length; i++) {
      var m = normalizeMerchant(rows[i]);
      if (m) normd.push(m);
    }
    if (!normd.length) return;

    var stones = Object.create(null);
    loadMilestones().forEach(function (s) { stones[s.merchant + '|' + s.level] = s; });

    var volState = null;
    try { volState = JSON.parse(getStore(LS.volState) || 'null'); } catch (e) {}
    var firstSync = !volState;
    volState = volState || {};

    normd.forEach(function (r) {
      var prev = Object.prototype.hasOwnProperty.call(volState, r.merchant) ? volState[r.merchant] : null;
      MILESTONE_LEVELS.forEach(function (level) {
        var k = r.merchant + '|' + level;
        // A date from the feed is AUTHORITATIVE: it creates the milestone on
        // that exact day and corrects one recorded earlier on the wrong
        // (first-observed) day.
        if (r.dates[level]) {
          var fk = dateKey(startOfDay(r.dates[level]));
          if (stones[k]) {
            stones[k].key = fk;
            if (r.agent && r.agent !== 'Unassigned') stones[k].agent = r.agent;
          } else {
            stones[k] = { merchant: r.merchant, agent: r.agent, level: level, key: fk };
          }
          return;
        }
        if (stones[k]) return;                                   // already recorded
        var when = null;
        if (r.volume != null && r.volume >= level) {
          if (firstSync) return;                                 // baseline pass: don't invent history
          if (prev != null && prev >= level) return;             // was already over before tracking caught it
          when = new Date();                                     // crossed since the last sync
        }
        if (!when) return;
        stones[k] = { merchant: r.merchant, agent: r.agent, level: level, key: dateKey(startOfDay(when)) };
      });
      if (r.volume != null) volState[r.merchant] = r.volume;
    });

    var list = Object.keys(stones).map(function (k) { return stones[k]; });
    setStore(LS.volState, JSON.stringify(volState));
    setStore(LS.milestones, JSON.stringify(list));
    state.milestones = list;
  }

  function milestoneEventObjects() {
    return (state.milestones || []).map(function (m, i) {
      if (isRemovedAgent(m.agent)) return null;
      var kp = String(m.key || '').split('-');
      if (kp.length !== 3) return null;
      var day = new Date(+kp[0], +kp[1] - 1, +kp[2]);
      if (isNaN(day)) return null;
      return {
        id: 'ms' + i,
        agent: canonicalAgent(m.agent) || 'Unassigned',  // stones saved under an old spelling follow the rename
        title: '💰 ' + m.merchant + ' hit ' + milestoneLabel(m.level),
        notes: m.merchant + ' crossed $' + Number(m.level).toLocaleString('en-US') + ' in volume — ' + (m.agent || 'the agent') + ' is getting paid!',
        location: '', status: 'Payout', phone: '',
        extra: [['Merchant', m.merchant], ['Milestone', '$' + Number(m.level).toLocaleString('en-US') + ' in volume']],
        day: day, key: dateKey(day), start: null, end: null, allDay: true,
        milestone: m.level,
      };
    }).filter(Boolean);
  }

  // Rebuild state.events from an appointments payload + recorded milestones.
  function applyData(payload) {
    state.feedEvents = normalize(payload).concat(milestoneEventObjects());
    rebuildEvents();
  }

  // What every view shows: the feed's events, the team's hand-entered ones and
  // (for this person only) their Calendly events.
  function rebuildEvents() {
    var evs = state.feedEvents.concat(manualEventObjects(), calendlyEventObjects());
    evs.sort(function (a, b) {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      var ta = a.start ? a.start.getTime() : 0, tb = b.start ? b.start.getTime() : 0;
      return ta - tb || a.agent.localeCompare(b.agent);
    });
    state.events = evs;
    rebuildAgents(); refreshAgentColorMap();
  }

  /* ---------------- The team's hand-entered entries ---------------- */
  // Kept in the site's team data (they sync like Routes, and don't need the
  // Apps Script); here they take the feed's own shape, marked manual.
  var KIND_LABEL = { appointment: 'Appointment', meeting: 'Meeting', event: 'Event' };
  var WHOLE_TEAM = 'Whole team';
  var WALL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
  function manualEntries() { return window.WPI && WPI.events ? WPI.events() : []; }
  function manualEventObjects() {
    return manualEntries().map(function (m) {
      var p = WALL_RE.exec(m.start || '');
      if (!p || (!m.allDay && p[4] == null)) return null;
      var day = new Date(+p[1], +p[2] - 1, +p[3]);
      var start = m.allDay ? null : new Date(+p[1], +p[2] - 1, +p[3], +p[4], +p[5]);
      var q = m.allDay ? null : WALL_RE.exec(m.end || '');
      var end = q && q[4] != null ? new Date(+q[1], +q[2] - 1, +q[3], +q[4], +q[5]) : null;
      if (end && start && end <= start) end = null;
      var agent = m.agent ? canonicalAgent(m.agent) : WHOLE_TEAM;
      if (isRemovedAgent(agent)) return null;
      var extra = [];
      if (m.by) extra.push(['Added by', m.by]);
      return {
        id: 'm:' + m.id, manualId: m.id, manual: true, kind: KIND_LABEL[m.kind] ? m.kind : 'appointment',
        agent: agent, title: m.title || 'Appointment', notes: m.notes || '', location: m.location || '',
        status: '', phone: m.phone || '', extra: extra,
        day: day, key: dateKey(day), start: start, end: end, allDay: !!m.allDay,
      };
    }).filter(Boolean);
  }
  // counted as a deal: not a payout, not a hand-entered meeting or event, not
  // someone's own Calendly
  function isAppt(e) { return !e.calendly && !isPayout(e) && !(e.manual && e.kind !== 'appointment'); }
  var MAN_IC = '<span class="man-ic" title="Added in the calendar" aria-label="Added in the calendar"><svg viewBox="0 0 16 16"><path d="M3 11.5 10.2 4.3l1.5 1.5L4.5 13H3z" fill="currentColor"/></svg></span>';
  function manTag(e) { return e.manual ? MAN_IC : ''; }

  function isPayout(e) {
    if (e.milestone) return true;
    var st = (e.status || '').toLowerCase();
    return st === 'payout' || st === 'paid' || st === 'bonus';
  }

  /* ---------------- Your Calendly ---------------- */
  // A person's own Calendly events. Their token stays on the site's server,
  // under their sign-in (never in this page); the events show only on their
  // own calendar, as one more row above the agents — never the team's, and
  // never counted as the team's appointments.
  var CAL_AGENT = 'My Calendly';
  var CAL_COLOR = '#7B61FF';
  var CAL_FN = '/.netlify/functions/ap-calendly';
  var cal = { on: false, who: null, events: [], min: 0, max: 0, at: 0, err: '', reconnect: false,
    busy: null, seq: 0, checkedAt: 0, nextTry: 0, more: 0, moreTimer: null };
  // whose copy it is: the signed-in account's id the site keeps on the device
  // (there offline and before the session is restored, gone at sign-out)
  function calMe() { return getStore('wp.user'); }
  function calLoad() {
    try {
      var c = JSON.parse(getStore(LS.calendly) || 'null');
      if (!c || c.v !== 1 || !c.me || c.me !== calMe()) return;
      cal.on = !!c.on; cal.who = c.who || null; cal.events = Array.isArray(c.events) ? c.events : [];
      cal.min = +c.min || 0; cal.max = +c.max || 0; cal.at = +c.at || 0;
      cal.err = String(c.err || ''); cal.reconnect = !!c.reconnect;
    } catch (e) {}
  }
  function calSave() {
    if (!cal.on) { setStore(LS.calendly, ''); return; }
    setStore(LS.calendly, JSON.stringify({ v: 1, me: calMe(), on: true, who: cal.who, events: cal.events,
      min: cal.min, max: cal.max, at: cal.at, err: cal.err, reconnect: cal.reconnect }));
  }
  function calOff() {
    clearTimeout(cal.moreTimer); cal.more = 0;
    cal.on = false; cal.who = null; cal.events = []; cal.min = cal.max = cal.at = 0; cal.err = ''; cal.reconnect = false;
    try { localStorage.removeItem(LS.calendly); } catch (e) {}
  }
  function calHttps(u) {
    try { var x = new URL(String(u || '')); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; }
  }
  // the site's server, as this person (it holds the token and talks to Calendly)
  function calCall(method, query, body) {
    if (!window.WPI || !WPI.token) return Promise.reject(new Error('Sign in first.'));
    return WPI.token().then(function (token) {
      if (!token) { var e0 = new Error('Your sign-in has expired — sign out and back in, then try again.'); e0.noauth = true; throw e0; }
      var h = { authorization: 'Bearer ' + token };
      if (body) h['content-type'] = 'application/json';
      return fetch(CAL_FN + (query || ''), { method: method, headers: h, cache: 'no-store', body: body ? JSON.stringify(body) : undefined });
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok || !d) {
          var e = new Error((d && d.error) || (r.status === 404 ? 'Calendly sync isn’t on this site yet.' : 'Couldn’t reach the site — try again in a minute.'));
          e.reconnect = !!(d && d.reconnect); throw e;
        }
        return d;
      });
    }, function (err) {
      if (err && (err.noauth || (err.message && !/fetch|network|load failed/i.test(err.message)))) throw err;
      throw new Error('Couldn’t reach the site — check your connection.');
    });
  }
  // the months fetched: one before the date on screen and the next three;
  // those shown need the date's month (and its neighbours' edge days) and the
  // one after (the schedule lists two months)
  function calRange() { return { min: addMonths(state.date, -1).getTime(), max: addMonths(state.date, 3).getTime() }; }
  function calCovers() {
    var from = addDays(new Date(state.date.getFullYear(), state.date.getMonth(), 1), -7).getTime();
    var to = addMonths(state.date, 2).getTime();
    return cal.min && cal.min <= from && cal.max >= to;
  }
  var calWaits = 0;                // tries while the sign-in is still being restored
  function calSync(interactive) {
    if (!window.WPI || !WPI.token || !calMe()) return Promise.resolve();
    var now = Date.now();
    if (!interactive) {
      if (cal.busy) return cal.busy;
      if (now < cal.nextTry) return Promise.resolve();
      // not connected: looked again now and then (it may have been connected on another device)
      if (!cal.on && cal.checkedAt && now - cal.checkedAt < 30 * 60 * 1000) return Promise.resolve();
    }
    var w = calRange(), seq = ++cal.seq;
    var p = calCall('GET', '?min=' + encodeURIComponent(new Date(w.min).toISOString()) + '&max=' + encodeURIComponent(new Date(w.max).toISOString()))
      .then(function (d) {
        if (seq !== cal.seq) return;
        cal.checkedAt = Date.now(); cal.nextTry = 0; calWaits = 0;
        if (!d.connected) {
          var was = cal.on; calOff();
          if (was) { rebuildEvents(); if (isOpen()) renderAll(true); }
          return;
        }
        cal.on = true; cal.who = d.who || null; cal.err = ''; cal.reconnect = false;
        cal.events = Array.isArray(d.events) ? d.events : [];
        cal.min = w.min; cal.max = w.max; cal.at = Date.now();
        calSave(); rebuildEvents(); if (isOpen()) renderAll(true);
        // the server answers within its time limit: the rest of the names follow
        clearTimeout(cal.moreTimer);
        if (d.partial && cal.more < 4) { cal.more++; cal.moreTimer = setTimeout(function () { calSync(false); }, 1500); }
        else cal.more = 0;
      }, function (err) {
        if (seq !== cal.seq) return;
        // just opened: the site is still restoring the sign-in — ask again shortly
        if (err.noauth && !interactive && calWaits < 20) { calWaits++; cal.nextTry = Date.now() + 2500; setTimeout(function () { calSync(false); }, 2600); return; }
        cal.checkedAt = Date.now(); cal.nextTry = Date.now() + 60 * 1000;
        if (cal.on) { cal.err = err.message; cal.reconnect = !!err.reconnect; calSave(); if (isOpen()) renderAll(true); }
        if (interactive && cal.on && window.WPI) WPI.toast('Calendly: ' + err.message);
      })
      .then(function () { if (cal.busy === p) { cal.busy = null; calFollow(); } renderCalSettings(); });
    cal.busy = p;
    return p;
  }
  // the date on screen moved past what was fetched
  function calFollow() {
    if (cal.on && !cal.busy && !calCovers() && Date.now() >= cal.nextTry) calSync(false);
  }

  function calendlyEventObjects() {
    if (!cal.on) return [];
    return cal.events.map(function (c) {
      if (!c || typeof c !== 'object') return null;
      var start = new Date(c.start), end = c.end ? new Date(c.end) : null;
      if (isNaN(start)) return null;
      if (end && (isNaN(end) || end <= start)) end = null;
      var day = startOfDay(start);
      var inv = Array.isArray(c.invitees) ? c.invitees : [];
      var first = inv[0] || null;
      var name = String(c.name || 'Calendly event');
      var who = first ? String(first.name || first.email || '') : '';
      var others = Math.max(+c.count || 0, inv.length) - 1;
      var extra = [['Event', name]];
      if (c.where) extra.push(['Where', String(c.where)]);
      inv.forEach(function (p, i) {
        var n = inv.length > 1 ? ' ' + (i + 1) : '';
        if (p.name) extra.push(['Invitee' + n, String(p.name)]);
        if (p.email) extra.push(['Email' + n, String(p.email)]);
        if (p.phone) extra.push(['Phone' + n, String(p.phone)]);
        if (p.tz) extra.push(['Their time zone' + n, String(p.tz)]);
        (Array.isArray(p.qa) ? p.qa : []).forEach(function (q) { if (q && q[0] && q[1]) extra.push([String(q[0]), String(q[1])]); });
      });
      if (others >= inv.length && inv.length) extra.push(['Also booked', (others - inv.length + 1) + ' more']);
      if (!first && c.count > 0 && c.status !== 'canceled') extra.push(['Invitees', String(c.count) + ' — names are on the way (Refresh)']);
      if (c.status === 'canceled') {
        if (c.canceledBy) extra.push(['Canceled by', String(c.canceledBy)]);
        if (c.reason) extra.push(['Reason', String(c.reason)]);
      }
      return {
        id: 'cal:' + c.id, calendly: true, agent: CAL_AGENT,
        title: (who ? who + (others > 0 ? ' +' + others : '') + ' · ' : '') + name,
        notes: '', location: c.address ? String(c.address) : '',
        status: c.status === 'canceled' ? 'Canceled' : first && first.noShow ? 'No-show' : '',
        phone: String(c.phone || (first && first.phone) || ''),
        join: calHttps(c.join), extra: extra,
        day: day, key: dateKey(day), start: start, end: end, allDay: false,
      };
    }).filter(Boolean);
  }

  // Settings → Appointments → Your Calendly
  function calStatus(msg, kind) { var s = $('cal-status'); if (!s) return; s.textContent = msg || ''; s.className = 'settings-status' + (kind ? ' ' + kind : ''); }
  function renderCalSettings() {
    var st = $('cal-state'); if (!st) return;
    var w = cal.who || {};
    var label = [w.name, w.email].filter(Boolean).join(' · ');
    if (cal.on) {
      var when = cal.at ? new Date(cal.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      st.textContent = 'Connected' + (label ? ' as ' + label : '') + (when ? ' — last synced ' + when : '') +
        '. Your Calendly events show on your calendar only (the “' + CAL_AGENT + '” row).';
    } else st.textContent = 'Not connected — your Calendly interviews and meetings can show on this calendar, for you only.';
    $('cal-connect').hidden = cal.on && !cal.reconnect;
    $('cal-on').hidden = !cal.on;
    $('cal-go').textContent = cal.on ? 'Reconnect' : 'Connect';
    if (cal.on && cal.err && !$('cal-status').textContent) calStatus(cal.err, 'err');
  }
  function calConnect() {
    var input = $('cal-token'), btn = $('cal-go');
    var token = input.value.replace(/^\s*bearer\s+/i, '').replace(/\s+/g, '');
    if (!token) { calStatus('Paste your Calendly personal access token first.', 'err'); input.focus(); return; }
    btn.disabled = true; calStatus('Checking the token with Calendly…');
    calCall('POST', '', { action: 'connect', token: token }).then(function (d) {
      input.value = '';
      cal.on = true; cal.who = d.who || null; cal.err = ''; cal.reconnect = false; cal.events = []; cal.min = cal.max = 0;
      calSave(); renderCalSettings();
      calStatus('✓ Connected' + (d.who && d.who.name ? ' as ' + d.who.name : '') + ' — syncing your events…', 'ok');
      return calSync(true).then(function () {
        if (!cal.on) return;
        var n = cal.events.filter(function (c) { return c.status !== 'canceled'; }).length;
        if (cal.err) calStatus('Connected, but the first sync failed: ' + cal.err, 'err');
        else calStatus('✓ Connected — ' + n + ' Calendly event' + (n === 1 ? '' : 's') + ' in the months around ' + fmtMonthLabel(state.date) + '.', 'ok');
      });
    }, function (err) { calStatus(err.message, 'err'); }).then(function () { btn.disabled = false; });
  }
  function calDisconnect() {
    var btn = $('cal-off');
    btn.disabled = true; calStatus('Disconnecting…');
    calCall('POST', '', { action: 'disconnect' }).then(function () {
      cal.seq++; calOff(); rebuildEvents(); renderAll(); renderCalSettings();
      calStatus('Disconnected — your token was deleted from the site. (To retire the token itself, delete it in Calendly.)', 'ok');
    }, function (err) { calStatus(err.message, 'err'); }).then(function () { btn.disabled = false; });
  }

  function rebuildAgents() {
    var names = [], seen = Object.create(null);
    // Roster first — fixed order, so each agent keeps its colour.
    for (var r = 0; r < ROSTER.length; r++) {
      if (!seen[ROSTER[r]]) { seen[ROSTER[r]] = true; names.push(ROSTER[r]); }
    }
    // Then any agents that appear in the data but aren't on the roster (sorted).
    var extra = [];
    for (var i = 0; i < state.events.length; i++) {
      var n = state.events[i].agent;
      if (n === CAL_AGENT && state.events[i].calendly) continue;
      if (!seen[n]) { seen[n] = true; extra.push(n); }
    }
    extra.sort(function (a, b) { return a.localeCompare(b); });
    names = names.concat(extra);

    state.agents = names.map(function (n, i) {
      return { name: n, color: AGENT_PALETTE[i % AGENT_PALETTE.length] };
    });
    // this person's Calendly, in its own colour
    if (cal.on) state.agents.unshift({ name: CAL_AGENT, color: CAL_COLOR, calendly: true });
  }
  var _agentColor = Object.create(null);
  function agentColor(name) {
    return _agentColor[name] || '#A7ABB3';
  }
  function refreshAgentColorMap() {
    _agentColor = Object.create(null);
    state.agents.forEach(function (a) { _agentColor[a.name] = a.color; });
  }

  /* ---------------- Filtering ---------------- */
  function visibleEvents() {
    var q = state.query.trim().toLowerCase();
    return state.events.filter(function (e) {
      if (q) {
        var hay = (e.title + ' ' + e.agent + ' ' + e.location + ' ' + e.notes + ' ' + e.status).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function eventsForDay(list, d) {
    var k = dateKey(d);
    return list.filter(function (e) { return e.key === k; });
  }

  /* ---------------- Demo data ---------------- */
  function demoEvents() {
    var agents = ROSTER;
    var merchants = ["Joe's Diner", 'Lube Express', 'Taqueria El Sol', 'Ace Hardware', 'Bella Nails',
      'Summit Coffee', 'Lone Star BBQ', 'West Texas Tire', 'The Corner Store', 'Golden Dragon',
      'Cactus Flower Boutique', 'Permian Auto Glass', 'Sunrise Donuts', 'Big Sky Vape', 'Rustic Roots Salon'];
    var kinds = ['Demo', 'Statement review', 'Install', 'Follow-up', 'Signing', 'Service call', 'Drop-in'];
    var statuses = ['Confirmed', 'Confirmed', 'Pending', 'Confirmed', 'Follow-up', 'Confirmed', 'Pending'];
    var locations = ['Odessa, TX', 'Midland, TX', 'Lubbock, TX', 'Abilene, TX', 'San Angelo, TX', 'Big Spring, TX'];
    var seed = 42; function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    var out = [], base = new Date(), first = new Date(base.getFullYear(), base.getMonth() - 1, 1), idx = 0;
    for (var d = 0; d < 92; d++) {
      var day = addDays(first, d), dow = day.getDay();
      for (var a = 0; a < agents.length; a++) {
        var n = rnd();
        var count = dow === 0 ? 0 : dow === 6 ? (n > 0.78 ? 1 : 0) : n > 0.84 ? 3 : n > 0.52 ? 2 : n > 0.24 ? 1 : 0;
        for (var c = 0; c < count; c++) {
          var h = 8 + Math.floor(rnd() * 9), m = [0, 15, 30, 45][Math.floor(rnd() * 4)], dur = [30, 45, 60, 90][Math.floor(rnd() * 4)];
          var endMin = h * 60 + m + dur;
          out.push({
            agent: agents[a], title: kinds[Math.floor(rnd() * kinds.length)] + ' — ' + merchants[Math.floor(rnd() * merchants.length)],
            date: dateKey(day), time: pad2(h) + ':' + pad2(m), end: pad2(Math.floor(endMin / 60)) + ':' + pad2(endMin % 60),
            status: statuses[Math.floor(rnd() * statuses.length)], location: locations[Math.floor(rnd() * locations.length)],
            phone: '(432) 555-0' + (100 + Math.floor(rnd() * 899)),
            mid: 'WP-' + (100000 + Math.floor(rnd() * 899999)),
            equipment: rnd() > 0.6 ? 'Clover Flex' : 'Dejavoo QD3',
            notes: rnd() > 0.82 ? 'Bring updated rate sheet.' : '', _i: idx++,
          });
        }
      }
    }
    // Demo payout milestones so the feature is visible without a live feed
    var payoutDemos = [
      { m: 'Summit Coffee', a: 'Anson Salazar', lvl: '$1K', off: -3 },
      { m: 'Lone Star BBQ', a: 'Anson Salazar', lvl: '$1K', off: 0 },
      { m: 'Golden Dragon', a: 'Anson Salazar', lvl: '$5K', off: 0 },
      { m: 'Ace Hardware', a: 'Anson Salazar', lvl: '$5K', off: 4 },
    ];
    payoutDemos.forEach(function (p) {
      out.push({
        agent: p.a, title: '💰 ' + p.m + ' hit ' + p.lvl, date: dateKey(addDays(base, p.off)), status: 'Payout',
        notes: p.m + ' crossed ' + (p.lvl === '$5K' ? '$5,000' : '$1,000') + ' in volume — ' + p.a + ' is getting paid!',
      });
    });
    return out;
  }

  /* ---------------- Data loading ---------------- */
  // Baked-in team feed: when set, every visitor (and every installed copy of
  // the app) connects to this Apps Script web app with zero setup. A URL saved
  // in Settings still overrides it on that device.
  var DEFAULT_FEED_URL = '';

  // The team's feed (saved in Settings, shared with everyone on the Ice Kannon Route
  // team) unless this device was pointed elsewhere by a setup link.
  function teamSettings() { return (window.WPI && WPI.settings()) || {}; }
  // Ice Kannon Route has no Apps Script or merchant-volume feed: the calendar
  // is the hand-entered entries (and each person's Calendly)
  function scriptUrl() { return ''; }
  function volumeUrl() { return ''; }
  function demoOn() { return getStore(LS.demo) === '1'; }

  function loadFromCache() {
    try {
      var c = JSON.parse(getStore(LS.cache) || 'null');
      if (c && c.raw && c.url === scriptUrl()) {
        applyData(c.raw);
        state.updatedAt = c.at ? new Date(c.at) : null;
        return true;
      }
    } catch (e) {}
    return false;
  }

  var freshFlag = false; // set during manual refresh / Save & Test: bypasses the server-side cache

  function buildUrl(url, extra) {
    var range = 'from=' + dateKey(addMonths(state.date, -2)) + '&to=' + dateKey(addDays(addMonths(state.date, 3), -1));
    // Cache-buster defeats any intermediary caching of the /exec response.
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + range + '&t=' + Date.now() + (freshFlag ? '&fresh=1' : '') + (extra || '');
  }

  var ACCESS_HINT = 'Couldn’t reach the web app. In your Apps Script deployment, set “Who has access” to “Anyone”, deploy a NEW version, and use the URL ending in /exec.';

  // Primary path: a normal CORS fetch. Works when the web app is public and
  // returns JSON with CORS headers (the usual case).
  function fetchViaFetch(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 25000) : null;
    return fetch(buildUrl(url), { method: 'GET', redirect: 'follow', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) { var e = new Error('The Apps Script responded with HTTP ' + res.status + '.'); e.http = true; throw e; }
        return res.text();
      })
      .then(function (text) {
        try { return JSON.parse(text); }
        catch (e) {
          if (/<html|<!doctype/i.test(text)) { var e2 = new Error('The URL returned a Google sign-in page — set the web app access to “Anyone”.'); e2.http = true; throw e2; }
          var e3 = new Error('The response was not JSON. Check that the URL is the /exec web app URL.'); e3.http = true; throw e3;
        }
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') { var e = new Error('Request timed out after 25s.'); e.http = true; throw e; }
        // A bare TypeError with no HTTP status = the browser blocked the read
        // (CORS / cross-origin login redirect). Mark it so we can try JSONP.
        if (!err.http) { err.network = true; }
        throw err;
      });
  }

  // Fallback path: this site's own server reads the web app and hands back
  // the data. Covers what JSONP covered — a deployment whose answer a browser
  // can't read directly (no CORS headers, or a JSONP-only answer, which the
  // server unwraps) — without ever running anything the feed sends.
  function fetchViaProxy(url) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 30000) : null;
    // The server has a few seconds per request: when a cold Apps Script
    // doesn't answer in time it says so, and one more request (now warm,
    // and allowed to use the script's cache) usually gets the data.
    function once(target, again) {
      return (window.WPI ? WPI.token() : Promise.resolve('')).then(function (token) {
        if (!token) { var e0 = new Error('Sign in again to load the calendar.'); e0.http = true; throw e0; }
        return fetch('/.netlify/functions/ap-feed?url=' + encodeURIComponent(target), {
          cache: 'no-store', headers: { authorization: 'Bearer ' + token }, signal: ctrl ? ctrl.signal : undefined
        });
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok || data == null) {
            if (!again && res.status === 504 && data && data.retry) return once(target.replace(/&fresh=1(?=&|$)/, ''), true);
            var e = new Error((data && data.error) || ('The feed service responded with HTTP ' + res.status + '.'));
            e.http = true; throw e;
          }
          return data;
        });
      });
    }
    return once(buildUrl(url), false).then(function (data) {
      if (timer) clearTimeout(timer);
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      if (err && err.http) throw err;
      var e = new Error(err && err.name === 'AbortError' ? 'Request timed out after 30s.' : 'Couldn’t reach the site’s feed service.');
      e.network = true; throw e;
    });
  }

  // Apps Script round trips are the slow part of loading (cold starts can take
  // 10-30s). Two speedups: remember which transport worked last time and use
  // it directly, and when the transport is unknown, race the direct fetch and
  // the site's server in parallel and take the first success (doGet is a
  // read, so this is safe).
  function tagTransport(name) {
    return function (data) { setStore(LS.transport, name); return data; };
  }

  function fetchAppointments(url) {
    if (!SCRIPT_URL_RE.test(url)) return Promise.reject(new Error('Invalid Apps Script URL.'));
    var pref = getStore(LS.transport);

    if (pref === 'proxy' || pref === 'jsonp') {
      return fetchViaProxy(url).then(tagTransport('proxy')).catch(function (pErr) {
        return fetchViaFetch(url).then(tagTransport('fetch')).catch(function (fErr) {
          // the server's account wins: it read the web app (or it says to sign in again)
          throw (pErr && pErr.http) ? pErr : fErr;
        });
      });
    }
    if (pref === 'fetch') {
      return fetchViaFetch(url).then(tagTransport('fetch')).catch(function (err) {
        if (err && err.network) {
          return fetchViaProxy(url).then(tagTransport('proxy')).catch(function (pErr) { throw (pErr && pErr.http) ? pErr : new Error(ACCESS_HINT); });
        }
        throw err;
      });
    }

    // Transport unknown (first connect): race both, first success wins.
    return new Promise(function (resolve, reject) {
      var fails = 0, bestErr = null, done = false;
      function win(name) { return function (data) { if (done) return; done = true; setStore(LS.transport, name); resolve(data); }; }
      function lose(err) {
        if (err && err.http && (!bestErr || !bestErr.http)) bestErr = err;
        else if (!bestErr) bestErr = err;
        if (++fails === 2 && !done) { done = true; reject(bestErr && bestErr.http ? bestErr : new Error(ACCESS_HINT)); }
      }
      fetchViaFetch(url).then(win('fetch'), lose);
      fetchViaProxy(url).then(win('proxy'), lose);
    });
  }

  function recordSync(info) {
    info.at = Date.now();
    setStore(LS.lastSync, JSON.stringify(info));
  }

  var lastRefreshAt = 0;
  var REFRESH_EVERY = 15 * 60 * 1000; // a background refresh while the calendar is on screen
  var STALE_AFTER = 5 * 60 * 1000;    // on coming back to it: refreshed only when older than this
  function refresh(interactive) {
    lastRefreshAt = Date.now();
    var pCal = calSync(interactive);
    var url = scriptUrl();
    // A real connection always wins: if a URL is configured, live data is
    // fetched and demo mode is switched off. Demo only applies with no URL.
    if (!url) {
      if (demoOn()) { state.feedEvents = normalize(demoEvents()); state.updatedAt = new Date(); }
      else state.feedEvents = [];
      rebuildEvents();
      state.loading = false; state.error = null; renderAll();
      return pCal;
    }
    if (demoOn()) { setStore(LS.demo, ''); state.feedEvents = []; rebuildEvents(); }

    var seq = ++reqSeq;                      // race guard
    freshFlag = !!interactive;               // manual refresh skips the server cache
    var wasLoading = state.loading = state.feedEvents.length === 0 && state.events.length === 0;
    state.error = null;
    if (interactive) $('btn-refresh').classList.add('spinning');
    if (wasLoading) renderAll(); // (the skeleton, only when there's nothing to show yet)

    var volNote = '';
    var t0 = Date.now();

    // Fire the appointments and volume feeds in PARALLEL — the volume feed
    // failing is non-fatal and must never delay or block appointments.
    var pVol = volumeUrl()
      ? fetchAppointments(volumeUrl()).catch(function (e2) {
          volNote = 'volume feed failed: ' + ((e2 && e2.message) || 'unreachable');
          return null;
        })
      : Promise.resolve(null);

    return fetchAppointments(url)
      .then(function (payload) {
        if (seq !== reqSeq) return;          // a newer refresh already won
        // Paint appointments IMMEDIATELY — don't wait for the volume feed.
        processMerchants(extractMerchants(payload, false) || []);
        applyData(payload);
        state.updatedAt = new Date(); state.error = null;
        setStore(LS.cache, JSON.stringify({ at: Date.now(), raw: payload, url: url }));
        state.loading = false; renderAll(!wasLoading);
        return pVol.then(function (p2) {
          if (seq !== reqSeq) return;
          if (p2) { processMerchants(extractMerchants(p2, true) || []); applyData(payload); }
          recordSync({ ok: true, rows: state.feedEvents.length, skipped: state.skipped, ms: Date.now() - t0, note: volNote || undefined });
        });
      })
      .catch(function (err) {
        if (seq === reqSeq) {
          state.error = (err && err.message) || 'Could not reach your Apps Script.';
          recordSync({ ok: false, err: state.error });
        }
      })
      .then(function () {
        freshFlag = false;
        if (seq !== reqSeq) return;
        state.loading = false; $('btn-refresh').classList.remove('spinning'); renderAll(true);
      })
      .then(function () { return pCal; });
  }

  /* ============================================================
     RENDER
     ============================================================ */
  // quiet: a background refresh or sync. The view is built off screen and only put
  // in when something on it changed — then without the fade and with every scroll
  // kept — so a refresh that changes nothing changes nothing on screen.
  var quietRender = false;
  function renderAll(quiet) {
    // view switcher state
    var vs = ROOT.querySelectorAll('.vs-btn');
    for (var i = 0; i < vs.length; i++) {
      var on = vs[i].getAttribute('data-view') === state.view;
      vs[i].classList.toggle('is-active', on); vs[i].setAttribute('aria-checked', String(on));
    }
    var bn = ROOT.querySelectorAll('.bn-btn');
    for (var b = 0; b < bn.length; b++) bn[b].classList.toggle('is-active', bn[b].getAttribute('data-view') === state.view);

    renderLabel();
    renderMini(); renderSideStats(); renderBanner();
    calFollow();

    var host = $('view-host');
    if (state.loading) { host.innerHTML = ''; host.appendChild(skeleton()); return; }
    quietRender = !!quiet && !!host.firstElementChild && !host.querySelector('.skeleton-wrap');
    var view = state.view === 'month' ? renderMonth()
      : state.view === 'week' ? renderTimeGrid(weekCols())
      : state.view === 'day' ? renderTimeGrid(1)
      : renderSchedule();
    var cur = host.firstElementChild;
    if (quietRender && cur && cur.outerHTML === view.outerHTML) { quietRender = false; renderFooterMeta(); return; }
    if (quietRender) {
      // where each scrolling part of the view was, to put it back
      var kept = [];
      [host].concat([].slice.call(host.querySelectorAll('*'))).forEach(function (n) {
        if (n.scrollTop || n.scrollLeft) kept.push({ cls: n === host ? null : n.className, i: n === host ? 0 : [].indexOf.call(host.getElementsByClassName(n.className), n), top: n.scrollTop, left: n.scrollLeft });
      });
      ROOT.classList.add('ap-noanim');
    }
    host.innerHTML = '';
    host.appendChild(view);
    if (quietRender) {
      kept.forEach(function (k) {
        var n = k.cls == null ? host : host.getElementsByClassName(k.cls)[k.i];
        if (n) { n.scrollTop = k.top; n.scrollLeft = k.left; }
      });
      requestAnimationFrame(function () { requestAnimationFrame(function () { ROOT.classList.remove('ap-noanim'); }); });
    }
    quietRender = false;
    renderFooterMeta();
  }

  // the long label, or the short one when the long one doesn't fit (a phone
  // on its side: the view switch shares the bar)
  function renderLabel() {
    var label = $('current-label');
    label.textContent = headerLabel();
    if (!isNarrow() && label.scrollWidth > label.clientWidth) label.textContent = headerLabel(true);
  }
  function headerLabel(short) {
    var narrow = short || isNarrow();
    if (state.view === 'month' || state.view === 'schedule') {
      return narrow
        ? state.date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : fmtMonthLabel(state.date);
    }
    if (state.view === 'day') {
      return narrow
        ? state.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : fmtDayLabel(state.date);
    }
    var span = weekCols();
    var ws = span === 7 ? startOfWeek(state.date) : startOfDay(state.date), we = addDays(ws, span - 1);
    if (narrow) {
      var a = ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return a + ' – ' + (ws.getMonth() === we.getMonth()
        ? we.getDate()
        : we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    if (ws.getMonth() === we.getMonth())
      return ws.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) + ' – ' + we.getDate() + ', ' + we.getFullYear();
    if (ws.getFullYear() === we.getFullYear())
      return ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + we.getFullYear();
    return ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' – ' + we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function skeleton() {
    var w = el('div', 'skeleton-wrap');
    var s = el('div', 'skeleton'); s.style.flex = '1';
    w.appendChild(s); return w;
  }

  /* ----- Mini calendar ----- */
  function renderMini() {
    $('mini-label').textContent = fmtMonthLabel(state.miniAnchor);
    var host = $('mini-grid'); host.innerHTML = '';
    var dows = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    dows.forEach(function (d) { var c = el('div', 'mini-dow'); c.textContent = d; host.appendChild(c); });
    var y = state.miniAnchor.getFullYear(), m = state.miniAnchor.getMonth();
    var first = new Date(y, m, 1), gridStart = addDays(first, -first.getDay());
    var vis = visibleEvents();
    var withEv = Object.create(null);
    vis.forEach(function (e) { withEv[e.key] = true; });
    var todayK = dateKey(new Date()), selK = dateKey(state.date);
    for (var i = 0; i < 42; i++) {
      var d = addDays(gridStart, i), k = dateKey(d);
      var btn = el('button', 'mini-day');
      if (d.getMonth() !== m) btn.classList.add('is-out');
      if (withEv[k]) btn.classList.add('has-ev');
      if (k === todayK) btn.classList.add('is-today');
      if (k === selK) btn.classList.add('is-sel');
      btn.textContent = d.getDate();
      btn.setAttribute('aria-label', fmtDayLabel(d));
      (function (dd) { btn.addEventListener('click', function () { selectDate(dd); }); })(d);
      host.appendChild(btn);
    }
  }

  /* ----- Side stats: follow the SELECTED day, not just today ----- */
  function renderSideStats() {
    var host = $('side-stats'); host.innerHTML = '';
    var day = startOfDay(state.date);
    var list = eventsForDay(visibleEvents(), day);
    var agentsBooked = Object.create(null), payouts = 0, appts = 0, mine = 0;
    list.forEach(function (e) {
      if (e.calendly) { if (!isCancelled(e)) mine++; return; }
      if (isPayout(e)) { payouts++; return; }
      if (!isAppt(e)) return;
      appts++;
      if (e.agent !== WHOLE_TEAM) agentsBooked[e.agent] = true;
    });
    var title = $('glance-title');
    if (title) {
      title.textContent = dateKey(day) === dateKey(new Date())
        ? 'Today at a glance'
        : day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' at a glance';
    }
    var rows = [
      { n: appts, l: appts === 1 ? 'Appointment' : 'Appointments', c: '#1E8FE8', kind: 'appts' },
      { n: Object.keys(agentsBooked).length, l: 'Agents booked', c: '#2EB875', kind: 'agents' },
      { n: payouts, l: payouts === 1 ? 'Payout' : 'Payouts', c: '#D4A017', kind: 'payouts' },
    ];
    if (cal.on) rows.push({ n: mine, l: 'On my Calendly', c: CAL_COLOR, kind: 'calendly' });
    rows.forEach(function (r) {
      var s = el('button', 'side-stat'); s.style.setProperty('--ss-c', r.c);
      s.setAttribute('aria-label', r.n + ' ' + r.l + ' — view breakdown');
      var num = el('span', 'ss-num'); num.textContent = r.n;
      var lab = el('span', 'ss-label'); lab.textContent = r.l;
      var chev = el('span', 'ss-chev'); chev.textContent = '›';
      s.appendChild(num); s.appendChild(lab); s.appendChild(chev);
      s.addEventListener('click', function () { openGlancePanel(r.kind); });
      host.appendChild(s);
    });
  }

  /* ----- Glance tile breakdown panel ----- */
  function openGlancePanel(kind) {
    closePopover();
    popOpen = true;
    var layer = $('popover-layer'); layer.style.pointerEvents = 'auto';
    var scrim = el('div', 'pop-scrim'); scrim.addEventListener('click', closePopover);
    layer.appendChild(scrim);

    var day = startOfDay(state.date);
    var list = eventsForDay(visibleEvents(), day);
    var appts = list.filter(isAppt);
    var pays = list.filter(isPayout);

    var conf = {
      appts: { title: 'Appointments', c: '#1E8FE8' },
      agents: { title: 'Agents booked', c: '#2EB875' },
      payouts: { title: 'Payouts', c: '#D4A017' },
      calendly: { title: 'My Calendly', c: CAL_COLOR },
    }[kind] || { title: 'Details', c: '#1E8FE8' };

    var pop = el('aside', 'detail-panel glance-panel');
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
    pop.style.setProperty('--agent-c', conf.c);
    pop.innerHTML = '<div class="pop-accent"></div>' +
      '<button class="icon-btn small pop-close" aria-label="Close"><svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
      '<div class="pop-title">' + conf.title + '</div>' +
      '<div class="glance-sub">' + esc(fmtDayLabel(day)) + '</div>';

    var body = el('div', 'glance-list');
    function addEmpty(msg) { var d = el('div', 'glance-empty'); d.textContent = msg; body.appendChild(d); }

    if (kind === 'appts') {
      if (!appts.length) addEmpty('No appointments on this day.');
      appts.forEach(function (e) { body.appendChild(scheduleItem(e)); });
    } else if (kind === 'payouts') {
      if (!pays.length) addEmpty('No payout milestones on this day.');
      pays.forEach(function (e) { body.appendChild(scheduleItem(e)); });
    } else if (kind === 'calendly') {
      var mine = list.filter(function (e) { return e.calendly; });
      if (!mine.length) addEmpty('Nothing on your Calendly on this day.');
      mine.forEach(function (e) { body.appendChild(scheduleItem(e)); });
    } else {
      var byAgent = Object.create(null), order = [];
      appts.filter(function (e) { return e.agent !== WHOLE_TEAM; }).forEach(function (e) {
        if (!byAgent[e.agent]) { byAgent[e.agent] = []; order.push(e.agent); }
        byAgent[e.agent].push(e);
      });
      order.sort(function (a, b) { return a.localeCompare(b); });
      if (!order.length) addEmpty('No agents booked on this day.');
      order.forEach(function (name) {
        var h = el('div', 'gl-agent-head');
        h.innerHTML = '<span class="ev-dot" style="background:' + safeColor(agentColor(name)) + '"></span>' +
          '<b>' + esc(name) + '</b>' +
          '<span class="gl-cnt">' + byAgent[name].length + ' appt' + (byAgent[name].length === 1 ? '' : 's') + '</span>';
        body.appendChild(h);
        byAgent[name].forEach(function (e) { body.appendChild(scheduleItem(e)); });
      });
    }
    pop.appendChild(body);
    pop.appendChild(closeBar());
    layer.appendChild(pop);
    pop.querySelector('.pop-close').addEventListener('click', closePopover);
  }

  function renderBanner() {
    var b = $('banner');
    if (state.error) {
      b.hidden = false; b.className = 'banner warn';
      b.innerHTML = '<span>⚠️ ' + esc(state.error) + '</span><button class="link-btn" data-act="retry">Try again</button><button class="link-btn" data-act="settings">Settings</button>';
      return;
    }
    if (cal.on && cal.reconnect && cal.err) {
      b.hidden = false; b.className = 'banner warn';
      b.innerHTML = '<span>⚠️ Calendly: ' + esc(cal.err) + '</span><button class="link-btn" data-act="settings">Settings</button>';
      return;
    }
    if (demoOn() && !scriptUrl()) {
      b.hidden = false; b.className = 'banner';
      b.innerHTML = '<span><strong>Demo data.</strong> Sample appointments — turn them off in Settings.</span><button class="link-btn" data-act="settings">Open Settings</button>';
      return;
    }
    b.hidden = true; b.innerHTML = '';
  }

  function renderFooterMeta() {
    // reflected into the sidebar "today" section title tooltip; keep lightweight
  }

  /* ============================================================
     MONTH
     ============================================================ */
  function renderMonth() {
    var wrap = el('div', 'view');
    var month = el('div', 'month');
    var dow = el('div', 'month-dow');
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (d) { var s = el('span'); s.textContent = d; dow.appendChild(s); });
    month.appendChild(dow);

    var grid = el('div', 'month-grid');
    var y = state.date.getFullYear(), m = state.date.getMonth();
    var first = new Date(y, m, 1), gridStart = addDays(first, -first.getDay());
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var rows = Math.ceil((first.getDay() + daysInMonth) / 7);

    var vis = visibleEvents();
    var byKey = Object.create(null);
    vis.forEach(function (e) { (byKey[e.key] || (byKey[e.key] = [])).push(e); });
    var todayK = dateKey(new Date());

    for (var i = 0; i < rows * 7; i++) {
      var d = addDays(gridStart, i), k = dateKey(d), evs = byKey[k] || [];
      var cell = el('div', 'mday');
      cell.setAttribute('data-day', k);
      if (d.getMonth() !== m) cell.classList.add('is-out');
      if (k === todayK) cell.classList.add('is-today');
      // The whole cell opens that day (chips stopPropagation to open details)
      (function (dd) {
        cell.addEventListener('click', function () {
          state.date = dd; state.view = 'day'; setStore(LS.view, 'day'); syncMini(); renderAll();
        });
      })(d);
      cell.style.cursor = 'pointer';

      var num = el('button', 'mnum'); num.textContent = d.getDate();
      num.setAttribute('aria-label', fmtDayLabel(d) + ', ' + evs.length + ' appointments');
      (function (dd) { num.addEventListener('click', function (e) { e.stopPropagation(); state.date = dd; state.view = 'day'; setStore(LS.view, 'day'); syncMini(); renderAll(); }); })(d);
      cell.appendChild(num);

      var evBox = el('div', 'mday-events');
      var maxChips = 3;
      for (var c = 0; c < Math.min(evs.length, maxChips); c++) evBox.appendChild(monthChip(evs[c]));
      if (evs.length > maxChips) {
        var more = el('button', 'mmore'); more.textContent = '+' + (evs.length - maxChips) + ' more';
        (function (dd) { more.addEventListener('click', function (e) { e.stopPropagation(); state.date = dd; state.view = 'day'; setStore(LS.view, 'day'); syncMini(); renderAll(); }); })(d);
        evBox.appendChild(more);
      }
      cell.appendChild(evBox);

      if (evs.length) {
        var dots = el('div', 'mday-dots');
        for (var dd2 = 0; dd2 < Math.min(evs.length, 6); dd2++) { var i2 = el('i'); i2.style.setProperty('--agent-c', agentColor(evs[dd2].agent)); dots.appendChild(i2); }
        cell.appendChild(dots);
      }
      grid.appendChild(cell);
    }
    month.appendChild(grid);
    wrap.appendChild(month);
    return wrap;
  }

  function monthChip(e) {
    var chip = el('button', 'mev' + (isCancelled(e) ? ' is-cancelled' : '') + (isPayout(e) ? ' is-payout' : ''));
    chip.style.setProperty('--agent-c', agentColor(e.agent));
    var inner = '';
    if (!e.allDay && e.start) inner += '<span class="mev-t">' + esc(shortTime(e.start)) + '</span>';
    else inner += '<span class="ev-dot" style="background:' + safeColor(agentColor(e.agent)) + '"></span>';
    inner += manTag(e) + '<span class="mev-title">' + esc(e.title) + '</span>';
    chip.innerHTML = inner;
    chip.addEventListener('click', function (ev) { ev.stopPropagation(); openPopover(e, chip); });
    return chip;
  }

  function shortTime(d) { var h = d.getHours() % 12 || 12, m = d.getMinutes(); return h + (m ? ':' + pad2(m) : '') + (d.getHours() < 12 ? 'a' : 'p'); }
  function isCancelled(e) { return /cancel|no-?\s?show/.test(e.status.toLowerCase()); }

  /* ============================================================
     TIME GRID (Day = 1 col, Week = 7 cols)
     ============================================================ */
  function renderTimeGrid(cols) {
    var wrap = el('div', 'view');
    var grid = el('div', 'timegrid');
    var startDay = cols === 7 ? startOfWeek(state.date) : startOfDay(state.date);
    var days = [];
    for (var i = 0; i < cols; i++) days.push(addDays(startDay, i));
    var vis = visibleEvents();
    var todayK = dateKey(new Date());
    var axisW = '52px';
    var colTemplate = axisW + ' repeat(' + cols + ', minmax(0, 1fr))';

    // header — skipped for single-day phone view (and any short screen, e.g.
    // a phone on its side), where the appbar label already says "Wed, Aug 19"
    // and the band just eats vertical space
    if (cols > 1 || (!isNarrow() && window.innerHeight > 500)) {
      var head = el('div', 'tg-head'); head.style.gridTemplateColumns = colTemplate;
      head.appendChild(el('div', 'tg-corner'));
      days.forEach(function (d) {
        var h = el('div', 'tg-daycol-head');
        if (dateKey(d) === todayK) h.classList.add('is-today');
        var dow = el('div', 'tg-dow'); dow.textContent = d.toLocaleDateString('en-US', { weekday: 'short' });
        var num = el('span', 'tg-dnum'); num.textContent = d.getDate();
        h.appendChild(dow); h.appendChild(num);
        if (cols > 1) { h.style.cursor = 'pointer'; (function (dd) { h.addEventListener('click', function () { state.date = dd; state.view = 'day'; setStore(LS.view, 'day'); syncMini(); renderAll(); }); })(d); }
        head.appendChild(h);
      });
      grid.appendChild(head);
    }

    // all-day row
    var alldayByDay = days.map(function (d) { return eventsForDay(vis, d).filter(function (e) { return e.allDay; }); });
    if (alldayByDay.some(function (a) { return a.length; })) {
      var ad = el('div', 'tg-allday' + (cols === 1 ? ' is-day' : ''));
      ad.style.gridTemplateColumns = colTemplate;
      var corner = el('div', 'tg-corner'); corner.innerHTML = 'All<br>day'; ad.appendChild(corner);
      alldayByDay.forEach(function (list) {
        var cell = el('div', 'tg-allday-cell');
        list.forEach(function (e) {
          var chip = el('button', 'allday-chip' + (isCancelled(e) ? ' is-cancelled' : '') + (isPayout(e) ? ' is-payout' : ''));
          chip.style.setProperty('--agent-c', agentColor(e.agent));
          if (cols === 1) {
            // Day view: roomy card with agent + location subtitle
            var sub = esc(e.agent) + (e.location ? ' · ' + esc(e.location) : '');
            chip.innerHTML = '<span class="ev-dot" style="background:' + safeColor(agentColor(e.agent)) + ';margin-top:5px"></span>' +
              '<span class="adc-main"><span class="adc-title">' + manTag(e) + esc(e.title) + '</span><span class="adc-sub">' + sub + '</span></span>';
          } else {
            chip.innerHTML = '<span class="ev-dot" style="background:' + safeColor(agentColor(e.agent)) + '"></span>' + manTag(e) + '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(e.title) + '</span>';
          }
          chip.addEventListener('click', function (ev) { ev.stopPropagation(); openPopover(e, chip); });
          cell.appendChild(chip);
        });
        ad.appendChild(cell);
      });
      grid.appendChild(ad);
    }

    // scrollable body
    var scroll = el('div', 'tg-scroll');
    var body = el('div', 'tg-body'); body.style.gridTemplateColumns = colTemplate;

    var axis = el('div', 'tg-axis');
    for (var hh = 0; hh < 24; hh++) {
      var hr = el('div', 'tg-hour'); hr.style.height = HOUR_H + 'px';
      if (hh > 0) { var lb = el('div', 'tg-hour-label'); lb.textContent = fmtHourLabel(hh); hr.appendChild(lb); }
      axis.appendChild(hr);
    }
    body.appendChild(axis);

    var earliest = 8;
    days.forEach(function (d) {
      var col = el('div', 'tg-col');
      if (dateKey(d) === todayK) col.classList.add('is-today');
      col.style.height = (24 * HOUR_H) + 'px';
      for (var line = 0; line < 24; line++) { var ln = el('div', 'tg-line'); ln.style.top = (line * HOUR_H) + 'px'; col.appendChild(ln); }
      if (canAdd()) {
        col.classList.add('can-add');
        (function (dd, c) {
          c.addEventListener('click', function (ev) {
            if (ev.target !== c && !ev.target.classList.contains('tg-line')) return;
            var mins = Math.floor((ev.clientY - c.getBoundingClientRect().top) / HOUR_H * 2) * 30;
            openEditor(null, { date: dd, start: Math.max(0, Math.min(mins, 23 * 60 + 30)) });
          });
        })(d, col);
      }

      var timed = eventsForDay(vis, d).filter(function (e) { return !e.allDay && e.start; });
      timed.forEach(function (e) { var mins = e.start.getHours() * 60 + e.start.getMinutes(); if (mins / 60 < earliest) earliest = Math.max(0, Math.floor(mins / 60)); });
      layoutColumns(timed).forEach(function (info) {
        col.appendChild(timeEvent(info, cols));
      });

      // now-line
      if (dateKey(d) === todayK) {
        var now = new Date(); var top = (now.getHours() + now.getMinutes() / 60) * HOUR_H;
        var nl = el('div', 'tg-now'); nl.style.top = top + 'px'; col.appendChild(nl);
      }
      body.appendChild(col);
    });

    scroll.appendChild(body);
    grid.appendChild(scroll);
    wrap.appendChild(grid);
    // scroll to earliest event (or 7am) — not on a quiet redraw, which keeps the scroll
    if (!quietRender) setTimeout(function () { scroll.scrollTop = Math.max(0, (Math.min(earliest, 8) - 0.5) * HOUR_H); }, 0);
    return wrap;
  }

  // Greedy column layout for overlapping events within one day.
  function layoutColumns(events) {
    var items = events.map(function (e) { return { e: e, s: startMs(e), end: endOf(e), col: 0, total: 1 }; });
    items.sort(function (a, b) { return a.s - b.s || (b.end - b.s) - (a.end - a.s); });
    var out = [], cluster = [], clusterEnd = -1;
    function flush() {
      if (!cluster.length) return;
      var colEnds = [];
      cluster.forEach(function (item) {
        var placed = false;
        for (var c = 0; c < colEnds.length; c++) {
          if (colEnds[c] <= item.s) { colEnds[c] = item.end; item.col = c; placed = true; break; }
        }
        if (!placed) { item.col = colEnds.length; colEnds.push(item.end); }
      });
      var total = colEnds.length;
      cluster.forEach(function (item) { item.total = total; out.push(item); });
      cluster = []; clusterEnd = -1;
    }
    items.forEach(function (item) {
      if (cluster.length && item.s >= clusterEnd) flush();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    });
    flush();
    return out;
  }
  function startMs(e) { return e.start.getHours() * 60 + e.start.getMinutes(); }
  function endOf(e) { if (e.end) { var em = e.end.getHours() * 60 + e.end.getMinutes(); return Math.max(em, startMs(e) + 20); } return startMs(e) + DEFAULT_DUR_MIN; }

  function timeEvent(info, cols) {
    var e = info.e;
    var top = (info.s / 60) * HOUR_H;
    var height = Math.max(22, ((info.end - info.s) / 60) * HOUR_H - 2);
    var widthPct = 100 / info.total;
    var node = el('button', 'tev' + (isCancelled(e) ? ' is-cancelled' : '') + (isPayout(e) ? ' is-payout' : '') + (height < 40 ? ' compact' : ''));
    node.style.setProperty('--agent-c', agentColor(e.agent));
    node.style.top = top + 'px'; node.style.height = height + 'px';
    node.style.left = 'calc(' + (info.col * widthPct) + '% + 3px)';
    node.style.width = 'calc(' + widthPct + '% - 6px)';
    var html = '<div class="tev-title">' + manTag(e) + esc(e.title) + '</div>';
    if (height >= 40) {
      var timeTxt = esc(fmtTime(e.start)) + (e.end ? ' – ' + esc(fmtTime(e.end)) : '');
      if (cols === 1 && height >= 58) {
        html += '<div class="tev-time">' + timeTxt + '</div><div class="tev-agent">' + esc(e.agent) + '</div>';
      } else if (cols === 1) {
        // Not enough height for a third line — the agent rides with the time
        html += '<div class="tev-time">' + timeTxt + ' · <span class="tev-agent-inline">' + esc(e.agent) + '</span></div>';
      } else {
        html += '<div class="tev-time">' + timeTxt + '</div>';
      }
    }
    node.innerHTML = html;
    node.addEventListener('click', function (ev) { ev.stopPropagation(); openPopover(e, node); });
    return node;
  }

  /* ============================================================
     SCHEDULE (agenda)
     ============================================================ */
  function renderSchedule() {
    var wrap = el('div', 'view');
    var list = el('div', 'schedule');
    var vis = visibleEvents();
    // Show from the 1st of the anchor month through loaded range; group by day.
    var from = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
    var to = addDays(addMonths(from, 2), -1);
    var byKey = Object.create(null), keys = [];
    vis.forEach(function (e) {
      if (e.day < from || e.day > to) return;
      if (!byKey[e.key]) { byKey[e.key] = []; keys.push(e.key); }
      byKey[e.key].push(e);
    });
    keys.sort();

    if (!keys.length) {
      list.appendChild(emptyState('🗓️', 'No appointments' + (state.query ? ' match “' + state.query + '”' : ''), state.query ? 'Try a different search.' : 'Nothing scheduled in this range.'));
      wrap.appendChild(list); return wrap;
    }
    var todayK = dateKey(new Date());
    keys.forEach(function (k) {
      var parts = k.split('-'); var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
      var row = el('div', 'sch-day'); row.setAttribute('data-day', k);
      var dateCol = el('div', 'sch-date' + (k === todayK ? ' is-today' : ''));
      dateCol.innerHTML = '<div class="sd-dow">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + '</div>' +
        '<div class="sd-num">' + d.getDate() + '</div>' +
        '<div class="sd-mon">' + d.toLocaleDateString('en-US', { month: 'short' }) + '</div>';
      var items = el('div', 'sch-items');
      byKey[k].forEach(function (e) { items.appendChild(scheduleItem(e)); });
      row.appendChild(dateCol); row.appendChild(items); list.appendChild(row);
    });
    wrap.appendChild(list);
    // open at the selected day (today, after Today), not at the 1st — or at
    // the end when nothing is left from that day on
    var want = dateKey(state.date);
    setTimeout(function () {
      var at = [].filter.call(list.querySelectorAll('.sch-day'), function (r) { return r.getAttribute('data-day') >= want; })[0];
      if (!at) { list.scrollTop = list.scrollHeight; return; }
      list.scrollTop += at.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }, 0);
    return wrap;
  }

  function scheduleItem(e) {
    var node = el('button', 'sch-ev' + (isCancelled(e) ? ' is-cancelled' : '') + (isPayout(e) ? ' is-payout' : ''));
    node.style.setProperty('--agent-c', agentColor(e.agent));
    var timeHtml = e.allDay ? '<div class="st1">All day</div>'
      : '<div class="st1">' + esc(fmtTime(e.start)) + '</div>' + (e.end ? '<div class="st2">to ' + esc(fmtTime(e.end)) + '</div>' : '');
    var meta = ['<span class="ag">' + esc(e.agent) + '</span>'];
    if (e.location) meta.push('<span>📍 ' + esc(e.location) + '</span>');
    node.innerHTML =
      '<div class="sch-time">' + timeHtml + '</div>' +
      '<div class="sch-main">' +
        '<div class="sch-title">' + manTag(e) + esc(e.title) + (e.status ? statusPill(e.status) : '') + (e.manual ? kindPill(e) : '') + '</div>' +
        '<div class="sch-meta">' + meta.join('<span class="sep">·</span>') + '</div>' +
        (e.notes ? '<div class="sch-notes">' + esc(e.notes) + '</div>' : '') +
      '</div>';
    node.addEventListener('click', function (ev) { ev.stopPropagation(); openPopover(e, node); });
    return node;
  }

  function kindPill(e) { return '<span class="status-pill man-pill">' + esc(KIND_LABEL[e.kind] || 'Appointment') + '</span>'; }
  function statusPill(status) {
    var st = status.toLowerCase().replace(/\s+/g, ' ').trim();
    var c = STATUS_COLORS[st] || STATUS_COLORS[st.replace(/[\s-]/g, '')] || '#A7ABB3';
    return '<span class="status-pill" style="--st-c:' + safeColor(c) + '">' + esc(status) + '</span>';
  }

  function emptyState(emoji, title, sub) {
    var e = el('div', 'empty');
    e.innerHTML = '<div class="empty-emoji">' + emoji + '</div><div class="empty-title">' + esc(title) + '</div><p>' + esc(sub) + '</p>';
    return e;
  }

  /* ============================================================
     EVENT POPOVER
     ============================================================ */
  var popOpen = false;
  var popEvent = null;             // the event whose panel is open
  function openPopover(e /*, anchor (unused: panel is docked right) */) {
    closePopover();
    popOpen = true;
    var layer = $('popover-layer'); layer.style.pointerEvents = 'auto';
    var scrim = el('div', 'pop-scrim'); scrim.addEventListener('click', closePopover);
    layer.appendChild(scrim);

    var pop = el('aside', 'detail-panel'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
    pop.style.setProperty('--agent-c', agentColor(e.agent));

    var rows = '';
    rows += popRow('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
      e.allDay ? 'All day · ' + fmtDayLabel(e.day) : fmtDayLabel(e.day) + ' · <b>' + esc(fmtTime(e.start)) + (e.end ? ' – ' + esc(fmtTime(e.end)) : '') + '</b>');
    rows += popRow('<circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
      '<span class="ev-dot" style="background:' + safeColor(agentColor(e.agent)) + ';margin-right:6px"></span><b>' + esc(e.agent) + '</b>');
    if (e.location) {
      rows += popRow('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
        '<a class="detail-link" target="_blank" rel="noopener" href="https://maps.google.com/?q=' + encodeURIComponent(e.location) + '">' + esc(e.location) + '</a>');
    }
    if (e.join) {
      rows += popRow('<rect x="3" y="6.5" width="12.5" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15.5 10.5 21 7.5v9l-5.5-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
        '<a class="detail-link" target="_blank" rel="noopener noreferrer" href="' + esc(e.join) + '">Join the meeting</a>');
    }
    if (e.phone) {
      rows += popRow('<path d="M6.6 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.9 5.9l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
        '<a class="detail-link" href="tel:' + esc(String(e.phone).replace(/[^\d+]/g, '')) + '">' + esc(e.phone) + '</a>');
    }
    if (e.status) rows += popRow('<path d="M5 12l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', statusPill(e.status));
    if (e.notes) rows += popRow('<path d="M5 5h14v11l-4 4H5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 9h6M9 12.5h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>', esc(e.notes));

    // Everything else the Apps Script sent for this row
    var extraHtml = '';
    if (e.extra && e.extra.length) {
      extraHtml = '<div class="detail-sec">Details</div><dl class="detail-extra">';
      e.extra.forEach(function (pair) {
        extraHtml += '<div><dt>' + esc(pair[0]) + '</dt><dd>' + esc(pair[1]) + '</dd></div>';
      });
      extraHtml += '</dl>';
    }

    var manHtml = e.manual
      ? '<div class="dp-actions"><button class="ghost-btn" type="button" data-man="edit">Edit</button><button class="ghost-btn ev-del" type="button" data-man="delete">Delete</button></div>'
      : '';
    pop.innerHTML = '<div class="pop-accent"></div>' +
      '<button class="icon-btn small pop-close" aria-label="Close"><svg viewBox="0 0 24 24" class="ic"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
      '<div class="pop-title' + (isPayout(e) ? ' is-payout-title' : '') + '">' + esc(e.title) + '</div>' +
      (e.manual ? '<div class="pop-man">' + MAN_IC + 'Added in the calendar · ' + esc(KIND_LABEL[e.kind] || 'Appointment') + '</div>' : '') +
      (e.calendly ? '<div class="pop-man pop-cal">From your Calendly · only you see this</div>' : '') +
      '<div class="detail-body">' + rows + extraHtml + manHtml + '</div>';
    pop.appendChild(closeBar());
    layer.appendChild(pop);
    popEvent = e;
    pop.querySelector('.pop-close').addEventListener('click', closePopover);
    if (e.manual) {
      pop.querySelector('[data-man="edit"]').addEventListener('click', function () { closePopover(); openEditor(e.manualId); });
      pop.querySelector('[data-man="delete"]').addEventListener('click', function () { closePopover(); deleteEntry(e.manualId); });
    }
  }
  // Bottom "Close" pill for phones, where the top-right ✕ is out of reach.
  function closeBar() {
    var bar = el('div', 'dp-close-bar');
    var btn = el('button'); btn.type = 'button'; btn.textContent = 'Close';
    btn.addEventListener('click', closePopover);
    bar.appendChild(btn);
    return bar;
  }
  function popRow(svg, html) {
    return '<div class="pop-row"><svg viewBox="0 0 24 24" class="pic">' + svg + '</svg><div>' + html + '</div></div>';
  }
  function closePopover() {
    popOpen = false;
    popEvent = null;
    var layer = $('popover-layer'); layer.innerHTML = ''; layer.style.pointerEvents = 'none';
  }

  /* ============================================================
     ADD / EDIT a hand-entered entry
     ============================================================ */
  var editingId = null, editKind = 'appointment';
  function canAdd() { return !!(window.WPI && WPI.saveEvent && WPI.team && WPI.team()); }
  function hhmm(mins) { return pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60); }
  function minsOf(v) { var m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : -1; }
  function myAgentName() {
    // the signed-in person, when they're on the roster (first.last@…)
    var u = window.WPI && WPI.user && WPI.user();
    var guess = u && u.email ? canonicalAgent(u.email.split('@')[0].replace(/[._-]+/g, ' ')) : '';
    return ROSTER.indexOf(guess) >= 0 ? guess : '';
  }
  function fillAgents(sel, current) {
    // (not "My Calendly": that row is this person's own, never a team agent)
    var names = [WHOLE_TEAM].concat(state.agents.filter(function (a) { return !a.calendly; }).map(function (a) { return a.name; }).filter(function (n) { return n !== WHOLE_TEAM; }));
    if (current && names.indexOf(current) < 0) names.push(current);
    sel.innerHTML = '';
    names.forEach(function (n) { var o = el('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    sel.value = current || WHOLE_TEAM;
  }
  function setKind(k) {
    editKind = KIND_LABEL[k] ? k : 'appointment';
    ROOT.querySelectorAll('#ap-event-backdrop [data-kind]').forEach(function (b) {
      var on = b.getAttribute('data-kind') === editKind;
      b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on));
    });
  }
  function setAllDay(on) {
    $('ev-allday').setAttribute('aria-checked', String(!!on));
    $('ev-times').hidden = !!on;
  }
  function evStatus(msg, kind) { var s = $('ev-status'); s.textContent = msg || ''; s.className = 'settings-status' + (kind ? ' ' + kind : ''); }
  // id: an entry to edit; preset: {date, start (minutes)} for a new one
  function openEditor(id, preset) {
    if (!canAdd()) { if (window.WPI) WPI.toast('Open your team first to add to its calendar'); return; }
    closePopover();
    var item = null;
    if (id) item = manualEntries().filter(function (m) { return m.id === id; })[0] || null;
    if (id && !item) { if (window.WPI) WPI.toast('That entry was deleted on another device'); return; }
    editingId = item ? item.id : null;
    $('event-title').textContent = item ? 'Edit ' + (KIND_LABEL[item.kind] || 'appointment').toLowerCase() : 'New appointment';
    evStatus('');
    if (item) {
      var p = WALL_RE.exec(item.start), q = WALL_RE.exec(item.end || '');
      setKind(item.kind);
      $('ev-title').value = item.title || '';
      fillAgents($('ev-agent'), item.agent ? canonicalAgent(item.agent) : WHOLE_TEAM);
      $('ev-date').value = p[1] + '-' + p[2] + '-' + p[3];
      setAllDay(item.allDay);
      $('ev-start').value = !item.allDay && p[4] != null ? p[4] + ':' + p[5] : '09:00';
      $('ev-end').value = !item.allDay && q && q[4] != null ? q[4] + ':' + q[5] : '';
      $('ev-start').dataset.was = $('ev-start').value;
      $('ev-location').value = item.location || '';
      $('ev-phone').value = item.phone || '';
      $('ev-notes').value = item.notes || '';
    } else {
      var d = (preset && preset.date) || state.date, start;
      if (preset && preset.start != null) start = preset.start;
      else if (dateKey(d) === dateKey(new Date())) start = Math.min(22 * 60 + 45, (new Date().getHours() + 1) * 60);
      else start = 9 * 60;
      setKind('appointment');
      $('ev-title').value = '';
      var last = getStore(LS.addAgent) || myAgentName();
      if (last === CAL_AGENT) last = '';
      fillAgents($('ev-agent'), last || WHOLE_TEAM);
      $('ev-date').value = dateKey(d);
      setAllDay(false);
      $('ev-start').value = hhmm(start);
      $('ev-end').value = hhmm(Math.min(start + 60, 23 * 60 + 45));
      $('ev-start').dataset.was = $('ev-start').value;
      $('ev-location').value = ''; $('ev-phone').value = ''; $('ev-notes').value = '';
    }
    $('ev-delete').hidden = !item;
    $('event-backdrop').hidden = false; document.body.style.overflow = 'hidden';
    if (!item && !isNarrow()) setTimeout(function () { $('ev-title').focus(); }, 30);
  }
  function closeEditor() {
    if ($('event-backdrop').hidden) return;
    $('event-backdrop').hidden = true; document.body.style.overflow = '';
    editingId = null;
  }
  function saveEditor() {
    var title = $('ev-title').value.trim();
    var date = $('ev-date').value, allDay = $('ev-allday').getAttribute('aria-checked') === 'true';
    var s = minsOf($('ev-start').value), e = minsOf($('ev-end').value);
    if (!title) { evStatus('Give it a title.', 'err'); $('ev-title').focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { evStatus('Pick a date.', 'err'); return; }
    if (!allDay && s < 0) { evStatus('Pick a start time, or turn on All day.', 'err'); return; }
    if (!allDay && e >= 0 && e <= s) { evStatus('It has to end after it starts.', 'err'); return; }
    var phone = $('ev-phone').value.trim();
    if (phone && phone.replace(/\D/g, '').length < 7) phone = '';
    var agent = $('ev-agent').value;
    if (agent === CAL_AGENT) { evStatus('Pick an agent, or the whole team.', 'err'); return; }
    var item = {
      kind: editKind, title: title, agent: agent === WHOLE_TEAM ? '' : agent,
      allDay: allDay, start: allDay ? date : date + 'T' + hhmm(s), end: allDay || e < 0 ? '' : date + 'T' + hhmm(e),
      location: $('ev-location').value.trim(), phone: phone, notes: $('ev-notes').value.trim(),
    };
    if (editingId) item.id = editingId;
    var id = WPI.saveEvent(item);
    if (!id) {
      evStatus(!WPI.team() ? 'Open your team first.'
        : editingId && !manualEntries().some(function (m) { return m.id === editingId; }) ? 'This entry was deleted on another device.'
        : WPI.eventsFull && WPI.eventsFull() ? 'The team calendar is full — delete some upcoming entries first.'
        : 'Couldn’t save it — try again.', 'err');
      return;
    }
    setStore(LS.addAgent, agent);
    // make sure it's in view: the search not hiding it, its day open
    if (state.query) { state.query = ''; var sb = $('search'); if (sb) sb.value = ''; $('search-clear').hidden = true; }
    var dp = date.split('-');
    state.date = new Date(+dp[0], +dp[1] - 1, +dp[2]); syncMini();
    var wasEdit = !!editingId;
    closeEditor();
    rebuildEvents(); renderAll();
    var saved = state.events.filter(function (x) { return x.manualId === id; })[0];
    if (saved && !isNarrow()) openPopover(saved);
    WPI.toast(wasEdit ? 'Saved' : 'Added to the team’s calendar', true);
  }
  function deleteEntry(id) {
    var copy = manualEntries().filter(function (m) { return m.id === id; })[0];
    if (!copy || !WPI.deleteEvent(id)) { WPI.toast('That entry was already deleted'); return; }
    closeEditor();
    var team = WPI.team(), tid = team && team.id;
    WPI.toast('Deleted “' + copy.title + '”', false, { label: 'Undo', run: function () {
      var now = WPI.team();
      if (!now || now.id !== tid) return;                // (only in the team it was deleted from)
      var back = WPI.saveEvent({ id: id, undo: true, kind: copy.kind, title: copy.title, agent: copy.agent, allDay: copy.allDay,
        start: copy.start, end: copy.end, location: copy.location, phone: copy.phone, notes: copy.notes, by: copy.by });
      if (!back) WPI.toast('Couldn’t bring it back' + (WPI.eventsFull && WPI.eventsFull() ? ' — the team calendar is full' : ''));
    } });
  }

  /* ============================================================
     Navigation
     ============================================================ */
  function go(delta) {
    if (state.view === 'day') state.date = addDays(state.date, delta);
    else if (state.view === 'week') state.date = addDays(state.date, delta * weekCols());
    else state.date = clampToToday(addMonths(state.date, delta));     // month, schedule: its 1st (today in this month)
    syncMini(); closePopover(); renderAll();
  }
  function clampToToday(d) {
    var t = new Date();
    return (d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth()) ? t : d;
  }
  function goToday() { state.date = new Date(); syncMini(); closePopover(); renderAll(); }
  function selectDate(d) {
    state.date = d;
    if (state.view === 'month' || state.view === 'schedule') { state.view = 'day'; setStore(LS.view, 'day'); }
    syncMini(); closePopover(); renderAll();
    if (window.innerWidth <= 860) closeSidebar();
  }
  function syncMini() { state.miniAnchor = new Date(state.date.getFullYear(), state.date.getMonth(), 1); }
  function setView(v) {
    if (state.view === v) return;
    state.view = v; setStore(LS.view, v); closePopover(); renderAll();
  }

  /* ============================================================
     Sidebar (mobile)
     ============================================================ */
  function openSidebar() { $('sidebar').classList.add('open'); $('sidebar-scrim').hidden = false; }
  function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-scrim').hidden = true; }

  /* ============================================================
     Settings
     ============================================================ */
  function fillSettings() {
    $('demo-toggle').setAttribute('aria-checked', demoOn() ? 'true' : 'false');
    $('settings-status').textContent = ''; $('settings-status').className = 'settings-status';
    renderConnStatus();
    $('cal-token').value = ''; calStatus('');
    renderCalSettings();
    applyTheme();
  }
  function openSettings() {
    // (in Ice Kannon Route these are in the site's Settings, with every section's)
    if (window.WPI && WPI.openSettings) { WPI.openSettings('appointments'); return; }
    fillSettings();
    $('settings-backdrop').hidden = false; document.body.style.overflow = 'hidden';
  }

  // Last-sync diagnostics shown in Settings, so "nothing synced" is never silent.
  function renderConnStatus() {
    var el = $('conn-status');
    if (!el) return;
    var bits = ['Build ' + APP_VERSION];
    try {
      var s = JSON.parse(getStore(LS.lastSync) || 'null');
      if (s && s.at) {
        var when = new Date(s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        if (s.ok) {
          bits.push('last sync ' + when + (s.ms ? ' (' + (s.ms / 1000).toFixed(1) + 's)' : '') + ' · ' + s.rows + ' appointments' + (s.skipped ? ' · ' + s.skipped + ' rows skipped (no date)' : '') + (s.note ? ' · ⚠ ' + s.note : ''));
          if (state.milestones && state.milestones.length) bits.push(state.milestones.length + ' payout milestones tracked');
        } else {
          bits.push('last sync attempt ' + when + ' failed: ' + (s.err || 'unknown error'));
        }
      }
    } catch (e) {}
    el.textContent = bits.join(' — ');
  }
  function closeSettings() { $('settings-backdrop').hidden = true; document.body.style.overflow = ''; }

  function init() {
    // One-time cleanup: earlier builds switched demo data on automatically for
    // new visitors, which reads like someone else's live appointments. Clear
    // any lingering flag; demo is opt-in from Settings from here on.
    if (getStore('tm_migr_demo') !== '1') { setStore(LS.demo, ''); setStore('tm_migr_demo', '1'); }

    // the calendar opens on the month (a day tapped there opens that day for
    // now); a link can still name a view, e.g. the Today shortcut's ?view=day
    state.view = 'month';
    if (urlParams.get('view') && ['day', 'week', 'month', 'schedule'].indexOf(urlParams.get('view')) >= 0) state.view = urlParams.get('view');
    if (IS_STANDALONE && !urlParams.get('view')) state.date = new Date();
    var dp = urlParams.get('date');
    if (dp && /^\d{4}-\d{2}-\d{2}$/.test(dp)) { var dpp = dp.split('-'); state.date = new Date(+dpp[0], +dpp[1] - 1, +dpp[2]); }
    state.milestones = loadMilestones();
    calLoad();
    rebuildEvents();
    syncMini();
    applyTheme();                            // (a link's ?theme= is applied by the site, for that visit)
    renderTeamName();

    // view switcher + bottom nav
    ROOT.querySelectorAll('.vs-btn').forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view')); }); });
    buildBottomNav();

    $('nav-prev').addEventListener('click', function () { go(-1); });
    $('nav-next').addEventListener('click', function () { go(1); });
    $('nav-today').addEventListener('click', goToday);
    $('mini-prev').addEventListener('click', function () { state.miniAnchor = addMonths(state.miniAnchor, -1); renderMini(); });
    $('mini-next').addEventListener('click', function () { state.miniAnchor = addMonths(state.miniAnchor, 1); renderMini(); });
    $('btn-refresh').addEventListener('click', function () { refresh(true); });
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-add').addEventListener('click', function () { openEditor(); });
    $('cal-go').addEventListener('click', calConnect);
    $('cal-token').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); calConnect(); } });
    $('cal-sync').addEventListener('click', function () {
      var btn = $('cal-sync'); btn.disabled = true; calStatus('Syncing with Calendly…');
      calSync(true).then(function () {
        btn.disabled = false;
        if (!cal.on) { calStatus(''); renderCalSettings(); return; }
        if (cal.err) { calStatus(cal.err, 'err'); return; }
        var n = cal.events.filter(function (c) { return c.status !== 'canceled'; }).length;
        calStatus('✓ Synced — ' + n + ' Calendly event' + (n === 1 ? '' : 's') + ' in the months around ' + fmtMonthLabel(state.date) + '.', 'ok');
      });
    });
    $('cal-off').addEventListener('click', calDisconnect);
    // back online: catch up now rather than after the pause a failure set
    window.addEventListener('online', function () { if (cal.on) { cal.nextTry = 0; calSync(false); } });
    $('event-close').addEventListener('click', closeEditor);
    $('ev-cancel').addEventListener('click', closeEditor);
    $('ev-save').addEventListener('click', saveEditor);
    $('ev-delete').addEventListener('click', function () { if (editingId) deleteEntry(editingId); });
    $('event-backdrop').addEventListener('click', function (ev) { if (ev.target === this) closeEditor(); });
    $('ev-allday').addEventListener('click', function () { setAllDay(this.getAttribute('aria-checked') !== 'true'); });
    ROOT.querySelectorAll('#ap-event-backdrop [data-kind]').forEach(function (b) {
      b.addEventListener('click', function () { setKind(b.getAttribute('data-kind')); });
    });
    ['ev-title', 'ev-location', 'ev-phone'].forEach(function (k) {
      $(k).addEventListener('keydown', function (ev) { if (ev.key === 'Enter') saveEditor(); });
    });
    // a new start time carries the end along with it (the length stays)
    $('ev-start').addEventListener('focus', function () { this.dataset.was = this.value; });
    $('ev-start').addEventListener('change', function () {
      var s = minsOf(this.value), was = minsOf(this.dataset.was || ''), e = minsOf($('ev-end').value);
      var len = was >= 0 && e > was ? e - was : 60;
      if (s >= 0) { var ne = Math.min(s + len, 23 * 60 + 59); $('ev-end').value = ne > s ? hhmm(ne) : ''; }
      this.dataset.was = this.value;
    });
    $('btn-add').hidden = !canAdd();
    $('settings-close').addEventListener('click', closeSettings);
    $('settings-close-m').addEventListener('click', closeSettings);
    $('settings-backdrop').addEventListener('click', function (ev) { if (ev.target === this) closeSettings(); });
    $('btn-menu').addEventListener('click', openSidebar);
    $('sidebar-scrim').addEventListener('click', closeSidebar);
    $('shortcuts-close').addEventListener('click', function () { $('shortcuts-backdrop').hidden = true; });
    $('shortcuts-backdrop').addEventListener('click', function (ev) { if (ev.target === this) this.hidden = true; });

    $('demo-toggle').addEventListener('click', function () {
      var on = this.getAttribute('aria-checked') === 'true';
      var next = !on;
      this.setAttribute('aria-checked', String(next));
      setStore(LS.demo, next ? '1' : '');
      state.feedEvents = []; rebuildEvents(); state.error = null;   // clear either way
      reqSeq++;                                // invalidate any in-flight fetch
      refresh(false);
    });

    ROOT.querySelectorAll('[data-theme-pick]').forEach(function (p) {
      p.addEventListener('click', function () {
        var v = p.getAttribute('data-theme-pick');
        if (window.WPI) WPI.theme.set(v === 'light' || v === 'dark' ? v : '');
        applyTheme();
      });
    });

    // search
    var search = $('search');
    search.addEventListener('input', function () {
      state.query = search.value; $('search-clear').hidden = !search.value;
      renderAll();
    });
    $('search-clear').addEventListener('click', function () { search.value = ''; state.query = ''; $('search-clear').hidden = true; renderAll(); search.focus(); });

    $('banner').addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]'); if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'settings') openSettings();
      else if (act === 'retry') refresh(true);
      else if (act === 'demo') { setStore(LS.demo, '1'); state.feedEvents = []; rebuildEvents(); refresh(false); }
    });

    // keyboard
    document.addEventListener('keydown', function (ev) {
      if (window.WPI && !WPI.active('appointments')) return;
      if (document.querySelector('dialog[open]')) return;
      // Escape / ? always work, even from inputs
      if (ev.key === 'Escape') {
        if (!$('event-backdrop').hidden) { closeEditor(); return; }
        if (popOpen) { closePopover(); return; }
        if (!$('settings-backdrop').hidden) { closeSettings(); return; }
        if (!$('shortcuts-backdrop').hidden) { $('shortcuts-backdrop').hidden = true; return; }
        if ($('sidebar').classList.contains('open')) { closeSidebar(); return; }
        if (document.activeElement === search && search.value) { search.value = ''; state.query = ''; $('search-clear').hidden = true; renderAll(); return; }
        return;
      }
      var typing = /^(input|textarea|select)$/i.test((ev.target.tagName || ''));
      if (typing) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (!$('settings-backdrop').hidden || !$('shortcuts-backdrop').hidden || !$('event-backdrop').hidden) return;
      switch (ev.key) {
        case 'ArrowLeft': go(-1); break;
        case 'ArrowRight': go(1); break;
        case 't': case 'T': goToday(); break;
        case 'd': case 'D': setView('day'); break;
        case 'w': case 'W': setView('week'); break;
        case 'm': case 'M': setView('month'); break;
        case 'a': case 'A': setView('schedule'); break;
        case 'r': case 'R': refresh(true); break;
        case '/': ev.preventDefault(); search.focus(); break;
        case 'c': case 'C': case 'n': case 'N': if (canAdd()) { ev.preventDefault(); openEditor(); } break;
        case '?': $('shortcuts-backdrop').hidden = false; break;
      }
    });

    // swipe navigation on the view host
    var tx = null, ty = null, host = $('view-host');
    host.addEventListener('touchstart', function (ev) { if (ev.touches.length !== 1) { tx = null; return; } tx = ev.touches[0].clientX; ty = ev.touches[0].clientY; }, { passive: true });
    host.addEventListener('touchend', function (ev) {
      if (tx == null) return;
      var dx = ev.changedTouches[0].clientX - tx, dy = ev.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.7) go(dx < 0 ? 1 : -1);
      tx = null;
    }, { passive: true });

    // re-render when crossing the phone/desktop breakpoint (rotation, resize)
    var wasNarrow = isNarrow();
    window.addEventListener('resize', function () {
      if (isNarrow() !== wasNarrow) { wasNarrow = isNarrow(); renderAll(); }
    });
    // …and fit the date to the bar whenever its room changes (a turn, the
    // notch's insets, a window resize)
    if (window.ResizeObserver) new ResizeObserver(function () { renderLabel(); }).observe($('current-label'));

    // first paint — no auto-demo: an unconfigured browser shows the Connect
    // banner (demo stays available as an explicit choice), never fake data
    // that could be mistaken for another team's live appointments.
    loadFromCache();
    // (made ready in the background, before it's opened: it fetches when first shown)
    if (isOpen()) refresh(false);

    // in the background: every 15 minutes while the calendar is on screen; on coming
    // back to it, only when what's shown is over 5 minutes old (↻ / pull to refresh any time)
    setInterval(function () { if (document.visibilityState === 'visible' && isOpen() && Date.now() - lastRefreshAt > REFRESH_EVERY - 5000) refresh(false); }, REFRESH_EVERY);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && isOpen() && Date.now() - lastRefreshAt > STALE_AFTER) refresh(false);
    });

    window.addEventListener('wpi:events', function () {
      rebuildEvents();
      if (isOpen()) renderAll(true);
      if (popEvent && popEvent.manual) {
        var now = state.events.filter(function (x) { return x.manualId === popEvent.manualId; })[0];
        if (!now) { closePopover(); if (window.WPI) WPI.toast('That entry was deleted on another device'); }
        else if (isOpen()) openPopover(now);
      }
    });

    // the team's feed changed (saved here, by a teammate, or another team was opened)
    feedKey = scriptUrl() + '|' + volumeUrl();
    window.addEventListener('wpi:settings', function () {
      renderTeamName();
      $('btn-add').hidden = !canAdd();
      var k = scriptUrl() + '|' + volumeUrl();
      if (k === feedKey) return;
      var urlChanged = k.split('|')[0] !== feedKey.split('|')[0];
      feedKey = k;
      if (urlChanged) { setStore(LS.transport, ''); state.feedEvents = []; rebuildEvents(); state.error = null; state.updatedAt = null; reqSeq++; loadFromCache(); }
      refresh(false);
    });
  }

  var feedKey = '';
  function isOpen() { return !window.WPI || WPI.active('appointments'); }
  function renderTeamName() {
    var t = window.WPI && WPI.team();
    var n = $('team-name');
    if (n) n.textContent = (t && t.name) || 'Team Ice Kannon';
  }
  function buildBottomNav() {
    var nav = el('div', 'bottom-nav');
    var items = [
      { v: 'day', label: 'Day', icon: '<rect x="4" y="5" width="16" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 9h16M8 3v3M16 3v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
      { v: 'week', label: 'Week', icon: '<rect x="3" y="6" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 6v13M15 6v13" stroke="currentColor" stroke-width="1.5"/>' },
      { v: 'month', label: 'Month', icon: '<rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.5h17M9 5v15M15 5v15M3.5 14.5h17" stroke="currentColor" stroke-width="1.3"/>' },
      { v: 'schedule', label: 'Schedule', icon: '<path d="M4 6h4M4 12h4M4 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M11 6h9M11 12h9M11 18h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    ];
    items.forEach(function (it) {
      var b = el('button', 'bn-btn'); b.setAttribute('data-view', it.v);
      b.innerHTML = '<svg viewBox="0 0 24 24" class="ic">' + it.icon + '</svg><span>' + it.label + '</span>';
      b.addEventListener('click', function () { setView(it.v); });
      nav.appendChild(b);
    });
    nav.setAttribute('role', 'radiogroup'); nav.setAttribute('aria-label', 'View');
    var bar = ROOT.querySelector('.appbar');
    bar.parentNode.insertBefore(nav, bar.nextSibling);
  }

  // Minimal test surface for automated checks (harmless in production).
  window.TM = { normalize: normalize, normalizeOne: normalizeOne, parseDateTime: parseDateTime, parseDateOnly: parseDateOnly, fetchViaProxy: fetchViaProxy, processMerchants: processMerchants, extractMerchants: extractMerchants, applyData: applyData, get state() { return state; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.WPI) WPI.register('appointments', {
    // an entry being added or edited (the site holds a new version back for it)
    busy: function () { return !$('event-backdrop').hidden; },
    // opened: redraw for the current size and catch up if it's been a while
    show: function () {
      ROOT.classList.add('ap-noanim');
      renderTeamName(); applyTheme();
      $('btn-add').hidden = !canAdd();
      renderAll();
      if (Date.now() - lastRefreshAt > STALE_AFTER) refresh(false);
      requestAnimationFrame(function () { requestAnimationFrame(function () { ROOT.classList.remove('ap-noanim'); }); });
    },
    // left: nothing of it stays over the other sections
    hide: function () {
      if (popOpen) closePopover();
      closeSidebar();
      if (!$('settings-backdrop').hidden) closeSettings();
      $('shortcuts-backdrop').hidden = true;
      closeEditor();
    },
    // its tab tapped again: back to today
    top: function () { goToday(); },
    // its shortcuts (its tab pressed and held): the views, today, a new entry
    quick: function () {
      return [
        { chips: [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['schedule', 'Schedule']].map(function (v) {
          return { label: v[1], on: state.view === v[0], run: function () { setView(v[0]); } };
        }) },
        { label: 'Today', run: goToday },
        { label: 'New appointment, meeting or event', run: function () {
          if (canAdd()) openEditor(null); else WPI.toast('Open your team first');
        } },
        { label: cal.on ? 'My Calendly' : 'Connect your Calendly', run: function () { WPI.openSettings('appointments'); } },
      ];
    },
    // swipe down to refresh while something is open: a fresh copy of the feed
    refresh: function () { return refresh(true); },
    // its part of the site's Settings: the fields and buttons of its own
    // Settings window, moved there while Settings is open (so they work
    // exactly as they do here) and back when it closes
    settings: function (host) {
      var modal = $('settings-backdrop').querySelector('.modal');
      var parts = [].slice.call(modal.children).filter(function (n) { return !n.classList.contains('modal-head'); });
      fillSettings();
      host.classList.add('wm', 'ap-root', 'ap-set');
      parts.forEach(function (n) { host.appendChild(n); });
      return function () {
        $('cal-token').value = '';
        parts.forEach(function (n) { modal.appendChild(n); });
        host.classList.remove('wm', 'ap-root', 'ap-set');
      };
    }
  });
})();
