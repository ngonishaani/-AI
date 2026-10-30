/**
 * Trade Square Mall directory — shops, dining, hours, amenities.
 * Used as grounded context for the Gemini WhatsApp / web chatbot.
 */

const MALL = {
  name: "Trade Square Mall",
  city: "Kwekwe",
  country: "Zimbabwe",
  address: "Trade Square Mall, Kwekwe, Zimbabwe",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Trade%20Square%20Mall%2C%20Kwekwe%2C%20Zimbabwe",
  about:
    "Trade Square is a modern shopping mall and business destination in the heart of Kwekwe. Our goal is to provide customers, tenants and the wider community with a convenient, safe, vibrant and welcoming environment.",
  website: "https://tradesquaremall.com",
};

const HOURS = [
  { days: "Monday – Thursday", text: "10am – 8pm" },
  { days: "Friday – Saturday", text: "10am – 9pm" },
  { days: "Sunday", text: "11am – 7pm" },
];

const SHOPS = [
  {
    slug: "barbers",
    name: "Barbers",
    kind: "shop",
    category: "Grooming",
    level: "Ground floor",
    hours: "Mall hours",
    summary: "Barber chairs for a cut on the way through the mall.",
    about:
      "Barbers at Trade Square Mall. Walk in from the parking and take a chair on the ground floor.",
  },
  {
    slug: "salons",
    name: "Salons",
    kind: "shop",
    category: "Grooming",
    level: "Ground floor",
    hours: "Mall hours",
    summary: "Hair salons along the shopfront.",
    about:
      "Salons for wash, style, and colour. Rooms can be partitioned to suit the chair layout.",
  },
  {
    slug: "cosmetics",
    name: "Cosmetics",
    kind: "shop",
    category: "Beauty",
    level: "Ground floor",
    hours: "Mall hours",
    summary: "Cosmetics and beauty counters.",
    about:
      "Cosmetics shops for everyday beauty and gifts. Ask about a 12 or 25 square metre space.",
  },
  {
    slug: "pet-stores",
    name: "Pet stores",
    kind: "shop",
    category: "Pets",
    level: "Ground floor",
    hours: "Mall hours",
    summary: "Pet shops for food, care, and supplies.",
    about:
      "Pet stores inside the mall, with parking right outside for a quick stop.",
  },
  {
    slug: "clothing",
    name: "Clothing",
    kind: "shop",
    category: "Fashion",
    level: "Level 1",
    hours: "Mall hours",
    summary: "Clothing stores on the upper shop floor.",
    about:
      "Clothing retail at Trade Square Mall. Shops can be taken as 12 or 25 square metres, and partitioning is free.",
  },
  {
    slug: "shop-12",
    name: "12 sqm shop",
    kind: "shop",
    category: "Space",
    level: "Available",
    hours: "By tour",
    summary: "A 12 square metre shop, free to partition.",
    about:
      "Twelve square metre shop spaces. Partitioning is free. Book a tour to walk the floor and choose a bay.",
  },
  {
    slug: "shop-25",
    name: "25 sqm shop",
    kind: "shop",
    category: "Space",
    level: "Available",
    hours: "By tour",
    summary: "A 25 square metre shop, free to partition.",
    about:
      "Twenty-five square metre shop spaces for a larger room. Partitioning is free. Toilets are on every floor.",
  },
  {
    slug: "training-center",
    name: "Training Center",
    kind: "shop",
    category: "Training",
    level: "Level 2",
    hours: "By booking",
    summary: "A furnished classroom for 10 to 20 students.",
    about:
      "The Training Center is a well furnished classroom for 10 to 20 students. Book it for a course, a briefing, or a workshop.",
  },
];

const DINING = [
  {
    slug: "rooftop-lounge",
    name: "Rooftop Lounge",
    kind: "dine",
    category: "Lounge",
    level: "Rooftop",
    hours: "Evenings",
    seating: "Walk in",
    summary: "The lounge signed across the top of the building.",
    about:
      "Rooftop Lounge is the sign on the roof of Trade Square Mall, lit above the Trade Square mark.",
  },
  {
    slug: "cocktail-bar",
    name: "Cocktail bar & night club",
    kind: "dine",
    category: "Nightlife",
    level: "Rooftop",
    hours: "Evenings",
    seating: "Walk in",
    summary: "Cocktails and a night club after the shops close.",
    about:
      "A cocktail bar and night club at Trade Square Mall. Come up once the facade lights are on.",
  },
];

