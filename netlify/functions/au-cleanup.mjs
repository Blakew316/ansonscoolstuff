/* AppUpload: a sweep every 15 minutes of anything a job left behind (a page
   closed mid-upload, a result never collected, a read cut off), so nothing
   outlives the hour. */
import { jobStore, JOB_TTL_MS } from "../au/common.mjs";

export default async () => {
  const st = jobStore();
  const { blobs } = await st.list({ prefix: "job/" });
  const byJob = new Map();
  for (const b of blobs) {
    const id = b.key.split("/")[1];
    if (!byJob.has(id)) byJob.set(id, []);
    byJob.get(id).push(b.key);
  }
  const now = Date.now();
  for (const [id, keys] of byJob) {
    let meta = null;
    try { meta = await st.get(`job/${id}/meta`, { type: "json" }); } catch (e) { continue; }   // couldn't look: next sweep
    if (meta && now - (meta.created || 0) < JOB_TTL_MS) continue;
    await Promise.all(keys.map((k) => st.delete(k).catch(() => {})));
  }
  /* per-person usage counts older than a day */
  const { blobs: quotas } = await st.list({ prefix: "quota/" });
  for (const b of quotas) {
    let q = null;
    try { q = await st.get(b.key, { type: "json" }); } catch (e) { continue; }
    const t = q && Array.isArray(q.t) ? q.t : [];
    if (!t.some((x) => now - x < 24 * 60 * 60 * 1000)) await st.delete(b.key).catch(() => {});
  }
};

export const config = { schedule: "*/15 * * * *" };
