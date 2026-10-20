/* AppUpload — runs as the AppUpload section of Ice Kannon Route: its markup lives in
   #sec-appupload (ids carry an au- prefix), files go to the site's own
   functions with the signed-in account, and downloads are handed over
   through the site (the share sheet on iPhone/iPad). */
(function () {
"use strict";

const MAX_FILES = 15;
const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 0.85;

const ROOT = document.getElementById("sec-appupload");
const el = (id) => document.getElementById("au-" + id);
const statusBanner = el("statusBanner");

function showBanner(kind, msg) {
  statusBanner.className = `banner ${kind}`;
  statusBanner.textContent = msg;
  statusBanner.classList.remove("hidden");
  statusBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
const hideBanner = () => statusBanner.classList.add("hidden");

/* ---------------- the site's functions ---------------- */
const FN = "/.netlify/functions/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function authed(url, opts = {}) {
  let token = window.WPI ? await WPI.token() : "";
  // (a token refresh on a weak signal can be slow, or fail, while the
  // session itself is fine: ask once more before saying anything)
  if (!token && window.WPI && WPI.user() && navigator.onLine !== false) {
    await sleep(1500);
    token = await WPI.token();
  }
  if (!token) {
    throw new Error(navigator.onLine === false
      ? "You’re offline — check your connection and try again."
      : window.WPI && WPI.user()
        ? "Couldn’t reach the server — check your signal and try again."
        : "Your sign-in has expired — sign out and back in, then try again.");
  }
  try {
    return await fetch(url, { ...opts, cache: "no-store", headers: { ...(opts.headers || {}), authorization: "Bearer " + token } });
  } catch (e) {
    // (not the browser's own words — "Failed to fetch", "Load failed")
    throw new Error(navigator.onLine === false
      ? "You’re offline — check your connection and try again."
      : "Couldn’t reach the server — check your signal and try again.");
  }
}
async function failure(res, fallback) {
  const d = await res.json().catch(() => ({}));
  return new Error(d.error || fallback);
}
/* Files go up one at a time (a large PDF in pieces — a request can't be
   larger than a few MB), a background function reads them (a big handwritten
   packet can take a while), and the result is collected here. */
const PART = 4 * 1024 * 1024;
// (twice more at most, and only for what passes: a dropped connection, too
// busy, a gateway timeout. A piece overwrites itself and a job is read only
// once, so sending one again is harmless.)
async function sendAgain(send) {
  for (let t = 0; ; t++) {
    let res = null, err = null;
    try { res = await send(); } catch (e) { err = e; }
    const again = err ? navigator.onLine !== false : [429, 502, 503, 504].includes(res.status);
    if (!again || t >= 2) { if (err) throw err; return res; }
    await sleep(1000 * (t + 1));
  }
}
async function runJob(kind, pages) {
  const g = sessionGen;
  let res = await authed(FN + "au-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, count: pages.length }),
  });
  if (!res.ok) throw await failure(res, `Upload failed (${res.status}).`);
  const { id } = await res.json();
  try {
    for (let i = 0; i < pages.length; i++) {
      const blob = pages[i].blob;
      const type = blob.type || (pages[i].isPdf ? "application/pdf" : "image/jpeg");
      const parts = Math.max(1, Math.ceil(blob.size / PART));
      for (let k = 0; k < parts; k++) {
        res = await sendAgain(() => authed(FN + "au-job?id=" + encodeURIComponent(id) + "&n=" + i + "&part=" + k + "&parts=" + parts, {
          method: "PUT",
          headers: { "Content-Type": type },
          body: blob.slice(k * PART, (k + 1) * PART, type),
        }));
        if (!res.ok) throw await failure(res, `Upload failed (${res.status}).`);
      }
    }
    res = await sendAgain(() => authed(FN + "au-extract-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }));
    if (!res.ok) throw await failure(res, `Couldn’t start reading (${res.status}).`);
    const t0 = Date.now();
    let misses = 0;
    for (;;) {
      await sleep(Date.now() - t0 < 20000 ? 1500 : 3000);
      if (g !== sessionGen) throw new Error("The session ended."); // (nobody's waiting for it)
      let d = {};
      try {
        res = await authed(FN + "au-job?id=" + encodeURIComponent(id));
        d = await res.json().catch(() => ({}));
      } catch (e) {
        res = null;
      }
      // a weak signal, or a passing server hiccup (5xx, too busy), drops a
      // poll now and then; the job keeps running
      if (!res || res.status >= 500 || res.status === 429) {
        if (++misses >= 12) throw new Error(res ? d.error || `Reading failed (${res.status}).` : "Lost the connection while reading — check your signal and try again.");
        continue;
      }
      misses = 0;
      if (!res.ok) throw new Error(d.error || `Reading failed (${res.status}).`);
      if (d.status === "done") {
        // have it: the server copy goes now
        authed(FN + "au-job?id=" + encodeURIComponent(id), { method: "DELETE" }).catch(() => {});
        return d;
      }
      if (d.status === "error") throw new Error(d.error || "Extraction failed.");
      if (d.status === "uploading" && Date.now() - t0 > 45000) throw new Error("Reading didn’t start — please try again.");
      if (Date.now() - t0 > 14 * 60 * 1000) throw new Error("Reading is taking too long — please try again.");
    }
  } catch (e) {
    authed(FN + "au-job?id=" + encodeURIComponent(id), { method: "DELETE" }).catch(() => {});
    throw e;
  }
}
/* The filled documents. The site's function answers one document per
   request (each well inside a function's time and size limits); several are
   fetched side by side and put together here, in the same fixed order, with
   the same PDF library (pdf-lib 1.17.1) AppUpload's server merges them with. */
let pdfLibLoading = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!pdfLibLoading) {
    pdfLibLoading = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = "apps/appupload/vendor/pdf-lib.min.js";
      sc.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error("Couldn’t load the PDF tools.")));
      sc.onerror = () => { pdfLibLoading = null; sc.remove(); reject(new Error("Couldn’t load the PDF tools — check your connection and try again.")); };
      document.head.appendChild(sc);
    });
  }
  return pdfLibLoading;
}
// The merchant applications: the "Application form" choice (Greenlight's CBD
// application is one too — then it is also the Greenlight packet — and so are
// the Pathward application and the Pathward Program Guide, which can also be
// ticked on their own).
const APP_FORMS = ["citizens", "merrick", "fd_north", "pbt", "greenlight", "pathward", "pathward_guide"];
// the applications that are also a document of their own (choosing one brings up its fields)
const OWN_FORMS = ["greenlight", "pathward", "pathward_guide"];
// Picked as the application and ticked on its own, the Greenlight packet (or the
// Pathward application, or the Pathward Program Guide) is printed once.
const packetKinds = (kinds, form) => (OWN_FORMS.includes(form) && kinds.includes("application") ? kinds.filter((k) => k !== form) : kinds);
const PACKET_ORDER = ["coversheet", "application", "po", "clover", "bankchange", "crf", "hempcbd", "cbdamendment", "giftcard", "cashadvance", "factor4", "greenlight", "pathward", "pathward_guide"];
async function fetchPacket(body) {
  const one = (b) => sendAgain(() => authed(FN + "au-packet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }));
  const chosen = Array.isArray(body.kinds) ? packetKinds(PACKET_ORDER.filter((k) => body.kinds.includes(k)), body.form || body.record?.appType) : [];
  if (chosen.length === 1 && body.kinds.length > 1) return one({ ...body, kinds: chosen });
  if (chosen.length < 2) return one(body);
  const [lib, ...parts] = await Promise.all([loadPdfLib(), ...chosen.map((k) => one({ ...body, kinds: [k] }))]);
  const bad = parts.find((r) => !r.ok);
  if (bad) return bad; // the same answer the server gives for that document
  const out = await lib.PDFDocument.create();
  for (const r of parts) {
    const src = await lib.PDFDocument.load(await r.arrayBuffer(), { ignoreEncryption: true });
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return new Response(new Blob([await out.save()], { type: "application/pdf" }), { headers: { "content-type": "application/pdf" } });
}

/* ---------------- shared image handling ---------------- */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve({ dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), blob }) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

/** Wire a dropzone + file input + thumbnail list into a small uploader. */
function makeUploader({ dropzone, input, browseBtn, thumbs, onChange }) {
  const pages = [];
  let nextId = 1;

  async function add(fileList) {
    const isPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    const files = Array.from(fileList).filter((f) => /^image\//.test(f.type) || isPdf(f));
    for (const file of files) {
      if (pages.length >= MAX_FILES) {
        showBanner("warn", `Up to ${MAX_FILES} files.`);
        break;
      }
      if (isPdf(file)) {
        // PDFs are sent as-is; the server renders each page to an image.
        pages.push({ id: nextId++, isPdf: true, name: file.name, blob: file });
        continue;
      }
      try {
        const { dataUrl, blob } = await resizeImage(file);
        pages.push({ id: nextId++, dataUrl, blob });
      } catch {
        showBanner("error", `Could not read "${file.name}".`);
      }
    }
    render();
  }
  function remove(id) {
    const i = pages.findIndex((p) => p.id === id);
    if (i >= 0) pages.splice(i, 1);
    render();
  }
  function clear() {
    pages.length = 0;
    render();
  }
  function render() {
    thumbs.innerHTML = "";
    pages.forEach((p, idx) => {
      const li = document.createElement("li");
      li.className = "thumb" + (p.isPdf ? " thumb-pdf" : "");
      if (p.isPdf) {
        li.innerHTML = `<span class="page-badge">${idx + 1}</span><button class="remove-thumb" aria-label="Remove">×</button><div class="pdf-tile"><span class="pdf-ico">PDF</span><span class="pdf-name"></span></div>`;
        li.querySelector(".pdf-name").textContent = p.name || "Document.pdf";
      } else {
        li.innerHTML = `<span class="page-badge">${idx + 1}</span><button class="remove-thumb" aria-label="Remove">×</button><img alt="upload ${idx + 1}" />`;
        li.querySelector("img").src = p.dataUrl;
      }
      li.querySelector(".remove-thumb").addEventListener("click", () => remove(p.id));
      thumbs.appendChild(li);
    });
    onChange(pages.length);
  }

  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    input.click();
  });
  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", (e) => {
    add(e.target.files);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === "dragleave" && dropzone.contains(e.relatedTarget)) return;
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => e.dataTransfer?.files?.length && add(e.dataTransfer.files));

  return { pages, clear };
}

