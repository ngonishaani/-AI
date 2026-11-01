import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { generateMallReply, isGeminiConfigured } from "./gemini.js";
import { startCronJobs } from "./cron.js";
import { startHttpServer } from "./server.js";
import {
  clearPairingCode,
  hasPendingPhone,
  maybeRequestPairingCode,
} from "./pairing.js";
import {
  clearAuthSession,
  ensureAuthDir,
  getAuthStatus,
  resolveAuthDir,
} from "./auth-path.js";
import { clearLatestQr, getLatestQr, setLatestQr } from "./qr-state.js";
import {
  aboutPlaceText,
  getProduct,
  getShop,
  parseMenuSelection,
  productCaption,
  shopSummary,
  textMainMenu,
  textShopMenu,
  whatsappLinkText,
} from "./menus.js";
import { resolveLocalMediaPath } from "./catalog-store.js";
import {
  createTurnBudget,
  getSendDiagnostics,
  safeSend,
} from "./safe-send.js";
import fs from "node:fs";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
}).child({ app: "trade-square-bot" });

const AUTH_DIR = resolveAuthDir();
const authMeta = ensureAuthDir(AUTH_DIR, logger);
logger.info(
  {
    authDir: AUTH_DIR,
    onRenderDisk: authMeta.onRenderDisk,
    existingAuthFiles: authMeta.files.length,
    sessionRegistered: getAuthStatus(AUTH_DIR).sessionRegistered,
  },
  "WhatsApp auth store"
);

let sock = null;
let connectionStatus = "close";
let reconnecting = false;
let stopCron = null;
let httpServer = null;
const recentMsgIds = new Map();
/** @type {Map<string, { shopId?: string, updatedAt: number }>} */
const chatState = new Map();

function seenRecently(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of recentMsgIds) {
    if (now - t > 2 * 60 * 1000) recentMsgIds.delete(k);
  }
  if (recentMsgIds.has(id)) return true;
  recentMsgIds.set(id, now);
  return false;
}

function getChatState(jid) {
  const state = chatState.get(jid);
  if (!state) return {};
  if (Date.now() - state.updatedAt > 60 * 60 * 1000) {
    chatState.delete(jid);
    return {};
  }
  return state;
}

function setChatShop(jid, shopId) {
  chatState.set(jid, { shopId, updatedAt: Date.now() });
}

function clearChatShop(jid) {
  chatState.set(jid, { updatedAt: Date.now() });
}

function extractText(msg) {
  const m = msg.message || {};
  return (
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  ).trim();
}

function bufferFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/
  );
  if (!match) return null;
  try {
    return Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
}

async function replyText(jid, text, budget) {
  if (!text) return false;
  if (budget && !budget.take()) {
    logger.warn({ jid }, "turn budget exhausted — skip extra text");
    return false;
  }
  const res = await safeSend(sock, jid, { text }, { logger });
  return Boolean(res.ok);
}

