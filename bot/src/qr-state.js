/** Latest WhatsApp QR payload for the /qr page. */

let latestQr = null;

export function setLatestQr(qr) {
  latestQr = qr || null;
}

export function getLatestQr() {
  return latestQr;
}

export function clearLatestQr() {
  latestQr = null;
}