/* ---------------- rotating video backdrop ---------------- */
// (In Ice Kannon Route the backdrop runs only while it can be seen: the AppUpload
// section is open, the sign-in screen isn't over it and Reduce Motion is off —
// with Reduce Motion the videos are hidden anyway, so nothing is downloaded.
// Otherwise both players are unloaded and any clip download is cancelled;
// when it can be seen again it picks up the same clip where it was.)
let bgOpen = false; // the backdrop is running
let bgSection = !window.WPI || WPI.active("appupload");
let bgStarted = false;
let bgRun = 0; // the current start of initBackdropPlaylist (a restart retires the one before)
// suspend/resume: the running backdrop's own; stale: its clips couldn't all be
// reached, so the next time it shows (or the connection comes back) it looks again
const bgHooks = { suspend: null, resume: null, stale: false };
const bgReduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
function bgSync() {
  const want = bgSection && !document.documentElement.classList.contains("auth-on") && !(bgReduce && bgReduce.matches);
  if (want === bgOpen) return;
  bgOpen = want;
  if (!want) { if (bgHooks.suspend) bgHooks.suspend(); return; }
  if (!bgStarted || bgHooks.stale) { bgStarted = true; initBackdropPlaylist(); }
  else if (bgHooks.resume) bgHooks.resume();
}
if (bgReduce) {
  if (bgReduce.addEventListener) bgReduce.addEventListener("change", bgSync);
  else if (bgReduce.addListener) bgReduce.addListener(bgSync);
}
window.addEventListener("wpi:auth", bgSync);
window.addEventListener("online", () => {
  if (!bgOpen || !bgHooks.stale) return;
  if (bgHooks.suspend) bgHooks.suspend();
  initBackdropPlaylist();
});
// Cycle the numbered backdrop videos (100.mp4 … 106.mp4, in /videos/ or the web
// root) in order, looping the sequence forever. Two stacked <video> elements
// double-buffer playback: while one plays, the other preloads the next clip,
// and each hand-off crossfades on the 'playing' event so there is no black
// flash. Missing numbers are skipped; if none exist (or every clip fails),
// the classic backdrop.mp4 single-video loop takes over.
async function initBackdropPlaylist() {
  const a = el("bgVideoA");
  const b = el("bgVideoB");
  if (!a || !b) return;
  const run = ++bgRun;
  const live = () => run === bgRun && bgOpen; // this start is the current one, and the backdrop is showing
  bgHooks.suspend = bgHooks.resume = null;
  bgHooks.stale = false;
  // (a restart begins where the markup does)
  a.classList.remove("bg-video-hidden");
  b.classList.add("bg-video-hidden");
  a.loop = b.loop = false;

  let current = a;
  let next = b;
  // Muted autoplay is sometimes held until a user gesture — retry on the first
  // pointer interaction so the backdrop always starts.
  const kick = () => {
    if (run !== bgRun) { document.removeEventListener("pointerdown", kick); return; }
    if (!bgOpen) return;
    document.removeEventListener("pointerdown", kick);
    current.play().catch(() => {});
  };
  document.addEventListener("pointerdown", kick);

  // An earlier revision stored full copies of every clip in Cache Storage —
  // reclaim that space on browsers that still carry it.
  try { if (typeof caches !== "undefined") caches.delete("bg-videos-v1").catch(() => {}); } catch {}

  let unreachable = false; // a lookup failed for want of a connection, not because the clip isn't there
  const found = await Promise.all(
    [100, 101, 102, 103, 104, 105, 106].map(async (n) => {
      for (const path of [`videos/${n}.mp4`, `${n}.mp4`]) {
        try {
          const r = await fetch(path, { method: "HEAD" });
          if (r.ok) return path;
        } catch { unreachable = true; }
      }
      return null;
    })
  );
  if (run !== bgRun) return; // restarted meanwhile
  const playlist = found.filter(Boolean);
  if (unreachable) bgHooks.stale = true;

  // seek a reloaded player back to where it was once it knows its length
  // (dropped if that load fails or the player is given something else)
  let seekOff = null;
  const seekOnLoad = (v, t) => {
    if (seekOff) seekOff();
    if (!(t > 0)) return;
    const src = v.getAttribute("src");
    const off = () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", off);
      if (seekOff === off) seekOff = null;
    };
    const onMeta = () => { off(); if (v.getAttribute("src") === src) { try { v.currentTime = t; } catch {} } };
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", off);
    seekOff = off;
  };
  const unload = () => {
    if (seekOff) seekOff();
    for (const v of [a, b]) { v.pause(); v.removeAttribute("src"); v.load(); }
  };

  const fallbackLoop = () => {
    next.classList.add("bg-video-hidden");
    current.classList.remove("bg-video-hidden");
    if (!/backdrop\.mp4$/.test(current.getAttribute("src") || "")) { current.src = "backdrop.mp4"; current.load(); }
    current.loop = true;
    if (live()) current.play().catch(() => {});
  };
  // a single looping clip (the fallback, or a one-clip playlist): unloaded on
  // leaving, reloaded at the same moment on coming back
  const loopHooks = (src) => {
    let at = 0;
    bgHooks.suspend = () => { at = current.currentTime || 0; unload(); };
    bgHooks.resume = () => {
      next.classList.add("bg-video-hidden");
      current.classList.remove("bg-video-hidden");
      current.src = src;
      current.loop = true;
      current.load();
      seekOnLoad(current, at);
      current.play().catch(() => {});
    };
  };
  if (!playlist.length) { loopHooks("backdrop.mp4"); fallbackLoop(); if (!bgOpen) bgHooks.suspend(); return; } // no numbered videos uploaded (yet)
  if (playlist.length === 1) {
    loopHooks(playlist[0]);
    current.src = playlist[0];
    current.loop = true;
    current.load();
    if (bgOpen) current.play().catch(() => {});
    else bgHooks.suspend();
    return;
  }

  /* The rotation is deliberately simple: both players stream their clips
     directly (the files are fast-start remuxed, so playback begins while the
     rest downloads) and the hidden player preloads the next clip the moment a
     hand-off completes, giving it the whole clip duration to buffer. Every
     hand-off crossfades on the 'playing' event; every failure mode — a clip
     that errors, never starts, decodes no video, or freezes mid-play — is
     skipped by the same bounded advance() path, and a watchdog guarantees the
     rotation can never silently die. */
  let pos = 0; // playlist index of the clip in `current`
  let gen = 0; // invalidates listeners of superseded hand-offs
  let handoff = null; // { idx, attempts, at, target, lastBuf, progressAt } while a hand-off is in flight
  let watchdog = null;
  const bufEnd = (v) => {
    try { return v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0; } catch { return 0; }
  };
  /* Zero-loading hand-offs: a background downloader fetches upcoming clips in
     full and parks them in `clipBlob` (idx -> object URL). It NEVER touches the
     players — the only code that assigns a src is setClip(), which runs
     synchronously inside the rotation machinery, so there is nothing to race.
     A hand-off whose download didn't finish in time simply streams that clip
     directly (the files are fast-start), and the download keeps going for the
     next lap. Only clips within the next two positions are kept; anything
     older is revoked — but never a URL that is still attached to a player. */
  const clipBlob = new Map(); // idx -> fully-downloaded object URL
  let loading = -1; // idx currently downloading (one at a time)
  let loadingCtl = null; // cancels it when the section is left
  let fellBack = false; // every clip failed: the classic single loop took over
  let nextWants = -1; // idx the hidden player should hold once its download lands
  const dist = (i, from) => (i - from + playlist.length) % playlist.length;
  const setClip = (v, i) => {
    v.dataset.pos = String(i);
    const url = clipBlob.get(i) || playlist[i];
    v.__attachedUrl = clipBlob.has(i) ? url : null;
    v.src = url;
    v.load();
  };
  const pruneBlobs = () => {
    for (const [i, u] of [...clipBlob]) {
      if (dist(i, pos) > 2 && u !== a.__attachedUrl && u !== b.__attachedUrl) {
        URL.revokeObjectURL(u);
        clipBlob.delete(i);
      }
    }
  };
  const tryArmNext = () => {
    // Load the ready blob into the hidden player — never mid-hand-off.
    if (!handoff && nextWants >= 0 && clipBlob.has(nextWants) && Number(next.dataset.pos) !== nextWants) setClip(next, nextWants);
  };
  // Strictly one download at a time, always the closest upcoming clip — a
  // background fetch never competes for bandwidth with the one needed next.
  const prefetch = (i) => {
    if (clipBlob.has(i) || loading !== -1 || fellBack || !live()) return;
    loading = i;
    const ctl = (loadingCtl = typeof AbortController !== "undefined" ? new AbortController() : null);
    fetch(playlist[i], ctl ? { signal: ctl.signal } : undefined)
      .then((r) => { if (!r.ok) throw new Error("fetch failed"); return r.blob(); })
      .then((bl) => {
        if (!live() || fellBack) return; // left (or gave up) meanwhile: nothing kept
        clipBlob.set(i, URL.createObjectURL(bl));
        tryArmNext();
        pruneBlobs();
      })
      .catch(() => {}) // hand-offs fall back to direct streaming
      .finally(() => {
        if (loadingCtl === ctl) loadingCtl = null;
        if (loading === i) loading = -1;
        prefetchWindow();
      });
  };
  const prefetchWindow = () => {
    if (loading !== -1) return;
    for (let d = 1; d <= 2; d++) {
      const w = (pos + d) % playlist.length;
      if (!clipBlob.has(w)) { prefetch(w); return; }
    }
  };
  const stopRotation = () => {
    fellBack = true;
    // (in a dead zone every clip fails the same way: look again next time)
    bgHooks.stale = true;
    loopHooks("backdrop.mp4");
    if (loadingCtl) loadingCtl.abort();
    gen++;
    handoff = null;
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
    for (const u of clipBlob.values()) { try { URL.revokeObjectURL(u); } catch {} }
    clipBlob.clear();
    a.__attachedUrl = b.__attachedUrl = null;
    fallbackLoop();
  };

  // Hand playback to the clip at `idx` (already preloading in `next` in the
  // normal case). A clip that cannot play is skipped; `attempts` bounds the
  // cascade so a playlist where every clip is broken lands on the classic
  // backdrop loop instead of stalling.
  const advance = (idx, attempts = 0) => {
    const g = ++gen;
    if (attempts >= playlist.length) return stopRotation();
    const target = next;
    handoff = { idx, attempts, at: Date.now(), target, lastBuf: -1, progressAt: Date.now() };
    if (Number(target.dataset.pos) !== idx) setClip(target, idx);
    const fail = () => { if (g === gen) advance((idx + 1) % playlist.length, attempts + 1); };
    if (target.error) return fail(); // its earlier preload already failed
    const onPlaying = () => {
      target.removeEventListener("error", onErr);
      if (g !== gen) return;
      // A clip whose VIDEO codec the browser can't decode may still "play" its
      // audio track — videoWidth stays 0. Treat that as unplayable and skip it
      // rather than showing a black backdrop for the clip's whole duration.
      if (!target.videoWidth) return fail();
      target.classList.remove("bg-video-hidden");
      current.classList.add("bg-video-hidden");
      next = current;
      current = target;
      pos = idx;
      handoff = null;
      nextWants = (idx + 1) % playlist.length;
      if (clipBlob.has(nextWants)) setClip(next, nextWants); // fully local — zero network at the next hand-off
      pruneBlobs();
      prefetchWindow(); // else: the downloader arms the player the moment it lands
    };
    const onErr = () => {
      target.removeEventListener("playing", onPlaying);
      fail();
    };
    target.addEventListener("playing", onPlaying, { once: true });
    target.addEventListener("error", onErr, { once: true });
    target.play().catch(() => {});
  };

  for (const v of [a, b]) {
    v.addEventListener("ended", (e) => { if (live() && !fellBack && e.target === current && !handoff) advance((pos + 1) % playlist.length); });
    // A clip failing mid-playback (decode/network) skips ahead the same way.
    v.addEventListener("error", (e) => { if (live() && !fellBack && e.target === current && !handoff) advance((pos + 1) % playlist.length, 1); });
  }

  // Watchdog: the rotation must never silently die — but buffering on a slow
  // connection is NOT a failure. A clip pausing to buffer (time frozen, bytes
  // still arriving) is left alone to resume on its own; a clip is only skipped
  // when BOTH playback time and its download have gone completely quiet — a
  // genuinely dead stream. Same for hand-offs: as long as the incoming clip's
  // buffer keeps growing we wait; we skip only when its download has stalled
  // out too. Players paused outside a hand-off (OS/tab interruption) are
  // resumed. Hidden tabs are throttled by design and don't count as stalls.
  let lastT = -1;
  let lastBuf = -1;
  let lastProgressAt = Date.now();
  watchdog = setInterval(() => {
    if (run !== bgRun) { clearInterval(watchdog); watchdog = null; return; } // restarted: this one retires
    if (document.hidden || !bgOpen) { lastT = -1; lastBuf = -1; lastProgressAt = Date.now(); return; }
    if (handoff) {
      const be = bufEnd(handoff.target);
      if (be > handoff.lastBuf) { handoff.lastBuf = be; handoff.progressAt = Date.now(); }
      if (Date.now() - handoff.at > 10000 && Date.now() - handoff.progressAt > 12000) {
        advance((handoff.idx + 1) % playlist.length, handoff.attempts + 1); // dead hand-off — skip that clip
      }
      return;
    }
    const t = current.currentTime;
    const be = bufEnd(current);
    if (!current.paused && t === lastT && be === lastBuf) {
      if (Date.now() - lastProgressAt > 30000) { lastT = -1; lastBuf = -1; lastProgressAt = Date.now(); advance((pos + 1) % playlist.length, 1); }
    } else {
      lastT = t;
      lastBuf = be;
      lastProgressAt = Date.now();
      if (current.paused && !current.ended) current.play().catch(() => {}); // resume an interrupted player
    }
  }, 3000);

  // leaving: remember the clip and the moment, let go of everything
  let resumeAt = null;
  bgHooks.suspend = () => {
    if (!resumeAt) resumeAt = { pos, t: current.currentTime || 0 };
    gen++;
    handoff = null;
    if (loadingCtl) loadingCtl.abort();
    unload();
    for (const v of [a, b]) { v.__attachedUrl = null; delete v.dataset.pos; }
    for (const u of clipBlob.values()) { try { URL.revokeObjectURL(u); } catch {} }
    clipBlob.clear();
  };
  // coming back: the same clip, from the same moment
  bgHooks.resume = () => {
    if (!resumeAt) { current.play().catch(() => {}); prefetchWindow(); return; }
    const { pos: p, t } = resumeAt;
    resumeAt = null;
    pos = p;
    next.classList.add("bg-video-hidden");
    current.classList.remove("bg-video-hidden");
    setClip(current, p);
    seekOnLoad(current, t);
    current.play().catch(() => {});
    nextWants = (p + 1) % playlist.length;
    prefetchWindow();
  };

  // Start: clip 0 streams immediately; the hidden player preloads clip 1.
  setClip(current, 0);
  const first = current;
  first.addEventListener(
    "playing",
    () => { if (run === bgRun && first === current && !first.videoWidth) advance(1, 1); }, // audio-only start — skip clip 0 too
    { once: true }
  );
  current.play().catch(() => {});
  nextWants = 1;
  prefetchWindow();
  if (!bgOpen) bgHooks.suspend(); // (it stopped showing while the playlist was being looked up)
}