/** Send a shop/product photo. Prefers local media files, then data URLs, then remote URLs. */
async function sendImage(jid, url, caption, budget) {
  if (!url || !sock) return false;
  if (budget && !budget.take()) {
    logger.warn({ jid }, "turn budget exhausted — skip image");
    return false;
  }

  const sendBuf = async (buf) => {
    const res = await safeSend(
      sock,
      jid,
      { image: buf, caption: caption || undefined },
      { logger }
    );
    return Boolean(res.ok);
  };

  const localPath = resolveLocalMediaPath(url);
  if (localPath) {
    try {
      return await sendBuf(fs.readFileSync(localPath));
    } catch (err) {
      logger.warn(
        { err: err?.message || err, localPath },
        "local media send failed — trying other sources"
      );
    }
  }

  if (String(url).startsWith("data:")) {
    const buf = bufferFromDataUrl(url);
    if (buf?.length) return sendBuf(buf);
    return false;
  }

  try {
    const res = await safeSend(
      sock,
      jid,
      { image: { url }, caption: caption || undefined },
      { logger }
    );
    if (res.ok) return true;
  } catch (err) {
    logger.warn(
      { err: err?.message || err, url: String(url).slice(0, 80) },
      "image send via url failed — trying buffer"
    );
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await sendBuf(Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    logger.warn({ err: err?.message || err }, "image send failed");
    return false;
  }
}

/**
 * Anti-flag: one text message only (no interactive list / buttons).
 * Unofficial list messages are a common ban trigger.
 */
async function sendMainMenu(jid, budget) {
  clearChatShop(jid);
  await replyText(jid, textMainMenu(), budget);
}

async function sendShopCard(jid, shop, budget) {
  setChatShop(jid, shop.id);
  const allowImages = process.env.BOT_SEND_IMAGES !== "0";
  const summary = shopSummary(shop);
  if (allowImages && shop.image) {
    const caption = `${summary}\n\nReply with a product number, *chat*, or *menu*.`;
    const sent = await sendImage(
      jid,
      shop.image,
      caption.slice(0, 1024),
      budget
    );
    if (sent) return;
  }
  await replyText(jid, textShopMenu(shop), budget);
}

async function sendProductCard(jid, shop, product, budget) {
  setChatShop(jid, shop.id);
  const allowImages = process.env.BOT_SEND_IMAGES !== "0";
  const caption = productCaption(shop, product);
  if (allowImages && (product.image || shop.image)) {
    const sent = await sendImage(
      jid,
      product.image || shop.image,
      caption.slice(0, 1024),
      budget
    );
    if (sent) return;
  }
  await replyText(jid, caption, budget);
}

async function sendWhatsAppLink(jid, shop, budget) {
  setChatShop(jid, shop.id);
  await replyText(jid, whatsappLinkText(shop), budget);
}

async function handleSelection(jid, selection, budget) {
  switch (selection.type) {
    case "menu":
      await sendMainMenu(jid, budget);
      return true;
    case "about":
      await replyText(jid, aboutPlaceText(), budget);
      return true;
    case "shop": {
      const shop = getShop(selection.shopId);
      if (!shop) {
        await replyText(
          jid,
          "I couldn't find that shop. Reply *menu* to see marketplace shops.",
          budget
        );
        return true;
      }
      await sendShopCard(jid, shop, budget);
      return true;
    }
    case "product": {
      const hit = getProduct(selection.shopId, selection.productId);
      if (!hit) {
        await replyText(
          jid,
          "I couldn't find that product. Reply *menu* to browse shops.",
          budget
        );
        return true;
      }
      await sendProductCard(jid, hit.shop, hit.product, budget);
      return true;
    }
    case "whatsapp": {
      const shop = getShop(selection.shopId);
      if (!shop) {
        await replyText(
          jid,
          "Shop WhatsApp not found. Reply *menu* to browse.",
          budget
        );
        return true;
      }
      await sendWhatsAppLink(jid, shop, budget);
      return true;
    }
    default:
      return false;
  }
}

async function handleIncoming(msg) {
  if (!msg?.message) return;
  if (msg.key.fromMe) return;
  if (msg.key.remoteJid === "status@broadcast") return;
  if (seenRecently(msg.key.id)) return;

  const jid = msg.key.remoteJid;
  if (!jid) return;

  if (jid.endsWith("@g.us") && process.env.BOT_ALLOW_GROUPS !== "1") {
    return;
  }
  if (jid.includes("@newsletter") || jid.endsWith("@broadcast")) return;

  const text = extractText(msg);
  if (!text) {
    // Silent on stickers/voice/photos — reduces bot-like chatter that gets flagged
    return;
  }

  logger.info({ jid, text: text.slice(0, 120) }, "inbound WhatsApp message");

  const budget = createTurnBudget();
  const state = getChatState(jid);
  const selection = parseMenuSelection(text, {
    currentShopId: state.shopId,
  });

  if (selection.type !== "chat") {
    await handleSelection(jid, selection, budget);
    logger.info({ jid, selection: selection.type }, "menu shortcut");
    return;
  }

  const { text: reply, action } = await generateMallReply(text, { jid });
  if (reply) {
    await replyText(jid, reply, budget);
  }
  // Avoid chaining extra menu/product dumps after Gemini (multi-message bursts get flagged)
  if (
    action &&
    budget.remaining() > 0 &&
    process.env.BOT_GEMINI_ACTIONS !== "0" &&
    (action.type === "whatsapp" ||
      action.type === "product" ||
      action.type === "shop")
  ) {
    logger.info({ jid, action }, "gemini suggested action");
    await handleSelection(jid, action, budget);
  }
  logger.info(
    { jid, chars: reply?.length || 0, send: getSendDiagnostics() },
    "natural gemini reply"
  );
}

async function connectToWhatsApp() {
  if (reconnecting) return;
  reconnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const alreadyRegistered = Boolean(state.creds?.registered);
    logger.info(
      { alreadyRegistered, authDir: AUTH_DIR },
      alreadyRegistered
        ? "Restoring saved WhatsApp session (no pairing needed)"
        : "No saved session — pairing required once"
    );

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      syncFullHistory: false,
      // Anti-flag: stay quiet on connect unless BOT_MARK_ONLINE=1
      markOnlineOnConnect: process.env.BOT_MARK_ONLINE === "1",
      generateHighQualityLinkPreview: false,
      browser: ["Ubuntu", "Chrome", "120.0.0"],
      getMessage: async () => undefined,
    });

    // Persist every creds/keys update to the disk-backed auth folder
    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        logger.debug("creds saved to persistent auth dir");
      } catch (err) {
        logger.error({ err: err?.message || err }, "failed to save WhatsApp creds");
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Always publish QR for /qr. If user asked for phone pairing, also request code.
      if (qr) {
        setLatestQr(qr);
        logger.info("QR ready — open /qr (computer) and scan, or wait for pairing code on /pair");
        if (
          !sock?.authState?.creds?.registered &&
          (hasPendingPhone() || process.env.WHATSAPP_LINK_MODE === "phone")
        ) {
          try {
            await maybeRequestPairingCode(sock, { logger });
          } catch (err) {
            logger.warn({ err: err?.message || err }, "pairing request skipped");
          }
        }
      }

      if (connection) {
        connectionStatus = connection;
        logger.info({ connection }, "connection update");
      }

      if (connection === "open") {
        clearPairingCode();
        clearLatestQr();
        try {
          await saveCreds();
        } catch {
          /* ignore */
        }
        logger.info(
          { authDir: AUTH_DIR, ...getAuthStatus(AUTH_DIR) },
          "WhatsApp connected — session saved for future redeploys"
        );
      }

      if (connection === "close") {
        const err = lastDisconnect?.error;
        const statusCode =
          err instanceof Boom
            ? err.output?.statusCode
            : new Boom(err)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const forbidden = statusCode === DisconnectReason.forbidden;
        const replaced =
          statusCode === DisconnectReason.connectionReplaced ||
          statusCode === DisconnectReason.multideviceMismatch;
        logger.warn(
          { statusCode, loggedOut, forbidden, replaced },
          "connection closed"
        );
        sock = null;

        // Banned / forced logout — do NOT tight-loop reconnect (makes flags worse)
        if (loggedOut || forbidden) {
          clearPairingCode();
          clearLatestQr();
          logger.error(
            {
              tip: "Account may be flagged. Wait before /relink. Use a fresh number if banned. Prefer fewer messages.",
            },
            "WhatsApp session ended (logged out or forbidden). Open /relink only after cooling off."
          );
          return;
        }

        if (replaced) {
          logger.error(
            "Session replaced by another linked device — stop duplicate bots, then /relink once."
          );
          return;
        }

        const delay = Number(process.env.BOT_RECONNECT_MS || 8000);
        setTimeout(() => {
          reconnecting = false;
          connectToWhatsApp().catch((reconnectErr) =>
            logger.error(
              { err: reconnectErr?.message || reconnectErr },
              "reconnect failed"
            )
          );
        }, delay);
      }
    });

    sock.ev.on("messages.upsert", async ({ type, messages }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        try {
          await handleIncoming(msg);
        } catch (err) {
          logger.error(
            { err: err?.message || err },
            "failed handling message"
          );
          try {
            const remote = msg?.key?.remoteJid;
            if (remote && sock) {
              await safeSend(
                sock,
                remote,
                {
                  text: "Sorry — something went wrong. Try again in a moment, or reply *menu*.",
                },
                { logger, skipTyping: true }
              );
            }
          } catch {
            /* ignore */
          }
        }
      }
    });
  } finally {
    reconnecting = false;
  }
}

