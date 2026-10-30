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

const DEFAULT_MODEL = "gemini-2.0-flash";

function directoryFallbackReply(userText) {
  const q = String(userText || "").toLowerCase();
  if (!q.trim()) {
    return "Hi — I am the Trade Square Mall assistant. Ask me about shops, dining, hours, events, or available shop space.";
  }
  if (/\b(hi|hello|hey|good (morning|afternoon|evening)|howdy)\b/.test(q)) {
    return `Hi — welcome to ${MALL.name} in ${MALL.city}. Ask about shops, dining, hours, events, or leasing space.`;
  }
  if (/\b(hours?|open(ing)?|clos(e|ing))\b/.test(q)) {
    return (
      "Mall hours:\n" +
      HOURS.map((h) => `• ${h.days}: ${h.text}`).join("\n")
    );
  }
  if (/\b(where|address|location|maps?|directions?)\b/.test(q)) {
    return `${MALL.address}\nMap: ${MALL.mapsUrl}`;
  }
  if (/\b(events?|official opening)\b/.test(q)) {
    return EVENTS.map(
      (e) => `${e.title} — ${e.date} (${e.time}) at ${e.place}. ${e.summary}`
    ).join("\n");
  }
  if (/\b(amenities|parking|toilets?|power|solar|security|boreholes?)\b/.test(q)) {
    return AMENITIES.map((a) => `• ${a.title}: ${a.text}`).join("\n");
  }
  if (/\b(dine|dining|eat|food|lounge|cocktail|nightlife|bars?)\b/.test(q)) {
    return (
      "Dine & nightlife:\n" +
      DINING.map((d) => `• ${d.name} (${d.level}) — ${d.summary}`).join("\n")
    );
  }
  if (
    /\b(shops?|stores?|directory|tenants?|leasing|lease|spaces?|sqm|grooming|salons?|barbers?|clothing|pets?|cosmetics?|training|ground floor|level\s*[12]|rooftop)\b/.test(
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
    return (
      "Shop directory:\n" +
      list
        .slice(0, 10)
        .map((s) => `• ${s.name} [${s.category}] · ${s.level} — ${s.summary}`)
        .join("\n")
    );
  }
  return `I can help with the Trade Square Mall shop directory, dining, hours, events, amenities, and leasing. Try “shops on ground floor”, “hours”, or “rooftop lounge”. Website: ${MALL.website}`;
}

function systemInstruction() {
  return `You are the Trade Square Mall concierge chatbot on WhatsApp.

Personality:
- Warm, clear, and concise — suitable for WhatsApp (short paragraphs, easy to scan).
- Helpful for shoppers, diners, event-goers, and prospective tenants.
- Reply in the same language the user writes in when possible (English or simple Shona/Ndebele mix is fine).

Grounding rules:
- Use ONLY the mall directory context below for facts about shops, dining, hours, events, amenities, and location.
- You MAY answer general conversational questions (greetings, thanks, how you can help) without inventing mall facts.
- If you do not know something about the mall that is not in the directory, say you are not sure and suggest they visit https://tradesquaremall.com or ask to book a tour.
- Never invent phone numbers, prices, stock, or tenant names that are not in the directory.
- When listing shops, keep it short: name, floor/level, and one-line summary.
- For tenant / leasing questions, mention 12 sqm and 25 sqm spaces, free partitioning, and that tours can be booked.

Directory context:
${buildDirectoryContext()}`;
}

async function generateMallReply(userText, options = {}) {
  const text = String(userText || "").trim().slice(0, 4000);
  if (!text) {
    return directoryFallbackReply("");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Directory-aware replies still work before Gemini secrets are wired.
    return directoryFallbackReply(text);
  }

  const model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
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
      temperature: 0.6,
      maxOutputTokens: 800,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error?.message || `Gemini request failed (${res.status})`;
      throw new Error(msg);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const reply = parts
      .map((p) => p.text || "")
      .join("\n")
      .trim();

    if (!reply) {
      return directoryFallbackReply(text);
    }

    return reply.length > 3500 ? `${reply.slice(0, 3490)}…` : reply;
  } catch (err) {
    console.error("gemini fallback", err?.message || err);
    return directoryFallbackReply(text);
  }
}

export {
  generateMallReply,
  systemInstruction,
  directoryFallbackReply,
  DEFAULT_MODEL,
};
