import {
  getShops,
  getShop,
  getProduct,
  shopSummary,
  productCaption,
  shopTags,
  shopLocationLine,
  PLACE_ABOUT,
  MARKETPLACE,
  formatMoney,
  cleanText,
} from "./marketplace.js";

const DIVIDER = "────────";

/** Interactive list + text fallback menus for WhatsApp. */

/** Short interactive-list body — full text is sent separately once. */
export function mainMenuList() {
  const shops = getShops();
  return {
    text: "Tap to pick a shop",
    footer: "Trade Square Marketplace",
    title: "Shops",
    buttonText: "View shops",
    sections: [
      {
        title: "Shops",
        rows: shops.map((s) => ({
          title: s.name.slice(0, 24),
          rowId: `shop:${s.id}`,
          description: shopLocationLine(s).slice(0, 72),
        })),
      },
      {
        title: "More",
        rows: [
          {
            title: "About the mall",
            rowId: "about:place",
            description: "Location & mall hours",
          },
        ],
      },
    ],
  };
}

export function shopMenuList(shop) {
  return {
    text: "Tap to pick a product",
    footer: shop.name,
    title: "Products",
    buttonText: "Products",
    sections: [
      {
        title: "Products & services",
        rows: (shop.products || []).map((p) => {
          const priced = (p.variations || []).find(
            (v) => v.price != null && Number(v.price) !== 0
          );
          return {
            title: p.name.slice(0, 24),
            rowId: `product:${shop.id}:${p.id}`,
            description: priced
              ? `from ${formatMoney(priced.price, priced.currency)}`.slice(0, 72)
              : "Quote on WhatsApp".slice(0, 72),
          };
        }),
      },
      {
        title: "Actions",
        rows: [
          {
            title: "Chat with store",
            rowId: `whatsapp:${shop.id}`,
            description: "Open shop WhatsApp",
          },
          {
            title: "All shops",
            rowId: "menu:main",
            description: "Back to marketplace",
          },
        ],
      },
    ],
  };
}

function productPriceHint(product) {
  const priced = (product.variations || []).find(
    (v) => v.price != null && Number(v.price) !== 0
  );
  if (priced) return `from ${formatMoney(priced.price, priced.currency)}`;
  return "quote on WhatsApp";
}

export function shopListLines() {
  return getShops()
    .map((s, i) => {
      const tags = shopTags(s, 3);
      return [
        `*${i + 1} · ${s.name}*`,
        `📍 ${shopLocationLine(s)}`,
        tags ? `_${tags}_` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function textMainMenu() {
  const count = getShops().length;
  return [
    `*${MARKETPLACE.name}*`,
    MARKETPLACE.tagline,
    "",
    DIVIDER,
    `*Shops* (${count})`,
    "",
    shopListLines(),
    "",
    DIVIDER,
    "*How to browse*",
    "• Reply with a *number* or *shop name*",
    "• Or type what you need (DTF, hoodies, hardware…)",
    "• *about* — mall location & hours",
  ].join("\n");
}

/** Products-only block (no shop header — use after shop image/summary). */
export function textShopProducts(shop) {
  const products = shop.products || [];
  const productBlock = products
    .map((p, i) => {
      const hint = productPriceHint(p);
      return `*${i + 1} · ${p.name}*\n   ${hint}`;
    })
    .join("\n\n");

  return [
    `*Products* (${products.length})`,
    "",
    productBlock || "_No products listed yet._",
    "",
    "Reply with a *number*, *chat*, or *menu*.",
  ].join("\n");
}

/** Full shop text when no image was sent. */
export function textShopMenu(shop) {
  return [shopSummary(shop), "", DIVIDER, "", textShopProducts(shop)].join("\n");
}

export function aboutPlaceText() {
  const hours = PLACE_ABOUT.hours
    .map((h) => `• ${h.days}: ${h.text}`)
    .join("\n");
  return [
    `*${PLACE_ABOUT.name}*`,
    cleanText(PLACE_ABOUT.about, { max: 320 }),
    "",
    DIVIDER,
    `📍 ${PLACE_ABOUT.address}`,
    `🗺 ${PLACE_ABOUT.mapsUrl}`,
    "",
    "*Mall hours*",
    hours,
    "",
    `🌐 ${PLACE_ABOUT.website}`,
    "",
    DIVIDER,
    "Reply *menu* to browse marketplace shops.",
  ].join("\n");
}

export function whatsappLinkText(shop) {
  return [
    `*Chat with ${shop.name}*`,
    shop.whatsapp || shop.link || "Ask at the mall for this shop’s WhatsApp.",
    "",
    "Tell them size, quantity, and deadline.",
  ].join("\n");
}

export function shopImageCaption(shop) {
  return `*${shop.name}*\n📍 ${shopLocationLine(shop)}`;
}

/**
 * Explicit menu shortcuts only.
 * Greetings and free-text go to Gemini (avoids dumping the shop list every hi).
 */
export function parseMenuSelection(text, { currentShopId } = {}) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return { type: "chat", text: "" };

  if (raw.startsWith("shop:")) return { type: "shop", shopId: raw.slice(5) };
  if (raw.startsWith("product:")) {
    const [, shopId, productId] = raw.split(":");
    return { type: "product", shopId, productId };
  }
  if (raw.startsWith("whatsapp:")) {
    return { type: "whatsapp", shopId: raw.slice(9) };
  }
  if (raw === "menu:main" || raw === "about:place") {
    return { type: raw.startsWith("about") ? "about" : "menu" };
  }

  if (/^(menu|shops?|list|marketplace|directory)\b/i.test(lower)) {
    return { type: "menu" };
  }
  if (
    /^(about|mall info|location|where is the mall|where is trade square)\b/i.test(
      lower
    )
  ) {
    return { type: "about" };
  }

  if (currentShopId && /^\d+$/.test(raw)) {
    const shop = getShop(currentShopId);
    const idx = Number(raw) - 1;
    if (shop?.products?.[idx]) {
      return {
        type: "product",
        shopId: shop.id,
        productId: shop.products[idx].id,
      };
    }
  }

  const shops = getShops();

  if (/^\d+$/.test(raw)) {
    const idx = Number(raw) - 1;
    if (shops[idx]) return { type: "shop", shopId: shops[idx].id };
  }

  if (/^(chat|whatsapp|order)\b/i.test(lower) && currentShopId) {
    return { type: "whatsapp", shopId: currentShopId };
  }

  return { type: "chat", text: raw };
}

export { getShop, getProduct, shopSummary, productCaption };
