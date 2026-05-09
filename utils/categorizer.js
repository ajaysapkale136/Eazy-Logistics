function makeRegex(words = []) {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "i");
}

const RULES = [
  { category: "Mountain", pattern: makeRegex(["mountain", "hill", "hills", "peak", "himalaya", "ghat", "valley", "cliff"]) },
  { category: "Castles", pattern: makeRegex(["castle", "fort", "heritage", "palace", "royal", "haveli"]) },
  { category: "Amazing Pools", pattern: makeRegex(["beach", "pool", "swimming", "infinity pool", "resort", "waterfront", "ocean", "sea view"]) },
  { category: "Camping", pattern: makeRegex(["camp", "tent", "camping", "campfire", "bonfire", "campsite", "glamping"]) },
  { category: "Farms", pattern: makeRegex(["farm", "agriculture", "tractor", "village", "barn", "farmland", "farmstay"]) },
  { category: "Arctic", pattern: makeRegex(["snow", "arctic", "ice", "cold", "frozen", "glacier", "snowfall"]) },
  { category: "Domes", pattern: makeRegex(["igloo", "dome", "geodesic", "bubble house", "pod stay"]) },
  { category: "Boats", pattern: makeRegex(["boat", "houseboat", "yacht", "ship", "sail", "cruise", "sailing"]) },
  { category: "Iconic Citys", pattern: makeRegex(["city", "urban", "metro", "downtown", "skyline", "city center", "city centre", "business district"]) },
  { category: "Rooms", pattern: makeRegex(["room", "bedroom", "single room", "double room", "guest room", "hotel room", "suite"]) },
  { category: "Trending", pattern: makeRegex(["trending", "popular", "featured", "premium", "luxury"]) },
];

function detectKeyword(text = "") {
  if (!text || typeof text !== "string") return "Trending";

  const normalized = text
    .toLowerCase()
    .replace(/[\u2013\u2014_,.;:!?"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.category;
  }

  return "Trending";
}

module.exports = detectKeyword;