const EVENTS = [
  {
    slug: "official-opening",
    title: "Official opening",
    date: "2026-09-26",
    time: "Opening day",
    place: "Trade Square Mall",
    summary: "Upcoming. The official opening of Trade Square Mall.",
    about:
      "The official opening of Trade Square Mall is on the 26th of September. Shops, the cocktail bar, and Rooftop Lounge open with the building.",
  },
];

const AMENITIES = [
  { title: "Parking", text: "Parking in front of the mall, beside the shopfronts." },
  { title: "Toilets", text: "Toilets on every floor." },
  { title: "Shop sizes", text: "12 sqm and 25 sqm. Free to partition." },
  { title: "300kVA power", text: "300kVA supply for the building." },
  { title: "Boreholes", text: "Borehole water for the mall." },
  { title: "Solar backup", text: "Powered by solar electricity as a backup." },
  { title: "Cleaning", text: "Cleaning is part of the building service." },
  { title: "Security", text: "Security on site." },
  {
    title: "Training Center",
    text: "A well furnished classroom for 10 to 20 students.",
  },
];

function allPlaces() {
  return [...SHOPS, ...DINING];
}

function findPlace(query) {
  const q = String(query || "")
    .toLowerCase()
    .trim();
  if (!q) return [];
  const stop = new Set([
    "a",
    "an",
    "the",
    "is",
    "are",
    "on",
    "in",
    "at",
    "to",
    "for",
    "of",
    "and",
    "or",
    "what",
    "which",
    "where",
    "who",
    "how",
    "me",
    "about",
    "please",
    "tell",
    "list",
    "show",
    "any",
    "do",
    "you",
    "have",
  ]);
  const words = q
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !stop.has(w));
  if (!words.length) return [];
  return allPlaces().filter((p) => {
    const hay = [p.name, p.slug, p.category, p.level, p.summary, p.about]
      .join(" ")
      .toLowerCase();
    // Prefer name/slug/category hits; require most content words to match
    const hits = words.filter((w) => hay.includes(w));
    return hits.length >= Math.min(words.length, Math.max(1, Math.ceil(words.length * 0.6)));
  });
}

function buildDirectoryContext() {
  const shopLines = SHOPS.map(
    (s) =>
      `- ${s.name} [${s.category}] · ${s.level} · ${s.hours} — ${s.summary} ${s.about}`
  ).join("\n");
  const dineLines = DINING.map(
    (s) =>
      `- ${s.name} [${s.category}] · ${s.level} · ${s.hours}${
        s.seating ? ` · seating: ${s.seating}` : ""
      } — ${s.summary} ${s.about}`
  ).join("\n");
  const hourLines = HOURS.map((h) => `- ${h.days}: ${h.text}`).join("\n");
  const amenityLines = AMENITIES.map((a) => `- ${a.title}: ${a.text}`).join(
    "\n"
  );
  const eventLines = EVENTS.map(
    (e) =>
      `- ${e.title} (${e.date}, ${e.time}) at ${e.place} — ${e.summary} ${e.about}`
  ).join("\n");

  return `MALL
Name: ${MALL.name}
Location: ${MALL.address}
Website: ${MALL.website}
Maps: ${MALL.mapsUrl}
About: ${MALL.about}

OPENING HOURS
${hourLines}

SHOP DIRECTORY
${shopLines}

DINE & NIGHTLIFE
${dineLines}

EVENTS
${eventLines}

AMENITIES & TENANT FACTS
${amenityLines}

TOURS
Visitors can book a tour to walk 12 sqm and 25 sqm shop bays, the Training Center, and the rooftop cocktail bar / night club. Partitioning of shop spaces is free.`;
}

module.exports = {
  MALL,
  HOURS,
  SHOPS,
  DINING,
  EVENTS,
  AMENITIES,
  allPlaces,
  findPlace,
  buildDirectoryContext,
};
