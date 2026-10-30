import {
  SHOPS,
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
  return {
    text: `Welcome to *${MARKETPLACE.name}* 🛍️\n${MARKETPLACE.tagline}\n\nPick a shop to browse products & prices:`,
    footer: "Trade Square Marketplace",
    title: "Shops",
    buttonText: "Open menu",
    sections: [
      {
        title: "Shops",
        rows: SHOPS.map((s) => ({
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
          {
            title: "Main menu",
            rowId: "menu:main",
            description: "Back to shops",
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
        rows: shop.products.map((p) => {
          const priced = p.variations.find((v) => v.price != null);
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

export function textMainMenu() {
  const lines = SHOPS.map(
    (s, i) => `${i + 1}. *${s.name}* — ${s.floor}, ${s.number}`
  ).join("\n");
  return `Welcome to *${MARKETPLACE.name}* 🛍️\n${MARKETPLACE.tagline}\n\n*Shops*\n${lines}\n\nReply with a number, shop name, or *menu*.\nFor the mall itself, reply *about*.`;
}

export function textShopMenu(shop) {
  const lines = shop.products
    .map((p, i) => {
      const priced = p.variations.find((v) => v.price != null);
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

export function parseMenuSelection(text, { currentShopId } = {}) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return { type: "menu" };

  // Interactive row ids (must run before greeting regexes — "shop:…" looks like "shop")
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

  if (/^(menu|hi|hello|hey|start|shops?|marketplace|mhoro|masikati)\b/i.test(lower)) {
    return { type: "menu" };
  }
  if (/^(about|mall|place|location|where is the mall|trade square)\b/i.test(lower)) {
    return { type: "about" };
  }

  // Number under a shop context → product
  if (currentShopId && /^\d+$/.test(raw)) {
    const shop = getShop(currentShopId);
    const idx = Number(raw) - 1;
    if (shop?.products[idx]) {
      return { type: "product", shopId: shop.id, productId: shop.products[idx].id };
    }
  }

  // Number on main menu → shop
  if (/^\d+$/.test(raw)) {
    const idx = Number(raw) - 1;
    if (SHOPS[idx]) return { type: "shop", shopId: SHOPS[idx].id };
  }

  if (/^(chat|whatsapp|order)\b/i.test(lower) && currentShopId) {
    return { type: "whatsapp", shopId: currentShopId };
  }

  // Fuzzy shop name
  const shopHit = SHOPS.find(
    (s) =>
      lower.includes(s.id) ||
      lower.includes(s.name.toLowerCase()) ||
      lower.includes("royale ape") ||
      lower.includes("royaleape") ||
      /\broyale\b/.test(lower)
  );
  if (
    shopHit &&
    /shop|royale|print|store|studios/i.test(lower) &&
    !/product|hoodie|dtf|shirt|gift|website|banner/i.test(lower)
  ) {
    return { type: "shop", shopId: shopHit.id };
  }

  // Fuzzy product within current shop or all shops
  const searchShops = currentShopId ? [getShop(currentShopId)].filter(Boolean) : SHOPS;
  for (const shop of searchShops) {
    const product = shop.products.find(
      (p) =>
        lower.includes(p.id) ||
        lower.includes(p.name.toLowerCase()) ||
        p.variations.some((v) => lower.includes(v.name.toLowerCase()))
    );
    if (product) return { type: "product", shopId: shop.id, productId: product.id };
  }

  // Common product keywords
  if (/\b(dtf|gang\s*sheet|transfer)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "dtf-sheets" };
  }
  if (/\b(hoodie|t-?shirt|polo|apparel|clothing)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "custom-apparel" };
  }
  if (/\b(gift|bottle|tote|hamper|merch)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "custom-gifts" };
  }
  if (/\b(banner|vinyl|flex|canvas|large\s*format)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "large-format" };
  }
  if (/\b(website|web\s*package|seo)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "web-packages" };
  }

  return { type: "chat", text: raw };
}

export { getShop, getProduct, shopSummary, productCaption };
