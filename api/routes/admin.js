// /api/routes/admin.js

import { kv } from "@vercel/kv";

// Use the SAME admin auth helper your legacy router uses.
// If your project uses a different name, change it here.
import { adminAuth } from "../router.legacy.js";

/**
 * Admin GET handler
 * (nothing handled here yet)
 */
export async function handleAdminGET(_req, _res) {
  return false;
}

/**
 * Admin POST handler
 */
export async function handleAdminPOST(req, res) {
  let body;
  try {
    body = await req.json();
  } catch {
    res.status(400).json({ ok: false, error: "invalid-json" });
    return true;
  }

  const { action } = body || {};
  if (!action) return false;

  /* ========================================================================
   * ONE-TIME CLEANUP: PURGE ACCIDENTAL ADDONS (banquets added to addons)
   * ====================================================================== */
  if (action === "admin_purge_addons") {
    adminAuth(req); // throws if unauthorized

    const { ids } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ ok: false, error: "Missing ids[]" });
      return true;
    }

    // Covers YOY / year buckets
    const years = ["2025", "2026", "2027", "2028"];

    for (const id of ids) {
      // delete the item itself
      await kv.del(`itemcfg:${id}`);

      // global indexes
      await kv.srem("itemcfg:index:addons", id);
      await kv.srem("itemcfg:index:all", id);

      // year / YOY indexes
      for (const y of years) {
        await kv.srem(`itemcfg:index:addons:${y}`, id);
        await kv.srem(`itemcfg:index:all:${y}`, id);
        await kv.srem(`itemcfg:index:${y}:addons`, id);
        await kv.srem(`itemcfg:index:${y}:all`, id);
      }
    }

    res.status(200).json({
      ok: true,
      purged: ids.length,
      ids
    });
    return true;
  }

  // not handled here
  return false;
}
