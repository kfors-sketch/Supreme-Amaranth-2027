// /api/router.js (split)
// Thin dispatcher: route modules first, fall back to legacy handler.
// This keeps the public endpoint stable while letting us migrate sections safely.

import { legacyHandler } from "./router.legacy.js";

import { handleVisitsGET, handleVisitsPOST } from "./routes/visits.js";
import { handleAdminGET, handleAdminPOST } from "./routes/admin.js";

export default async function handler(req, res) {
  // Order matters: small, low-risk modules first; legacy last.

  // ---- VISITS (must never kill page load) ----
  try {
    if (await handleVisitsGET(req, res)) return;
    if (await handleVisitsPOST(req, res)) return;
  } catch (e) {
    // swallow visit errors completely
    console.error("visit handler error (ignored):", e);
  }

  // ---- ADMIN ----
  try {
    if (await handleAdminGET(req, res)) return;
    if (await handleAdminPOST(req, res)) return;
  } catch (e) {
    return errResponse(res, 500, "admin-handler-failed", req, e);
  }

  // ---- LEGACY FALLBACK ----
  try {
    return legacyHandler(req, res);
  } catch (e) {
    return errResponse(res, 500, "router-failure", req, e);
  }
}
