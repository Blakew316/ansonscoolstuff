/* AppUpload: equipment models from the pricing matrix for the Purchase
   Order's equipment dropdown — AppUpload's /api/equipment.
   GET /.netlify/functions/au-equipment -> { models } */
import { json, requireUser } from "../au/common.mjs";
import { MODELS } from "../au/pricing.mjs";

export default async (req) => {
  const auth = await requireUser(req);
  if (auth.res) return auth.res;
  return json({ models: MODELS });
};
