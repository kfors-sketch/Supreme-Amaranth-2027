// /api/admin/finalize-router.js
// Handles finalizing completed checkout sessions into saved orders.

import { REQ_OK, REQ_ERR } from "./core.js";

export async function handleFinalizeRoute(req, res, ctx = {}) {
  const {
    url,
    type,
    action,
    body = {},
    requestId,
    getStripe,
    getEffectiveOrderChannel,
    saveOrderFromSession,
    ensureOrderIntegrityMarkers,
    sendPostOrderEmails,
    errResponse,
  } = ctx;

  if (req.method === "GET" && type === "finalize_order") {
    const sid = String(url.searchParams.get("sid") || "").trim();
    if (!sid) {
      REQ_ERR(res, 400, "missing-sid", { requestId });
      return true;
    }

    try {
      const orderChannel = await getEffectiveOrderChannel().catch(() => "test");
      const order = await saveOrderFromSession(
        { id: sid },
        { mode: orderChannel }
      );

      await ensureOrderIntegrityMarkers(order, requestId);
      await sendPostOrderEmails(order, requestId);

      REQ_OK(res, {
        requestId,
        ok: true,
        orderId: order.id,
        status: order.status || "paid",
      });
      return true;
    } catch (err) {
      errResponse(res, 500, "finalize-failed", req, err, { sid });
      return true;
    }
  }

  if (req.method === "POST" && action === "finalize_checkout") {
    try {
      const orderChannel = await getEffectiveOrderChannel().catch(() => "test");

      const stripe = await getStripe(orderChannel);
      if (!stripe) {
        REQ_ERR(res, 500, "stripe-not-configured", { requestId });
        return true;
      }

      const sid = String(body.sid || body.id || "").trim();
      if (!sid) {
        REQ_ERR(res, 400, "missing-sid", { requestId });
        return true;
      }

      const order = await saveOrderFromSession(
        { id: sid },
        { mode: orderChannel }
      );

      await ensureOrderIntegrityMarkers(order, requestId);
      await sendPostOrderEmails(order, requestId);

      REQ_OK(res, { requestId, ok: true, orderId: order.id });
      return true;
    } catch (e) {
      errResponse(res, 500, "finalize-checkout-failed", req, e);
      return true;
    }
  }

  return false;
}
