// /api/supplies-request-price.js
import { Resend } from "resend";

const json = (res, status, obj) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
};

const esc = (s) => String(s || "").replace(/[<>&"]/g, c => (
  c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;"
));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM || "Amaranth <no-reply@yourdomain.com>";

  const TO_SUPREME_SECRETARY = process.env.SUPREME_SECRETARY_EMAIL; // required
  const CC_ME = process.env.SUPPLIES_PRICE_CC || "kfors@verizon.net"; // you

  if (!RESEND_API_KEY) return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY" });
  if (!TO_SUPREME_SECRETARY) return json(res, 500, { ok: false, error: "Missing SUPREME_SECRETARY_EMAIL" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return json(res, 400, { ok: false, error: "Invalid JSON body" });
  }

  const item = body?.item || {};
  const purchaser = body?.purchaser || {};
  const notes = body?.notes || "";

  const itemName = item?.name || "";
  const category = item?.category || "";
  const itemId = item?.id || "";

  const name = purchaser?.name || "";
  const email = purchaser?.email || "";
  const phone = purchaser?.phone || "";
  const courtName = purchaser?.courtName || "";
  const courtNumber = purchaser?.courtNumber || "";

  // Basic validation (keep it simple but effective)
  if (!itemName || !category || !itemId) {
    return json(res, 400, { ok: false, error: "Missing item info" });
  }
  if (!name || !email || !phone || !courtName || !courtNumber) {
    return json(res, 400, { ok: false, error: "Missing purchaser info" });
  }

  const subject = `Supplies Price Request — ${itemName} — Court #${courtNumber}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4">
      <h2 style="margin:0 0 12px">Supplies Price Request</h2>

      <h3 style="margin:14px 0 6px">Item</h3>
      <div><b>Category:</b> ${esc(category)}</div>
      <div><b>Item:</b> ${esc(itemName)}</div>
      <div><b>Item ID:</b> ${esc(itemId)}</div>

      <h3 style="margin:14px 0 6px">Purchaser</h3>
      <div><b>Name:</b> ${esc(name)}</div>
      <div><b>Email:</b> ${esc(email)}</div>
      <div><b>Phone:</b> ${esc(phone)}</div>

      <h3 style="margin:14px 0 6px">Court</h3>
      <div><b>Court Name:</b> ${esc(courtName)}</div>
      <div><b>Court #:</b> ${esc(courtNumber)}</div>

      ${notes ? `<h3 style="margin:14px 0 6px">Notes</h3><div>${esc(notes)}</div>` : ``}
    </div>
  `;

  try {
    const resend = new Resend(RESEND_API_KEY);

    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: [TO_SUPREME_SECRETARY],
      cc: [CC_ME],
      reply_to: email, // so Supreme Secretary can reply directly to purchaser
      subject,
      html
    });

    return json(res, 200, { ok: true, id: result?.id || null });
  } catch (err) {
    return json(res, 500, { ok: false, error: String(err?.message || err) });
  }
}