/* ---------------- record path helpers ---------------- */
const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/* ---------------- review form schema ---------------- */
// How each piece of equipment is being provided (coversheet equipment row).
const ACQUISITION_OPTS = [["", "—"], ["free", "Free"], ["existing", "Existing"], ["po", "PO"], ["rental", "Rental"], ["lease", "Lease"]];
const YN = [["", "—"], ["yes", "Yes"], ["no", "No"]];
const REVIEW_SECTIONS = [
  {
    title: "Business",
    open: true,
    fields: [
      ["business.dba", "DBA / Trade name"],
      ["business.legalName", "Legal / corporate name"],
      ["business.locationAddress", "Location address"],
      ["business.locationCity", "City"],
      ["business.locationState", "State"],
      ["business.locationZip", "ZIP"],
      ["__sameAsDba", "Corporate address same as DBA / location address", "sameAsDba"],
      ["business.corpAddress", "Corporate address"],
      ["business.corpCity", "Corp city"],
      ["business.corpState", "Corp state"],
      ["business.corpZip", "Corp ZIP"],
      ["business.phone", "Phone"],
      ["business.fax", "Fax"],
      ["business.contactName", "Contact name"],
      ["business.contactPhone", "Contact phone"],
      ["business.customerServicePhone", "Customer service phone"],
      ["business.email", "Business email"],
      ["business.website", "Website"],
      ["business.federalTaxId", "Federal Tax ID"],
      ["business.taxType", "Tax type"],
      ["business.taxFilingName", "Tax filing name"],
      ["business.dnb", "D&B #"],
      ["business.businessType", "Business type"],
      ["business.productsSold", "Products / services sold"],
      ["business.organizationType", "Organization type"],
      ["business.stateIssued", "State issued"],
      ["business.businessStarted", "Business started"],
      ["business.lengthOwnershipYears", "Ownership (years)"],
      ["business.lengthOwnershipMonths", "Ownership (months)"],
    ],
  },
  { title: "Banking (from voided check)", owner: null, fields: [
    ["banking.bankName", "Bank name"],
    ["banking.routing", "Routing #"],
    ["banking.account", "Account #"],
    ["banking.bankPhone", "Bank phone"],
    ["banking.accountType", "Account type", "select", ["", "checking", "savings"]],
  ]},
  { title: "Transaction", fields: [
    ["transaction.monthlyVolume", "Monthly volume ($)"],
    ["transaction.avgTicket", "Average ticket ($)"],
    ["transaction.highTicket", "High ticket ($)"],
    ["transaction.amexVolume", "Amex volume ($)"],
    ["transaction.swipePct", "Swipe %"],
    ["transaction.motoPct", "MO/TO %"],
    ["transaction.internetPct", "Internet %"],
    ["transaction.salesToConsumerPct", "Sales to consumer %"],
    ["transaction.salesToBusinessPct", "Sales to business %"],
    ["transaction.salesToGovPct", "Sales to government %"],
    ["transaction.previousProcessor", "Previous processor"],
    ["transaction.reasonForLeaving", "Reason for leaving"],
    // the high-volume / active months (Citizens, FD North, Merrick and Pathward print them; any one makes the merchant seasonal)
    ...["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
      .map((m) => [`pathward.m${m.slice(0, 3)}`, `Seasonal — ${m} (high volume / active)`, "checkbox"]),
  ]},
  { title: "Fees — authorization / monthly / misc", fields: [
    ["fees.authVmcda", "Auth Visa/MC/Disc/Amex ($)"],
    ["fees.fleet", "Fleet card ($)"],
    ["fees.pinDebit", "Pin debit ($)"],
    ["fees.pinDebitPct", "Pin debit (%)"],
    ["fees.ebt", "EBT ($)"],
    ["fees.salesTxn", "Sales transaction ($)"],
    ["fees.monthlyService", "Monthly service ($)"],
    ["fees.monthlyMinimum", "Monthly minimum ($)"],
    ["fees.wireless", "Wireless ($)"],
    ["fees.pinDebitMonthly", "Pin debit monthly ($)"],
    ["fees.industryCompliance", "Industry compliance ($)"],
    ["fees.chargeback", "Chargeback ($)"],
    ["fees.retrieval", "Retrieval ($)"],
    ["fees.achReject", "ACH reject ($)"],
    ["fees.annual", "Annual fee ($)"],
    ["fees.equipmentRental", "Equipment monthly rental ($)"],
    ["fees.monthToBill", "Month to bill"],
    ["fees.earlyTermination", "Early termination / ETF ($)"],
    ["fees.batch", "Batch fee ($) — Merrick / Pathward"],
    ["fees.returnTxn", "Return transaction fee ($) — Merrick / Pathward"],
    ["fees.electronicAvs", "Electronic AVS ($) — Merrick / Pathward"],
    ["fees.voiceAuth", "Voice authorization ($) — Merrick / Pathward"],
    ["fees.voiceAvs", "Voice AVS ($) — Merrick / Pathward"],
    ["fees.basilPos", "Basil POS ($) — Merrick / Pathward"],
    ["fees.saasFee", "SAAS fee ($) — Merrick / Pathward"],
    ["fees.inactivityFee", "Inactivity fee ($) — Merrick / Pathward"],
    ["fees.gatewayMonthly", "Gateway monthly ($) — Merrick / Pathward"],
    ["fees.gatewayTxn", "Gateway transaction ($) — Merrick / Pathward"],
    ["fees.monthlyMisc", "Monthly misc ($) — Merrick / Pathward"],
  ]},
  { title: "Service acceptance & fee schedule", fields: [
    ["serviceAcceptance.cardVisaCredit", "Visa credit", "checkbox"],
    ["serviceAcceptance.cardVisaDebit", "Visa debit", "checkbox"],
    ["serviceAcceptance.cardMcCredit", "Mastercard credit", "checkbox"],
    ["serviceAcceptance.cardMcDebit", "Mastercard debit", "checkbox"],
    ["serviceAcceptance.cardDiscover", "Discover", "checkbox"],
    ["serviceAcceptance.cardAmex", "Amex", "checkbox"],
    ["serviceAcceptance.cardPin", "Pin debit", "checkbox"],
    ["serviceAcceptance.cardEbt", "EBT (Merrick / Pathward)", "checkbox"],
    ["serviceAcceptance.discountPlan", "Discount plan", "select", [["", "—"], ["flat", "Flat Rate"], ["passthrough", "Passthrough IC"]]],
    ["serviceAcceptance.flatCreditPct", "Flat credit %"],
    ["serviceAcceptance.flatDebitPct", "Flat debit %"],
    ["serviceAcceptance.flatAmexPct", "Flat amex % (Merrick / Pathward)"],
    ["serviceAcceptance.passCreditPct", "Passthrough credit %"],
    ["serviceAcceptance.passDebitPct", "Passthrough debit %"],
    ["serviceAcceptance.passAmexPct", "Passthrough amex %"],
    ["serviceAcceptance.assessments", "Assessments", "select", [["", "—"], ["included", "Included"], ["billed", "Billed Separately"]]],
    ["serviceAcceptance.paymentMethod", "Discount payment method", "select", [["", "—"], ["daily", "Daily"], ["monthly", "Monthly"]]],
  ]},
  { title: "Signatures (printed name / title / date)", fields: [
    ["signatures.printedName", "Signer 1 printed name"],
    ["signatures.title", "Signer 1 title"],
    ["signatures.date", "Signer 1 date"],
    ["signatures.printedName2", "Signer 2 printed name"],
    ["signatures.title2", "Signer 2 title"],
    ["signatures.date2", "Signer 2 date"],
  ]},
  { title: "Equipment", fields: [
    ["equipment.0.model", "Item 1 — choose equipment", "modelSelect"],
    ["equipment.0.quantity", "Qty"],
    ["equipment.0.acquisition", "Type", "select", ACQUISITION_OPTS],
    ["equipment.0.onCoversheet", "Add to Cover Sheet", "checkbox"],
    ["equipment.1.model", "Item 2 — choose equipment", "modelSelect"],
    ["equipment.1.quantity", "Qty"],
    ["equipment.1.acquisition", "Type", "select", ACQUISITION_OPTS],
    ["equipment.1.onCoversheet", "Add to Cover Sheet", "checkbox"],
    ["equipment.2.model", "Item 3 — choose equipment", "modelSelect"],
    ["equipment.2.quantity", "Qty"],
    ["equipment.2.acquisition", "Type", "select", ACQUISITION_OPTS],
    ["equipment.2.onCoversheet", "Add to Cover Sheet", "checkbox"],
    ["equipment.3.model", "Item 4 — choose equipment", "modelSelect"],
    ["equipment.3.quantity", "Qty"],
    ["equipment.3.acquisition", "Type", "select", ACQUISITION_OPTS],
    ["equipment.3.onCoversheet", "Add to Cover Sheet", "checkbox"],
  ]},
  { title: "Coversheet — set-up form", fields: [
    ["sales.salesAgentName", "Sales partner name"],
    ["coversheet.territoryManager", "Territory manager"],
    ["coversheet.teamColor", "Team color"],
    ["coversheet.platform", "Requested platform", "select", [["", "—"], ["tsys", "TSYS (Merrick Bank)"], ["fdomaha", "FD Omaha (Citizen's Bank)"], ["fdnorth", "FD North (Synovus)"], ["other", "Other"]]],
    ["coversheet.platformOther", "Platform — other"],
    ["coversheet.telemarketing", "Telemarketing lead", "checkbox"],
    ["coversheet.reBoard", "Re-board", "checkbox"],
    ["coversheet.docPictures", "Pictures inside & out", "checkbox"],
    ["coversheet.docStatements", "Statements", "checkbox"],
    ["coversheet.etf", "Boarding ETF ($)"],
    ["coversheet.annualFee", "Boarding annual fee ($)"],
    ["coversheet.monthlyMin", "Boarding monthly min ($)"],
    ["coversheet.svcFee", "Boarding svc fee ($)"],
    ["coversheet.cashDiscount", "Cash discount", "checkbox"],
    ["coversheet.cashDiscountTerminalRate", "Cash discount terminal rate"],
    ["coversheet.bypassFee", "Bypass fee option", "checkbox"],
    ["coversheet.shipping", "Shipping to", "select", [["", "—"], ["dba", "DBA Address"], ["agent", "Sales Agent Address"], ["other", "Other"]]],
    ["coversheet.shippingOther", "Shipping — other"],
    ["coversheet.vasGiftCards", "Gift cards", "checkbox"],
    ["coversheet.vasCheckServices", "Check services", "checkbox"],
    ["coversheet.vasWpiRewards", "WPI rewards", "checkbox"],
    ["coversheet.vasCustomerConnect", "Customer connect", "checkbox"],
    ["coversheet.fbAppType", "File build — application type", "select", [["", "—"], ["retail", "Retail"], ["restaurant", "Restaurant"], ["ecommerce", "E-Commerce"], ["moto", "Moto"]]],
    ["coversheet.fbConnection", "File build — connection", "select", [["", "—"], ["ethernet", "Ethernet"], ["dial", "Dial"], ["wifi", "Wifi"], ["wireless", "Wireless 3g/4g"]]],
    ["coversheet.enPinDebit", "Enable Pin Debit", "checkbox"],
    ["coversheet.enEbt", "Enable EBT", "checkbox"],
    ["coversheet.enWex", "Enable Wex/Voyager", "checkbox"],
    ["coversheet.fnsNumber", "FNS #"],
    ["coversheet.autoClose", "Auto close", "checkbox"],
    ["coversheet.autoCloseTime", "Auto close time"],
    ["coversheet.timezone", "Timezone", "select", [["", "—"], ["pst", "PST"], ["mst", "MST"], ["cst", "CST"], ["est", "EST"]]],
    ["coversheet.tips", "Tips", "select", [["", "—"], ["none", "None"], ["tipline", "Tip Line"], ["tipprompt", "Tip Prompt"]]],
    ["coversheet.serverNumbers", "Server #'s", "checkbox"],
    ["coversheet.avsCvv", "AVS/CVV", "checkbox"],
    ["coversheet.invoiceNumber", "Invoice #", "checkbox"],
    ["coversheet.specialOther", "Special prompts — other"],
    ["coversheet.notes", "Notes & special instructions"],
  ]},
  { title: "Purchase order (optional)", fields: [
    ["po.mid", "Merchant MID"],
    ["po.team", "Team (defaults to team color)"],
    ["po.salesManager", "Sales manager (defaults to territory mgr)"],
    ["po.billTo", "Equipment bill to (defaults Merchant)"],
    ["po.shipTo", "Ship to", "select", [["", "—"], ["dba", "Merchant DBA"], ["rep", "Sales Rep"], ["other", "Other"]]],
    ["po.shAttention", "Ship to — attention (defaults to contact)"],
    ["po.shipStreet", "Ship to — street (defaults to location)"],
    ["po.shipCity", "Ship to — city (defaults to location)"],
    ["po.shipState", "Ship to — state (defaults to location)"],
    ["po.shipZip", "Ship to — ZIP (defaults to location)"],
    ["po.shippingMethod", "Shipping method", "select", [["", "—"], ["ground", "Ground (Free)"], ["2day", "2 Day"], ["overnight", "Overnight"]]],
    ["po.payPlan", "Pay plan", "select", [["", "—"], ["3pay", "3 Pay"], ["4pay", "4 Pay"]]],
    ["po.billingType", "Billing", "select", [["", "—"], ["ach", "ACH (voided check)"], ["cc", "Credit Card"]]],
    ["po.shCost", "S&H cost ($)"],
    ["po.salesTax", "Sales tax ($)"],
    ["po.frontendPlatform", "Clover frontend platform", "select", [["", "—"], ["omaha", "Omaha"], ["nashville", "Nashville"]]],
  ]},
  { title: "Bank account change", fields: [
    ["bankChange.merchantId", "Merchant ID number (defaults to MID)"],
    ["bankChange.fundBankName", "Funding — bank name"],
    ["bankChange.fundRouting", "Funding — routing #"],
    ["bankChange.fundAccount", "Funding — account #"],
    ["bankChange.billBankName", "Billing — bank name"],
    ["bankChange.billRouting", "Billing — routing #"],
    ["bankChange.billAccount", "Billing — account #"],
    ["bankChange.addrMatchesFile", "Address matches what's on file", "checkbox"],
    ["bankChange.addrChangeLegal", "Address change from Legal Entity", "checkbox"],
    ["bankChange.addrChangeDba", "Address change from Location (DBA)", "checkbox"],
    ["bankChange.settleChargebacksToFunding", "TSYS: settle chargebacks to Funding account", "checkbox"],
    ["bankChange.docVoidedCheck", "Doc provided: pre-printed voided check", "checkbox"],
    ["bankChange.docBankLetter", "Doc provided: bank letter", "checkbox"],
    ["bankChange.docBankStatement", "Doc provided: bank statement", "checkbox"],
  ]},
  { title: "Change request (CRF)", fields: [
    ["crf.merchantId", "Merchant ID number (defaults to PO MID)"],
    ["crf.ownerName", "Account owner's name (defaults to Owner 1)"],
    ["crf.dba", "Business name / DBA (defaults from Business)"],
    ["crf.legalName", "Current legal name (defaults from Business)"],
    ["crf.dbaName", "Change: new DBA name"],
    ["crf.legalAddress", "Change: new legal address"],
    ["crf.dbaAddress", "Change: new DBA address"],
    ["crf.emailAddress", "Change: new email address"],
    ["crf.dbaPhone", "Change: new DBA phone number"],
    ["crf.dbaFax", "Change: new DBA fax number"],
    ["crf.website", "Change: new website address"],
    ["crf.amexOptBluePlan", "Amex Opt Blue plan", "select", [["", "—"], ["interchange", "Interchange"], ["tiered", "Tiered"]]],
    ["crf.amexOptBlueRate", "Amex Opt Blue rate"],
    ["crf.amexDirectSe", "Amex Direct SE#"],
    ["crf.addDiscover", "Add Discover", "checkbox"],
    ["crf.pinDebitDiscount", "Pin debit discount", "checkbox"],
    ["crf.pinDebitRate", "Pin debit rate"],
    ["crf.ebtFns", "EBT — FNS#"],
    ["crf.ebtFee", "EBT — transaction fee"],
    ["crf.addCashBenefits", "Add cash benefits", "checkbox"],
    ["crf.myMerchantBenefits", "Add MX Merchant benefits", "checkbox"],
    ["crf.myMerchantBenefitsRate", "MX Merchant benefits rate"],
    ["crf.vmdDiscount", "Visa/MasterCard/Discover discount", "checkbox"],
    ["crf.vmdNewRate", "Visa/MC/Discover new rate"],
    ["crf.checkCardDiscount", "Check card discount", "checkbox"],
    ["crf.checkCardRate", "Check card rate"],
    ["crf.other1", "Other change 1"],
    ["crf.other1Rate", "Other change 1 — rate"],
    ["crf.other2", "Other change 2"],
    ["crf.other2Rate", "Other change 2 — rate"],
    ["crf.notes", "Notes"],
  ]},
  { title: "Hemp & CBD (disclosure / amendment)", fields: [
    ["cbd.agreementDate", "Merchant agreement date (MM/DD/YYYY \u2014 defaults to coversheet date)"],
    ["cbd.stateHempLicense", "State Hemp retail license # (if applicable)"],
    ["cbd.growsHemp", "Grows / cultivates Hemp plants?", "select", [["", "\u2014"], ["yes", "Yes"], ["no", "No"]]],
    ["cbd.manufacturesHemp", "Manufactures / processes Hemp plants or CBD?", "select", [["", "\u2014"], ["yes", "Yes"], ["no", "No"]]],
    ["cbd.advertisesHemp", "Markets or advertises Hemp/CBD to the public?", "select", [["", "\u2014"], ["yes", "Yes"], ["no", "No"]]],
    // The product schedule prints 20 numbered rows.
    ...Array.from({ length: 20 }, (_, i) => [
      [`cbd.products.${i}.name`, `Product ${i + 1} \u2014 type/name`],
      [`cbd.products.${i}.distributor`, `Product ${i + 1} \u2014 distributor`],
      [`cbd.products.${i}.state`, `Product ${i + 1} \u2014 state of manufacture`],
    ]).flat(),
  ]},
  { title: "Gift card program (application)", fields: [
    ["giftCard.appKind", "Application kind", "select", [["", "—"], ["new", "New gift card merchant"], ["outlet", "Additional outlet — tie to"], ["entitle", "Additional outlet — entitle only (no cards)"]]],
    ["giftCard.tieTo", "Tie to (existing merchant, for additional outlets)"],
    ["giftCard.resubmission", "Resubmission", "checkbox"],
    ["giftCard.additionalInfo", "Additional information attached", "checkbox"],
    ["giftCard.numLocations", "# of locations"],
    ["giftCard.eq.0.qty", "Equipment 1 — quantity"],
    ["giftCard.eq.0.terminalType", "Equipment 1 — terminal type (if PC, enter PC)"],
    ["giftCard.eq.0.bizType", "Equipment 1 — business type", "select", [["", "—"], ["retail", "Retail"], ["restaurant", "Restaurant"], ["qsr", "QSR"], ["lodging", "Lodging"], ["supermarket", "Supermarket"], ["carrental", "Car Rental"], ["moto", "MOTO"]]],
    ["giftCard.eq.0.model", "Equipment 1 — model code and name"],
    ["giftCard.eq.0.serial", "Equipment 1 — track/version/serial #"],
    ["giftCard.eq.1.qty", "Equipment 2 — quantity"],
    ["giftCard.eq.1.terminalType", "Equipment 2 — terminal type (if PC, enter PC)"],
    ["giftCard.eq.1.bizType", "Equipment 2 — business type", "select", [["", "—"], ["retail", "Retail"], ["restaurant", "Restaurant"], ["qsr", "QSR"], ["lodging", "Lodging"], ["supermarket", "Supermarket"], ["carrental", "Car Rental"], ["moto", "MOTO"]]],
    ["giftCard.eq.1.model", "Equipment 2 — model code and name"],
    ["giftCard.eq.1.serial", "Equipment 2 — track/version/serial #"],
    ["giftCard.eq.2.qty", "Equipment 3 — quantity"],
    ["giftCard.eq.2.terminalType", "Equipment 3 — terminal type (if PC, enter PC)"],
    ["giftCard.eq.2.bizType", "Equipment 3 — business type", "select", [["", "—"], ["retail", "Retail"], ["restaurant", "Restaurant"], ["qsr", "QSR"], ["lodging", "Lodging"], ["supermarket", "Supermarket"], ["carrental", "Car Rental"], ["moto", "MOTO"]]],
    ["giftCard.eq.2.model", "Equipment 3 — model code and name"],
    ["giftCard.eq.2.serial", "Equipment 3 — track/version/serial #"],
    ["giftCard.merchantProcessingNum", "Merchant processing # (15 digits)"],
    ["giftCard.giftCardMerchantNum", "Gift card merchant # (11 digits)"],
    ["giftCard.chain", "Chain"],
    ["giftCard.omahaMerchantNum", "Omaha merchant # (17 digits)"],
    ["giftCard.mcc", "MCC (4 digits)"],
  ]},
  { title: "Gift card — locations & bank affiliation", fields: [
    ["giftCard.setUpFee", "Set-up fee (G34)"],
    ["giftCard.addlLocFee", "Additional location fee (G55)"],
    ["giftCard.activationFee", "Transaction — activation (G66)"],
    ["giftCard.redemptionFee", "Transaction — redemption (G67)"],
    ["giftCard.reloadFee", "Transaction — reload (G68)"],
    ["giftCard.voidFee", "Transaction — void/reversal (G69)"],
    ["giftCard.balanceFee", "Transaction — balance inquiry (G70)"],
    ["giftCard.otherFee", "Transaction — other (G71)"],
    ["giftCard.monthlyMinFee", "Monthly minimum transaction fee (G72)"],
    ["giftCard.monthlyFee", "Gift card monthly fee (32M)"],
    ["giftCard.locations.0.dba", "Location 1 — DBA name"],
    ["giftCard.locations.0.street", "Location 1 — street address"],
    ["giftCard.locations.0.city", "Location 1 — city"],
    ["giftCard.locations.0.state", "Location 1 — state"],
    ["giftCard.locations.0.zip", "Location 1 — ZIP"],
    ["giftCard.locations.0.phone", "Location 1 — phone"],
    ["giftCard.locations.0.fax", "Location 1 — fax"],
    ["giftCard.locations.0.contact", "Location 1 — contact name"],
    ["giftCard.locations.0.positionTitle", "Location 1 — position/title"],
    ["giftCard.locations.0.email", "Location 1 — e-mail"],
    ["giftCard.locations.0.processingNum", "Location 1 — merchant processing #"],
    ["giftCard.locations.1.dba", "Location 2 — DBA name"],
    ["giftCard.locations.1.street", "Location 2 — street address"],
    ["giftCard.locations.1.city", "Location 2 — city"],
    ["giftCard.locations.1.state", "Location 2 — state"],
    ["giftCard.locations.1.zip", "Location 2 — ZIP"],
    ["giftCard.locations.1.phone", "Location 2 — phone"],
    ["giftCard.locations.1.fax", "Location 2 — fax"],
    ["giftCard.locations.1.contact", "Location 2 — contact name"],
    ["giftCard.locations.1.positionTitle", "Location 2 — position/title"],
    ["giftCard.locations.1.email", "Location 2 — e-mail"],
    ["giftCard.locations.1.processingNum", "Location 2 — merchant processing #"],
    ["giftCard.affBank", "Bank affiliation change — new bank (fills page 3)"],
    ["giftCard.affMerchantId", "Bank affiliation — merchant ID (defaults to PO MID)"],
    ["giftCard.affAltId", "Bank affiliation — credit card ID (Alt ID)"],
    ["giftCard.affExistingNum", "Bank affiliation — existing gift card number"],
    ["giftCard.affPromoNumber", "Bank affiliation — promo number"],
  ]},
  { title: "Cash advance (MCA) application", fields: [
    ["cashAdvance.isoName", "ISO name / code"],
    ["cashAdvance.agentName", "Agent name (defaults to sales partner name)"],
    ["cashAdvance.requestedAmount", "Requested advance amount"],
    ["cashAdvance.useOfFunds", "Intended use of funds"],
    ["cashAdvance.docCcStatements", "Attached: last 3 months credit card statements", "checkbox"],
    ["cashAdvance.docBankStatements", "Attached: last 3 months business bank statements", "checkbox"],
    ["cashAdvance.docDriversLicense", "Attached: color photo of driver's license", "checkbox"],
    ["cashAdvance.docVoidedCheck", "Attached: voided business check", "checkbox"],
    ["cashAdvance.positions.0.lender", "Current position 1 — lender"],
    ["cashAdvance.positions.0.amount", "Current position 1 — amount"],
    ["cashAdvance.positions.0.balance", "Current position 1 — balance"],
    ["cashAdvance.positions.1.lender", "Current position 2 — lender"],
    ["cashAdvance.positions.1.amount", "Current position 2 — amount"],
    ["cashAdvance.positions.1.balance", "Current position 2 — balance"],
    ["cashAdvance.positions.2.lender", "Current position 3 — lender"],
    ["cashAdvance.positions.2.amount", "Current position 3 — amount"],
    ["cashAdvance.positions.2.balance", "Current position 3 — balance"],
    ["cashAdvance.bankruptcy", "Ever filed for bankruptcy?", "select", [["", "—"], ["no", "No"], ["yes", "Yes"]]],
    ["cashAdvance.bankruptcyDetails", "Bankruptcy details (optional)"],
    ["cashAdvance.rent", "Rent (monthly)"],
    ["cashAdvance.mortgage", "Mortgage (monthly)"],
    ["cashAdvance.totalCcSales", "Total credit card sales (defaults to monthly card volume)"],
    ["cashAdvance.totalGrossDeposits", "Total gross deposits"],
    ["cashAdvance.avgBankBalance", "Average bank balance"],
    ["cashAdvance.avgNsf", "Average NSFs per month"],
    ["cashAdvance.owner1Mobile", "Owner 1 — mobile phone"],
    ["cashAdvance.owner1CreditScore", "Owner 1 — credit score"],
    ["cashAdvance.owner2Mobile", "Owner 2 — mobile phone"],
    ["cashAdvance.owner2CreditScore", "Owner 2 — credit score"],
  ]},
  { title: "Factor4 gift & loyalty set-up", fields: [
    ["factor4.companyName", "Company name (defaults to DBA)"],
    ["factor4.numLocations", "Number of locations (defaults to the gift card form’s)"],
    ["factor4.phoneExt", "Company phone — ext."],
    ["factor4.perLocationPricing", "Per location pricing / monthly"],
    ["factor4.numCards", "Cards / starter kit — # of cards"],
    ["factor4.cardPricing", "Cards / starter kit — pricing (not incl. shipping)"],
    ["factor4.cardNotes", "Cards / starter kit — notes"],
    ["factor4.primaryContact", "Primary contact (defaults to the business contact, or Owner 1)"],
    ["factor4.primaryPhone", "Primary contact — phone (defaults with the contact)"],
    ["factor4.primaryEmail", "Primary contact — email (defaults with the contact)"],
    ["factor4.secondaryContact", "Secondary contact (defaults to Owner 2)"],
    ["factor4.secondaryPhone", "Secondary contact — phone (defaults with the contact)"],
    ["factor4.secondaryEmail", "Secondary contact — email (defaults with the contact)"],
    ["factor4.integration", "Standalone or integrated with credit card", "select", [["", "—"], ["standalone", "Standalone (gift only)"], ["integrated", "Integrate with credit card"]]],
    ["factor4.ipOrDial", "IP or dial (defaults from the coversheet’s file build connection)", "select", [["", "—"], ["ip", "IP"], ["dial", "Dial"]]],
    ["factor4.terminalType", "Terminal type / POS system (defaults to the terminals in Equipment)"],
    ["factor4.numTerminals", "Number of terminals / tablets (defaults to their quantity)"],
    ["factor4.ccProcessor", "Credit card processor"],
    ["factor4.program", "Program", "select", [["", "—"], ["gift", "Gift only"], ["loyalty", "Loyalty only"], ["both", "Gift & loyalty"]]],
    ["factor4.loyaltyOption", "Loyalty program option", "select", [["", "—"], ["points", "Points for prize"], ["threshold", "Threshold"], ["cashback", "Percentage cash back"], ["punch", "Punch card"]]],
    ["factor4.bankBranch", "Bank branch"],
    ["factor4.bankCity", "Bank branch — city"],
    ["factor4.bankState", "Bank branch — state"],
  ]},
  { title: "Greenlight CBD — agent & business", fields: [
    ["greenlight.isoOffice", "ISO office (defaults to Wholesale Payments)"],
    ["greenlight.program", "Program (defaults to CBD)"],
    ["greenlight.sendMailTo", "Send mail to", "select", [["", "—"], ["corporate", "Corporate address"], ["dba", "DBA address"]]],
    ["greenlight.description", "Description of business (defaults to the business type)"],
    ["greenlight.mcc", "MCC (internal only)"],
    ["greenlight.fulfillmentCenter", "Fulfillment center"],
    ["greenlight.fulfillmentContact", "Fulfillment center contact & phone number"],
    ["greenlight.bankruptcy", "Prior business bankruptcy", "select", YN],
    ["greenlight.match", "Previously placed on MATCH", "select", YN],
    ["greenlight.chargedAt", "Cardholder is charged at time of", "select", [["", "—"], ["purchase", "Purchase"], ["shipment", "Shipment"]]],
    ["greenlight.refundPolicy", "Refund policy (keep it short — the box is small)"],
    ["greenlight.daysToDelivery", "Days to delivery"],
    ["greenlight.depositRequired", "Deposit required", "select", YN],
    ["greenlight.depositPct", "Deposit % of total purchase price"],
    ["greenlight.mktSocial", "Marketing — social media", "checkbox"],
    ["greenlight.mktSms", "Marketing — SMS text", "checkbox"],
    ["greenlight.mktEmail", "Marketing — email", "checkbox"],
    ["greenlight.mktAffiliate", "Marketing — affiliate", "checkbox"],
    ["greenlight.mktOnlineAds", "Marketing — online ads", "checkbox"],
    ["greenlight.mktDirectMail", "Marketing — direct mail (brochure / catalog)", "checkbox"],
    ["greenlight.mktRadioTv", "Marketing — radio / TV", "checkbox"],
  ]},
  { title: "Greenlight CBD — principal 3", fields: [
    ["greenlight.o3First", "Principal 3 — first name"],
    ["greenlight.o3Last", "Principal 3 — last name"],
    ["greenlight.o3Title", "Title"],
    ["greenlight.o3Pct", "Ownership %"],
    ["greenlight.o3Address", "Home address"],
    ["greenlight.o3City", "City"],
    ["greenlight.o3State", "State"],
    ["greenlight.o3Zip", "ZIP"],
    ["greenlight.o3Email", "Email"],
    ["greenlight.o3Phone", "Phone"],
    ["greenlight.o3Ssn", "SSN"],
    ["greenlight.o3Dl", "Driver's license #"],
    ["greenlight.o3DlState", "License state"],
    ["greenlight.o3Dob", "Date of birth"],
  ]},
  { title: "Greenlight CBD — services, equipment & pricing", fields: [
    ["greenlight.mtCashDiscount", "Merchant type — cash discount (also checked by the coversheet’s cash discount)", "checkbox"],
    ["greenlight.cdSwipe", "Cash discount — swipe % (defaults to the swipe % for a cash-discount merchant)"],
    ["greenlight.cdKeyed", "Cash discount — keyed %"],
    ["greenlight.mtRetail", "Merchant type — retail", "checkbox"],
    ["greenlight.retailSwipe", "Retail — swipe % (defaults to the swipe %)"],
    ["greenlight.retailKeyed", "Retail — keyed %"],
    ["greenlight.mtEcommerce", "Merchant type — ecommerce", "checkbox"],
    ["greenlight.ecomInternet", "Ecommerce — internet % (defaults to the internet %)"],
    ["greenlight.ecomPhone", "Ecommerce — phone %"],
    ["greenlight.mtMoto", "Merchant type — MO/TO", "checkbox"],
    ["greenlight.motoMail", "MO/TO — mail %"],
    ["greenlight.motoPhone", "MO/TO — phone % (defaults to the MO/TO %)"],
    ["greenlight.amexSe", "American Express Direct — SE # (blank = Opt Blue)"],
    ["greenlight.eqPos", "Equipment — POS terminal (checked when Equipment lists a terminal)", "checkbox"],
    ["greenlight.eqManufacturer", "POS terminal — manufacturer (defaults from Equipment)"],
    ["greenlight.eqModel", "POS terminal — model (defaults from Equipment)"],
    ["greenlight.eqGateway", "Equipment — gateway", "checkbox"],
    ["greenlight.gatewayProvider", "Gateway — provider"],
    ["greenlight.eqVirtual", "Equipment — virtual terminal", "checkbox"],
    ["greenlight.virtualProvider", "Virtual terminal — provider"],
    ["greenlight.eqSoftware", "Equipment — software", "checkbox"],
    ["greenlight.softwareProvider", "Software — provider"],
    ["greenlight.crm", "Do you use a CRM?", "select", YN],
    ["greenlight.crmName", "CRM — which one"],
    ["greenlight.cdRate", "Cash discount — rate % (defaults to the coversheet’s terminal rate)"],
    ["greenlight.qualPerItem", "Qual rate — per item ($)"],
    ["greenlight.qualRate", "Qual rate (%)"],
    ["greenlight.midQualRate", "Mid-qual + (%)"],
    ["greenlight.nonQualRate", "Non-qual + (%)"],
    ["greenlight.underwritingFee", "GLP underwriting fee ($)"],
    ["greenlight.riskMonitoringFee", "Risk monitoring fee ($ / month)"],
    ["greenlight.merlinkFee", "MERLINK fee ($ / month)"],
  ]},
  { title: "Greenlight CBD — documents checklist", fields: [
    ["greenlight.docApplication", "Completed merchant application", "checkbox"],
    ["greenlight.docVoidedCheck", "Voided business check / bank letter (also checked when a voided check was uploaded)", "checkbox"],
    ["greenlight.docArticles", "Articles of incorporation / by-laws or operating agreement", "checkbox"],
    ["greenlight.docBankExisting", "(Existing business) 3 months of company bank statements", "checkbox"],
    ["greenlight.docBankNew", "(New business) 3 months of personal bank statements", "checkbox"],
    ["greenlight.docProcessing", "3 months of processing statements", "checkbox"],
    ["greenlight.docLicense", "Driver license for all owners / principal signers (also checked when a license was uploaded)", "checkbox"],
    ["greenlight.docDomain", "Proof of domain ownership", "checkbox"],
    ["greenlight.docWebsite", "URL / website lists privacy, refund and terms links", "checkbox"],
    ["greenlight.docProducts", "Export of all products sold on the website", "checkbox"],
    ["greenlight.docCoa", "COA (certificate of analysis) for every product", "checkbox"],
    ["greenlight.docDropShip", "Drop shipping / fulfillment agreement", "checkbox"],
    ["greenlight.docAffiliate", "Affiliate programs", "checkbox"],
    ["greenlight.freeTrial", "Offering a free trial or sample products?", "select", YN],
  ]},
  { title: "Pathward — merchant & site inspection", fields: [
    ["pathward.merchantNumber", "Merchant # (defaults to the purchase order’s MID)"],
    ["pathward.mcc", "MCC (defaults to the Greenlight / gift card MCC)"],
    ["pathward.tinType", "TIN type (defaults from the tax type)", "select", [["", "—"], ["ein", "EIN"], ["ssn", "SSN"]]],
    ["pathward.optIn", "Marketing calls & texts", "select", [["", "—"], ["in", "Opt in"], ["out", "Opt out"]]],
    ["pathward.acceptsCards", "Location currently accepts payment cards (Yes when there’s a current processor)", "select", YN],
    ["pathward.deposits", "Currently takes deposits (defaults to the Greenlight answer)", "select", YN],
    ["pathward.daysToDelivery", "Days to delivery (defaults to the Greenlight answer)"],
    ["pathward.siteLocation", "Site inspection — location", "select", [["", "—"], ["apartment", "Apartment"], ["home", "Home"], ["isolated", "Isolated"], ["mall", "Mall"], ["office", "Office"], ["shopping", "Shopping area"], ["other", "Other"]]],
    ["pathward.siteLocationOther", "Location — other"],
    ["pathward.zone", "Zone", "select", [["", "—"], ["business", "Business"], ["industrial", "Industrial"], ["residential", "Residential"]]],
    ["pathward.nameStoreFront", "Name displayed — store front", "checkbox"],
    ["pathward.nameDoor", "Name displayed — door", "checkbox"],
    ["pathward.nameWindow", "Name displayed — window", "checkbox"],
    ["pathward.sqFootage", "Approximate square footage", "select", [["", "—"], ["0-250", "0-250"], ["251-500", "251-500"], ["501-2000", "501-2,000"], ["2000+", "2,000+"]]],
    ["pathward.licenseVisible", "Proper license visible (liquor, tax ID, etc.)", "select", YN],
    ["pathward.floors", "Number of floors", "select", [["", "—"], ["1", "1"], ["2-4", "2-4"], ["5-10", "5-10"], ["11+", "11+"]]],
    ["pathward.occupies", "Merchant occupies", "select", [["", "—"], ["ground", "Ground floor"], ["other", "Other"]]],
    ["pathward.occupiesOther", "Occupies — other"],
    ["pathward.remainingFloors", "Remaining floor(s) occupied by", "select", [["", "—"], ["residential", "Residential"], ["commercial", "Commercial"], ["combination", "Combination"]]],
    ["pathward.employees", "Number of employees"],
    ["pathward.registers", "Number of registers / terminals (defaults to the equipment count)"],
    ["pathward.fulfillment", "Who performs product / service fulfillment", "select", [["", "—"], ["direct", "Direct"], ["vendor", "Vendor"], ["other", "Other"]]],
    ["pathward.vendorName", "Vendor — name"],
    ["pathward.vendorPhone", "Vendor — phone"],
    ["pathward.vendorAddress", "Vendor — address"],
    ["pathward.vendorCity", "Vendor — city"],
    ["pathward.vendorState", "Vendor — state"],
    ["pathward.vendorZip", "Vendor — ZIP"],
  ]},
  { title: "Pathward — services & equipment", fields: [
    ["pathward.cardFleet", "Requested card type — Fleet", "checkbox"],
    ["pathward.pinPlan", "If PIN debit — plan", "select", [["", "—"], ["passthrough", "Passthrough IC"], ["flat", "Flat Rate"]]],
    ["pathward.pinPlanPct", "If PIN debit — %"],
    ["pathward.servicePlan", "Service plan", "select", [["", "—"], ["core", "Core"], ["growth", "Growth"]]],
    ...[1, 2, 3].flatMap((n) => [
      [`pathward.eq${n}Type`, `Equipment row ${n} — type (defaults from Equipment)`, "select", [["", "—"], ["terminal", "Terminal"], ["pinpad", "Pin Pad"], ["var", "VAR"], ["gateway", "Gateway"]]],
      [`pathward.eq${n}Make`, `Row ${n} — manufacturer`],
      [`pathward.eq${n}Model`, `Row ${n} — model / version`],
      [`pathward.eq${n}Deploy`, `Row ${n} — deployment`, "select", [["", "—"], ["new", "New order"], ["existing", "Existing"]]],
      [`pathward.eq${n}Conn`, `Row ${n} — connection`, "select", [["", "—"], ["dial", "Dial"], ["ethernet", "Ethernet"], ["wireless", "Wireless"]]],
    ]),
    ["pathward.payAppName", "If software — payment application name"],
    ["pathward.payAppVersion", "If software — version in use"],
    ["pathward.tpp", "Uses a third-party provider (TPP) to store, process or transmit card data", "select", YN],
    ["pathward.tppName", "TPP — name"],
    ["pathward.tppAddress", "TPP — address"],
    ["pathward.tppPhone", "TPP — phone"],
    ["pathward.tppEmail", "TPP — email"],
  ]},
  { title: "Pathward — principals", fields: [
    ["pathward.cp1", "Principal 1 — control prong", "select", YN],
    ["pathward.cp2", "Principal 2 — control prong", "select", YN],
    ...[3, 4].flatMap((n) => [
      [`pathward.o${n}First`, `Principal ${n} — first name${n === 3 ? " (the same principal 3 as on the Greenlight form)" : ""}`],
      [`pathward.o${n}Last`, `Principal ${n} — last name`],
      [`pathward.o${n}Title`, "Title"],
      [`pathward.o${n}Pct`, "Ownership %"],
      [`pathward.o${n}Address`, "Home address"],
      [`pathward.o${n}City`, "City"],
      [`pathward.o${n}State`, "State"],
      [`pathward.o${n}Zip`, "ZIP"],
      [`pathward.o${n}Phone`, "Telephone"],
      [`pathward.o${n}Email`, "Email"],
      [`pathward.o${n}Ssn`, "SSN"],
      [`pathward.o${n}Dob`, "Date of birth"],
      [`pathward.o${n}Dl`, "Driver's license #"],
      [`pathward.o${n}DlState`, "License state"],
      [`pathward.cp${n}`, `Principal ${n} — control prong`, "select", YN],
    ]),
  ]},
];

const OWNER_FIELDS = [
  ["first", "First name"],
  ["last", "Last name"],
  ["title", "Title"],
  ["ownershipPct", "Ownership %"],
  ["homeAddress", "Home address"],
  ["city", "City"],
  ["state", "State"],
  ["zip", "ZIP"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["ssn", "SSN"],
  ["dob", "Date of birth"],
  ["dlNumber", "Driver's license #"],
  ["dlState", "License state"],
  ["dlExp", "License expiration"],
];

let workingRecord = null;
let EQUIPMENT_MODELS = [];

function buildEquipmentDatalist() {
  const dl = el("equipmentModels");
  if (!dl) return;
  dl.innerHTML = "";
  EQUIPMENT_MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.model;
    opt.label = `$${m.price} · ${m.category}`;
    dl.appendChild(opt);
  });
}

