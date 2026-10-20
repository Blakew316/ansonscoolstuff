/* Netlify's build step: puts together the folder the site is served from.
   It holds everything in the repo except what only the server uses — the
   functions and their data (AppUpload's form templates, the merchant
   directory), installed packages — and the project's own files, so none of
   that can ever be fetched from the site. The functions are bundled from the
   repo itself, as before.

   Then it stamps the deploy: a fingerprint of every file that goes out is
   written into sw.js and index.html (their BUILD = "dev"), so any change to
   the site is a new service worker and every open app picks it up. */
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const OUT = "_site";
const SKIP = new Set([OUT, "netlify", "node_modules", "package.json", "package-lock.json", "netlify.toml", "README.md"]);

rmSync(OUT, { recursive: true, force: true });
for (const name of readdirSync(".")) {
  if (name.startsWith(".") || SKIP.has(name)) continue;
  cpSync(name, OUT + "/" + name, { recursive: true });
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = dir + "/" + name;
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
};
walk(OUT);
const hash = createHash("sha256");
for (const p of files) { hash.update(p.slice(OUT.length) + "\0"); hash.update(readFileSync(p)); hash.update("\0"); }
const build = hash.digest("hex").slice(0, 12);
for (const [file, re] of [["sw.js", /const BUILD = "dev";/g], ["index.html", /const BUILD="dev";/g]]) {
  const p = OUT + "/" + file, s = readFileSync(p, "utf8");
  const n = (s.match(re) || []).length;
  if (n !== 1) throw new Error(`publish: expected one BUILD placeholder in ${file}, found ${n}`);
  writeFileSync(p, s.replace(re, m => m.replace('"dev"', `"${build}"`)));
}
console.log("publish: " + readdirSync(OUT).join(", ") + " — build " + build);
