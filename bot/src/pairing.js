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
  if (!sock) return null;
  if (sock.authState?.creds?.registered) return null;
  if (!pendingPhone) return null;
  if (requesting) return latestCode;

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
    lastError = err?.message || String(err);
    logger?.error({ err: lastError, phone: pendingPhone }, "pairing code failed");
    return null;
  } finally {
    requesting = false;
  }
}

function formatCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return String(code);
}
