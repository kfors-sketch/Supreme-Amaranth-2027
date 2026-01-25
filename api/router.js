// /api/router.js (split)
// Thin dispatcher: route modules first, fall back to legacy handler.
// This keeps the public endpoint stable while letting us migrate sections safely.

import { legacyHandler } from "./router.legacy.js";

import { handleVisitsGET, handleVisitsPOST } from "./routes/visits.js";
import { handleAdminGET, handleAdminPOST } from "./routes/admin.js";
import { errResponse } from "./lib/http.js";

export default async function handler(req, res) {
  // Order matters: small, low-risk modules first; legacy last.
  try {
    if (req.method === "GET") {
      if (await handleVisitsGET(req, res)) return;
      if (await handleAdminGET(req, res)) return;
    } else if (req.method === "POST") {
      if (await handleVisitsPOST(req, res)) return;
      if (await handleAdminPOST(req, res)) return;
    }
  } catch (e) {
    // If a new module throws, fall back to legacy error handling.
    // (Legacy already formats REQ_ERR/REQ_OK with requestId.)
    console.error("[router] split-module threw; falling back to legacy", e);
  }

  return legacyHandler(req, res);
}
// ADMIN: PURGE BAD ADDONS (one-time use)
if (action === "admin_purge_addons") {
  adminAuth(req);

  const { ids } = body || {};
  if (!Array.isArray(ids) || !ids.length) {
    return REQ_ERR(res, "Missing addon ids");
  }

  for (const id of ids) {
    await kvDelSafe(`itemcfg:${id}`);
    await kvSremSafe("itemcfg:index:addons", id);
    await kvSremSafe("itemcfg:index:all", id);
  }

  return REQ_OK(res, {
    purged: ids.length,
    ids,
  });
}
