/* AppUpload: the submission history. On this site it's kept in the browser
   (au-health says "local"), so there's nothing to serve here. */
import { json, requireUser } from "../au/common.mjs";

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  return json({ error: "On this site the history is kept in the browser." }, 404);
};