// Which review sections matter for each form, so picking a form shows only those fields.
// Citizens and Merrick are entirely separate applications; they share the same
// review data but are chosen independently.
const APP_SECTIONS = ["Business", "Owner / Principal 1", "Owner / Principal 2", "Banking (from voided check)", "Transaction", "Fees — authorization / monthly / misc", "Service acceptance & fee schedule", "Signatures (printed name / title / date)", "Documents provided"];
const FORM_SECTIONS = {
  citizens: APP_SECTIONS,
  merrick: APP_SECTIONS,
  fd_north: APP_SECTIONS,
  pbt: [...APP_SECTIONS, "Equipment", "Coversheet — set-up form"],
  application: APP_SECTIONS, // fallback alias
  coversheet: ["Coversheet — set-up form", "Equipment", "Business", "Owner / Principal 1", "Documents provided"],
  po: ["Purchase order (optional)", "Equipment", "Business", "Banking (from voided check)", "Coversheet — set-up form"],
  clover: ["Business", "Signatures (printed name / title / date)", "Purchase order (optional)"],
  bankchange: ["Bank account change", "Business", "Owner / Principal 1"],
  crf: ["Change request (CRF)", "Signatures (printed name / title / date)"],
  hempcbd: ["Hemp & CBD (disclosure / amendment)", "Business", "Signatures (printed name / title / date)"],
  cbdamendment: ["Hemp & CBD (disclosure / amendment)", "Business", "Signatures (printed name / title / date)"],
  giftcard: ["Gift card program (application)", "Gift card — locations & bank affiliation", "Business", "Owner / Principal 1", "Signatures (printed name / title / date)", "Coversheet — set-up form"],
  cashadvance: ["Cash advance (MCA) application", "Business", "Owner / Principal 1", "Owner / Principal 2", "Signatures (printed name / title / date)"],
  factor4: ["Factor4 gift & loyalty set-up", "Business", "Owner / Principal 1", "Owner / Principal 2", "Banking (from voided check)", "Equipment", "Signatures (printed name / title / date)"],
  greenlight: ["Greenlight CBD — agent & business", "Greenlight CBD — principal 3", "Greenlight CBD — services, equipment & pricing", "Greenlight CBD — documents checklist",
    "Business", "Owner / Principal 1", "Owner / Principal 2", "Banking (from voided check)", "Transaction", "Fees — authorization / monthly / misc",
    "Service acceptance & fee schedule", "Signatures (printed name / title / date)", "Equipment", "Coversheet — set-up form", "Documents provided"],
  pathward: ["Pathward — merchant & site inspection", "Pathward — services & equipment", "Pathward — principals",
    "Business", "Owner / Principal 1", "Owner / Principal 2", "Banking (from voided check)", "Transaction", "Fees — authorization / monthly / misc",
    "Service acceptance & fee schedule", "Signatures (printed name / title / date)", "Equipment", "Coversheet — set-up form", "Documents provided"],
  pathward_guide: ["Business", "Signatures (printed name / title / date)"],
};

