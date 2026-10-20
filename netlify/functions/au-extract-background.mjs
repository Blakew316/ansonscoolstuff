/* AppUpload: reads a job's photos and PDFs with Claude (a merchant
   application with its check and license, or a menu) — AppUpload's
   /api/extract and /api/menu/extract. Runs in the background (up to 15
   minutes) since a large handwritten packet can take longer than a normal
   request may; the page polls au-job for the result.
   POST /.netlify/functions/au-extract-background  {id}  (the job owner's sign-in) */
import { randomUUID } from "node:crypto";
import { requireUser, jobStore, ID_RE, MAX_FILE_BYTES } from "../au/common.mjs";
import { extractFromImages } from "../au/extract.mjs";
import { extractMenu } from "../au/menu.mjs";

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return;
  let b = null;
  try { b = await req.json(); } catch (e) {}
  const id = b && typeof b.id === "string" ? b.id : "";
  if (!ID_RE.test(id)) return;
  const st = jobStore();
  const key = `job/${id}/meta`;
  const cur = await st.getWithMetadata(key, { type: "json" });
  const meta = cur && cur.data;
  if (!meta || meta.owner !== auth.user.id || meta.status !== "uploading" || !cur.etag) return;
  /* only one run per job: the switch to "running" lands only on the job as it
     was read, so a second trigger (or a cancel in between) stops here */
  const base = { ...meta, run: randomUUID() };
  const running = await st.setJSON(key, { ...base, status: "running", started: Date.now() }, { onlyIfMatch: cur.etag });
  if (!running || !running.modified || !running.etag) return;
  /* the page can cancel the job (DELETE) while it's being read: the final
     writes only land on the job as this run left it, so a cancelled job
     never comes back */
  const etag = running.etag;
  const finish = async (m) => {
    for (let i = 0; i < 3; i++) {
      let w = null;
      try { w = await st.setJSON(key, m, { onlyIfMatch: etag }); } catch (e) {}
      if (w && w.modified === false) return false;          // cancelled meanwhile
      if (w && w.modified && w.etag) return true;
      /* the write's outcome is unknown (a server error): look before retrying */
      let now = null;
      try { now = await st.getWithMetadata(key, { type: "json" }); } catch (e) { continue; }
      if (!now || !now.data) return false;
      if (now.data.run === base.run && now.data.status === m.status) return true;
      if (now.etag !== etag) return false;
    }
    return false;
  };
  try {
    /* each file arrives in one or more pieces: put them back together */
    const missing = () => Object.assign(new Error("A photo didn’t finish uploading — please try again."), { statusCode: 400 });
    const images = [];
    for (let n = 0; n < meta.count; n++) {
      const first = await st.getWithMetadata(`job/${id}/img/${n}/0`, { type: "arrayBuffer" });
      if (!first || !first.data) throw missing();
      const type = (first.metadata && first.metadata.type) || "image/jpeg";
      const parts = Number(first.metadata && first.metadata.parts) || 1;
      const chunks = [Buffer.from(first.data)];
      for (let k = 1; k < parts; k++) {
        const r = await st.get(`job/${id}/img/${n}/${k}`, { type: "arrayBuffer" });
        if (!r) throw missing();
        chunks.push(Buffer.from(r));
      }
      const buf = Buffer.concat(chunks);
      if (buf.length > MAX_FILE_BYTES) throw Object.assign(new Error("File too large"), { statusCode: 400 });
      images.push({ data: buf.toString("base64"), mediaType: type });
    }
    const result = meta.kind === "menu" ? { menu: await extractMenu(images) } : { record: await extractFromImages(images) };
    await st.setJSON(`job/${id}/result`, result);
    if (!(await finish({ ...base, status: "done", finished: Date.now() }))) {
      await st.delete(`job/${id}/result`).catch(() => {});   // cancelled meanwhile: nothing is kept
    }
  } catch (e) {
    console.error("Extraction failed:", e && e.message);
    await finish({ ...base, status: "error", error: (e && e.message) || "Extraction failed.", code: (e && e.statusCode) || 500 }).catch(() => {});
  } finally {
    /* the photos are never kept past the read */
    try {
      const { blobs } = await st.list({ prefix: `job/${id}/img/` });
      await Promise.all(blobs.map((b) => st.delete(b.key).catch(() => {})));
    } catch (e) {}
  }
};
