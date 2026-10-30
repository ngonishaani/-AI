import { buildMarketplaceContext, PLACE_ABOUT } from "./marketplace.js";

const DEFAULT_MODEL = (() => {
  const envModel = process.env.GEMINI_MODEL?.trim();
  if (envModel && !isRetiredModel(envModel)) return envModel;
  return "gemini-3.8-flash";
})();

const MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
].filter((m, i, arr) => m && !isRetiredModel(m) && arr.indexOf(m) === i);

function isRetiredModel(name) {
  return /^gemini-(1\.5|2\.0)([.-]|$)/i.test(String(name || ""));
}

function isHighDemandError(err) {
  const msg = String(err?.message || err || "");
  return /high demand|resource.exhausted|quota|try again later|429|503|unavailable/i.test(
    msg
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function systemInstruction() {
  return `${buildMarketplaceContext()}

How you talk:
- Warm, short WhatsApp messages (2–5 lines). Sound human. English / Shona mix OK.
- Lead with shops & products (prices, variations). Offer the store WhatsApp link to order.
- Do NOT dump Trade Square mall boilerplate unless they ask about the mall/place/about/location/mall hours.
- When they ask about a product, mention price options clearly.
- Never invent shops, prices, or phone numbers not in the catalog.`;
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
  if (!reply) {
    const blockReason = data?.candidates?.[0]?.finishReason;
    throw new Error(`Gemini empty reply (${blockReason || "unknown"})`);
  }
  return reply;
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
      console.warn(`gemini ${model} busy; retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
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
      hint: "Set GEMINI_API_KEY and GEMINI_MODEL=gemini-3.8-flash on Render",
    };
  }

  let lastErr = null;
  for (const model of MODEL_FALLBACKS) {
    for (const useSystemInstruction of [true, false]) {
      try {
        const reply = await callGeminiWithRetry(
          apiKey,
          model,
          "Reply with exactly: GEMINI_OK",
          { useSystemInstruction }
        );
        if (reply) {
          lastGemini.ok = true;
          lastGemini.model = model;
          lastGemini.error = null;
          return { ok: true, configured: true, model, sample: reply.slice(0, 200) };
        }
      } catch (err) {
        lastErr = err?.message || String(err);
      }
    }
  }
  lastGemini.ok = false;
  lastGemini.error = lastErr || "All models failed";
  lastGemini.model = null;
  return { ok: false, configured: true, error: lastGemini.error };
}

/** Lightweight fallback when Gemini is down — marketplace oriented */
function marketplaceFallback(userText) {
  const q = String(userText || "").toLowerCase();
  if (/\b(about|mall|place|location|trade square)\b/.test(q)) {
    return `*${PLACE_ABOUT.name}*\n${PLACE_ABOUT.about}\n📍 ${PLACE_ABOUT.address}\nReply *menu* for the shop list.`;
  }
  return `I can help you browse marketplace shops.\n\nReply *menu* for the shop list, pick a number, or type what you want (DTF, hoodies, gifts, banners, website).`;
}

export async function generateMallReply(userText) {
  const text = String(userText || "").trim().slice(0, 4000);
  if (!text) return marketplaceFallback("");

  if (/^(test\s*gemini|gemini\s*status|\/gemini)\b/i.test(text)) {
    const result = await testGemini();
    if (result.ok) {
      return `Gemini is working ✅\nModel: ${result.model}\nSample: ${result.sample}`;
    }
    return `Gemini is NOT working ❌\n${result.error}`;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return marketplaceFallback(text);

  let lastErr = null;
  for (const model of MODEL_FALLBACKS) {
    for (const useSystemInstruction of [true, false]) {
      try {
        const reply = await callGeminiWithRetry(apiKey, model, text, {
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
        console.error(`gemini ${model} failed:`, lastErr);
      }
    }
  }

  lastGemini.ok = false;
  lastGemini.error = lastErr;
  lastGemini.testedAt = new Date().toISOString();
  return marketplaceFallback(text);
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export { DEFAULT_MODEL };
