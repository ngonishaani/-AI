/**
 * Outbound guards that reduce WhatsApp “automated / spam” flags.
 * - Per-chat + global rate limits
 * - Human-like typing delay
 * - Cap messages per reply turn
 */

const perJid = new Map();
const globalTimes = [];

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function prune(now) {
  const windowMs = envNum("BOT_RATE_WINDOW_MS", 60_000);
  while (globalTimes.length && now - globalTimes[0] > windowMs) {
    globalTimes.shift();
  }
  for (const [jid, times] of perJid) {
    const next = times.filter((t) => now - t <= windowMs);
    if (next.length) perJid.set(jid, next);
    else perJid.delete(jid);
  }
}

function canSend(jid) {
  const now = Date.now();
  prune(now);
  const maxGlobal = envNum("BOT_RATE_GLOBAL_PER_MIN", 40);
  const maxPerJid = envNum("BOT_RATE_PER_JID_PER_MIN", 8);
  const jidTimes = perJid.get(jid) || [];
  if (globalTimes.length >= maxGlobal) {
    return { ok: false, reason: "global_rate" };
  }
  if (jidTimes.length >= maxPerJid) {
    return { ok: false, reason: "jid_rate" };
  }
  const minGap = envNum("BOT_MIN_GAP_MS", 1200);
  const last = jidTimes[jidTimes.length - 1] || 0;
  if (now - last < minGap) {
    return { ok: false, reason: "gap", waitMs: minGap - (now - last) };
  }
  return { ok: true };
}

function recordSend(jid) {
  const now = Date.now();
  globalTimes.push(now);
  const list = perJid.get(jid) || [];
  list.push(now);
  perJid.set(jid, list);
}

export function typingDelayMs(text) {
  const len = String(text || "").length;
  const base = envNum("BOT_TYPING_BASE_MS", 600);
  const perChar = envNum("BOT_TYPING_PER_CHAR_MS", 12);
  const max = envNum("BOT_TYPING_MAX_MS", 2800);
  return Math.min(max, base + Math.floor(len * perChar));
}

/**
 * Send one WhatsApp payload with rate limits + optional composing delay.
 */
export async function safeSend(sock, jid, content, { logger, skipTyping = false } = {}) {
  if (!sock || !jid) return { ok: false, reason: "no_sock" };

  let gate = canSend(jid);
  if (!gate.ok && gate.reason === "gap" && gate.waitMs) {
    await sleep(gate.waitMs);
    gate = canSend(jid);
  }
  if (!gate.ok) {
    logger?.warn({ jid, reason: gate.reason }, "safeSend blocked (anti-flag rate limit)");
    return { ok: false, reason: gate.reason };
  }

  if (!skipTyping) {
    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch {
      /* ignore */
    }
    const delay =
      typeof content?.text === "string"
        ? typingDelayMs(content.text)
        : typeof content?.caption === "string"
          ? typingDelayMs(content.caption)
          : envNum("BOT_TYPING_BASE_MS", 600);
    await sleep(delay);
  }

  try {
    await sock.sendMessage(jid, content);
    recordSend(jid);
    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {
      /* ignore */
    }
    return { ok: true };
  } catch (err) {
    logger?.error({ err: err?.message || err, jid }, "safeSend failed");
    return { ok: false, reason: "send_error", error: err };
  }
}

/** Cap how many outbound messages one inbound turn may produce. */
export function createTurnBudget(max = envNum("BOT_MAX_MSGS_PER_TURN", 2)) {
  let left = max;
  return {
    remaining: () => left,
    take() {
      if (left <= 0) return false;
      left -= 1;
      return true;
    },
  };
}

export function getSendDiagnostics() {
  prune(Date.now());
  return {
    globalRecent: globalTimes.length,
    activeChats: perJid.size,
    maxGlobalPerMin: envNum("BOT_RATE_GLOBAL_PER_MIN", 40),
    maxPerJidPerMin: envNum("BOT_RATE_PER_JID_PER_MIN", 8),
    maxMsgsPerTurn: envNum("BOT_MAX_MSGS_PER_TURN", 2),
  };
}
