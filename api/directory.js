/**
 * Public JSON shop / dine directory for the mall chatbot and site tooling.
 */

const {
  MALL,
  HOURS,
  SHOPS,
  DINING,
  EVENTS,
  AMENITIES,
  findPlace,
} = require("../lib/shop-directory");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = req.query.q || req.query.query || "";
  if (q) {
    return res.status(200).json({
      query: q,
      results: findPlace(q),
    });
  }

  return res.status(200).json({
    mall: MALL,
    hours: HOURS,
    shops: SHOPS,
    dining: DINING,
    events: EVENTS,
    amenities: AMENITIES,
  });
};
