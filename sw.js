/* Ice Kannon Route — offline service worker. Keeps the app shell and every
   section (Routes, Appointments, AppUpload) on the device so the
   app opens instantly and works offline; the site's functions are never
   cached here. */
const VER = "wp-routes-v50";         /* the same as APP_VER in index.html */
/* every deploy's own fingerprint, written in by netlify/publish.mjs (so any
   change to the site is a new service worker, and open apps update) */
const BUILD = "dev";
const SHELL = BUILD === "dev" ? VER : VER + "." + BUILD;
const MOD_V = "32";                /* the same as MOD_V in index.html */
/* the sections' vendor libraries never change in place (a new version gets a
   new name), so they're kept across versions instead of downloaded again */
const VENDOR = "wp-vendor-1";
const CORE = [
  "./",
  "manifest.webmanifest",
  "manifest-dark.webmanifest",
  "img/logo-light.webp",
  "img/logo-dark.webp",
  "img/pdf-logo.jpg",
  "icons/ice-kannon-v2-180.png",
  "icons/ice-kannon-32.png",
  "icons/ice-kannon-v2-192.png",
  "icons/ice-kannon-v2-512.png",
  "icons/ice-kannon-v2-mask-512.png",
];
const CRITICAL = ["./", "manifest.webmanifest", "manifest-dark.webmanifest",
  "img/logo-light.webp", "img/logo-dark.webp"];
/* the other sections, saved up front as the stand-alone calendar did */
const MODULE_FILES = [
  "apps/appointments/view.html", "apps/appointments/app.css", "apps/appointments/app.js",
  "apps/appupload/view.html", "apps/appupload/app.css", "apps/appupload/app.js",
].map(u => u + "?v=" + MOD_V + (BUILD === "dev" ? "" : "." + BUILD));   /* (as the page names them) */
const VENDOR_FILES = ["apps/appupload/vendor/pdf-lib.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(async c => {
        /* the shell must cache completely or this install fails and the
           previous version keeps serving; icons and the PDF logo are best-effort */
        await Promise.all(CRITICAL.map(u => c.add(new Request(u, { cache: "no-cache" }))));
        await Promise.allSettled(CORE.filter(u => !CRITICAL.includes(u)).map(u => c.add(u)));
        await Promise.allSettled(MODULE_FILES.map(u => c.add(new Request(u, { cache: "no-cache" }))));
        const v = await caches.open(VENDOR);
        await Promise.allSettled(VENDOR_FILES.map(async u => { if (!(await v.match(u))) await v.add(u); }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    const replaced = ks.some(k => k !== SHELL && k !== VENDOR);
    await Promise.all(ks.filter(k => k !== SHELL && k !== VENDOR).map(k => caches.delete(k)));
    await self.clients.claim();
    /* pages still showing the version this one replaces switch over (by
       themselves if nothing has been touched yet, otherwise they offer a
       Reload); a page already on this version ignores it */
    if (replaced) for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage({ type: "updated", ver: SHELL });
  })());
});

/* a page can ask which version this is (after a new one takes over) */
self.addEventListener("message", e => {
  if (e.data && e.data.type === "ver" && e.source) e.source.postMessage({ type: "ver", ver: SHELL });
});

/* tell the page that just opened from the saved shell that a newer one has
   been saved, so it can switch over (or offer to) */
async function announceUpdate(clientId) {
  let c = clientId ? await self.clients.get(clientId) : null;
  if (!c && clientId) {
    await new Promise(r => setTimeout(r, 1500));
    c = await self.clients.get(clientId);
  }
  /* the page that was given the older copy is gone: whatever replaced it went
     through this same check itself (only without resultingClientId, say all) */
  const targets = c ? [c] : clientId ? [] : await self.clients.matchAll({ type: "window" });
  for (const t of targets) t.postMessage({ type: "updated" });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* never intercept API traffic or other origins (fonts) — caching
     those would serve stale prospect lists */
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/.netlify/functions/")) return;
  /* videos stream straight from the network, never into the device's cache */
  if (/\.(mp4|m4v|mov|webm)$/i.test(url.pathname)) return;

  /* the app shell: the newest version whenever the network answers within a
     few seconds, so a deploy shows up the next time the app is opened; the
     copy saved on the device when it doesn't (offline, a weak signal), so
     the app still opens — and then it switches over once the new one lands.
     The site's own login (the team's Netlify login, a redirect to it or its
     401/403) is always shown, never covered up with the saved copy: behind
     it, nothing new could ever arrive. */
  if (req.mode === "navigate") {
    if (!/\/(index\.html)?$/.test(url.pathname)) return;
    const cachedP = caches.open(SHELL).then(c => c.match("./"));
    /* (what this page would be given from the device, read before it's handed over) */
    const savedTextP = cachedP.then(r => r ? r.clone().text() : null, () => null);
    /* an error page is shown when it's all there is, but never saved */
    const netP = fetch(req)
      .then(r => ({ page: r, store: r.ok && !r.redirected ? r.clone() : null,
        login: r.type === "opaqueredirect" || r.redirected || r.status === 401 || r.status === 403 }), () => null);
    let servedSaved = false;
    e.respondWith((async () => {
      const n = await Promise.race([netP, new Promise(r => setTimeout(() => r("slow"), 3000))]);
      if (n && n !== "slow" && (n.store || n.login)) return n.page;
      const cached = await cachedP;
      if (cached) { servedSaved = true; return cached; }
      const m = n === "slow" ? await netP : n;
      return m ? m.page : Response.error();
    })());
    e.waitUntil((async () => {
      const [was, n] = await Promise.all([savedTextP, netP]);
      if (!n || !n.store) return;
      const c = await caches.open(SHELL);
      const now = await n.store.clone().text();
      await c.put("./", n.store);
      if (servedSaved && was !== now) await announceUpdate(e.resultingClientId);
    })().catch(() => {}));
    return;
  }

  /* a section's own files: each is versioned (?v=) or a vendor library, so a
     saved copy is always current and is used as is, with no re-download */
  if (url.pathname.startsWith("/apps/") && (url.searchParams.has("v") || url.pathname.includes("/vendor/"))) {
    const name = url.pathname.includes("/vendor/") ? VENDOR : SHELL;
    e.respondWith((async () => {
      const c = await caches.open(name);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.status === 200) {
        const put = c.put(req, r.clone()).catch(() => {});
        try { e.waitUntil(put); } catch (err) { /* already settled: the put still runs */ }
      }
      return r;
    })());
    return;
  }

  /* everything else (images, icons): cache first,
     refreshed in the background */
  const hit = caches.match(req);
  const net = fetch(req).then(async r => {
    if (r.status === 200) await (await caches.open(SHELL)).put(req, r.clone());
    return r;
  });
  e.respondWith(hit.then(m => m || net));
  e.waitUntil(net.then(() => {}, () => {}));
});