function getSock() {
  return sock;
}
function getStatus() {
  return connectionStatus;
}
function getAuthInfo() {
  return getAuthStatus(AUTH_DIR);
}
async function reconnect() {
  if (connectionStatus === "open" && sock) return;
  await connectToWhatsApp();
}

/** Clear broken/stale session and force a brand-new QR. */
async function forceRelink() {
  logger.warn("Force relink requested — clearing session and reconnecting");
  clearPairingCode();
  clearLatestQr();
  try {
    sock?.end?.(undefined);
  } catch {
    /* ignore */
  }
  sock = null;
  connectionStatus = "close";
  reconnecting = false;
  clearAuthSession(AUTH_DIR, logger);
  await connectToWhatsApp();
  return getAuthStatus(AUTH_DIR);
}

httpServer = startHttpServer({
  getStatus,
  getSock,
  getAuthInfo,
  getLatestQr,
  forceRelink,
  logger,
  isGeminiConfigured,
});
if (!isGeminiConfigured()) {
  logger.warn(
    "GEMINI_API_KEY is not set — bot will use marketplace menus until you add it in Render → Environment"
  );
} else {
  logger.info("Gemini enabled for natural Shona/English marketplace replies");
}
await connectToWhatsApp();
stopCron = startCronJobs({
  getSock,
  getStatus,
  reconnect,
  logger,
});

function shutdown() {
  stopCron?.();
  try {
    httpServer?.close?.();
  } catch {
    /* ignore */
  }
  try {
    sock?.end?.(undefined);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