// Within the shown sections, exactly the fields each form's PDF prints (checked by
// tracing every record read of each form map), so a shared section (e.g. Business)
// shows only what that form uses. An entry ending in "." matches a whole group by
// prefix; otherwise it's exact. "signatures.date" stays wherever a PDF prints a
// signing date: it fills in whenever the global "Coversheet date" is left blank.
// Citizens and FD North share one field map (fd_north = citizens in lib/formMaps.js).
// the seasonal month boxes' record keys (kept under pathward.*, where they were first read)
const SEASON_MONTHS = ["mJan", "mFeb", "mMar", "mApr", "mMay", "mJun", "mJul", "mAug", "mSep", "mOct", "mNov", "mDec"];
const CITIZENS_FIELDS = [
  "__sameAsDba", // UI helper (mirrors location -> corporate address); not a record path
  ...["dba", "legalName", "locationAddress", "locationCity", "locationState", "locationZip", "corpAddress", "corpCity", "corpState", "corpZip",
    "phone", "fax", "contactName", "contactPhone", "customerServicePhone", "email", "website", "federalTaxId", "taxType", "taxFilingName",
    "dnb", "businessType", "productsSold", "organizationType", "businessStarted", "lengthOwnershipYears", "lengthOwnershipMonths"].map((k) => `business.${k}`),
  ...[0, 1].flatMap((i) => ["first", "last", "title", "ownershipPct", "homeAddress", "city", "state", "zip", "phone", "email", "ssn", "dob"].map((k) => `owners.${i}.${k}`)),
  "banking.",
  ...["monthlyVolume", "avgTicket", "highTicket", "swipePct", "motoPct", "internetPct", "previousProcessor", "reasonForLeaving", "seasonal"].map((k) => `transaction.${k}`),
  ...SEASON_MONTHS.map((k) => `pathward.${k}`), // the seasonal row's month boxes
  ...["authVmcda", "fleet", "pinDebit", "pinDebitPct", "ebt", "salesTxn", "monthlyService", "monthlyMinimum", "wireless", "pinDebitMonthly",
    "industryCompliance", "chargeback", "retrieval", "achReject", "annual", "equipmentRental", "monthToBill", "earlyTermination"].map((k) => `fees.${k}`),
  ...["cardVisaCredit", "cardVisaDebit", "cardMcCredit", "cardMcDebit", "cardDiscover", "cardAmex", "cardPin", "discountPlan",
    "flatCreditPct", "flatDebitPct", "passCreditPct", "passDebitPct", "passAmexPct", "assessments", "paymentMethod"].map((k) => `serviceAcceptance.${k}`),
  "signatures.printedName", "signatures.title", "signatures.date", "signatures.printedName2", "signatures.title2", "signatures.date2",
];
const FORM_FIELDS = {
  citizens: CITIZENS_FIELDS,
  fd_north: CITIZENS_FIELDS,
  merrick: [
    "__sameAsDba",
    ...["dba", "legalName", "locationAddress", "locationCity", "locationState", "locationZip", "corpAddress", "corpCity", "corpState", "corpZip",
      "phone", "fax", "contactName", "contactPhone", "email", "website", "federalTaxId", "businessType", "productsSold", "organizationType",
      "stateIssued", "lengthOwnershipYears", "lengthOwnershipMonths"].map((k) => `business.${k}`),
    "owners.", "banking.", "serviceAcceptance.",
    ...["monthlyVolume", "avgTicket", "highTicket", "amexVolume", "swipePct", "motoPct", "internetPct", "salesToConsumerPct", "salesToBusinessPct",
      "salesToGovPct", "reasonForLeaving", "seasonal"].map((k) => `transaction.${k}`),
    ...SEASON_MONTHS.map((k) => `pathward.${k}`), // the seasonal row's month boxes
    ...["authVmcda", "fleet", "pinDebit", "pinDebitPct", "ebt", "salesTxn", "monthlyService", "monthlyMinimum", "wireless", "pinDebitMonthly",
      "industryCompliance", "chargeback", "retrieval", "achReject", "annual", "monthToBill", "earlyTermination", "batch", "returnTxn",
      "electronicAvs", "voiceAuth", "voiceAvs", "basilPos", "saasFee", "inactivityFee", "gatewayMonthly", "gatewayTxn", "monthlyMisc"].map((k) => `fees.${k}`), // all but equipmentRental
    "signatures.printedName", "signatures.title", "signatures.date",
  ],
  pbt: [
    "__sameAsDba", "business.", "owners.", "transaction.", "serviceAcceptance.",
    "banking.bankName", "banking.routing", "banking.account",
    ...["authVmcda", "fleet", "pinDebit", "pinDebitPct", "ebt", "salesTxn", "monthlyService", "monthlyMinimum", "wireless", "pinDebitMonthly",
      "industryCompliance", "chargeback", "retrieval", "achReject", "annual", "monthToBill", "earlyTermination", "batch", "returnTxn",
      "electronicAvs", "voiceAuth", "voiceAvs", "monthlyMisc"].map((k) => `fees.${k}`),
    "signatures.printedName", "signatures.title", "signatures.date", "signatures.printedName2", "signatures.title2", "signatures.date2",
    ...[0, 1, 2, 3].flatMap((i) => ["model", "quantity", "acquisition"].map((k) => `equipment.${i}.${k}`)),
    "sales.salesAgentName",
    "coversheet.fbAppType", "coversheet.fbConnection", "coversheet.autoClose", "coversheet.autoCloseTime",
    "coversheet.avsCvv", "coversheet.serverNumbers", "coversheet.invoiceNumber",
    "coversheet.enWex", "coversheet.vasGiftCards", "coversheet.vasCheckServices",
  ],
  crf: ["crf.", "signatures.date"],
  po: [
    "po.mid", "po.team", "po.salesManager", "po.billTo", "po.shipTo", "po.shAttention", "po.shipStreet", "po.shipCity", "po.shipState", "po.shipZip",
    "po.shippingMethod", "po.payPlan", "po.billingType", "po.shCost", "po.salesTax",
    ...[0, 1, 2, 3].flatMap((i) => [`equipment.${i}.model`, `equipment.${i}.quantity`]),
    "sales.salesAgentName",
    "banking.bankName", "banking.routing", "banking.account",
    "business.dba", "business.legalName", "business.phone",
    "business.locationAddress", "business.locationCity", "business.locationState", "business.locationZip",
  ],
  coversheet: [
    "coversheet.", "documents.", "equipment.", "sales.salesAgentName",
    "business.dba", "business.email", "business.federalTaxId",
    "owners.0.ssn",
  ],
  clover: [
    "business.legalName", "business.email",
    "signatures.printedName", "signatures.title", "signatures.date",
    "po.mid", "po.frontendPlatform",
  ],
  bankchange: [
    "bankChange.",
    "business.legalName", "business.phone",
    "business.locationAddress", "business.locationCity", "business.locationState", "business.locationZip",
    "owners.0.first", "owners.0.last",
  ],
  hempcbd: [
    "cbd.", "business.legalName", "business.dba",
    "signatures.printedName", "signatures.title", "signatures.date",
  ],
  cbdamendment: [
    "cbd.agreementDate", "business.legalName",
    "signatures.printedName", "signatures.title", "signatures.date",
  ],
  giftcard: [
    "giftCard.",
    "business.legalName", "business.dba", "business.federalTaxId", "business.locationAddress",
    "business.locationCity", "business.locationState", "business.locationZip",
    "business.contactName", "business.phone", "business.fax", "business.email", "business.organizationType",
    "owners.0.first", "owners.0.last", "owners.0.title", "owners.0.ownershipPct", "owners.0.homeAddress",
    "owners.0.city", "owners.0.state", "owners.0.zip", "owners.0.phone", "owners.0.ssn",
    "signatures.printedName", "signatures.title", "signatures.date",
    "sales.salesAgentName", // printed on the Additional Location page
  ],
  cashadvance: [
    "cashAdvance.",
    "business.legalName", "business.dba", "business.federalTaxId", "business.contactPhone", "business.phone",
    "business.locationAddress", "business.locationCity", "business.locationState", "business.locationZip",
    "business.businessStarted", "business.website", "business.email", "business.organizationType",
    ...[0, 1].flatMap((i) => ["first", "last", "homeAddress", "city", "state", "zip", "phone", "email", "ssn", "dob", "ownershipPct"].map((k) => `owners.${i}.${k}`)),
    "signatures.date", "signatures.date2",
  ],
  factor4: [
    "factor4.",
    "business.legalName", "business.dba", "business.locationAddress", "business.locationCity", "business.locationState", "business.locationZip",
    "business.phone", "business.fax", "business.website", "business.contactName", "business.contactPhone", "business.email",
    "owners.0.first", "owners.0.last", "owners.0.title", "owners.0.phone", "owners.0.email", // primary contact / signer fallbacks
    "owners.1.first", "owners.1.last", "owners.1.phone", "owners.1.email", // the secondary contact
    "banking.bankName", "banking.routing", "banking.account",
    ...[0, 1, 2, 3].flatMap((i) => [`equipment.${i}.model`, `equipment.${i}.quantity`]),
    "signatures.printedName", "signatures.title", "signatures.date",
  ],
  greenlight: [
    "greenlight.",
    "business.legalName", "business.dba", "business.organizationType", "business.federalTaxId", "business.businessStarted",
    "business.locationAddress", "business.locationCity", "business.locationState", "business.locationZip",
    "__sameAsDba", "business.corpAddress", "business.corpCity", "business.corpState", "business.corpZip", // the legal address
    "business.contactName", "business.phone", "business.email", "business.website", "business.customerServicePhone", "business.fax",
    "business.productsSold", "business.businessType",
    ...[0, 1].flatMap((i) => ["first", "last", "title", "ownershipPct", "homeAddress", "city", "state", "zip", "email", "phone", "ssn", "dlNumber", "dlState", "dob"].map((k) => `owners.${i}.${k}`)),
    "banking.bankName", "banking.routing", "banking.account", "banking.accountType",
    "transaction.monthlyVolume", "transaction.avgTicket", "transaction.highTicket", "transaction.amexVolume",
    "transaction.swipePct", "transaction.internetPct", "transaction.motoPct", "transaction.salesToConsumerPct", "transaction.salesToBusinessPct", "transaction.previousProcessor",
    "fees.salesTxn", "fees.pinDebit", "fees.pinDebitPct", "fees.authVmcda", "fees.batch", "fees.electronicAvs", "fees.ebt", "fees.annual", "fees.monthToBill",
    "fees.monthlyService", "fees.industryCompliance", "fees.monthlyMinimum", "fees.earlyTermination",
    "serviceAcceptance.cardVisaCredit", "serviceAcceptance.cardVisaDebit", "serviceAcceptance.cardMcCredit", "serviceAcceptance.cardMcDebit",
    "serviceAcceptance.cardDiscover", "serviceAcceptance.cardAmex", "serviceAcceptance.cardPin", "serviceAcceptance.cardEbt",
    "serviceAcceptance.discountPlan", "serviceAcceptance.flatCreditPct", "serviceAcceptance.passCreditPct",
    "signatures.printedName", "signatures.title", "signatures.date", "signatures.printedName2", "signatures.title2", "signatures.date2",
    ...[0, 1, 2, 3].flatMap((i) => [`equipment.${i}.model`, `equipment.${i}.quantity`]),
    "sales.salesAgentName", "coversheet.cashDiscount", "coversheet.cashDiscountTerminalRate", "coversheet.fnsNumber",
    "documents.hasVoidedCheck", "documents.hasDriversLicense",
  ],
  pathward: [
    "pathward.",
    "__sameAsDba",
    ...["dba", "legalName", "locationAddress", "locationCity", "locationState", "locationZip", "corpAddress", "corpCity", "corpState", "corpZip",
      "phone", "fax", "contactName", "contactPhone", "email", "website", "federalTaxId", "stateIssued", "organizationType", "businessStarted",
      "businessType", "productsSold"].map((k) => `business.${k}`),
    ...[0, 1].flatMap((i) => ["first", "last", "title", "ownershipPct", "homeAddress", "city", "state", "zip", "phone", "email", "ssn", "dob", "dlNumber", "dlState"].map((k) => `owners.${i}.${k}`)),
    "banking.", "serviceAcceptance.",
    ...["monthlyVolume", "amexVolume", "avgTicket", "highTicket", "swipePct", "motoPct", "internetPct", "salesToConsumerPct", "salesToBusinessPct",
      "salesToGovPct", "previousProcessor", "reasonForLeaving", "seasonal"].map((k) => `transaction.${k}`),
    ...["authVmcda", "fleet", "pinDebit", "pinDebitPct", "ebt", "electronicAvs", "voiceAuth", "voiceAvs", "monthlyService", "monthlyMinimum",
      "pinDebitMonthly", "wireless", "industryCompliance", "basilPos", "saasFee", "inactivityFee", "gatewayMonthly", "monthlyMisc", "batch", "annual",
      "chargeback", "retrieval", "achReject", "gatewayTxn", "salesTxn", "returnTxn", "monthToBill", "earlyTermination"].map((k) => `fees.${k}`), // all but equipmentRental
    "signatures.printedName", "signatures.title", "signatures.date", "signatures.printedName2", "signatures.title2", "signatures.date2",
    ...[0, 1, 2, 3].flatMap((i) => ["model", "quantity", "acquisition"].map((k) => `equipment.${i}.${k}`)),
    "sales.salesAgentName",
  ],
  // its Confirmation Page (page 2): the legal name, and the principal's signature line
  pathward_guide: ["business.legalName", "signatures.printedName", "signatures.title", "signatures.date"],
};
const fieldAllowed = (k, allow) => allow.some((a) => (a.endsWith(".") ? k.startsWith(a) : k === a));

