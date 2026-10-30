/**
 * Persistent enrolled-shop catalog (from tradesquaremall.com/enroll).
 * Stored on disk next to Baileys auth so Render redeploys keep enrolments.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAuthDir } from "./auth-path.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_FALLBACK = path.join(__dirname, "..", "data", "enrolled-shops.json");

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

/** Drop huge base64 uploads — they break Cloudflare/Render body limits and WhatsApp menus. */
export function sanitizeShopsForStorage(shops) {
  return (Array.isArray(shops) ? shops : []).map((shop) => {
    if (!shop || typeof shop !== "object") return shop;
    const next = { ...shop };
    if (typeof next.image === "string" && next.image.startsWith("data:")) {
      next.image = "";
      next.imageOmitted = true;
    }
    if (Array.isArray(next.products)) {
      next.products = next.products.map((product) => {
        if (!product || typeof product !== "object") return product;
        if (typeof product.image === "string" && product.image.startsWith("data:")) {
          return { ...product, image: "", imageOmitted: true };
        }
        return product;
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
          image: String(p.image || raw.image || "").trim(),
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
        image: String(p.image || raw.image || "").trim(),
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
      image: String(raw.image || "").trim(),
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
    image: String(raw.image || "").trim(),
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
