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

// Prefer 1.5-flash / lite first — 2.0-flash often hits "high demand"
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
].filter((m, i, arr) => m && arr.indexOf(m) === i);

function isHighDemandError(err) {
  const msg = String(err?.message || err || "");
  return /high demand|resource.exhausted|quota|try again later|429|503|unavailable/i.test(
    msg
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGeminiWithRetry(apiKey, model, text, opts = {}) {
  const attempts = Number(process.env.GEMINI_RETRIES || 3);
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callGemini(apiKey, model, text, opts);
    } catch (err) {
      lastErr = err;
      if (!isHighDemandError(err) || i === attempts - 1) throw err;
      const wait = 400 * (i + 1) * (i + 1);
      console.warn(
        `gemini ${model} busy (${err.message}); retry in ${wait}ms`
      );
      await sleep(wait);
    }
  }
  throw lastErr;
}

let lastGemini = {
  ok: false,
  configured: false,
  model: null,
  error: null,
  testedAt: null,
};

export function getGeminiDiagnostics() {
  return {
    ...lastGemini,
    configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
  };
}

function looksShona(text) {
  const t = String(text || "").toLowerCase();
  return /\b(mhoro|masikati|manheru|makadii|ndinoda|ndiri|zvakanaka|tatenda|ndatenda|handizive|ndipei|ndapota|nguva|kuvhura|kuvhara|chii|pane|sei|tiri|hendai|tour)\b/i.test(
    t
  );
}

