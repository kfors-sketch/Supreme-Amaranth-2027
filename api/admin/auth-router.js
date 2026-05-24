import {
  resend,
  RESEND_FROM,
  REPLY_TO,
  REQ_OK,
  REQ_ERR,
  sendWithRetry,
  recordMailLog,
} from "./core.js";

import { handleAdminLogin } from "./security.js";

function getUrl(req) {
  const host = req?.headers?.host || req?.headers?.["host"] || "localhost";
  return new URL(req.url, `http://${host}`);
}

export async function handleAuthRoute(req, res, ctx = {}) {
  const { action, body = {}, requestId, errResponse } = ctx;

  if (req.method !== "POST") return false;

  if (action === "admin_login") {
    try {
      const ip =
        req.headers["x-forwarded-for"] ||
        req.headers["x-real-ip"] ||
        req.socket?.remoteAddress ||
        "";
      const ua = req.headers["user-agent"] || "";

      console.log("[router] admin_login called", { ip, ua, hasBody: !!body });

      const result = await handleAdminLogin({
        password: String(body.password || ""),
        ip,
        userAgent: ua,
      });

      console.log("[router] admin_login result", result);

      if (result.ok) return REQ_OK(res, { requestId, ...result });

      const status =
        result.error === "invalid_password" || result.error === "locked_out"
          ? 401
          : 500;

      const errCode = result.error || "login-failed";
      return REQ_ERR(res, status, errCode, { requestId, ...result });
    } catch (e) {
      return errResponse(res, 500, "login-failed", req, e);
    }
  }

  if (action === "test_resend") {
    if (!resend) return REQ_ERR(res, 500, "resend-not-configured", { requestId });

    const urlObj = getUrl(req);
    const bodyTo = (body && body.to) || urlObj.searchParams.get("to") || "";
    const fallbackAdmin =
      (process.env.REPORTS_BCC || process.env.REPORTS_CC || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)[0] || "";
    const to = (bodyTo || fallbackAdmin).trim();
    if (!to) return REQ_ERR(res, 400, "missing-to", { requestId });

    const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif">
      <h2>Resend test OK</h2>
      <p>Time: ${new Date().toISOString()}</p>
      <p>From: ${RESEND_FROM || ""}</p>
      <p>requestId: ${String(requestId).replace(/</g, "&lt;")}</p>
    </div>`;

    const payload = {
      from: RESEND_FROM || "onboarding@resend.dev",
      to: [to],
      subject: "Supreme Council test email",
      html,
      reply_to: REPLY_TO || undefined,
    };

    const retry = await sendWithRetry(() => resend.emails.send(payload), "manual-test");

    if (retry.ok) {
      const sendResult = retry.result;
      await recordMailLog({
        ts: Date.now(),
        from: payload.from,
        to: [to],
        subject: payload.subject,
        resultId: sendResult?.id || null,
        kind: "manual-test",
        status: "queued",
      });
      return REQ_OK(res, {
        requestId,
        ok: true,
        id: sendResult?.id || null,
        to,
      });
    }

    const err = retry.error;
    await recordMailLog({
      ts: Date.now(),
      from: payload.from,
      to: [to],
      subject: payload.subject,
      resultId: null,
      kind: "manual-test",
      status: "error",
      error: String(err?.message || err),
    });
    return errResponse(res, 500, "resend-send-failed", req, err);
  }

  return false;
}
