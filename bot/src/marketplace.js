/**
 * Marketplace catalog — shops with products, prices, images, WhatsApp links.
 * Sample shop: RoyaleApe Studios (scraped from royaleape.com).
 */

export const MARKETPLACE = {
  name: "Trade Square Marketplace",
  tagline: "Shops inside Trade Square Mall · Kwekwe",
  website: "https://tradesquaremall.com",
};

/** Mall “about” — only when user asks about the place */
export const PLACE_ABOUT = {
  name: "Trade Square Mall",
  city: "Kwekwe",
  country: "Zimbabwe",
  address: "Trade Square Mall, Kwekwe, Zimbabwe",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Trade%20Square%20Mall%2C%20Kwekwe%2C%20Zimbabwe",
  website: "https://tradesquaremall.com",
  about:
    "Trade Square is a modern shopping mall and business destination in the heart of Kwekwe — convenient, safe, and welcoming for shoppers and tenants.",
  hours: [
    { days: "Monday – Thursday", text: "10am – 8pm" },
    { days: "Friday – Saturday", text: "10am – 9pm" },
    { days: "Sunday", text: "11am – 7pm" },
  ],
};

export const SHOPS = [
  {
    id: "royaleape",
    name: "RoyaleApe Studios",
    floor: "Ground floor",
    number: "Shop 55",
    image: "https://www.royaleape.com/hero-mascot.png",
    description:
      "Print shop & digital studio — business cards, banners, DTF apparel, custom gifts, and website packages. Quotes fastest on WhatsApp.",
    link: "https://royaleape.com/",
    whatsapp: "https://wa.me/263778830198",
    whatsappNumber: "263778830198",
    hours: "Mon–Fri 08:00–18:00 · Sat 09:00–14:00",
    categories: ["Printing", "Apparel", "Gifts", "Websites"],
    products: [
      {
        id: "dtf-sheets",
        name: "DTF Ready-to-Press Sheets",
        description:
          "High-quality Direct to Film transfers — press with a heat press or iron. Build A3/A4 gang sheets online, then order on WhatsApp.",
        image: "https://www.royaleape.com/shop/dtf-sheets-800.jpg",
        link: "https://royaleape.com/dtf",
        includes: [
          "Print-ready DTF film",
          "Hot-melt powder finish",
          "Online gang sheet builder",
        ],
        variations: [
          {
            id: "a3",
            name: "A3 Size",
            price: 1.5,
            currency: "USD",
            note: "From — listed on royaleape.com",
          },
          {
            id: "other",
            name: "Other sizes / rolls",
            price: null,
            currency: "USD",
            note: "Quote on WhatsApp",
          },
        ],
      },
      {
        id: "custom-apparel",
        name: "Custom Branded Apparel",
        description:
          "Hoodies, polos, jackets, hats, and event tees — DTF or screen print. Send artwork on WhatsApp for a quote.",
        image: "https://www.royaleape.com/shop/custom-apparel-800.jpg",
        link: "https://royaleape.com/#shop",
        includes: ["Design placement mockup", "DTF or screen print options"],
        variations: [
          { id: "tee", name: "T-Shirt", price: null, currency: "USD", note: "Quote on WhatsApp" },
          { id: "polo", name: "Polo Shirt", price: null, currency: "USD", note: "Quote on WhatsApp" },
          { id: "hoodie", name: "Hoodie", price: null, currency: "USD", note: "Quote on WhatsApp" },
        ],
      },
      {
        id: "custom-gifts",
        name: "Customized Gifts & Merch",
        description:
          "Branded bottles, tote bags, and personalized gift sets for birthdays, launches, and corporate gifting.",
        image: "https://www.royaleape.com/shop/custom-gifts-800.jpg",
        link: "https://royaleape.com/#shop",
        includes: ["Logo print or engraving", "Gift-ready packaging options"],
        variations: [
          { id: "bottle", name: "Branded Bottle", price: null, currency: "USD", note: "Quote on WhatsApp" },
          { id: "tote", name: "Canvas Tote", price: null, currency: "USD", note: "Quote on WhatsApp" },
          { id: "hamper", name: "Custom Gift Box", price: null, currency: "USD", note: "Quote on WhatsApp" },
        ],
      },
      {
        id: "large-format",
        name: "Large Format Printing",
        description:
          "Vinyl, flex, canvas, one-way vision, banners, stickers, posters — priced to size. Fastest quote on WhatsApp.",
        image: "https://www.royaleape.com/hero-mascot.png",
        link: "https://royaleape.com/#pricing",
        includes: ["Banners", "Stickers", "Posters", "Canvas printing"],
        variations: [
          { id: "vinyl", name: "Vinyl / flex / canvas", price: null, currency: "USD", note: "Per m² — quote on WhatsApp" },
          { id: "signage", name: "Banners & signage", price: null, currency: "USD", note: "Quote on WhatsApp" },
        ],
      },
      {
        id: "web-packages",
        name: "Website Packages",
        description:
          "Business websites with hosting, domains, email, and SEO / AI-visibility help for local businesses.",
        image: "https://www.royaleape.com/hero-mascot.png",
        link: "https://royaleape.com/#web-packages",
        includes: ["Domain options", "SSL", "Hosting packages", "SEO for AI"],
        variations: [
          {
            id: "site",
            name: "Business website",
            price: null,
            currency: "USD",
            note: "Package quote on WhatsApp",
          },
        ],
      },
    ],
    services: [
      "Business cards",
      "Flyers & brochures",
      "Banners & signage",
      "Shop branding",
      "Custom apparel / DTF",
      "Custom gifts",
      "Canvas & portraits",
      "Website development",
      "SEO for AI",
    ],
  },
];