function directoryFallbackReply(userText) {
  const q = String(userText || "").toLowerCase();
  const shona = looksShona(userText);
  const geminiOff = !process.env.GEMINI_API_KEY?.trim();

  if (!q.trim()) {
    return shona
      ? `Mhoro! Ndiri pa Trade Square Mall ku Kwekwe. Ndingakubatsirei nei nhasi — shops, dining, kana tour?`
      : `Hi! I’m here for Trade Square Mall in Kwekwe — shops, dining, hours, or a quick tour. What do you need?`;
  }

  if (
    /\b(hi|hello|hey|good (morning|afternoon|evening)|howdy|mhoro|masikati|manheru|makadii)\b/.test(
      q
    )
  ) {
    return shona
      ? `Mhoro zvakanaka 😊 Tikugamuchira ku Trade Square. Unoda shops, dining, nguva yekuvhura, kana tour yemall?`
      : `Hey, welcome to Trade Square 😊 Looking for shops, dining, opening hours, or a mall tour?`;
  }

  if (/\b(tour|walk\s*through|show\s*me\s*around|nditour|ndiite tour)\b/.test(q)) {
    return shona
      ? `Zvakanaka — tour ye Trade Square inofamba 12 sqm ne 25 sqm shop bays, Training Center, then rooftop cocktail bar / night club. Partitioning yemashops iri mahara. Ungada kuti ndikutsigire book tour here, kana ndikutaurire floor by floor?`
      : `Sure — a Trade Square tour walks the 12 and 25 sqm shop bays, the Training Center, then the rooftop cocktail bar / night club. Shop partitioning is free. Want a floor-by-floor walkthrough, or tips on booking a visit?`;
  }

  if (/\b(hours?|open(ing)?|clos(e|ing)|nguva|kuvhura|kuvhara)\b/.test(q)) {
    const lines = HOURS.map((h) => `• ${h.days}: ${h.text}`).join("\n");
    return shona
      ? `Nguva yekuvhura:\n${lines}`
      : `We’re open:\n${lines}`;
  }

  if (/\b(where|address|location|maps?|directions?|kupi|kwakirwa)\b/.test(q)) {
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

  if (/\b(dine|dining|eat|food|lounge|cocktail|nightlife|bars?|chikafu)\b/.test(q)) {
    return (
      (shona ? "Pamusoro (rooftop):\n" : "Up on the roof:\n") +
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
    return (
      (shona ? "Hezvino zvitoro zviripo:\n" : "Here’s what’s in the directory:\n") +
      list
        .slice(0, 10)
        .map((s) => `• ${s.name} [${s.category}] · ${s.level} — ${s.summary}`)
        .join("\n")
    );
  }

  // Unknown query — natural nudge (and hint if Gemini key missing)
  if (geminiOff) {
    return shona
      ? `Ndinokwanisa kukubatsira nezve shops, dining, nguva, tour, kana leasing pa Trade Square. Chii chaunoda? (AI Gemini haisati yaiswa — isa GEMINI_API_KEY pa Render.)`
      : `I can help with shops, dining, hours, a mall tour, or leasing at Trade Square — what are you after?\n\n(Note: Gemini isn’t configured yet. Add GEMINI_API_KEY in Render → Environment, then message “test gemini”.)`;
  }

  return shona
    ? `Ndinokwanisa kukubatsira nezve shops, dining, nguva, tour, kana leasing. Chii chaunoda nhasi?`
    : `I can help with shops, dining, hours, a mall tour, or leasing — what would you like?`;
}

function systemInstruction() {
  return `You are a friendly human concierge for Trade Square Mall (Kwekwe, Zimbabwe) chatting on WhatsApp.

Talk like a real person texting:
- Short, warm WhatsApp replies (usually 2–5 short lines). No robot menus unless listing shops/hours.
- English, chiShona, or natural mix — mirror how the customer writes.
- For “take me for a tour” / tour requests: walk them through the mall conversationally (ground floor shops → level 1 clothing → level 2 Training Center → rooftop lounge/cocktail bar), mention 12/25 sqm bays and free partitioning when relevant.
- Never dump a canned “I can help with X, Y, Z. Try …” help menu unless they ask what you can do.
- Use ONLY the directory facts below for mall details. Don’t invent phones, prices, or tenants.
- If unknown, say so casually and point to ${MALL.website}.

Directory:
${buildDirectoryContext()}`;
}

async function callGemini(apiKey, model, text, { useSystemInstruction = true } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: useSystemInstruction
              ? text
              : `${systemInstruction()}\n\n---\nCustomer WhatsApp message:\n${text}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 900,
    },
  };

  if (useSystemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction() }],
    };
  }

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
  const reply = parts
    .map((p) => p.text || "")
    .join("\n")
    .trim();

  const blockReason = data?.candidates?.[0]?.finishReason;
  if (!reply && blockReason) {
    throw new Error(`Gemini empty reply (${blockReason})`);
  }
  return reply;
}

export async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  lastGemini.testedAt = new Date().toISOString();
  lastGemini.configured = Boolean(apiKey);

  if (!apiKey) {
    lastGemini.ok = false;
    lastGemini.error = "GEMINI_API_KEY is missing on Render";
    lastGemini.model = null;
    return {
      ok: false,
      configured: false,
      error: lastGemini.error,
      hint: "Render → Environment → add GEMINI_API_KEY from https://aistudio.google.com/apikey → Save → Manual Deploy",
    };
  }

  const probe = "Reply with exactly: GEMINI_OK";
  let lastErr = null;
  for (const model of MODEL_FALLBACKS) {
    for (const useSystemInstruction of [true, false]) {
      try {
        const reply = await callGemini(apiKey, model, probe, {
          useSystemInstruction,
        });
        if (reply) {
          lastGemini.ok = true;
          lastGemini.model = model;
          lastGemini.error = null;
          return {
            ok: true,
            configured: true,
            model,
            sample: reply.slice(0, 200),
          };
        }
      } catch (err) {
        lastErr = err?.message || String(err);
      }
    }
  }

  lastGemini.ok = false;
  lastGemini.model = null;
  lastGemini.error = lastErr || "All Gemini models failed";
  return {
    ok: false,
    configured: true,
    error: lastGemini.error,
    hint: "Check the API key is valid and Gemini API is enabled for the Google project.",
  };
}

async function generateMallReply(userText, options = {}) {
  const text = String(userText || "").trim().slice(0, 4000);
  if (!text) {
    return directoryFallbackReply("");
  }

  // WhatsApp self-test command
  if (/^(test\s*gemini|gemini\s*status|\/gemini)\b/i.test(text)) {
    const result = await testGemini();
    if (result.ok) {
      return `Gemini is working ✅\nModel: ${result.model}\nSample: ${result.sample}`;
    }
    return `Gemini is NOT working ❌\n${result.error}\n${result.hint || ""}`.trim();
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    lastGemini.ok = false;
    lastGemini.configured = false;
    lastGemini.error = "GEMINI_API_KEY missing";
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
    for (const useSystemInstruction of [true, false]) {
      try {
        const reply = await callGemini(apiKey, model, text, {
          useSystemInstruction,
        });
        if (reply) {
          lastGemini.ok = true;
          lastGemini.configured = true;
          lastGemini.model = model;
          lastGemini.error = null;
          lastGemini.testedAt = new Date().toISOString();
          return reply.length > 3500 ? `${reply.slice(0, 3490)}…` : reply;
        }
      } catch (err) {
        lastErr = err?.message || String(err);
        console.error(
          `gemini model ${model} (system=${useSystemInstruction}) failed:`,
          lastErr
        );
      }
    }
  }

  lastGemini.ok = false;
  lastGemini.configured = true;
  lastGemini.error = lastErr || "unknown";
  lastGemini.testedAt = new Date().toISOString();
  console.error("gemini all models failed", lastErr);
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
