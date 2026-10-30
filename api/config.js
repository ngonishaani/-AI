/**
 * Public (non-secret) client config for the site WhatsApp CTA.
 */

const { publicWhatsAppLink } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const wa = publicWhatsAppLink();
  return res.status(200).json({
    mall: "Trade Square Mall",
    chatEnabled: true,
    geminiEnabled: Boolean(process.env.GEMINI_API_KEY),
    whatsapp: wa,
  });
};
