/* AppUpload jobs: photos go up one per request (each well under the
   request-size limit), a background function reads them, and the page
   collects the result.
   POST   ?            {kind:"app"|"menu", count}   -> {id}
   PUT    ?id=&n=&part=&parts=   one file (image or PDF), in pieces of up to
                       4 MB (a request can't be larger); its content-type
   GET    ?id=         -> {status} ... {status:"done", record|menu}
   DELETE ?id=         drop the job (the page does, once it has the result)
   Every call needs a signed-in company account, and a job is only visible to
   the account that made it. */
import { randomUUID } from "node:crypto";
import { json, requireUser, jobStore, readMeta, deleteJob, updateJSON, MAX_FILES, MAX_FILE_BYTES, MAX_PART_BYTES, JOB_TTL_MS, ID_RE, FILE_TYPES } from "../au/common.mjs";

const HOUR_MS = 60 * 60 * 1000, DAY_MS = 24 * HOUR_MS;
const PER_HOUR = 40, PER_DAY = 200;

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  const me = auth.user;
  const st = jobStore();
  const url = new URL(req.url);

  if (req.method === "POST") {
    let b = null;
    try { b = await req.json(); } catch (e) {}
    const kind = b && (b.kind === "app" || b.kind === "menu") ? b.kind : null;
    const count = Number(b && b.count);
    if (!kind) return json({ error: "Unknown upload type." }, 400);
    if (!Number.isInteger(count) || count < 1) return json({ error: "Please upload at least one image." }, 400);
    if (count > MAX_FILES) return json({ error: `Up to ${MAX_FILES} files.` }, 400);
    /* each read is billed by the AI service: a generous per-person cap keeps
       a runaway script (or a borrowed sign-in) from running up the bill */
    let over = false;
    try {
      await updateJSON(st, `quota/${me.id}`, (q) => {
        const now = Date.now();
        const t = (q && Array.isArray(q.t) ? q.t : []).filter((x) => now - x < DAY_MS);
        over = t.filter((x) => now - x < HOUR_MS).length >= PER_HOUR || t.length >= PER_DAY;
        if (over) return undefined;
        t.push(now);
        return { t };
      });
    } catch (e) {
      return json({ error: "The server is busy — please try again in a moment." }, 503);
    }
    if (over) return json({ error: "That’s a lot of reads in a short time — please try again a little later." }, 429);
    const id = randomUUID();
    await st.setJSON(`job/${id}/meta`, { owner: me.id, kind, count, created: Date.now(), status: "uploading" });
    return json({ id });
  }

  const id = url.searchParams.get("id") || "";
  if (!ID_RE.test(id)) return json({ error: "That upload has expired — please upload again." }, 404);
  const meta = await readMeta(st, id);
  if (!meta || meta.owner !== me.id) return json({ error: "That upload has expired — please upload again." }, 404);

  if (req.method === "PUT") {
    if (meta.status !== "uploading") return json({ error: "This upload is already being read." }, 409);
    const n = Number(url.searchParams.get("n"));
    const parts = Number(url.searchParams.get("parts") || 1), part = Number(url.searchParams.get("part") || 0);
    const maxParts = Math.ceil(MAX_FILE_BYTES / MAX_PART_BYTES);
    if (!Number.isInteger(n) || n < 0 || n >= meta.count) return json({ error: "Unexpected file." }, 400);
    if (!Number.isInteger(parts) || parts < 1 || parts > maxParts || !Number.isInteger(part) || part < 0 || part >= parts) {
      return json({ error: "File too large" }, 413);
    }
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!FILE_TYPES.has(type)) return json({ error: "Only images (JPEG, PNG, WebP, GIF) or PDF files are allowed." }, 415);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength) return json({ error: "That file was empty." }, 400);
    if (buf.byteLength > MAX_PART_BYTES) return json({ error: "File too large" }, 413);
    await st.set(`job/${id}/img/${n}/${part}`, buf, { metadata: { type, parts } });
    return json({ ok: true });
  }

  if (req.method === "GET") {
    if (meta.status === "done" || meta.status === "error") {
      /* repeatable, so an answer lost on a weak signal can be asked for
         again; the page deletes the job once it has it (au-cleanup sweeps
         anything left within the hour) */
      if (meta.status === "error") return json({ status: "error", error: meta.error || "Extraction failed.", code: meta.code || 500 });
      const result = await st.get(`job/${id}/result`, { type: "json" });
      if (!result) return json({ status: "error", error: "The result went missing — please try again.", code: 500 });
      return json({ status: "done", ...result });
    }
    if (Date.now() - meta.created > JOB_TTL_MS) {
      await deleteJob(st, id);
      return json({ error: "That upload has expired — please upload again." }, 404);
    }
    return json({ status: meta.status });
  }

  if (req.method === "DELETE") {
    await deleteJob(st, id);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed." }, 405);
};
