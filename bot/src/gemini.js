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

const MAX_HISTORY_TURNS = 12; // user+model pairs roughly; we store messages
/** @type {Map<string, { messages: Array<{role: string, text: string}>, updatedAt: number }>} */
const conversations = new Map();

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

function getHistory(jid) {
  if (!jid) return [];
  const entry = conversations.get(jid);
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > 2 * 60 * 60 * 1000) {
    conversations.delete(jid);
    return [];
  }
  return entry.messages;
}

function appendHistory(jid, role, text) {
  if (!jid || !text) return;
  const prev = getHistory(jid);
  const messages = [...prev, { role, text: String(text).slice(0, 2000) }];
  while (messages.length > MAX_HISTORY_TURNS) messages.shift();
  conversations.set(jid, { messages, updatedAt: Date.now() });
}

export function clearConversation(jid) {
  if (jid) conversations.delete(jid);
}

function systemInstruction() {
  return `${buildMarketplaceContext()}

You are chatting on WhatsApp — be a friendly human concierge, not a menu robot.

How you talk:
- Sound natural and warm. Short WhatsApp messages (usually 2–5 lines).
- English, Shona, or a light mix — match the customer's language and vibe.
- Remember what they already said in this chat. Do not restart from scratch every time.
- Ask a quick clarifying question when helpful (size, quantity, budget, deadline).
- When recommending a product, mention real prices from the catalog (or say quote on WhatsApp).
- Offer the shop WhatsApp link when they are ready to order — do not push it every message.
- Do NOT dump Trade Square mall boilerplate unless they ask about the mall / place / location / mall hours.
- Never invent shops, prices, or phone numbers that are not in the catalog.
- Do not paste a full shop directory every reply. Only list shops when they ask for shops/menu/options, or when they seem lost.
- Greetings: welcome briefly, say you can help find a shop or product, invite them to say what they need.

After your normal WhatsApp reply, ALWAYS end with exactly one control line (customers will not see it):
ACTION: none
ACTION: menu
ACTION: about
ACTION: shop:<shopId>
ACTION: product:<shopId>:<productId>
ACTION: whatsapp:<shopId>

Use ACTION when it helps (e.g. they ask for the shop list → menu; they want DTF details → product:royaleape:dtf-sheets; they want to order → whatsapp:royaleape). Use ACTION: none for ordinary chat.`;
}

/**
 * Parse Gemini output into visible text + optional structured action.
 * @returns {{ text: string, action: { type: string, shopId?: string, productId?: string } | null }}
 */
export function parseGeminiOutput(raw) {
  let text = String(raw || "").trim();
  let action = null;
  const actionRe =
    /\n?\s*ACTION:\s*(none|menu|about|shop:[\w-]+|product:[\w-]+:[\w-]+|whatsapp:[\w-]+)\s*$/i;
  const match = text.match(actionRe);
  if (match) {
    text = text.slice(0, match.index).trim();
    const spec = match[1].trim().toLowerCase();
    if (spec === "none") action = null;
    else if (spec === "menu") action = { type: "menu" };
    else if (spec === "about") action = { type: "about" };
    else if (spec.startsWith("shop:"))
      action = { type: "shop", shopId: spec.slice(5) };
    else if (spec.startsWith("product:")) {
      const [, shopId, productId] = spec.split(":");
      action = { type: "product", shopId, productId };
    } else if (spec.startsWith("whatsapp:"))
      action = { type: "whatsapp", shopId: spec.slice(9) };
  }
  // Strip accidental ACTION lines mid-text
  text = text.replace(/\n?\s*ACTION:\s*\S+/gi, "").trim();
  return { text, action };
}

async function callGemini(apiKey, model, userText, history, { useSystemInstruction = true } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const contents = [];
  for (const turn of history) {
    contents.push({
      role: turn.role === "model" ? "model" : "user",
      parts: [{ text: turn.text }],
    });
  }
  contents.push({
    role: "user",
    parts: [
      {
        text: useSystemInstruction
          ? userText
          : `${systemInstruction()}\n\n---\nCustomer WhatsApp message:\n${userText}`,
      },
    ],
  });

  // Gemini requires alternating roles; merge if needed
  const normalized = [];
  for (const c of contents) {
    const last = normalized[normalized.length - 1];
    if (last && last.role === c.role) {
      last.parts[0].text += `\n${c.parts[0].text}`;
    } else {
      normalized.push({
        role: c.role,
        parts: [{ text: c.parts[0].text }],
      });
    }
  }

  const body = {
    contents: normalized,
    generationConfig: {
      maxOutputTokens: 700,
      temperature: 0.85,
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

async function callGeminiWithRetry(apiKey, model, userText, history, opts = {}) {
  const attempts = Number(process.env.GEMINI_RETRIES || 3);
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callGemini(apiKey, model, userText, history, opts);
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
          "Reply with exactly: GEMINI_OK\nACTION: none",
          [],
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

function marketplaceFallback(userText) {
  const q = String(userText || "").toLowerCase();
  if (/^(hi|hello|hey|mhoro|masikati|good\s*(morning|afternoon|evening))\b/.test(q)) {
    return {
      text: "Hesi! 👋 I'm the Trade Square marketplace assistant — I can help you find a shop or product. What are you looking for today?",
      action: null,
    };
  }
  if (/\b(about|mall|place|location|trade square)\b/.test(q)) {
    return {
      text: `*${PLACE_ABOUT.name}*\n${PLACE_ABOUT.about}\n📍 ${PLACE_ABOUT.address}\nSay *menu* if you want the shop list.`,
      action: { type: "about" },
    };
  }
  return {
    text: "Tell me what you need (printing, DTF, hoodies, gifts, website…) or say *menu* for the shop list.",
    action: null,
  };
}

/**
 * Natural marketplace reply with conversation memory.
 * @returns {Promise<{ text: string, action: object | null }>}
 */
export async function generateMallReply(userText, { jid } = {}) {
  const text = String(userText || "").trim().slice(0, 4000);
  if (!text) return marketplaceFallback("");

  if (/^(test\s*gemini|gemini\s*status|\/gemini)\b/i.test(text)) {
    const result = await testGemini();
    if (result.ok) {
      return {
        text: `Gemini is working ✅\nModel: ${result.model}\nSample: ${result.sample}`,
        action: null,
      };
    }
    return { text: `Gemini is NOT working ❌\n${result.error}`, action: null };
  }

  if (/^(reset|clear|new\s*chat)\b/i.test(text)) {
    clearConversation(jid);
    return {
      text: "Fresh start — what can I help you find?",
      action: null,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return marketplaceFallback(text);

  const history = getHistory(jid);
  let lastErr = null;
  for (const model of MODEL_FALLBACKS) {
    for (const useSystemInstruction of [true, false]) {
      try {
        const raw = await callGeminiWithRetry(
          apiKey,
          model,
          text,
          history,
          { useSystemInstruction }
        );
        if (raw) {
          lastGemini.ok = true;
          lastGemini.configured = true;
          lastGemini.model = model;
          lastGemini.error = null;
          lastGemini.testedAt = new Date().toISOString();
          const parsed = parseGeminiOutput(raw);
          const replyText =
            parsed.text.length > 3500
              ? `${parsed.text.slice(0, 3490)}…`
              : parsed.text || marketplaceFallback(text).text;
          appendHistory(jid, "user", text);
          appendHistory(jid, "model", replyText);
          return { text: replyText, action: parsed.action };
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
