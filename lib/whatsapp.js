/**
 * Meta WhatsApp Cloud API helpers.
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

function getCredentials() {
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return { token, phoneNumberId };
}

async function sendWhatsAppText(to, body) {
  const { token, phoneNumberId } = getCredentials();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be configured"
    );
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
    phoneNumberId
  )}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: String(to).replace(/\D/g, ""),
      type: "text",
      text: {
        preview_url: true,
        body: String(body).slice(0, 4096),
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message || `WhatsApp send failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function extractInboundMessages(payload) {
  const out = [];
  const entries = payload?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const contactName =
        contacts[0]?.profile?.name || contacts[0]?.wa_id || "";
      for (const msg of value.messages || []) {
        if (msg.type === "text" && msg.text?.body) {
          out.push({
            from: msg.from,
            id: msg.id,
            timestamp: msg.timestamp,
            text: msg.text.body,
            contactName,
          });
        } else if (msg.type === "button" && msg.button?.text) {
          out.push({
            from: msg.from,
            id: msg.id,
            timestamp: msg.timestamp,
            text: msg.button.text,
            contactName,
          });
        } else if (msg.type === "interactive") {
          const t =
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            "";
          if (t) {
            out.push({
              from: msg.from,
              id: msg.id,
              timestamp: msg.timestamp,
              text: t,
              contactName,
            });
          }
        }
      }
    }
  }
  return out;
}

function publicWhatsAppLink() {
  const raw =
    process.env.WHATSAPP_DISPLAY_NUMBER ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const preset = encodeURIComponent(
    "Hi Trade Square Mall — I have a question."
  );
  return {
    number: digits,
    link: `https://wa.me/${digits}?text=${preset}`,
  };
}

module.exports = {
  sendWhatsAppText,
  extractInboundMessages,
  publicWhatsAppLink,
  getCredentials,
};
