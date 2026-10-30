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
    text: textMainMenu(),
    footer: "Trade Square Marketplace",
    title: "Shops",
    buttonText: "View shops",
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

export function shopListLines() {
  return SHOPS.map(
    (s, i) =>
      `${i + 1}. *${s.name}*\n   ${s.floor} · ${s.number}\n   ${s.categories?.slice(0, 3).join(" · ") || s.description.slice(0, 60)}`
  ).join("\n\n");
}

export function textMainMenu() {
  return `Welcome to *${MARKETPLACE.name}* 🛍️\n${MARKETPLACE.tagline}\n\n*Shops*\n${shopListLines()}\n\n👉 Reply with a *number* or *shop name*\n👉 Or type what you want (e.g. DTF, hoodies, banners, website)\n👉 *about* = mall info`;
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

/** Match typed need → product across all shops */
function matchTypedNeed(lower) {
  if (/\b(dtf|gang\s*sheets?|transfers?|heat\s*press)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "dtf-sheets" };
  }
  if (
    /\b(hoodies?|t-?shirts?|tees?\b|polos?|apparel|clothing|jerseys?|uniforms?)\b/i.test(
      lower
    )
  ) {
    return { type: "product", shopId: "royaleape", productId: "custom-apparel" };
  }
  if (/\b(gifts?|bottles?|totes?|hampers?|merch)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "custom-gifts" };
  }
  if (/\b(business\s*cards?|flyers?|brochures?)\b/i.test(lower)) {
    return { type: "shop", shopId: "royaleape" };
  }
  if (
    /\b(banners?|vinyl|flex|canvas|large\s*format|signage|posters?|stickers?|prints?|printing)\b/i.test(
      lower
    )
  ) {
    return { type: "product", shopId: "royaleape", productId: "large-format" };
  }
  if (/\b(websites?|web\s*sites?|web\s*packages?|seo|hosting)\b/i.test(lower)) {
    return { type: "product", shopId: "royaleape", productId: "web-packages" };
  }
  return null;
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

  if (
    /^(menu|hi|hello|hey|start|shops?|list|marketplace|mhoro|masikati|good\s*(morning|afternoon|evening)|howdy|sup)\b/i.test(
      lower
    )
  ) {
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

  // Typed need (product / service) — works without picking a shop first
  const need = matchTypedNeed(lower);
  if (need) return need;

  // Fuzzy shop name (typing the shop alone is enough)
  const shopHit = SHOPS.find((s) => {
    const name = s.name.toLowerCase();
    return (
      lower === s.id ||
      lower === name ||
      lower.includes(s.id) ||
      lower.includes(name) ||
      lower.includes("royale ape") ||
      lower.includes("royaleape") ||
      /\broyale\b/.test(lower)
    );
  });
  if (shopHit) {
    return { type: "shop", shopId: shopHit.id };
  }

  // Fuzzy product name across current shop, then all shops
  const searchOrder = [
    ...(currentShopId ? [getShop(currentShopId)].filter(Boolean) : []),
    ...SHOPS.filter((s) => s.id !== currentShopId),
  ];
  for (const shop of searchOrder) {
    const product = shop.products.find(
      (p) =>
        lower.includes(p.id.replace(/-/g, " ")) ||
        lower.includes(p.id) ||
        lower.includes(p.name.toLowerCase()) ||
        p.variations.some((v) => lower.includes(v.name.toLowerCase()))
    );
    if (product) return { type: "product", shopId: shop.id, productId: product.id };
  }

  return { type: "chat", text: raw };
}

export { getShop, getProduct, shopSummary, productCaption };
