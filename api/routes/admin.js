// /api/routes/admin.js
//
// Admin route module for the split router.
//
// IMPORTANT:
// - Return true when a request is handled so /api/router.js does NOT fall through
//   to router.legacy.js (which will return {"error":"unknown-action"}).
// - Keep this module low-risk: no dependencies on legacy router exports.
//

import { kv } from "@vercel/kv";

// Header name used by your front-end Admin.tokenHeader() helpers
const TOKEN_HEADER = "x-admin-token";

// Optional: allow a simple env password fallback (set in Vercel env vars).
// NOTE: rotate secrets if they were ever shared.
const ADMIN_PASSWORD_ENV = (process.env.ADMIN_PASSWORD || "").trim();

// Optional: if you store a long-lived token in KV, set it here.
const KV_ADMIN_TOKEN_KEY = "admin:token";

async function requireAdmin(req) {
  const token = (req.headers.get(TOKEN_HEADER) || "").trim();

  if (token) {
    // 1) Prefer a KV token if present
    const expected = (await kv.get(KV_ADMIN_TOKEN_KEY)) || "";
    if (expected && token === String(expected)) return;

    // 2) Fallback: allow env password match (useful during early setup)
    if (ADMIN_PASSWORD_ENV && token === ADMIN_PASSWORD_ENV) return;
  }

  const err = new Error("unauthorized");
  err.statusCode = 401;
  throw err;
}

export async function handleAdminGET(_req, _res) {
  return false;
}

export async function handleAdminPOST(req, res) {
  let body;
  try {
    body = await req.json();
  } catch {
    return false; // not JSON, let legacy handle
  }

  const action = body?.action;
  if (!action) return false;

  try {
    // Quick proof that THIS file is live
    if (action === "admin_ping") {
      // No auth needed; it's harmless and helps verify routing.
      res.status(200).json({ ok: true, msg: "admin.js is live" });
      return true;
    }

    // One-time cleanup: remove accidental "banquets" created as addons
    if (action === "admin_purge_addons") {
      await requireAdmin(req);

      const ids = body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ ok: false, error: "Missing ids[]" });
        return true;
      }

      // YOY/year bucket coverage (safe sweep)
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

    // Not handled here
    return false;
  } catch (e) {
    const status = e?.statusCode || 500;
    res.status(status).json({
      ok: false,
      error: String(e?.message || e),
    });
    return true;
  }
}
