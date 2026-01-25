// /api/routes/admin.js
//
// Admin route module for the split router.
//
// IMPORTANT:
// - Vercel/Next.js API routes use Node's IncomingMessage for req (no req.json()).
//   So we must read the raw body ourselves.
// - Return true when a request is handled so /api/router.js does NOT fall through
//   to router.legacy.js (which will return {"error":"unknown-action"}).
//

import { kv } from "@vercel/kv";
import { verifyAdminToken } from "../admin/security.js";

// Accept either:
// - Authorization: Bearer <token>   (matches legacy requireAdminAuth)
// - x-admin-token: <token>          (matches your front-end Admin.tokenHeader)
const TOKEN_HEADER = "x-admin-token";

const ADMIN_PASSWORD_ENV = (process.env.ADMIN_PASSWORD || "").trim();
const KV_ADMIN_TOKEN_KEY = "admin:token";

// -------------------- body helpers (Node req) --------------------
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buf = await readRawBody(req);
  const text = buf.toString("utf8") || "";
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const err = new Error("invalid-json");
    err.statusCode = 400;
    err.details = e?.message || String(e);
    throw err;
  }
}

// -------------------- admin auth --------------------
async function requireAdmin(req) {
  const headers = req?.headers || {};

  // 1) Bearer token (preferred; matches legacy)
  const rawAuth = headers.authorization || headers.Authorization || "";
  const auth = String(rawAuth || "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (!token) {
      const err = new Error("unauthorized");
      err.statusCode = 401;
      throw err;
    }

    const legacy = (process.env.REPORT_TOKEN || "").trim();
    if (legacy && token === legacy) return;

    try {
      const result = await verifyAdminToken(token);
      if (result?.ok) return;
    } catch (e) {
      // fall through
    }

    const err = new Error("unauthorized");
    err.statusCode = 401;
    throw err;
  }

  // 2) x-admin-token (front-end header)
  const token = String(headers[TOKEN_HEADER] || headers[TOKEN_HEADER.toLowerCase()] || "").trim();
  if (token) {
    const expected = (await kv.get(KV_ADMIN_TOKEN_KEY)) || "";
    if (expected && token === String(expected)) return;

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
    body = await readJsonBody(req);
  } catch (e) {
    // If it's invalid JSON, respond here; otherwise fall back.
    if (e?.statusCode === 400 && e?.message === "invalid-json") {
      res.status(400).json({ ok: false, error: "invalid-json", details: e?.details || "" });
      return true;
    }
    return false;
  }

  const action = body?.action;
  if (!action) return false;

  try {
    // Proof this module is live
    if (action === "admin_ping") {
      res.status(200).json({ ok: true, msg: "admin.js is live (node-body parser ok)" });
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

    return false;
  } catch (e) {
    const status = e?.statusCode || 500;
    res.status(status).json({ ok: false, error: String(e?.message || e) });
    return true;
  }
}
