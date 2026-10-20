/* AppUpload status — AppUpload's /api/health: is extraction configured,
   with which model, and where the submission history lives.
   GET /.netlify/functions/au-health (signed-in company accounts) */
import { json, requireUser, OWNER_MODE } from "../au/common.mjs";
import { dbEnabled } from "../au/db.mjs";

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  return json({
    ok: true,
    ready: Boolean(process.env.ANTHROPIC_API_KEY) || process.env.TRANSCRIBE_MOCK === "1",
    mock: process.env.TRANSCRIBE_MOCK === "1",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    historyBackend: dbEnabled && !OWNER_MODE ? "supabase" : "local",   /* (no sign-in: kept in the browser) */
  });
};