export function getShop(id) {
  return SHOPS.find((s) => s.id === id) || null;
}

export function getProduct(shopId, productId) {
  const shop = getShop(shopId);
  if (!shop) return null;
  const product = shop.products.find((p) => p.id === productId);
  return product ? { shop, product } : null;
}

export function formatMoney(amount, currency = "USD") {
  if (amount == null || Number.isNaN(Number(amount))) return "Quote on WhatsApp";
  if (currency === "USD") return `US$${Number(amount).toFixed(Number(amount) % 1 ? 2 : 0)}`;
  return `${currency} ${amount}`;
}

export function shopSummary(shop) {
  return `*${shop.name}*\n📍 ${shop.floor} · ${shop.number}\n${shop.description}\n🌐 ${shop.link}\n💬 Chat store: ${shop.whatsapp}`;
}

export function productCaption(shop, product) {
  const vars = product.variations
    .map((v) => {
      const priceLabel =
        v.price != null
          ? `*${formatMoney(v.price, v.currency)}*`
          : "*Quote on WhatsApp*";
      return `• ${v.name}: ${priceLabel}${v.note ? ` (${v.note})` : ""}`;
    })
    .join("\n");
  return `*${product.name}*\n${product.description}\n\n*Prices / options*\n${vars}\n\nOrder / chat with ${shop.name}:\n${shop.whatsapp}\n${product.link}`;
}

export function buildMarketplaceContext() {
  const lines = SHOPS.map((shop) => {
    const products = shop.products
      .map((p) => {
        const vars = p.variations
          .map((v) => `${v.name} ${formatMoney(v.price, v.currency)}${v.note ? ` (${v.note})` : ""}`)
          .join("; ");
        return `  - ${p.name}: ${p.description} Prices: ${vars}. Image: ${p.image}. Link: ${p.link}`;
      })
      .join("\n");
    return `SHOP ${shop.name}
Floor: ${shop.floor}
Number: ${shop.number}
Image: ${shop.image}
Description: ${shop.description}
Link: ${shop.link}
WhatsApp: ${shop.whatsapp}
Hours: ${shop.hours}
Services: ${shop.services.join(", ")}
Products:
${products}`;
  }).join("\n\n");

  return `You are a marketplace WhatsApp assistant for shops inside Trade Square Mall (Kwekwe).

Default focus: help customers browse SHOPS and PRODUCTS (name, floor, shop number, images, prices, variations) and send them to the shop WhatsApp to order.
Only talk about Trade Square Mall itself when the user asks about the mall / place / “about” / location / mall hours — not on every message.

PLACE (Trade Square Mall) — use only when asked about the place:
${PLACE_ABOUT.about}
Address: ${PLACE_ABOUT.address}
Maps: ${PLACE_ABOUT.mapsUrl}
Mall hours: ${PLACE_ABOUT.hours.map((h) => `${h.days} ${h.text}`).join("; ")}
Website: ${PLACE_ABOUT.website}

MARKETPLACE SHOPS:
${lines}

Reply style: warm, short WhatsApp messages; English/Shona mix OK. Prefer guiding users through menus (shops → products → prices) over dumping long lists.`;
}
