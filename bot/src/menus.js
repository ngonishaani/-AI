import {
  getShops,
  getShop,
  getProduct,
  shopSummary,
  productCaption,
  PLACE_ABOUT,
  MARKETPLACE,
  formatMoney,
} from "./marketplace.js";

/** Interactive list + text fallback menus for WhatsApp. */

export function mainMenuList() {
  const shops = getShops();
  return {
    text: textMainMenu(),
    footer: "Trade Square Marketplace",
    title: "Shops",
    buttonText: "View shops",
    sections: [
      {
        title: "Shops",
        rows: shops.map((s) => ({
          title: s.name.slice(0, 24),
          rowId: `shop:${s.id}`,
          description: `${s.floor} · ${s.number}`.slice(0, 72),
        })),
      },
      {
        title: "More",
        rows: [
          {
            title: "About the mall",
            rowId: "about:place",
            description: "Trade Square Mall info",
          },
        ],
      },
    ],
  };
}

export function shopMenuList(shop) {
  return {
    text: `${shopSummary(shop)}\n\nChoose a product:`,
    footer: shop.name,
    title: "Products",
    buttonText: "Products",
    sections: [
      {
        title: "Products & services",
        rows: (shop.products || []).map((p) => {
          const priced = (p.variations || []).find((v) => v.price != null);
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

export function shopListLines() {
  return getShops()
    .map(
      (s, i) =>
        `${i + 1}. *${s.name}*\n   ${s.floor} · ${s.number}\n   ${
          s.categories?.slice(0, 3).join(" · ") ||
          String(s.description || "").slice(0, 60)
        }`
    )
    .join("\n\n");
}

export function textMainMenu() {
  return `Welcome to *${MARKETPLACE.name}* 🛍️\n${MARKETPLACE.tagline}\n\n*Shops*\n${shopListLines()}\n\n👉 Reply with a *number* or *shop name*\n👉 Or just tell me what you want — I chat naturally\n👉 *about* = mall info`;
}

export function textShopMenu(shop) {
  const lines = (shop.products || [])
    .map((p, i) => {
      const priced = (p.variations || []).find((v) => v.price != null);
      return `${i + 1}. *${p.name}* — ${
        priced ? `from ${formatMoney(priced.price, priced.currency)}` : "quote on WhatsApp"
      }`;
    })
    .join("\n");
  return `${shopSummary(shop)}\n\n*Products*\n${lines}\n\nReply with a number / product name.\n*chat* = WhatsApp the store · *menu* = all shops`;
}

export function aboutPlaceText() {
  const hours = PLACE_ABOUT.hours
    .map((h) => `• ${h.days}: ${h.text}`)
    .join("\n");
  return `*${PLACE_ABOUT.name}*\n${PLACE_ABOUT.about}\n\n📍 ${PLACE_ABOUT.address}\n🗺 ${PLACE_ABOUT.mapsUrl}\n\n*Mall hours*\n${hours}\n\n🌐 ${PLACE_ABOUT.website}\n\nReply *menu* to browse marketplace shops.`;
}

/**
 * Only hard-route explicit menu UI / shortcuts.
 * Greetings and free-text needs go to Gemini for natural conversation.
 */
export function parseMenuSelection(text, { currentShopId } = {}) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return { type: "chat", text: "" };

  // Interactive row ids
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

  // Explicit shop list only (greetings are conversational via Gemini)
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

  // Number under a shop context → product
  if (currentShopId && /^\d+$/.test(raw)) {
    const shop = getShop(currentShopId);
    const idx = Number(raw) - 1;
    if (shop?.products?.[idx]) {
      return { type: "product", shopId: shop.id, productId: shop.products[idx].id };
    }
  }

  const shops = getShops();

  // Number on main menu → shop
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
