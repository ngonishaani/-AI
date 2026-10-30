/**
 * Persistent enrolled-shop catalog (from tradesquaremall.com/enroll).
 * Stored on disk next to Baileys auth so Render redeploys keep enrolments.
 * Uploaded shop photos (data URLs) are written under shop-media/ and rewritten
 * to /media/<file> so WhatsApp can show them when a shop is opened.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAuthDir } from "./auth-path.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FALLBACK = path.join(__dirname, "..", "data", "enrolled-shops.json");
const MAX_STORED_IMAGE_BYTES = 2 * 1024 * 1024;

function catalogPath() {
  if (process.env.CATALOG_PATH?.trim()) {
    return path.resolve(process.env.CATALOG_PATH.trim());
  }
  try {
    const authDir = resolveAuthDir();
    // On Render disk keep enrolments beside Baileys auth so they survive redeploys
    if (authDir === "/var/data/auth_info_baileys" || authDir.startsWith("/var/data/")) {
      return path.join("/var/data", "enrolled-shops.json");
    }
  } catch {
    // fall through
  }
  return LOCAL_FALLBACK;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** Directory for persisted shop/product upload bytes (survives redeploys on Render disk). */
export function mediaDir() {
  return path.join(path.dirname(catalogPath()), "shop-media");
}

export function publicBaseUrl() {
  const raw =
    process.env.BOT_PUBLIC_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "https://ai-mallbot.onrender.com";
  return raw.replace(/\/$/, "");
}

/** Turn /media/foo.jpg into an absolute URL for the enrol page / WhatsApp URL fetch. */
export function resolvePublicImageUrl(image) {
  const value = String(image || "").trim();
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  if (value.startsWith("/media/")) return `${publicBaseUrl()}${value}`;
  return value;
}

/**
 * Resolve a catalog image field to a local file path when it points at our media store.
 * @returns {string|null}
 */
export function resolveLocalMediaPath(image) {
  const value = String(image || "").trim();
  if (!value) return null;
  let filename = "";
  if (value.startsWith("/media/")) {
    filename = value.slice("/media/".length);
  } else {
    try {
      const u = new URL(value);
      if (u.pathname.startsWith("/media/")) {
        filename = u.pathname.slice("/media/".length);
      }
    } catch {
      return null;
    }
  }
  filename = path.basename(filename);
  if (!filename || filename !== path.basename(filename) || filename.includes("..")) {
    return null;
  }
  if (!/\.(jpe?g|png|webp|gif)$/i.test(filename)) return null;
  const full = path.join(mediaDir(), filename);
  return fs.existsSync(full) ? full : null;
}

function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Persist a data-URL upload to shop-media/ and return a portable /media/… path.
 * Oversized or invalid payloads return "".
 */
export function materializeDataUrl(dataUrl, key) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return "";
  let buf;
  try {
    buf = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  } catch {
    return "";
  }
  if (!buf.length || buf.length > MAX_STORED_IMAGE_BYTES) return "";

  const ext = extForMime(match[1]);
  const base = slugify(key) || `img-${Date.now().toString(36)}`;
  const filename = `${base}.${ext}`;
  const dir = mediaDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buf);
  return `/media/${filename}`;
}

function persistImageField(image, key) {
  const value = String(image || "").trim();
  if (!value) return { image: "", omitted: false };
  if (value.startsWith("data:")) {
    const stored = materializeDataUrl(value, key);
    if (stored) return { image: stored, omitted: false };
    return { image: "", omitted: true };
  }
  // Already a media path or remote URL — keep as-is
  if (value.startsWith("/media/") || /^https?:\/\//i.test(value)) {
    return { image: value, omitted: false };
  }
  return { image: value, omitted: false };
}

/** Persist data-URL uploads to disk; keep http(s) and /media paths. */
export function sanitizeShopsForStorage(shops) {
  return (Array.isArray(shops) ? shops : []).map((shop) => {
    if (!shop || typeof shop !== "object") return shop;
    const next = { ...shop };
    const shopKey = slugify(next.id || next.name) || "shop";
    const shopImg = persistImageField(next.image, shopKey);
    next.image = shopImg.image;
    if (shopImg.omitted) next.imageOmitted = true;
    else delete next.imageOmitted;

    if (Array.isArray(next.products)) {
      next.products = next.products.map((product, index) => {
        if (!product || typeof product !== "object") return product;
        const productKey = `${shopKey}-${slugify(product.id || product.name) || `p${index + 1}`}`;
        const productImg = persistImageField(product.image, productKey);
        const out = { ...product, image: productImg.image };
        if (productImg.omitted) out.imageOmitted = true;
        else delete out.imageOmitted;
        return out;
      });
    }
    return next;
  });
}

