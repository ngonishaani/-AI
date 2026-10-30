import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateMallReply } from "./gemini.js";
import { startCronJobs } from "./cron.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR =
  process.env.BAILEYS_AUTH_DIR ||
  path.join(__dirname, "..", "auth_info_baileys");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
}).child({ app: "trade-square-bot" });

let sock = null;
let connectionStatus = "close";
let reconnecting = false;
let stopCron = null;
const recentMsgIds = new Map();

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

function extractText(msg) {
  const m = msg.message || {};
  return (
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

async function handleIncoming(msg) {
  if (!msg?.message) return;
  if (msg.key.fromMe) return;
  if (msg.key.remoteJid === "status@broadcast") return;
  if (seenRecently(msg.key.id)) return;

  const jid = msg.key.remoteJid;
  if (!jid) return;

  // Skip groups unless explicitly enabled
  if (jid.endsWith("@g.us") && process.env.BOT_ALLOW_GROUPS !== "1") {
    return;
  }

  const text = extractText(msg);
  if (!text) {
    await sock.sendMessage(jid, {
      text: "I can read text messages. Ask me about shops, dining, hours, events, or leasing at Trade Square Mall.",
    });
    return;
  }

  logger.info({ jid, text: text.slice(0, 120) }, "inbound WhatsApp message");

  try {
    await sock.sendPresenceUpdate("composing", jid);
  } catch {
    /* ignore */
  }

  const reply = await generateMallReply(text);
  await sock.sendMessage(jid, { text: reply });
  logger.info({ jid, chars: reply.length }, "replied");
}

async function connectToWhatsApp() {
  if (reconnecting) return;
  reconnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
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

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\nScan this QR with WhatsApp → Linked Devices:\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection) {
        connectionStatus = connection;
        logger.info({ connection }, "connection update");
      }

      if (connection === "open") {
        logger.info("WhatsApp connected — Trade Square Mall bot is live");
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
        logger.error(
          "Logged out — delete auth_info_baileys and scan a new QR"
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
            const jid = msg?.key?.remoteJid;
            if (jid && sock) {
              await sock.sendMessage(jid, {
                text: "Sorry — something went wrong. Please try again in a moment.",
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
async function reconnect() {
  if (connectionStatus === "open" && sock) return;
  await connectToWhatsApp();
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
    sock?.end?.(undefined);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