function focusForm(key) {
  scheduleDefaults(0); // (after the sections shown change: their filled-in values)
  const sections = [...ROOT.querySelectorAll("#au-reviewForm > details.review-section")];
  const wanted = FORM_SECTIONS[key];
  const allow = FORM_FIELDS[key];
  const clearFields = (d) => d.querySelectorAll(".field.field-hidden").forEach((f) => f.classList.remove("field-hidden"));
  if (!wanted) {
    // "All sections" — show everything, open the first, reveal all fields.
    sections.forEach((d, i) => {
      d.classList.remove("section-off");
      d.open = i === 0;
      clearFields(d);
    });
    return;
  }
  let first = null;
  sections.forEach((d) => {
    const title = d.querySelector("summary")?.textContent || "";
    const match = wanted.includes(title);
    d.classList.toggle("section-off", !match); // hide sections this form doesn't use
    d.open = match;
    if (match && !first) first = d;
    // Within a shown section, hide fields the form doesn't use.
    if (match && allow) {
      d.querySelectorAll(".field").forEach((f) => {
        const k = f.dataset.key || "";
        f.classList.toggle("field-hidden", Boolean(k) && !fieldAllowed(k, allow));
      });
    } else {
      clearFields(d);
    }
  });
  if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------------- submission history (browser-only) ---------------- */
const HISTORY_KEY = "appupload.history.v1";
const REP_KEY = "appupload.rep";
const MANAGER_KEY = "appupload.manager";
// Sales agents shown in the rep dropdown (and seeded into the history rep filter).
const AGENTS = ["Anson Salazar"];
// Default territory manager (you) — auto-populates the form when none is set.
const DEFAULT_MANAGER = "Anson Salazar";
let currentHistoryId = null;
let HISTORY_BACKEND = "local"; // (Ice Kannon Route has no sign-in: the history lives in this browser)

function getCurrentRep() {
  try {
    return localStorage.getItem(REP_KEY) || "";
  } catch {
    return "";
  }
}
function setCurrentRep(v) {
  try {
    localStorage.setItem(REP_KEY, v);
  } catch {}
}
const repFor = (record) => getCurrentRep() || (record && record.sales && record.sales.salesAgentName) || "";

function getCurrentManager() {
  try {
    return localStorage.getItem(MANAGER_KEY) || DEFAULT_MANAGER;
  } catch {
    return DEFAULT_MANAGER;
  }
}
// The manager name (the person running this) defaults the coversheet territory
// manager, which in turn defaults the purchase order's sales manager. Only fills
// when the record hasn't already specified one, so it never clobbers real data.
function applyManagerDefault(record) {
  const mgr = getCurrentManager();
  if (!mgr || !record) return;
  record.coversheet = record.coversheet || {};
  if (!record.coversheet.territoryManager) record.coversheet.territoryManager = mgr;
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}
// Regenerate the PDF packet for a saved submission. Prefers the exact document
// mix (and date) used when it was generated; older entries without that memory
// fall back to inferring the documents from the record's content.
function inferKinds(record) {
  const kinds = ["coversheet"];
  if (APP_FORMS.includes(record.appType)) kinds.push("application");
  const equip = (record.equipment || []).filter((e) => e && (e.model || e.type));
  const po = record.po || {};
  if (equip.length || po.mid || po.payPlan || po.shippingMethod) kinds.push("po");
  if (equip.some((e) => /clover/i.test(e.model || e.type || ""))) kinds.push("clover");
  const bc = record.bankChange || {};
  if (["fundBankName", "fundRouting", "fundAccount", "billBankName", "billRouting", "billAccount"].some((k) => bc[k])) kinds.push("bankchange");
  const crf = record.crf || {};
  if (Object.entries(crf).some(([k, v]) => !["merchantId", "ownerName", "dba", "legalName"].includes(k) && v)) kinds.push("crf");
  const cbd = record.cbd || {};
  const cbdProducts = Array.isArray(cbd.products) ? cbd.products : Object.values(cbd.products || {});
  if (["stateHempLicense", "growsHemp", "manufacturesHemp", "advertisesHemp"].some((k) => cbd[k]) ||
      cbdProducts.some((pr) => pr && (pr.name || pr.distributor || pr.state))) kinds.push("hempcbd");
  const gc = record.giftCard || {};
  const gcRows = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
  if (["appKind", "tieTo", "numLocations", "merchantProcessingNum", "giftCardMerchantNum", "chain", "omahaMerchantNum", "mcc", "affBank"].some((k) => gc[k]) ||
      gcRows(gc.eq).some((e) => e && Object.values(e).some(Boolean)) ||
      gcRows(gc.locations).some((l) => l && Object.values(l).some(Boolean))) kinds.push("giftcard");
  const ca = record.cashAdvance || {};
  const caRows = Array.isArray(ca.positions) ? ca.positions : Object.values(ca.positions || {});
  if (Object.entries(ca).some(([k, v]) => k !== "positions" && k !== "agentName" && v) ||
      caRows.some((p) => p && (p.lender || p.amount || p.balance))) kinds.push("cashadvance");
  if (Object.values(record.factor4 || {}).some(Boolean)) kinds.push("factor4");
  if (record.appType !== "greenlight" && Object.values(record.greenlight || {}).some(Boolean)) kinds.push("greenlight"); // (as the application it is already in)
  // (the seasonal months alone aren't the Pathward form: Citizens, FD North and Merrick print them too)
  if (record.appType !== "pathward" && Object.entries(record.pathward || {}).some(([k, v]) => v && !SEASON_MONTHS.includes(k))) kinds.push("pathward");
  return kinds;
}
async function downloadEntryPdf(id) {
  const record = await historyGet(id);
  if (!record) return historyUnreached();
  showBanner("info", "Generating PDF…");
  const kinds = Array.isArray(record._lastKinds) && record._lastKinds.length ? record._lastKinds : inferKinds(record);
  const date = record._lastDate || new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  try {
    const res = await fetchPacket({ record, kinds, date });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not generate PDF.");
    }
    const blob = await res.blob();
    const made = packetKinds(kinds, record.appType);
    triggerDownload(blob, pdfFileName(record, made.length === 1 ? made[0] : "combined"));
    hideBanner();
  } catch (e) {
    showBanner("error", e.message);
  }
}
async function exportAll() {
  let items;
  if (HISTORY_BACKEND === "supabase") {
    try {
      items = (await (await authed(FN + "au-history?export=1")).json()).items || [];
    } catch {
      items = [];
    }
  } else {
    items = loadHistory().map((e) => ({ id: e.id, dba: e.dba, appType: e.appType, rep: e.rep || "", savedAt: e.savedAt, record: e.record }));
  }
  if (!items.length) return;
  downloadJson(items, "appupload-history.json");
}

async function historyList() {
  if (HISTORY_BACKEND === "supabase") {
    try {
      const d = await (await authed(FN + "au-history")).json();
      return d.items || [];
    } catch {
      return null; // (couldn't be reached — not the same as no history)
    }
  }
  return loadHistory();
}
// (a saved submission couldn't be fetched: said, rather than nothing happening)
const historyUnreached = () => showBanner("error", navigator.onLine === false
  ? "You’re offline — try again when you’re back online."
  : "Couldn’t reach the saved submissions — check your signal and try again.");
async function historyGet(id) {
  if (HISTORY_BACKEND === "supabase") {
    try {
      const r = await authed(FN + "au-history?id=" + encodeURIComponent(id));
      return r.ok ? (await r.json()).record : null;
    } catch {
      return null;
    }
  }
  return (loadHistory().find((x) => x.id === id) || {}).record || null;
}
async function historyUpsert(record, id) {
  const dba = (record.business && (record.business.dba || record.business.legalName)) || "(unnamed)";
  if (HISTORY_BACKEND === "supabase") {
    try {
      const r = await authed(FN + "au-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dba, appType: record.appType || "unknown", rep: repFor(record), data: record }),
      });
      return (await r.json().catch(() => ({}))).id || id;
    } catch {
      return id;
    }
  }
  return upsertHistory(record, id);
}
async function historyDelete(id) {
  if (HISTORY_BACKEND === "supabase") {
    try {
      const r = await authed(FN + "au-history?id=" + encodeURIComponent(id), { method: "DELETE" });
      return !r || r.ok !== false;
    } catch { return false; }
  }
  saveHistoryList(loadHistory().filter((x) => x.id !== id));
  return true;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHistoryList(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {}
}
function upsertHistory(record, id) {
  const list = loadHistory();
  const entry = {
    id: id || "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    savedAt: Date.now(),
    dba: (record.business && (record.business.dba || record.business.legalName)) || "(unnamed)",
    appType: record.appType || "unknown",
    rep: repFor(record),
    record,
  };
  const idx = list.findIndex((e) => e.id === entry.id);
  if (idx >= 0) list[idx] = entry;
  else list.unshift(entry);
  saveHistoryList(list);
  return entry.id;
}
let historyCache = [];

let historyAt = 0; // when the shared list was last fetched
let historyMissed = false; // the last fetch couldn't reach the list
async function renderHistory() {
  // (offline: what's showing stays, and the list is asked for again when the
  // connection or the app comes back)
  const list = await historyList();
  historyMissed = !list;
  if (list) { historyCache = list; historyAt = Date.now(); }
  paintHistory();
  window.dispatchEvent(new CustomEvent("wpi:au-history")); // (Settings shows the count)
}

const typeLabel = (e) => ({ merrick: "Merrick", citizens: "Citizens", fd_north: "FD North", pbt: "PB&T", greenlight: "Greenlight", pathward: "Pathward", pathward_guide: "Pathward guide" }[e.appType] || "—");

// Build the top-of-page rep dropdown from the agent list, preserving any
// previously-saved rep that isn't on the list (so a custom value still shows).
function populateRepPicker() {
  const sel = el("repInput");
  if (!sel) return;
  const cur = getCurrentRep();
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select rep…";
  sel.appendChild(blank);
  AGENTS.forEach((name) => {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  });
  if (cur && !AGENTS.includes(cur)) {
    const o = document.createElement("option");
    o.value = cur;
    o.textContent = `${cur} (custom)`;
    sel.appendChild(o);
  }
  sel.value = cur;
}

function populateRepFilter() {
  const sel = el("repFilter");
  if (!sel) return;
  // Always include the known agents, plus any reps that already appear in history.
  const reps = [...new Set([...AGENTS, ...historyCache.map((e) => e.rep).filter(Boolean)])].sort();
  const cur = sel.value;
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All reps";
  sel.appendChild(all);
  reps.forEach((r) => {
    const o = document.createElement("option");
    o.value = r;
    o.textContent = r;
    sel.appendChild(o);
  });
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

function paintHistory() {
  const ul = el("historyList");
  if (!ul) return;
  populateRepFilter();
  const q = (el("historySearch")?.value || "").trim().toLowerCase();
  const repSel = el("repFilter")?.value || "";
  let list = historyCache;
  if (q) list = list.filter((e) => `${e.dba || ""} ${typeLabel(e)} ${e.rep || ""}`.toLowerCase().includes(q));
  if (repSel) list = list.filter((e) => (e.rep || "") === repSel);

  // Keep the list short: only the 3 most recent show by default; typing in the
  // search box (or picking a rep) searches the full history.
  let hiddenCount = 0;
  if (!q && !repSel) {
    const sorted = [...list].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    hiddenCount = Math.max(0, sorted.length - 3);
    list = sorted.slice(0, 3);
  }

  ul.innerHTML = "";
  if (list.length === 0) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = historyCache.length ? "No matches." : !historyMissed ? "No saved submissions yet."
      : navigator.onLine === false ? "You’re offline — saved submissions show when you’re back online."
      : "Couldn’t load saved submissions — check your signal and try again.";
    ul.appendChild(li);
  }
  list.forEach((e) => {
    const li = document.createElement("li");
    li.className = "history-item";
    const d = new Date(e.savedAt);
    const when = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "history-open";
    open.innerHTML = `<strong></strong><span class="history-meta"></span>`;
    open.querySelector("strong").textContent = e.dba;
    open.querySelector(".history-meta").textContent = `${typeLabel(e)}${e.rep ? " · " + e.rep : ""} · ${when}`;
    open.addEventListener("click", () => resumeHistory(e.id));
    const exp = document.createElement("button");
    exp.type = "button";
    exp.className = "history-exp";
    exp.title = "Download PDF packet";
    exp.textContent = "⬇";
    exp.addEventListener("click", () => downloadEntryPdf(e.id));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-del";
    del.title = "Remove";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      if (!(await historyDelete(e.id))) return historyUnreached();
      renderHistory();
    });
    li.appendChild(open);
    li.appendChild(exp);
    li.appendChild(del);
    ul.appendChild(li);
  });
  if (hiddenCount > 0) {
    const li = document.createElement("li");
    li.className = "history-more";
    li.textContent = `+ ${hiddenCount} older submission${hiddenCount === 1 ? "" : "s"} — use the search box to find them`;
    ul.appendChild(li);
  }
  updateHistoryVisibility();
}