export function loadEnrolledRaw() {
  const filePath = catalogPath();
  try {
    if (!fs.existsSync(filePath)) {
      return { shops: [], updatedAt: null };
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const shops = Array.isArray(parsed?.shops) ? parsed.shops : Array.isArray(parsed) ? parsed : [];
    return {
      shops,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return { shops: [], updatedAt: null };
  }
}

export function saveEnrolledRaw(shops) {
  const list = sanitizeShopsForStorage(shops);
  const filePath = catalogPath();
  ensureDir(filePath);
  const payload = {
    shops: list,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function getCatalogMeta() {
  const data = loadEnrolledRaw();
  return {
    path: catalogPath(),
    count: data.shops.length,
    updatedAt: data.updatedAt,
  };
}

export function slugify(value) {
  return (
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "shop"
  );
}

function parsePrice(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function deriveWhatsApp(link, explicit) {
  const raw = String(explicit || link || "").trim();
  if (!raw) return { whatsapp: "", whatsappNumber: "" };
  const wa = raw.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)(\+?\d+)/i);
  if (wa) {
    const digits = wa[1].replace(/\D/g, "");
    return { whatsapp: `https://wa.me/${digits}`, whatsappNumber: digits };
  }
  if (/^\+?\d{8,15}$/.test(raw.replace(/[\s-]/g, ""))) {
    const digits = raw.replace(/\D/g, "");
    return { whatsapp: `https://wa.me/${digits}`, whatsappNumber: digits };
  }
  return { whatsapp: "", whatsappNumber: "" };
}

/**
 * Map enrolment-page shop JSON → marketplace shop shape.
 */
export function normalizeEnrolledShop(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim();
  if (!name) return null;

  const id = slugify(raw.id || name);
  const { whatsapp, whatsappNumber } = deriveWhatsApp(raw.link, raw.whatsapp || raw.whatsappNumber);
  const productsIn = Array.isArray(raw.products) ? raw.products : [];

  const products = productsIn
    .map((p, index) => {
      if (!p || !String(p.name || "").trim()) return null;
      const productName = String(p.name).trim();
      const productId = slugify(p.id || productName) || `product-${index + 1}`;
      const variationLabel = String(p.variation || "Standard").trim() || "Standard";
      const priceNum = parsePrice(p.price);
      const priceNote =
        priceNum == null && p.price ? String(p.price).trim() : undefined;

      // Already marketplace-shaped products (with variations[]) pass through lightly
      if (Array.isArray(p.variations) && p.variations.length) {
        return {
          id: productId,
          name: productName,
          description: String(p.description || productName).trim(),
          image: resolvePublicImageUrl(p.image || raw.image || ""),
          link: String(p.link || raw.link || "").trim(),
          includes: Array.isArray(p.includes) ? p.includes : [],
          variations: p.variations.map((v, vi) => ({
            id: slugify(v.id || v.name) || `opt-${vi + 1}`,
            name: String(v.name || "Option").trim(),
            price: parsePrice(v.price),
            currency: v.currency || "USD",
            note: v.note,
          })),
        };
      }

      return {
        id: productId,
        name: productName,
        description: String(p.description || productName).trim(),
        image: resolvePublicImageUrl(p.image || raw.image || ""),
        link: String(p.link || raw.link || "").trim(),
        includes: [],
        variations: [
          {
            id: slugify(variationLabel) || "standard",
            name: variationLabel,
            price: priceNum,
            currency: "USD",
            note: priceNote,
          },
        ],
      };
    })
    .filter(Boolean);

  if (!products.length) {
    products.push({
      id: "general",
      name: "Ask the shop",
      description: "Message the shop for products and prices.",
      image: resolvePublicImageUrl(raw.image || ""),
      link: String(raw.link || "").trim(),
      includes: [],
      variations: [
        {
          id: "quote",
          name: "Quote",
          price: null,
          currency: "USD",
          note: "Ask on WhatsApp or at the mall",
        },
      ],
    });
  }

  return {
    id,
    name,
    floor: String(raw.floor || "Trade Square Mall").trim(),
    number: String(raw.number || "").trim() || "—",
    image: resolvePublicImageUrl(raw.image || ""),
    description: String(raw.description || "").trim() || `${name} at Trade Square Mall.`,
    link: String(raw.link || "").trim() || "https://tradesquaremall.com",
    whatsapp: whatsapp || String(raw.link || "").trim(),
    whatsappNumber,
    hours: String(raw.hours || "Mall hours").trim(),
    categories: Array.isArray(raw.categories)
      ? raw.categories
      : products.slice(0, 4).map((p) => p.name),
    products,
    services: Array.isArray(raw.services)
      ? raw.services
      : products.map((p) => p.name),
    enrolled: true,
    updatedAt: raw.updatedAt || null,
  };
}

export function listNormalizedEnrolled() {
  return loadEnrolledRaw()
    .shops.map(normalizeEnrolledShop)
    .filter(Boolean);
}
