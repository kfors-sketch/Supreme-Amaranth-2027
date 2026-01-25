// /api/routes/admin.js
//
// Admin route module for the split router.
// This module *must* return true when it handles a request so /api/router.js
// does not fall through to router.legacy.js (which will report unknown-action).
//

import { kv } from "@vercel/kv";

// NOTE: We intentionally do NOT import adminAuth from legacy here, because
// projects vary. We validate using the same header your site already uses:
// Admin.tokenHeader() on the front-end typically sends "x-admin-token".
// If your site uses a different header, adjust TOKEN_HEADER below.
const TOKEN_HEADER = "x-admin-token";

// If you store your admin token in KV, set this key. If not, leave as-is.
// If this key does not exist in your project, the fallback password path below
// will still work.
const KV_ADMIN_TOKEN_KEY = "admin:token";

// Optional: allow ADMIN_PASSWORD fallback (matches your existing pattern).
const ADMIN_PASSWORD_ENV = process.env.ADMIN_PASSWORD || "";

// Minimal auth: accept either a KV token match OR (if present) a password header.
async function requireAdmin(req) {
  const token = (req.headers.get(TOKEN_HEADER) || "").trim();
  if (token) {
    const expected = (await kv.get(KV_ADMIN_TOKEN_KEY)) || "";
    if (expected && token === expected) return;
    // If KV key isn't set, still allow token to act as password (common during setup)
    if (!expected && ADMIN_PASSWORD_ENV && token === ADMIN_PASSWORD_ENV) return;
  }

  // Also accept a password in JSON body via "password" for login-style calls
  // (not used for purge, but keeps behavior flexible)
  throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
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
    if (action === "admin_purge_addons") {
      await requireAdmin(req);

      const ids = body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ ok: false, error: "Missing ids[]" });
        return true;
      }

      // YOY/year bucket coverage
      const years = ["2025", "2026", "2027", "2028"];

      for (const id of ids) {
        await kv.del(`itemcfg:${id}`);

        await kv.srem("itemcfg:index:addons", id);
        await kv.srem("itemcfg:index:all", id);

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

    return false;
  } catch (e) {
    const status = e?.statusCode || 500;
    res.status(status).json({
      ok: false,
      error: e?.message ? String(e.message) : String(e),
      requestId: res?.locals?.requestId,
    });
    return true;
  }
}
