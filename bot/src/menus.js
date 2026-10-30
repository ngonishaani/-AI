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
    text: textShopMenu(shop),
    footer: shop.name,
    title: "Products",
    buttonText: "Products",
    sections: [
      {
        title: "Products & services",
        rows: shop.products.map((p) => {
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

export function textShopMenu(shop) {
  const productBlock = shop.products
    .map((p, i) => {
      const hint = productPriceHint(p);
      const blurb = cleanText(p.description, { max: 70 }).replace(/\n/g, " ");
      const lines = [`*${i + 1} · ${p.name}*`, `   ${hint}`];
      if (blurb && blurb.toLowerCase() !== String(p.name).toLowerCase()) {
        lines.push(`   _${blurb}_`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    shopSummary(shop),
    "",
    DIVIDER,
    `*Products* (${shop.products.length})`,
    "",
    productBlock || "_No products listed yet._",
    "",
    DIVIDER,
    "*Next*",
    "• Reply with a *number* or product name",
    "• *chat* — WhatsApp this store",
    "• *menu* — all shops",
  ].join("\n");
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
    `📍 ${shopLocationLine(shop)}`,
    "",
    shop.whatsapp || shop.link || "Ask at the mall for this shop’s WhatsApp.",
    "",
    "Tell them what you need (size, quantity, deadline).",
    "",
    DIVIDER,
    "Reply *menu* anytime to browse other shops.",
  ].join("\n");
}

export function geminiFollowUpText() {
  return [
    DIVIDER,
    "*Shops*",
    shopListLines(),
    "",
    "Reply with a *number*, shop name, or type what you want.",
  ].join("\n");
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

  const shops = getShops();

  // Number on main menu → shop
  if (/^\d+$/.test(raw)) {
    const idx = Number(raw) - 1;
    if (shops[idx]) return { type: "shop", shopId: shops[idx].id };
  }

  if (/^(chat|whatsapp|order)\b/i.test(lower) && currentShopId) {
    return { type: "whatsapp", shopId: currentShopId };
  }

  // Typed need (product / service) — works without picking a shop first
  const need = matchTypedNeed(lower);
  if (need) return need;

  // Fuzzy shop name (typing the shop alone is enough)
  const shopHit = shops.find((s) => {
    const name = s.name.toLowerCase();
    return (
      lower === s.id ||
      lower === name ||
      lower.includes(s.id) ||
      lower.includes(name) ||
      (s.id === "royaleape" &&
        (lower.includes("royale ape") ||
          lower.includes("royaleape") ||
          /\broyale\b/.test(lower)))
    );
  });
  if (shopHit) {
    return { type: "shop", shopId: shopHit.id };
  }

  // Fuzzy product name across current shop, then all shops
  const searchOrder = [
    ...(currentShopId ? [getShop(currentShopId)].filter(Boolean) : []),
    ...shops.filter((s) => s.id !== currentShopId),
  ];
  for (const shop of searchOrder) {
    const product = shop.products.find(
      (p) =>
        lower.includes(p.id.replace(/-/g, " ")) ||
        lower.includes(p.id) ||
        lower.includes(p.name.toLowerCase()) ||
        (Array.isArray(p.variations) &&
          p.variations.some((v) => lower.includes(String(v.name || "").toLowerCase())))
    );
    if (product) return { type: "product", shopId: shop.id, productId: product.id };
  }

  return { type: "chat", text: raw };
}

export { getShop, getProduct, shopSummary, productCaption };
