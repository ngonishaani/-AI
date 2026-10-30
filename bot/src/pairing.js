/** Shared pairing-code state for Baileys phone-number linking. */

// Only auto-load phone when explicitly using phone link mode
let pendingPhone =
  process.env.WHATSAPP_LINK_MODE === "phone"
    ? normalizePhone(process.env.WHATSAPP_PHONE_NUMBER || "")
    : "";
let latestCode = null;
let lastError = null;
let requesting = false;

export function normalizePhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export function getPairingState() {
  return {
    phone: pendingPhone || null,
    code: latestCode,
    error: lastError,
  };
}

export function setPendingPhone(raw) {
  const phone = normalizePhone(raw);
  if (phone.length < 8) {
    lastError = "Enter a full number with country code (digits only), e.g. 26377xxxxxxx";
    return null;
  }
  pendingPhone = phone;
  latestCode = null;
  lastError = null;
  return phone;
}

export function clearPairingCode() {
  latestCode = null;
  lastError = null;
}

/**
 * Request an 8-digit pairing code once the socket is ready (usually on QR event).
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {{ logger?: import('pino').Logger }} opts
 */
export async function maybeRequestPairingCode(sock, { logger } = {}) {
  if (!sock) {
    lastError = "WhatsApp socket not ready yet — wait a few seconds and retry";
    return null;
  }
  if (sock.authState?.creds?.registered) return null;
  if (!pendingPhone) return null;
  if (requesting) return latestCode;
  if (latestCode) return latestCode;

  requesting = true;
  try {
    const code = await sock.requestPairingCode(pendingPhone);
    latestCode = formatCode(code);
    lastError = null;
    logger?.info(
      { phone: pendingPhone, code: latestCode },
      "WhatsApp pairing code ready — enter it on the phone"
    );
    console.log(`\nPairing code for ${pendingPhone}: ${latestCode}`);
    console.log(
      "Phone: WhatsApp → Linked Devices → Link a device → Link with phone number instead\n"
    );
    return latestCode;
  } catch (err) {
    const msg = err?.message || String(err);
    // Not ready yet is normal before the first QR event — keep waiting quietly
    if (/not connected|connection closed|timed out|401|428/i.test(msg)) {
      lastError = null;
      logger?.info({ err: msg }, "pairing not ready yet — will retry");
    } else {
      lastError = msg;
      logger?.error({ err: msg, phone: pendingPhone }, "pairing code failed");
    }
    return null;
  } finally {
    requesting = false;
  }
}

export function hasPendingPhone() {
  return Boolean(pendingPhone);
}

function formatCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return String(code);
}
