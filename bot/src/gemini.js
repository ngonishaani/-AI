import {
  buildDirectoryContext,
  findPlace,
  HOURS,
  SHOPS,
  DINING,
  EVENTS,
  MALL,
  AMENITIES,
} from "./shop-directory.js";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-flash-latest",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

function looksShona(text) {
  const t = String(text || "").toLowerCase();
  return /\b(mhoro|masikati|manheru|makadii|ndinoda|ndiri|zvakanaka|tatenda|ndatenda|handizive|ko|here|ndipei|ndapota|shops?\s+dziripi|nguva|kuvhura|kuvhara|chii|pane|sei)\b/i.test(
    t
  );
}

function directoryFallbackReply(userText) {
  const q = String(userText || "").toLowerCase();
  const shona = looksShona(userText);

  if (!q.trim()) {
    return shona
      ? `Mhoro! Ndiri assistant we${MALL.name} ku${MALL.city}. Mundibvunze nezve shops, dining, nguva yekuvhura, kana space yekutengesa.`
      : `Hi — I’m the Trade Square Mall assistant in Kwekwe. Ask me about shops, dining, hours, events, or leasing space.`;
  }

  if (
    /\b(hi|hello|hey|good (morning|afternoon|evening)|howdy|mhoro|masikati|manheru|makadii)\b/.test(
      q
    )
  ) {
    return shona
      ? `Mhoro zvakanaka 😊 Tikugamuchira ku${MALL.name}, ${MALL.city}. Mundibvunze nezve shops, dining, nguva, events, kana shop space.`
      : `Hi, welcome to ${MALL.name} in ${MALL.city} 😊 Ask me about shops, dining, hours, events, or leasing — English or Shona is fine.`;
  }

  if (
    /\b(hours?|open(ing)?|clos(e|ing)|nguva|kuvhura|kuvhara)\b/.test(q)
  ) {
    const lines = HOURS.map((h) => `• ${h.days}: ${h.text}`).join("\n");
    return shona
      ? `Nguva yekuvhura ye mall:\n${lines}\n\nMall hours above — come through anytime we’re open.`
      : `Mall hours:\n${lines}`;
  }

  if (/\b(where|address|location|maps?|directions?|kupi|kwakirwa)\b/.test(q)) {
    return shona
      ? `${MALL.name} iri ku${MALL.city}, Zimbabwe.\nMap: ${MALL.mapsUrl}`
      : `${MALL.address}\nMap: ${MALL.mapsUrl}`;
  }

  if (/\b(events?|official opening)\b/.test(q)) {
    return EVENTS.map(
      (e) => `${e.title} — ${e.date} (${e.time}) at ${e.place}. ${e.summary}`
    ).join("\n");
  }

  if (/\b(amenities|parking|toilets?|power|solar|security|boreholes?)\b/.test(q)) {
    return AMENITIES.map((a) => `• ${a.title}: ${a.text}`).join("\n");
  }

  if (/\b(dine|dining|eat|food|lounge|cocktail|nightlife|bars?|chikafu)\b/.test(q)) {
    return (
      (shona ? "Dine & nightlife (rooftop):\n" : "Dine & nightlife:\n") +
      DINING.map((d) => `• ${d.name} (${d.level}) — ${d.summary}`).join("\n")
    );
  }

  if (
    /\b(shops?|stores?|directory|tenants?|leasing|lease|spaces?|sqm|grooming|salons?|barbers?|clothing|pets?|cosmetics?|training|ground floor|level\s*[12]|rooftop|zvitoro|kutengesa)\b/.test(
      q
    )
  ) {
    let list = [];
    if (/\bground floor\b/.test(q)) {
      list = SHOPS.filter((s) => /ground/i.test(s.level));
    } else if (/\blevel\s*1\b/.test(q)) {
      list = SHOPS.filter((s) => /level 1/i.test(s.level));
    } else if (/\blevel\s*2\b/.test(q)) {
      list = SHOPS.filter((s) => /level 2/i.test(s.level));
    } else if (/\brooftop\b/.test(q)) {
      list = findPlace(userText);
      if (!list.length) list = DINING.filter((s) => /rooftop/i.test(s.level));
    } else {
      list = findPlace(userText);
    }
    if (!list.length) list = SHOPS;
    const header = shona ? "Shop directory / zvitoro:\n" : "Shop directory:\n";
    return (
      header +
      list
        .slice(0, 10)
        .map((s) => `• ${s.name} [${s.category}] · ${s.level} — ${s.summary}`)
        .join("\n")
    );
  }

  return shona
    ? `Ndinokwanisa kukubatsira nezve shop directory ye Trade Square, dining, nguva, events, amenities, ne leasing. Edza “shops on ground floor”, “hours”, kana “rooftop lounge”. Website: ${MALL.website}`
    : `I can help with Trade Square’s shop directory, dining, hours, events, amenities, and leasing. Try “shops on ground floor”, “hours”, or “rooftop lounge”. Website: ${MALL.website}`;
}

function systemInstruction() {
  return `You are a friendly Trade Square Mall concierge on WhatsApp for shoppers and tenants in Kwekwe, Zimbabwe.

How you talk (very important):
- Sound like a natural Zimbabwean assistant: warm, human, short WhatsApp messages (2–5 short lines usually).
- You understand and reply in English, chiShona (Shona), or a natural mix of both (code-switching), the way people actually chat.
- Mirror the customer: if they write in Shona, reply mainly in Shona; if English, mainly English; if mixed, mix naturally.
- Use everyday Shona where it fits (e.g. Mhoro, Masikati, Manheru, Makadii, Zvakanaka, Tatenda, Ndinokwanisa kukubatsira…) but keep shop/brand names in English.
- Be conversational, not robotic. Light warmth is good; don’t overdo slang or emojis (0–1 emoji max).
- Never sound like a formal document or a bullet-only robot unless listing shops/hours.

Grounding rules:
- Use ONLY the mall directory context below for facts about shops, dining, hours, events, amenities, and location.
- You may chat casually (greetings, thanks, small talk) without inventing mall facts.
- If something isn’t in the directory, say you’re not sure — in the user’s language — and suggest https://tradesquaremall.com or booking a tour.
- Never invent phone numbers, prices, stock, or tenant names that aren’t in the directory.
- When listing shops: name, floor/level, one short line.
- For leasing: mention 12 sqm and 25 sqm spaces, free partitioning, and that tours can be booked.

Directory context:
${buildDirectoryContext()}`;
}

async function callGemini(apiKey, model, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction() }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text }],
      },
    ],
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 900,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message || `Gemini request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}

async function generateMallReply(userText, options = {}) {
  const text = String(userText || "").trim().slice(0, 4000);
  if (!text) {
    return directoryFallbackReply("");
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "GEMINI_API_KEY missing — using directory fallback. Set it in Render → Environment."
    );
    return directoryFallbackReply(text);
  }

  const models = options.model
    ? [options.model, ...MODEL_FALLBACKS]
    : MODEL_FALLBACKS;

  let lastErr = null;
  for (const model of models) {
    try {
      const reply = await callGemini(apiKey, model, text);
      if (reply) {
        return reply.length > 3500 ? `${reply.slice(0, 3490)}…` : reply;
      }
    } catch (err) {
      lastErr = err;
      console.error(
        `gemini model ${model} failed:`,
        err?.message || err
      );
      // try next model
    }
  }

  console.error("gemini all models failed", lastErr?.message || lastErr);
  return directoryFallbackReply(text);
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export {
  generateMallReply,
  systemInstruction,
  directoryFallbackReply,
  DEFAULT_MODEL,
};