let appView = "upload";
function updateHistoryVisibility() {
  // Show the section whenever we're on the home/upload view. Deleting the last
  // item then shows the empty-state message rather than making the section vanish.
  const sec = el("historySection");
  if (sec) sec.classList.toggle("hidden", appView !== "upload");
}
async function resumeHistory(id) {
  const record = await historyGet(id);
  if (!record) return historyUnreached();
  workingRecord = record;
  currentHistoryId = id;
  switchMode("app");
  showReview(workingRecord);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function blankRecord() {
  return {
    appType: "unknown", appTypeConfidence: "", documents: {},
    business: {}, owners: [{}, {}], banking: {}, transaction: {}, fees: {},
    serviceAcceptance: {}, signatures: {}, equipment: [{}, {}, {}, {}],
    coversheet: {}, po: {}, bankChange: {}, crf: {}, cbd: {}, giftCard: {}, cashAdvance: {}, factor4: {}, greenlight: {}, pathward: {}, sales: {}, notes: "",
  };
}

/** Home-page picker: open the review form (blank if nothing uploaded) focused on one form. */
function startBlankForm(key) {
  if (!key) return;
  if (!workingRecord) {
    workingRecord = blankRecord();
    currentHistoryId = null;
  }
  // Citizens / Merrick / FD North are distinct applications — lock the app type to the choice.
  if (APP_FORMS.includes(key)) workingRecord.appType = key;
  showReview(workingRecord);
  focusForm(key);
  const js = el("jumpFormSelect");
  if (js) js.value = ["citizens", "merrick", "fd_north", "pbt", "coversheet", "po", "clover", "bankchange", "crf", "hempcbd", "cbdamendment", "giftcard", "cashadvance", "factor4", "greenlight", "pathward", "pathward_guide"].includes(key) ? key : "";
  const hs = el("homeFormSelect");
  if (hs) hs.value = "";
}

function renderReviewForm(record) {
  const container = el("reviewForm");
  container.innerHTML = "";

  const makeField = (path, label, type, options) => {
    const value = getPath(record, path);
    if (type === "checkbox" || type === "sameAsDba") {
      const lab = document.createElement("label");
      lab.className = "field checkfield";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      if (type === "sameAsDba") {
        cb.id = "au-sameAsDbaToggle";
        cb.addEventListener("change", () => applySameAsDba(cb.checked));
      } else {
        cb.checked = Boolean(value);
        cb.dataset.path = path;
        cb.dataset.type = "checkbox";
      }
      lab.appendChild(cb);
      const span = document.createElement("span");
      span.textContent = label;
      lab.appendChild(span);
      return lab;
    }
    if (type === "modelSelect") {
      const wrap = document.createElement("div");
      wrap.className = "field field-wide equip-field" + (value ? "" : " empty");

      // Canonical value read by collectReview; custom text overrides the dropdown.
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.dataset.path = path;
      wrap.appendChild(hidden);

      // 1) Custom equipment text field (above) — for anything not on the pricing list.
      const customLab = document.createElement("label");
      customLab.className = "equip-sub";
      const cspan = document.createElement("span");
      cspan.textContent = "Custom equipment (type if not listed)";
      customLab.appendChild(cspan);
      const custom = document.createElement("input");
      custom.type = "text";
      custom.placeholder = "Type whatever the merchant is requesting…";
      customLab.appendChild(custom);
      wrap.appendChild(customLab);

      // 2) Equipment dropdown (below) — the pricing matrix list.
      const selLab = document.createElement("label");
      selLab.className = "equip-sub";
      const span = document.createElement("span");
      span.textContent = label;
      selLab.appendChild(span);
      const sel = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "— none —";
      sel.appendChild(blank);
      const groups = {};
      EQUIPMENT_MODELS.forEach((m) => (groups[m.category] = groups[m.category] || []).push(m));
      Object.keys(groups).sort().forEach((cat) => {
        const og = document.createElement("optgroup");
        og.label = cat;
        groups[cat].forEach((m) => {
          const o = document.createElement("option");
          o.value = m.model;
          o.textContent = `${m.model} — $${m.price}`;
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      selLab.appendChild(sel);
      const hint = document.createElement("span");
      hint.className = "price-hint";
      selLab.appendChild(hint);
      wrap.appendChild(selLab);

      // Seed initial state: a known model fills the dropdown; anything else is custom.
      const known = value && EQUIPMENT_MODELS.some((m) => m.model === value);
      sel.value = known ? value : "";
      if (value && !known) custom.value = value;
      hidden.value = value || "";

      const refreshHint = () => {
        const v = hidden.value.trim();
        const m = EQUIPMENT_MODELS.find((x) => x.model.toLowerCase() === v.toLowerCase());
        hint.textContent = m ? `${m.category} · $${m.price}` : (v ? "Custom item — no preset price" : "");
        wrap.classList.toggle("empty", v === "");
      };
      custom.addEventListener("input", () => {
        const c = custom.value.trim();
        hidden.value = c || sel.value; // typed custom wins; cleared falls back to the dropdown
        refreshHint();
      });
      sel.addEventListener("change", () => {
        custom.value = ""; // picking from the list clears any custom text
        hidden.value = sel.value;
        refreshHint();
      });
      refreshHint();
      return wrap;
    }
    const wrap = document.createElement("label");
    const isEmpty = value === "" || value == null;
    wrap.className = "field" + (isEmpty ? " empty" : "");
    const span = document.createElement("span");
    span.textContent = label;
    wrap.appendChild(span);
    let inputEl;
    if (type === "select") {
      inputEl = document.createElement("select");
      options.forEach((o) => {
        const [ov, ol] = Array.isArray(o) ? o : [o, o === "" ? "—" : o];
        const opt = document.createElement("option");
        opt.value = ov;
        opt.textContent = ol;
        if (ov === value) opt.selected = true;
        inputEl.appendChild(opt);
      });
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.value = value ?? "";
      if (type === "model") inputEl.setAttribute("list", "au-equipmentModels");
    }
    inputEl.dataset.path = path;
    inputEl.addEventListener("input", () => wrap.classList.toggle("empty", inputEl.value === ""));
    wrap.appendChild(inputEl);
    if (type === "model") {
      const hint = document.createElement("span");
      hint.className = "price-hint";
      const sync = () => {
        const m = EQUIPMENT_MODELS.find((x) => x.model.toLowerCase() === inputEl.value.trim().toLowerCase());
        hint.textContent = m ? `${m.category} · $${m.price}` : "";
        if (m) {
          const typeInp = ROOT.querySelector(`[data-path="${path.replace(/\.model$/, ".type")}"]`);
          if (typeInp) { typeInp.value = m.category; typeInp.dispatchEvent(new Event("input")); }
        }
      };
      inputEl.addEventListener("input", sync);
      wrap.appendChild(hint);
      sync();
    }
    return wrap;
  };

  const addSection = (title, fields, open) => {
    const det = document.createElement("details");
    det.className = "review-section";
    if (open) det.open = true;
    const sum = document.createElement("summary");
    sum.textContent = title;
    det.appendChild(sum);
    const body = document.createElement("div");
    body.className = "section-body";
    if (/^(Greenlight CBD|Factor4|Pathward)/.test(title)) {
      const note = document.createElement("p");
      note.className = "section-note";
      note.textContent = "Greyed values fill in from the rest of the application — type in a field only to change it.";
      body.appendChild(note);
    }
    const row = document.createElement("div");
    row.className = "field-row";
    fields.forEach(([path, label, type, options]) => {
      const f = makeField(path, label, type, options);
      f.dataset.key = path; // used by focusForm for per-form field filtering
      row.appendChild(f);
    });
    body.appendChild(row);
    det.appendChild(body);
    container.appendChild(det);
  };

  REVIEW_SECTIONS.forEach((s, i) => {
    if (s.title === "Banking (from voided check)") {
      // Insert owners before banking.
      [0, 1].forEach((oi) =>
        addSection(`Owner / Principal ${oi + 1}`, OWNER_FIELDS.map(([k, l]) => [`owners.${oi}.${k}`, l]), false)
      );
    }
    addSection(s.title, s.fields, s.open);
  });

  // Documents present (drive coversheet checklist).
  const det = document.createElement("details");
  det.className = "review-section";
  det.innerHTML = `<summary>Documents provided</summary>`;
  const body = document.createElement("div");
  body.className = "section-body";
  [["documents.hasVoidedCheck", "Voided check included"], ["documents.hasDriversLicense", "Driver's license included"], ["transaction.seasonal", "Seasonal merchant"]].forEach(([path, label]) => {
    const lab = document.createElement("label");
    lab.className = "field checkfield";
    lab.dataset.key = path;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = Boolean(getPath(record, path));
    cb.dataset.path = path;
    cb.dataset.type = "checkbox";
    lab.appendChild(cb);
    const span = document.createElement("span");
    span.textContent = label;
    lab.appendChild(span);
    body.appendChild(lab);
  });
  det.appendChild(body);
  container.appendChild(det);

  // Keep the corporate address mirroring the DBA / location address while the toggle is on.
  const toggle = el("sameAsDbaToggle");
  ["business.locationAddress", "business.locationCity", "business.locationState", "business.locationZip"].forEach((p) => {
    container.querySelector(`[data-path="${p}"]`)?.addEventListener("input", () => {
      if (toggle && toggle.checked) applySameAsDba(true);
    });
  });
  buildEquipmentDatalist();
  if (!container.dataset.defaultsWired) {
    container.dataset.defaultsWired = "1";
    container.addEventListener("input", () => scheduleDefaults());
    container.addEventListener("change", () => scheduleDefaults());
  }
  scheduleDefaults(0);
}

/* ---------------- what fills in by itself ---------------- */
// A field that fills in from the rest of the application (the Greenlight and
// Factor4 forms', and an answer two forms share) shows what it will print,
// greyed, while it's empty — so nothing already in the application is typed
// again; typing there overrides it. The server works it out with the same code
// that prints the PDFs, so what's shown is what prints.
const DEFAULT_PATHS = '[data-path^="greenlight."], [data-path^="factor4."], [data-path^="pathward."], [data-path="giftCard.mcc"], [data-path="cashAdvance.bankruptcy"], [data-path="coversheet.platform"], [data-path="coversheet.platformOther"]';
let defaultsSeq = 0, defaultsTimer = 0;
function reviewSnapshot() {
  const snap = JSON.parse(JSON.stringify(workingRecord || {}));
  el("reviewForm").querySelectorAll("[data-path]").forEach((inp) => {
    setPath(snap, inp.dataset.path, inp.dataset.type === "checkbox" ? inp.checked : inp.value);
  });
  snap.appType = el("appTypeSelect").value;
  return snap;
}
function scheduleDefaults(delay = 600) {
  clearTimeout(defaultsTimer);
  defaultsTimer = setTimeout(refreshDefaults, delay);
}
async function refreshDefaults() {
  // (only while such a field is shown that can show one: a text box or a choice, not a
  // check box like the seasonal months, and not one hidden for the form picked)
  const shown = [...el("reviewForm").querySelectorAll("details.review-section:not(.section-off)")]
    .some((d) => [...d.querySelectorAll(DEFAULT_PATHS)].some((i) => (i.tagName === "SELECT" || i.type === "text") && !i.closest(".field-hidden")));
  if (!workingRecord || !shown) return;
  const seq = ++defaultsSeq;
  let defaults;
  try {
    const res = await authed(FN + "au-packet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record: reviewSnapshot(), date: el("coverDate").value.trim(), defaults: true }) });
    if (!res.ok) return;
    defaults = (await res.json()).defaults || {};
  } catch (e) {
    return; // (no hints then — nothing depends on them)
  }
  if (seq !== defaultsSeq) return; // a later edit asked again
  showDefaults(defaults);
}
function showDefaults(defaults) {
  el("reviewForm").querySelectorAll(`input${DEFAULT_PATHS.split(", ").join(", input")}, select${DEFAULT_PATHS.split(", ").join(", select")}`).forEach((inp) => {
    const v = defaults[inp.dataset.path] || "";
    if (inp.tagName === "SELECT") {
      const blank = [...inp.options].find((o) => o.value === "");
      if (!blank) return;
      if (blank.dataset.plain == null) blank.dataset.plain = blank.textContent;
      blank.textContent = v ? `${v} (filled in)` : blank.dataset.plain;
    } else if (inp.type === "text") {
      inp.placeholder = v;
    } else return;
    inp.closest(".field")?.classList.toggle("has-default", Boolean(v));
  });
}

function applySameAsDba(checked) {
  const pairs = [
    ["business.locationAddress", "business.corpAddress"],
    ["business.locationCity", "business.corpCity"],
    ["business.locationState", "business.corpState"],
    ["business.locationZip", "business.corpZip"],
  ];
  pairs.forEach(([src, dst]) => {
    const s = ROOT.querySelector(`[data-path="${src}"]`);
    const d = ROOT.querySelector(`[data-path="${dst}"]`);
    if (!s || !d) return;
    if (checked) {
      d.value = s.value;
      d.readOnly = true;
      const f = d.closest(".field");
      if (f) { f.classList.remove("empty"); f.classList.add("mirrored"); }
    } else {
      d.readOnly = false;
      d.closest(".field")?.classList.remove("mirrored");
    }
  });
}

function collectReview() {
  const modelsBefore = (workingRecord.equipment || []).map((e) => String((e && e.model) || "").trim().toLowerCase());
  el("reviewForm")
    .querySelectorAll("[data-path]")
    .forEach((inp) => {
      const path = inp.dataset.path;
      const value = inp.dataset.type === "checkbox" ? inp.checked : inp.value;
      setPath(workingRecord, path, value);
    });
  // Equipment type has no review input (it comes from extraction). When a model is
  // changed or cleared, drop its old type so the PO "(type)" suffix and the PB&T
  // type boxes never describe equipment that was replaced.
  (workingRecord.equipment || []).forEach((e, i) => {
    if (e && String(e.model || "").trim().toLowerCase() !== (modelsBefore[i] || "")) e.type = "";
  });
  workingRecord.appType = el("appTypeSelect").value;
  applyManagerDefault(workingRecord); // ensure generated PDFs carry the manager even if the section was never opened
}

/* ---------------- application flow ---------------- */
let appUploader;

async function extractApplication() {
  if (appUploader.pages.length === 0) return;
  showSection("app", "processing");
  const g = sessionGen;
  try {
    const data = await runJob("app", appUploader.pages);
    if (g !== sessionGen) return; // the session ended meanwhile
    workingRecord = data.record;
    currentHistoryId = (await historyUpsert(workingRecord)) || currentHistoryId;
    renderHistory();
    showReview(workingRecord, true); // came from upload + auto-detection
  } catch (e) {
    if (g !== sessionGen) return;
    showSection("app", "upload");
    showBanner("error", e.message);
  }
}

// Download picker: enable the button only when at least one document is checked.
const dlChecks = () => [...ROOT.querySelectorAll(".dl-check input")];
function updateDlBtn() {
  el("genSelectedBtn").disabled = dlChecks().filter((c) => c.checked).length === 0;
}
function resetDlChecks() {
  dlChecks().forEach((c) => (c.checked = false));
  updateDlBtn();
}

function showReview(record, detected = false) {
  resetDlChecks();
  clearSignature();
  applyManagerDefault(record);
  el("appTypeSelect").value = record.appType || "unknown";
  const badge = el("detectBadge");
  const type = record.appType || "unknown";
  if (detected) {
    // Only after a real upload + auto-detection do we show the detection result.
    const conf = record.appTypeConfidence || "";
    badge.className = `detect-badge ${type}`;
    badge.textContent =
      type === "unknown" ? "Could not detect form — choose one below" : `Detected: ${{ citizens: "Citizens", merrick: "Merrick", fd_north: "FD North", pbt: "PB&T", greenlight: "Greenlight", pathward: "Pathward", pathward_guide: "Pathward Program Guide" }[type] || type}${conf ? ` (${conf} confidence)` : ""}`;
  } else {
    // Manual form pick or reopened submission — no detection banner.
    badge.className = "detect-badge hidden";
    badge.textContent = "";
  }
  renderReviewForm(record);
  showSection("app", "review");
}

async function generateSelected() {
  const kinds = PACKET_ORDER.filter((k) => dlChecks().some((c) => c.checked && c.value === k));
  if (!kinds.length) return;
  collectReview();
  // Remember what was generated (and the date used) so the history ⬇ button can
  // regenerate the same packet later instead of guessing.
  workingRecord._lastKinds = kinds;
  workingRecord._lastDate = el("coverDate").value.trim();
  currentHistoryId = (await historyUpsert(workingRecord, currentHistoryId)) || currentHistoryId;
  renderHistory();
  const body = { record: workingRecord, form: el("appTypeSelect").value, date: el("coverDate").value.trim(), kinds, signature: signatureData };
  try {
    const res = await fetchPacket(body);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not generate PDF.");
    }
    const blob = await res.blob();
    // One doc -> its own name; several -> "<DBA> - Packet.pdf".
    const made = packetKinds(kinds, body.form);
    triggerDownload(blob, pdfFileName(workingRecord, made.length === 1 ? made[0] : "combined"));
  } catch (e) {
    showBanner("error", e.message);
  }
}

/* ---------------- Sign Now (Owner 1) ---------------- */
let signatureData = ""; // PNG data URL of Owner 1's signature (per session, not persisted)
let signPad = null;     // lazily-built drawing pad controller

function clearSignature() {
  signatureData = "";
  updateSignStatus();
}

function updateSignStatus() {
  const status = el("signStatus");
  const btn = el("signNowBtn");
  if (!status || !btn) return;
  if (signatureData) {
    status.textContent = "✓ Signed (Owner 1)";
    status.classList.add("signed");
    btn.textContent = "✍ Edit signature — Owner 1";
  } else {
    status.textContent = "";
    status.classList.remove("signed");
    btn.textContent = "✍ Sign now — Owner 1";
  }
}

// Pointer-driven signature pad (works for mouse, touch, and pen).
function buildSignPad() {
  const canvas = el("signPad");
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0a1973";
  let drawing = false;
  let dirty = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    dirty = true;
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("pointerleave", stop);
  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
    isEmpty() { return !dirty; },
    // Export only the inked bounding box (plus padding). The full pad canvas has
    // large blank margins that would shrink the signature when the PDF scales it
    // to fit each signature line.
    dataURL() {
      const { width, height } = canvas;
      const px = ctx.getImageData(0, 0, width, height).data;
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (px[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return canvas.toDataURL("image/png"); // nothing drawn
      const pad = 6;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
      const out = document.createElement("canvas");
      out.width = maxX - minX + 1;
      out.height = maxY - minY + 1;
      out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    },
  };
}

// Render a typed name as a cursive signature PNG, trimmed to the text width.
function typedSignatureDataURL(name) {
  const t = (name || "").trim();
  if (!t) return "";
  const font = "64px 'Brush Script MT','Snell Roundhand','Segoe Script',cursive";
  const meas = document.createElement("canvas").getContext("2d");
  meas.font = font;
  const w = Math.ceil(meas.measureText(t).width) + 24;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = 96;
  const ctx = c.getContext("2d");
  ctx.font = font;
  ctx.fillStyle = "#0a1973";
  ctx.textBaseline = "middle";
  ctx.fillText(t, 12, 50);
  return c.toDataURL("image/png");
}

// Render the typed-name preview; hide the box entirely when empty so a large
// cursive glyph can't leave a paint ghost behind (a Safari repaint quirk).
function setTypePreview(value) {
  const pv = el("signTypePreview");
  pv.textContent = value;
  pv.classList.toggle("hidden", value.trim() === "");
}

function openSignModal() {
  const modal = el("signModal");
  if (!signPad) signPad = buildSignPad();
  signPad.clear();
  el("signTypeInput").value = "";
  setTypePreview("");
  signSwitchTab("draw");
  modal.classList.remove("hidden");
  // (over the site's header and tab bar too, as on its own: the browser's top layer)
  if (modal.showPopover) { modal.popover = "manual"; try { modal.showPopover(); } catch (e) {} }
  else document.documentElement.classList.add("au-modal-open");
}

function closeSignModal() {
  const modal = el("signModal");
  modal.classList.add("hidden");
  if (modal.hidePopover) { try { modal.hidePopover(); } catch (e) {} }
  document.documentElement.classList.remove("au-modal-open");
}

const signErr = (msg) => { el("signErr").textContent = msg; };
let signTab = "draw";
function signSwitchTab(which) {
  signTab = which;
  signErr("");
  const draw = which === "draw";
  el("signTabDraw").classList.toggle("active", draw);
  el("signTabType").classList.toggle("active", !draw);
  el("signDrawPane").classList.toggle("hidden", !draw);
  el("signTypePane").classList.toggle("hidden", draw);
}

function applySignature() {
  let data = "";
  if (signTab === "draw") {
    if (signPad && !signPad.isEmpty()) data = signPad.dataURL();
  } else {
    data = typedSignatureDataURL(el("signTypeInput").value);
  }
  if (!data) {
    // (said in the window: the page's banner is behind it)
    signErr(signTab === "draw" ? "Draw your signature first." : "Type your name first.");
    return;
  }
  signatureData = data;
  updateSignStatus();
  closeSignModal();
}

function initSignNow() {
  el("signNowBtn").addEventListener("click", openSignModal);
  el("signCancelBtn").addEventListener("click", closeSignModal);
  el("signApplyBtn").addEventListener("click", applySignature);
  el("signClearBtn").addEventListener("click", () => {
    if (signTab === "draw") { if (signPad) signPad.clear(); }
    else { el("signTypeInput").value = ""; setTypePreview(""); }
  });
  el("signTabDraw").addEventListener("click", () => signSwitchTab("draw"));
  el("signTabType").addEventListener("click", () => signSwitchTab("type"));
  el("signTypeInput").addEventListener("input", (e) => { setTypePreview(e.target.value); signErr(""); });
  el("signPad").addEventListener("pointerdown", () => signErr(""));
  el("signModal").addEventListener("click", (e) => { if (e.target === el("signModal")) closeSignModal(); });
}

/* ---------------- menu flow ---------------- */
let menuUploader;
let menuItems = [];

async function extractMenu() {
  if (menuUploader.pages.length === 0) return;
  showSection("menu", "processing");
  const g = sessionGen;
  try {
    const data = await runJob("menu", menuUploader.pages);
    if (g !== sessionGen) return; // the session ended meanwhile
    menuItems = data.menu.items || [];
    el("restaurantName").value = data.menu.restaurantName || "";
    renderMenuTable();
    showSection("menu", "review");
  } catch (e) {
    if (g !== sessionGen) return;
    showSection("menu", "upload");
    showBanner("error", e.message);
  }
}

function renderMenuTable() {
  const tbody = el("menuTable").querySelector("tbody");
  tbody.innerHTML = "";
  menuItems.forEach((it, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-k="name" value="${esc(it.name)}" /></td>
      <td class="price-col"><input data-k="price" value="${esc(it.price)}" inputmode="decimal" /></td>
      <td class="cat-col"><input data-k="category" value="${esc(it.category)}" /></td>
      <td><input data-k="description" value="${esc(it.description)}" /></td>
      <td><button class="row-del" title="Remove">×</button></td>`;
    tr.querySelectorAll("input").forEach((inp) =>
      inp.addEventListener("input", () => (menuItems[idx][inp.dataset.k] = inp.value))
    );
    tr.querySelector(".row-del").addEventListener("click", () => {
      menuItems.splice(idx, 1);
      renderMenuTable();
    });
    tbody.appendChild(tr);
  });
}

async function downloadXlsx() {
  const menu = { restaurantName: el("restaurantName").value.trim(), items: menuItems };
  try {
    const res = await authed(FN + "au-menu-xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not build spreadsheet.");
    }
    const blob = await res.blob();
    const name = (menu.restaurantName || "menu").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 50);
    triggerDownload(blob, `${name}-clover-import.xlsx`);
  } catch (e) {
    showBanner("error", e.message);
  }
}

/* ---------------- helpers ---------------- */
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
// Human-readable form labels used in downloaded file names.
const FORM_LABELS = { combined: "Packet", application: "Application", coversheet: "Coversheet", po: "Purchase Order", clover: "Clover Addendum", bankchange: "Bank Account Change", crf: "Change Request", hempcbd: "Hemp & CBD Disclosure", cbdamendment: "CBD Amendment", giftcard: "Gift Card Setup", cashadvance: "Cash Advance Application", factor4: "Factor4 Merchant Set-Up", greenlight: "Greenlight CBD Application", pathward: "Pathward Application", pathward_guide: "Pathward Program Guide" };
// Lead the file name with the Doing-Business-As name so downloads are auto-labeled
// and easy to find. Falls back to legal name, then a generic label.
function pdfFileName(record, kind) {
  const dba = ((record && record.business && (record.business.dba || record.business.legalName)) || "").trim();
  const safe = dba.replace(/[\/\\:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const label = FORM_LABELS[kind] || "Document";
  return `${safe || "Application"} - ${label}.pdf`;
}

function triggerDownload(blob, filename) {
  // the share sheet on iPhone/iPad (Save to Files, Mail, Print…), a download elsewhere
  return WPI.saveFile(blob, filename, blob.type);
}

function showSection(mode, which) {
  if (mode === "app") {
    appView = which;
    el("appUpload").classList.toggle("hidden", which !== "upload");
    el("appProcessing").classList.toggle("hidden", which !== "processing");
    el("appReview").classList.toggle("hidden", which !== "review");
    updateHistoryVisibility();
  } else {
    el("menuUpload").classList.toggle("hidden", which !== "upload");
    el("menuProcessing").classList.toggle("hidden", which !== "processing");
    el("menuReview").classList.toggle("hidden", which !== "review");
  }
  if (which !== "review") hideBanner();
}

// Reset the Merchant Application workflow back to the upload home screen.
function goHome() {
  switchMode("app");
  if (appUploader) appUploader.clear();
  workingRecord = null;
  currentHistoryId = null;
  showSection("app", "upload");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchMode(mode) {
  const isApp = mode === "app";
  el("tabApp").classList.toggle("active", isApp);
  el("tabMenu").classList.toggle("active", !isApp);
  el("tabApp").setAttribute("aria-selected", String(isApp));
  el("tabMenu").setAttribute("aria-selected", String(!isApp));
  el("appMode").classList.toggle("hidden", !isApp);
  el("menuMode").classList.toggle("hidden", isApp);
  hideBanner();
}

let healthy = false;
let healthBusy = false;
let healthInfo = null; // what the reading service said about itself
let sessionGen = 0; // bumped when a session ends: answers meant for it are dropped
async function checkHealth() {
  if (healthBusy) return;
  healthBusy = true;
  const g = sessionGen;
  try {
    const res = await authed(FN + "au-health");
    if (!res.ok) throw await failure(res, "");
    const data = await res.json();
    if (g !== sessionGen) return;
    healthy = true;
    healthInfo = data;
    if (!data.ready) showBanner("warn", "Not configured: set ANTHROPIC_API_KEY on the server (or TRANSCRIBE_MOCK=1 for a demo).");
    else if (data.mock) showBanner("info", "Demo mode: uploads return sample data so you can preview the workflow.");
    HISTORY_BACKEND = data.historyBackend || "local";
    const note = el("historyNote");
    if (note) {
      note.textContent =
        HISTORY_BACKEND === "supabase"
          ? "Shared across your team's devices. Click one to reopen and fill more forms."
          : "Saved only in this browser (extracted data only — no photos). Click one to reopen and fill more forms.";
    }
  } catch {} finally { if (g === sessionGen) healthBusy = false; }
  if (g !== sessionGen) return;
  // Render once the backend is known (or defaulted on failure) to avoid a
  // local-then-supabase flash and a redundant history fetch.
  renderHistory();
}

function init() {
  appUploader = makeUploader({
    dropzone: el("appDropzone"),
    input: el("appFileInput"),
    browseBtn: el("appBrowseBtn"),
    thumbs: el("appThumbs"),
    onChange: (n) => {
      el("extractBtn").disabled = n === 0;
      el("appClearBtn").classList.toggle("hidden", n === 0);
      if (n) hideBanner();
    },
  });
  menuUploader = makeUploader({
    dropzone: el("menuDropzone"),
    input: el("menuFileInput"),
    browseBtn: el("menuBrowseBtn"),
    thumbs: el("menuThumbs"),
    onChange: (n) => {
      el("menuExtractBtn").disabled = n === 0;
      el("menuClearBtn").classList.toggle("hidden", n === 0);
      if (n) hideBanner();
    },
  });

  el("tabApp").addEventListener("click", () => switchMode("app"));
  el("tabMenu").addEventListener("click", () => switchMode("menu"));

  el("extractBtn").addEventListener("click", extractApplication);
  el("appClearBtn").addEventListener("click", () => appUploader.clear());
  el("genSelectedBtn").addEventListener("click", generateSelected);
  dlChecks().forEach((c) => c.addEventListener("change", updateDlBtn));
  initSignNow();
  el("jumpFormSelect").addEventListener("change", (e) => {
    const v = e.target.value;
    if (APP_FORMS.includes(v)) {
      el("appTypeSelect").value = v;
      if (workingRecord) workingRecord.appType = v;
    }
    focusForm(v);
  });
  el("homeFormSelect").addEventListener("change", (e) => startBlankForm(e.target.value));
  // Choosing the Greenlight or Pathward application (or the Pathward Program Guide) brings up its own questions
  // (and leaving it, while they're shown, brings up the newly chosen application's).
  el("appTypeSelect").addEventListener("change", (e) => {
    const v = e.target.value, js = el("jumpFormSelect");
    if (workingRecord) workingRecord.appType = v;
    if (OWN_FORMS.includes(v) || (OWN_FORMS.includes(js.value) && APP_FORMS.includes(v))) {
      js.value = v;
      focusForm(v);
    }
  });
  bgSync();
  el("historySearch").addEventListener("input", paintHistory);
  el("repFilter").addEventListener("change", paintHistory);
  el("exportAllBtn").addEventListener("click", exportAll);
  populateRepPicker();
  el("repInput").addEventListener("change", (e) => setCurrentRep(e.target.value));
  el("clearHistoryBtn").addEventListener("click", async () => {
    if (!confirm("Clear all saved submissions?")) return;
    if (HISTORY_BACKEND === "supabase") {
      const items = await historyList();
      if (!items) return historyUnreached();
      await Promise.all(items.map((e) => historyDelete(e.id)));
    } else {
      saveHistoryList([]);
    }
    renderHistory();
  });
  el("appRestartBtn").addEventListener("click", goHome);

  // Clicking the brand logo returns to the application upload screen to start over.
  const logo = el("brandLogo");
  if (logo) {
    logo.addEventListener("click", goHome);
    logo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goHome(); }
    });
  }

  el("menuExtractBtn").addEventListener("click", extractMenu);
  el("menuClearBtn").addEventListener("click", () => menuUploader.clear());
  el("addItemBtn").addEventListener("click", () => {
    menuItems.push({ name: "", price: "", category: "", description: "" });
    renderMenuTable();
  });
  el("genXlsxBtn").addEventListener("click", downloadXlsx);
  el("menuRestartBtn").addEventListener("click", () => {
    menuUploader.clear();
    menuItems = [];
    showSection("menu", "upload");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // (made ready in the background, before it's opened: its show() does this when first shown)
  if (!window.WPI || WPI.active("appupload")) {
    checkHealth(); // renders history itself once the backend is determined
    loadLists();
  }
}

// (signed out or offline when the section first opened: tried again when it's shown)
let equipmentLoaded = false;
let equipmentBusy = false;
function loadLists() {
  const g = sessionGen;
  const wantEquipment = !equipmentLoaded && !equipmentBusy;
  if (wantEquipment) equipmentBusy = true;
  if (wantEquipment) authed(FN + "au-equipment")
    .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
    .then((d) => {
      equipmentLoaded = true;
      EQUIPMENT_MODELS = d.models || [];
      buildEquipmentDatalist();
      // If a review form is already on screen (e.g. models loaded late), rebuild it
      // so the equipment dropdowns populate — preserving any edits already made.
      if (workingRecord && !el("appReview").classList.contains("hidden")) {
        collectReview();
        renderReviewForm(workingRecord);
        focusForm(el("jumpFormSelect").value);
      }
    })
    .catch(() => {})
    .finally(() => { equipmentBusy = false; });
}

init();

// this person's own rep, chosen on another device, arriving here
window.addEventListener("wpi:prefs", (e) => {
  const keys = (e.detail && e.detail.keys) || [];
  if (keys.includes(REP_KEY)) populateRepPicker();
});

// a session that ended leaves nothing of a merchant's documents on screen or
// in memory for whoever signs in next
window.addEventListener("wpi:signedout", () => {
  if (appUploader) appUploader.clear();
  if (menuUploader) menuUploader.clear();
  workingRecord = null;
  currentHistoryId = null;
  menuItems = [];
  clearSignature();
  if (signPad) signPad.clear();
  closeSignModal();
  sessionGen++;
  historyCache = []; historyMissed = false; paintHistory();
  healthy = false; healthBusy = false;
  el("reviewForm").innerHTML = "";
  el("coverDate").value = "";
  el("restaurantName").value = "";
  el("menuTable").querySelector("tbody").innerHTML = "";
  el("signTypeInput").value = "";
  setTypePreview("");
  el("historySearch").value = "";
  el("detectBadge").className = "detect-badge hidden";
  el("detectBadge").textContent = "";
  for (const id of ["appTypeSelect", "jumpFormSelect", "homeFormSelect", "repFilter"]) {
    const sel = el(id);
    sel.selectedIndex = Math.max(0, [...sel.options].findIndex((o) => o.defaultSelected));
  }
  switchMode("app");
  showSection("app", "upload");
  showSection("menu", "upload");
});

// signed in again (after a session ended), back online or back in the
// foreground with the section open: what didn't load is asked for again
const catchUp = () => {
  if (bgSection && !document.hidden && !document.documentElement.classList.contains("auth-on")) {
    if (!healthy) checkHealth();
    else if (Date.now() - historyAt > 10000) renderHistory();
    loadLists();
  }
};
window.addEventListener("wpi:auth", catchUp);
window.addEventListener("online", catchUp);
document.addEventListener("visibilitychange", catchUp);

function settingsPart(host) {
  const row = (label, sub, act = "") =>
    `<div class="set-row"><div class="set-txt"><div class="set-lbl">${label}</div><div class="set-sub">${sub}</div></div>${act}</div>`;
  // (built once; later only its text changes, so typing isn't interrupted)
  const histText = () => `Saved in this browser${historyAt ? ` (${historyCache.length} showing)` : ""}. Clearing it is on the AppUpload page.`;
  const readText = () => (!healthInfo ? "Checking…"
    : !healthInfo.ready ? "Not set up yet: the site needs its Anthropic API key (ANTHROPIC_API_KEY in Netlify)."
    : healthInfo.mock ? "Demo mode: reads return sample data."
    : "Ready.") + " Each person can read up to 40 times an hour (200 a day).";
  const refresh = () => {
    const h = host.querySelector('[data-au-sub="hist"]'), r = host.querySelector('[data-au-sub="read"]');
    if (h) h.textContent = histText();
    if (r) r.textContent = readText();
  };
  const paint = () => {
    host.innerHTML =
      row("Sales rep", "Saved with each submission you read or fill.", '<select data-au="rep" aria-label="Sales rep"></select>') +
      row("Submission history", "", '<button class="btn" type="button" data-au="export">Export all</button>') +
      row("Reading", "");
    const subs = host.querySelectorAll(".set-sub");
    subs[1].dataset.auSub = "hist"; subs[2].dataset.auSub = "read";
    refresh();
    const sel = host.querySelector('[data-au="rep"]');
    for (const o of el("repInput").options) sel.appendChild(o.cloneNode(true));
    sel.value = getCurrentRep();
  };
  const onChange = (e) => {
    const t = e.target;
    if (t.dataset.au === "rep") {
      setCurrentRep(t.value);
      el("repInput").value = t.value;
    }
  };
  const onClick = async (e) => {
    const b = e.target.closest("[data-au]");
    if (!b || b.tagName !== "BUTTON") return;
    if (b.dataset.au === "export" &&
      confirm("Download every saved submission? The file holds merchants’ SSNs, dates of birth and bank numbers — keep it private.")) exportAll();
  };
  paint();
  if (!healthy) checkHealth().then(refresh, () => {});
  host.addEventListener("change", onChange);
  host.addEventListener("click", onClick);
  window.addEventListener("wpi:au-history", refresh);
  return () => {
    host.removeEventListener("change", onChange);
    host.removeEventListener("click", onClick);
    window.removeEventListener("wpi:au-history", refresh);
  };
}

if (window.WPI) WPI.register("appupload", {
  show: () => {
    bgSection = true;
    bgSync();
    // (signed out or offline when it first opened; teammates' saves since)
    if (!healthy) checkHealth();
    else if (Date.now() - historyAt > 10000) renderHistory();
    loadLists();
  },
  hide: () => {
    bgSection = false;
    bgSync();
    if (!el("signModal").classList.contains("hidden")) el("signCancelBtn").click();
  },
  settings: settingsPart,
  // its shortcuts (its tab pressed and held)
  quick: () => [
    { label: "Merchant application", on: !el("appMode").classList.contains("hidden"), run: () => { switchMode("app"); window.scrollTo({ top: 0 }); } },
    { label: "Fill in a form by hand", run: () => {
      switchMode("app");
      const s = el("homeFormSelect");
      if (!workingRecord && s && s.offsetParent) { s.scrollIntoView({ block: "center" }); s.focus(); } else window.scrollTo({ top: 0 });
    } },
    { label: "Menu → Clover", on: !el("menuMode").classList.contains("hidden"), run: () => { switchMode("menu"); window.scrollTo({ top: 0 }); } },
    { label: "Past uploads & downloads", run: () => {
      switchMode("app");
      const h = el("historySection");
      if (h && !h.classList.contains("hidden")) h.scrollIntoView({ block: "start" }); else window.scrollTo({ top: 0 });
    } },
  ],
  // swipe down to refresh while something is in progress: the team's
  // history, the lists, the reading service (the form stays as it is)
  refresh: () => Promise.allSettled([healthy ? null : checkHealth(), renderHistory(), loadLists()]),
  // an application or menu in progress, or a signature being drawn: the site
  // holds a new version back until it's done (none of that is saved yet)
  busy: () => !!workingRecord || !!(appUploader && appUploader.pages.length) ||
    !!(menuUploader && menuUploader.pages.length) || menuItems.length > 0 ||
    !el("signModal").classList.contains("hidden"),
});
})();
