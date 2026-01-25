// /api/routes/admin.js
import { kv } from "@vercel/kv";

export async function handleAdminGET(_req, _res) {
  return false;
}

export async function handleAdminPOST(req, res) {
  try {
    // Only handle JSON POSTs with an action
    let body = null;
    try {
      body = await req.json();
    } catch {
      // not JSON; let legacy handle it
      return false;
    }

    const action = body?.action;
    if (!action) return false;

    // ONE-TIME CLEANUP: remove accidentally-added "banquets" from addons
    if (action === "admin_purge_addons") {
      // TEMP: no admin auth here to avoid crashes from missing imports.
      // Use it once, verify cleanup, then remove this action or revert this file.

      const ids = body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ ok: false, error: "Missing ids[]" });
        return true;
      }

      // YOY/year bucket coverage (adjust as needed)
      const years = ["2025", "2026", "2027", "2028"];

      for (const id of ids) {
        // delete the item record
        await kv.del(`itemcfg:${id}`);

        // remove from global indexes
        await kv.srem("itemcfg:index:addons", id);
        await kv.srem("itemcfg:index:all", id);

        // remove from likely year/Yoy indexes
        for (const y of years) {
          await kv.srem(`itemcfg:index:addons:${y}`, id);
          await kv.srem(`itemcfg:index:all:${y}`, id);
          await kv.srem(`itemcfg:index:${y}:addons`, id);
          await kv.srem(`itemcfg:index:${y}:all`, id);
        }
      }

      res.status(200).json({ ok: true, purged: ids.length, ids });
      return true;
    }

    // not handled here
    return false;
  } catch (e) {
    // Prevent Vercel generic "A server error..." by always returning JSON
    res.status(500).json({
      ok: false,
      error: String(e?.message || e),
      stack: String(e?.stack || ""),
    });
    return true;
  }
}
