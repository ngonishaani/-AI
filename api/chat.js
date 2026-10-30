/**
 * Web chat endpoint — same Gemini + shop directory brain as WhatsApp.
 * POST { "message": "..." } → { "reply": "..." }
 */

const { generateMallReply } = require("../lib/gemini");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body =
    typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const message = body.message || body.text || "";

  try {
    const reply = await generateMallReply(message);
    return res.status(200).json({
      reply,
      engine: process.env.GEMINI_API_KEY ? "gemini" : "directory",
    });
  } catch (err) {
    console.error("chat error", err?.message || err);
    return res.status(502).json({
      error: "Could not generate a reply.",
      detail: err?.message || String(err),
    });
  }
};
