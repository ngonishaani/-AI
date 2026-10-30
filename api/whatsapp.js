/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  /api/whatsapp  — hub challenge verification
 * POST /api/whatsapp  — inbound messages → Gemini (shop directory) → reply
 *
 * Required env:
 *   WHATSAPP_VERIFY_TOKEN
 *   WHATSAPP_TOKEN (or WHATSAPP_ACCESS_TOKEN)
 *   WHATSAPP_PHONE_NUMBER_ID
 *   GEMINI_API_KEY
 */

const { generateMallReply } = require("../lib/gemini");
const {
  sendWhatsAppText,
  extractInboundMessages,
} = require("../lib/whatsapp");

// Deduplicate Meta retries within this warm instance
const recentIds = new Map();
function seenRecently(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of recentIds) {
    if (now - t > 5 * 60 * 1000) recentIds.delete(k);
  }
  if (recentIds.has(id)) return true;
  recentIds.set(id, now);
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verify = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && verify && token === verify) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Acknowledge immediately; Meta retries on slow responses
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  try {
    const messages = extractInboundMessages(body);
    for (const msg of messages) {
      if (seenRecently(msg.id)) continue;
      try {
        const reply = await generateMallReply(msg.text);
        await sendWhatsAppText(msg.from, reply);
      } catch (err) {
        console.error("whatsapp reply failed", err?.message || err);
        try {
          await sendWhatsAppText(
            msg.from,
            "Sorry — our assistant is briefly unavailable. Please try again in a moment, or visit https://tradesquaremall.com"
          );
        } catch (_) {
          /* ignore secondary failure */
        }
      }
    }
  } catch (err) {
    console.error("whatsapp webhook error", err?.message || err);
  }

  return res.status(200).json({ ok: true });
};
