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
  mainMenuList,
  parseMenuSelection,
  productCaption,
  shopMenuList,
  shopSummary,
  textMainMenu,
  textShopMenu,
  whatsappLinkText,
} from "./menus.js";

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

async function sendImage(jid, url, caption) {
  if (!url || !sock) return false;
  try {
    await sock.sendMessage(jid, {
      image: { url },
      caption: caption || undefined,
    });
    return true;
  } catch (err) {
    logger.warn(
      { err: err?.message || err, url: String(url).slice(0, 80) },
      "image send via url failed — trying buffer"
    );
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await sock.sendMessage(jid, {
      image: buf,
      caption: caption || undefined,
    });
    return true;
  } catch (err) {
    logger.warn({ err: err?.message || err }, "image send failed");
    return false;
  }
}

async function sendListOrText(jid, listPayload, textFallback) {
  // Always send the numbered text list so shops/products are visible in chat.
  // Interactive list is optional (many WhatsApp clients hide it behind a button).
  await sock.sendMessage(jid, { text: textFallback });
  try {
    await sock.sendMessage(jid, listPayload);
    return true;
  } catch (err) {
    logger.warn(
      { err: err?.message || err },
      "interactive list unsupported — text menu already sent"
    );
    return false;
  }
}

async function sendMainMenu(jid) {
  clearChatShop(jid);
  // Numbered shop list first — always readable; optional tap menu after.
  await sock.sendMessage(jid, { text: textMainMenu() });
  try {
    await sock.sendMessage(jid, mainMenuList());
  } catch (err) {
    logger.warn(
      { err: err?.message || err },
      "interactive shop list skipped"
    );
  }
}

async function sendShopCard(jid, shop) {
  setChatShop(jid, shop.id);
  const caption = shopSummary(shop);
  const sent = await sendImage(jid, shop.image, caption);
  if (!sent) {
    await sock.sendMessage(jid, { text: caption });
  }
  await sendListOrText(jid, shopMenuList(shop), textShopMenu(shop));
}

async function sendProductCard(jid, shop, product) {
  setChatShop(jid, shop.id);
  const caption = productCaption(shop, product);
  const sent = await sendImage(jid, product.image || shop.image, caption);
  if (!sent) {
    await sock.sendMessage(jid, { text: caption });
  }
  await sock.sendMessage(jid, {
    text: [
      "*Next*",
      `• *chat* — WhatsApp ${shop.name}`,
      "• Reply with a *number* for another product",
      "• *menu* — all shops",
    ].join("\n"),
  });
}

async function sendWhatsAppLink(jid, shop) {
  setChatShop(jid, shop.id);
  await sock.sendMessage(jid, {
    text: whatsappLinkText(shop),
  });
}

async function handleSelection(jid, selection) {
  switch (selection.type) {
    case "menu":
      await sendMainMenu(jid);
      return true;
    case "about":
      await sock.sendMessage(jid, { text: aboutPlaceText() });
      return true;
    case "shop": {
      const shop = getShop(selection.shopId);
      if (!shop) {
        await sock.sendMessage(jid, {
          text: "I couldn't find that shop. Reply *menu* to see marketplace shops.",
        });
        return true;
      }
      await sendShopCard(jid, shop);
      return true;
    }
    case "product": {
      const hit = getProduct(selection.shopId, selection.productId);
      if (!hit) {
        await sock.sendMessage(jid, {
          text: "I couldn't find that product. Reply *menu* to browse shops.",
        });
        return true;
      }
      await sendProductCard(jid, hit.shop, hit.product);
      return true;
    }
    case "whatsapp": {
      const shop = getShop(selection.shopId);
      if (!shop) {
        await sock.sendMessage(jid, {
          text: "Shop WhatsApp not found. Reply *menu* to browse.",
        });
        return true;
      }
      await sendWhatsAppLink(jid, shop);
      return true;
    }
    default:
      return false;
  }
}

async function applyGeminiAction(jid, action) {
  if (!action?.type || action.type === "none") return;
  // Small pause so the natural text arrives first
  await sleep(350);
  await handleSelection(jid, action);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

  const text = extractText(msg);
  if (!text) {
    await sock.sendMessage(jid, {
      text: "Send me a text — tell me what you're looking for, or say *menu* for shops.",
    });
    return;
  }

  logger.info({ jid, text: text.slice(0, 120) }, "inbound WhatsApp message");

  try {
    await sock.sendPresenceUpdate("composing", jid);
  } catch {
    /* ignore */
  }

  const state = getChatState(jid);
  const selection = parseMenuSelection(text, {
    currentShopId: state.shopId,
  });

  // Explicit menu shortcuts still work; everything else is natural Gemini chat
  if (selection.type !== "chat") {
    await handleSelection(jid, selection);
    logger.info({ jid, selection: selection.type }, "menu shortcut");
    return;
  }

  const { text: reply, action } = await generateMallReply(text, { jid });
  if (reply) {
    await sock.sendMessage(jid, { text: reply });
  }
  if (action) {
    logger.info({ jid, action }, "gemini suggested action");
    await applyGeminiAction(jid, action);
  }
  logger.info({ jid, chars: reply?.length || 0 }, "natural gemini reply");
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
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
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
        logger.warn({ statusCode, loggedOut }, "connection closed");
        sock = null;
        if (!loggedOut) {
          const delay = Number(process.env.BOT_RECONNECT_MS || 3000);
          setTimeout(() => {
            reconnecting = false;
            connectToWhatsApp().catch((reconnectErr) =>
              logger.error(
                { err: reconnectErr?.message || reconnectErr },
                "reconnect failed"
              )
            );
          }, delay);
          return;
        }
        clearPairingCode();
        clearLatestQr();
        logger.error(
          "Logged out from WhatsApp. Open /qr and scan once; keep the Render disk so this does not repeat on redeploy."
        );
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
              await sock.sendMessage(remote, {
                text: "Sorry — something went wrong. Reply *menu* to browse shops.",
              });
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
