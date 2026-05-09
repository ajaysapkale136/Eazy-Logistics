const axios = require("axios");
const detectKeyword = require("./categorizer");

// Environment toggles
const USE_AI = process.env.USE_AI_CATEGORY === "true";
const AI_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:5000/predict";
const parsedConfidence = parseFloat(process.env.AI_CONFIDENCE || "0.45");
const MIN_CONFIDENCE = Number.isFinite(parsedConfidence) ? parsedConfidence : 0.45;

// Allowed categories
const VALID_CATEGORIES = [
  "Trending",
  "Rooms",
  "Iconic Citys",
  "Mountain",
  "Castles",
  "Amazing Pools",
  "Camping",
  "Farms",
  "Arctic",
  "Domes",
  "Boats",
];

function normalizeCategory(output = "") {
  const text = String(output || "").toLowerCase();

  if (text.includes("mountain") || text.includes("hill")) return "Mountain";
  if (
    text.includes("pool") ||
    text.includes("beach") ||
    text.includes("ocean") ||
    text.includes("waterfront")
  )
    return "Amazing Pools";
  if (text.includes("castle") || text.includes("fort") || text.includes("palace")) return "Castles";
  if (text.includes("farm") || text.includes("village") || text.includes("ranch")) return "Farms";
  if (text.includes("camp") || text.includes("tent")) return "Camping";
  if (text.includes("arctic") || text.includes("snow") || text.includes("ice") || text.includes("glacier")) return "Arctic";
  if (text.includes("boat") || text.includes("ship") || text.includes("yacht") || text.includes("cruise")) return "Boats";
  if (text.includes("igloo") || text.includes("dome") || text.includes("geodesic") || text.includes("bubble")) return "Domes";
  if (
    text.includes("city") ||
    text.includes("urban") ||
    text.includes("metro") ||
    text.includes("downtown") ||
    text.includes("skyline")
  )
    return "Iconic Citys";
  if (text.includes("room") || text.includes("bed") || text.includes("suite")) return "Rooms";
  if (text.includes("trend") || text.includes("popular") || text.includes("featured") || text.includes("premium")) return "Trending";

  return null;
}

function cleanText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SCORING_RULES = {
  Mountain: [
    { pattern: /\bmountain|hills?|peak|valley|cliff|ridge|himalaya|ghat\b/g, weight: 2.4 },
    { pattern: /\btrek|trekking|scenic\s+view\b/g, weight: 1.2 },
  ],
  Rooms: [
    { pattern: /\broom|bedroom|suite|hostel|dorm|studio\s+room|guest\s+room|private\s+room\b/g, weight: 2.3 },
    { pattern: /\bsingle\s+room|double\s+room\b/g, weight: 1.3 },
  ],
  "Iconic Citys": [
    { pattern: /\bcity|urban|metro|downtown|skyline|city\s+center|city\s+centre|business\s+district\b/g, weight: 2.1 },
    { pattern: /\bhigh\s*rise|apartment|penthouse\b/g, weight: 1.0 },
  ],
  Castles: [{ pattern: /\bcastle|fort|palace|royal|heritage|haveli|mansion\b/g, weight: 2.4 }],
  "Amazing Pools": [
    { pattern: /\bpool|swimming|infinity\s+pool|plunge\s+pool|beach|beachfront|ocean|sea\s+view|waterfront|lakefront\b/g, weight: 2.35 },
  ],
  Camping: [{ pattern: /\bcamp|camping|campfire|bonfire|tent|campsite|glamp|glamping\b/g, weight: 2.35 }],
  Farms: [{ pattern: /\bfarm|farmhouse|farmstay|farmland|agriculture|orchard|barn|ranch|village\s+stay\b/g, weight: 2.25 }],
  Arctic: [{ pattern: /\barctic|snow|snowfall|ice|icy|glacier|frozen\b/g, weight: 2.35 }],
  Domes: [{ pattern: /\bdome|domes|geodesic|igloo|bubble\s+house|pod\s+stay\b/g, weight: 2.25 }],
  Boats: [{ pattern: /\bboat|boats|houseboat|yacht|ship|sailing|sailboat|cruise|river\s+cruise\b/g, weight: 2.35 }],
  Trending: [{ pattern: /\btrending|popular|featured|luxury|premium|viral|exclusive\b/g, weight: 1.1 }],
};

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function scoreFromText(text, multiplier = 1) {
  const scores = {};
  const normalized = cleanText(text);

  if (!normalized) return scores;

  for (const category of Object.keys(SCORING_RULES)) {
    let total = 0;
    for (const rule of SCORING_RULES[category]) {
      total += countMatches(normalized, rule.pattern) * rule.weight * multiplier;
    }
    if (total > 0) {
      scores[category] = (scores[category] || 0) + total;
    }
  }

  return scores;
}

function mergeScores(base = {}, extra = {}) {
  const merged = { ...base };
  for (const [category, score] of Object.entries(extra)) {
    merged[category] = (merged[category] || 0) + score;
  }
  return merged;
}

function bestScoredCategory(title = "", description = "") {
  const titleScores = scoreFromText(title, 1.65);
  const descriptionScores = scoreFromText(description, 1.0);
  const merged = mergeScores(titleScores, descriptionScores);

  let winner = null;
  let max = 0;

  for (const [category, score] of Object.entries(merged)) {
    if (score > max) {
      max = score;
      winner = category;
    }
  }

  if (winner && VALID_CATEGORIES.includes(winner) && max >= 1.2) {
    return winner;
  }

  return null;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchAiPrediction(payloads = []) {
  for (const payload of payloads) {
    try {
      const response = await axios.post(AI_URL, payload, { timeout: 1800 });
      const rawCategory = response?.data?.category || "";
      const confidence = toNumber(response?.data?.confidence);
      const normalized = normalizeCategory(rawCategory);

      if (normalized && VALID_CATEGORIES.includes(normalized)) {
        return { category: normalized, confidence };
      }
    } catch (_err) {
      // Try next payload variant quietly.
    }
  }

  return null;
}

/**
 * Main AI Category Detection
 * Accepts title + description (keeps old signature; also supports single combined text).
 */
async function detectCategoryAI(title = "", description = "") {
  const safeTitle = typeof title === "string" ? title : "";
  const safeDescription = typeof description === "string" ? description : "";
  const combinedText = `${safeTitle} ${safeDescription}`.trim();

  const scoredGuess =
    bestScoredCategory(safeTitle, safeDescription) ||
    bestScoredCategory(combinedText, "");

  const keywordGuess = detectKeyword(combinedText) || "Trending";

  try {
    if (!USE_AI) {
      return scoredGuess || keywordGuess;
    }

    // Try both API payload styles to avoid integration errors.
    const fallbackDescription = safeDescription || safeTitle || combinedText || "listing";
    const payloads = [
      { title: safeTitle || combinedText, description: fallbackDescription },
      { text: combinedText },
    ];

    const ai = await fetchAiPrediction(payloads);

    if (ai?.category && ai.confidence >= MIN_CONFIDENCE) {
      return ai.category;
    }

    // Low-confidence AI -> trust weighted local rules first.
    if (scoredGuess) {
      return scoredGuess;
    }

    if (ai?.category) {
      return ai.category;
    }

    return keywordGuess;
  } catch (err) {
    console.error("AI categorizer error:", err.message);
    return scoredGuess || keywordGuess;
  }
}

module.exports = detectCategoryAI;
