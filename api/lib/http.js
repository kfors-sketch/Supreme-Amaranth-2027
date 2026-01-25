// /api/lib/http.js
import { REQ_ERR } from "../admin/core.js";

function getRequestId(req) {
  return (
    req?.headers?.["x-vercel-id"] ||
    req?.headers?.["x-request-id"] ||
    `local-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
  );
}

function toSafeError(err) {
  const e = err || {};
  const name = String(e.name || "Error");
  const message = String(e.message || e.toString?.() || "Unknown error");

  const stripe = {};
  if (e.type) stripe.type = String(e.type);
  if (e.code) stripe.code = String(e.code);
  if (e.param) stripe.param = String(e.param);
  if (e.decline_code) stripe.decline_code = String(e.decline_code);
  if (e.statusCode || e.status_code)
    stripe.status = Number(e.statusCode || e.status_code);

  const safe = {
    name,
    message,
    stackTop: typeof e.stack === "string" ? e.stack.split("\n")[0] : "",
  };

  if (Object.keys(stripe).length) safe.stripe = stripe;
  return safe;
}

function errResponse(res, status, code, req, err, extra = {}) {
  const requestId = getRequestId(req);
  const safe = toSafeError(err);
  console.error(`[router] ${code} requestId=${requestId}`, err);
  return REQ_ERR(res, status, code, {
    requestId,
    error: safe,
    ...extra,
  });
}

// ============================================================================
// RAW BODY HELPERS (required for Stripe webhook signature verification)
// ============================================================================
async function readRawBody(req) {
  if (req._rawBodyBuffer) return req._rawBodyBuffer;

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  req._rawBodyBuffer = buf;
  return buf;
}

async function readJsonBody(req) {
  const buf = await readRawBody(req);
  const text = buf.toString("utf8") || "";
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON body: ${e?.message || e}`);
  }
}


// ============================================================================
// URL helper
// - Normalizes req.url into a full URL object.
// - Works in Vercel Node/Serverless where req.url is typically a path + query.
// ============================================================================
function getUrl(req) {
  const raw = (req && req.url) ? String(req.url) : "/";
  const host =
    (req && req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) ||
    "localhost";
  const proto =
    (req && req.headers && (req.headers["x-forwarded-proto"] || req.headers["x-forwarded-protocol"])) ||
    "https";
  try {
    return new URL(raw, `${proto}://${host}`);
  } catch {
    // Fallback: strip anything weird
    return new URL("/", `${proto}://${host}`);
  }
}


// ---- Admin auth helper ----


export {
  getRequestId,
  toSafeError,
  errResponse,
  readRawBody,
  readJsonBody,
  getUrl,
};
