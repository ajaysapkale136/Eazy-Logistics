const express = require("express");
const router = express.Router();
const axios = require("axios");
const Listing = require("../models/listing");
const mapToken = process.env.MAP_TOKEN;

const OVERPASS_FILTERS_BY_INTENT = {
  food: [
    { key: "amenity", valueRegex: "restaurant|cafe|fast_food|food_court|bar" },
    { key: "tourism", valueRegex: "hotel|guest_house|hostel|motel|resort" },
  ],
  hospital: [{ key: "amenity", valueRegex: "hospital|clinic|doctors|pharmacy" }],
  atm: [{ key: "amenity", valueRegex: "atm|bank" }],
  travel: [
    { key: "tourism", valueRegex: "attraction|museum|viewpoint" },
    { key: "aeroway", valueRegex: "aerodrome" },
    { key: "railway", valueRegex: "station" },
    { key: "amenity", valueRegex: "bus_station|ferry_terminal" },
  ],
};

const MAPBOX_QUERY_HINTS = {
  food: ["restaurant", "cafe", "hotel"],
  hospital: ["hospital", "clinic", "pharmacy"],
  atm: ["atm", "bank"],
  travel: ["tourist attraction", "bus station", "railway station"],
};

function normalizeIntent(value = "") {
  const normalized = String(value).trim().toLowerCase();
  return ["food", "hospital", "atm", "travel"].includes(normalized) ? normalized : "food";
}

function parseRadiusKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 2.5;
  return Math.min(10, Math.max(0.5, n));
}

function buildRadiusBBox(lng, lat, radiusKm) {
  const latDelta = radiusKm / 110.574;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return [lng - lngDelta, lat - latDelta, lng + lngDelta, lat + latDelta];
}

function buildOverpassQuery(intent, radiusMeters, lat, lng) {
  const filters = OVERPASS_FILTERS_BY_INTENT[intent] || OVERPASS_FILTERS_BY_INTENT.food;
  const selectors = [];

  filters.forEach((filter) => {
    const escapedValue = String(filter.valueRegex).replace(/"/g, '\\"');
    selectors.push(`node["${filter.key}"~"${escapedValue}"](around:${radiusMeters},${lat},${lng});`);
    selectors.push(`way["${filter.key}"~"${escapedValue}"](around:${radiusMeters},${lat},${lng});`);
    selectors.push(`relation["${filter.key}"~"${escapedValue}"](around:${radiusMeters},${lat},${lng});`);
  });

  return `[out:json][timeout:25];(${selectors.join("")});out center;`;
}

function normalizeOverpassElement(element) {
  const coordinates =
    typeof element.lon === "number" && typeof element.lat === "number"
      ? [element.lon, element.lat]
      : element.center && typeof element.center.lon === "number" && typeof element.center.lat === "number"
        ? [element.center.lon, element.center.lat]
        : null;

  if (!coordinates) return null;

  const title = element.tags?.name || "Nearby place";
  const subtitle =
    element.tags?.["addr:full"] ||
    element.tags?.["addr:street"] ||
    element.tags?.amenity ||
    element.tags?.tourism ||
    "";

  return {
    id: element.id ? `osm-${element.type || "element"}-${element.id}` : `${coordinates[0]},${coordinates[1]}`,
    coordinates,
    title,
    subtitle,
  };
}

function normalizeMapboxFeature(feature) {
  const coords = feature?.center || feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  return {
    id: feature.id || `${coords[0]},${coords[1]}`,
    coordinates: coords,
    title: feature.text || feature.properties?.name || "Nearby place",
    subtitle: feature.place_name || feature.properties?.address || "",
  };
}

async function fetchNearbyPlacesFromMapbox(intent, lat, lng, radiusKm) {
  if (!mapToken) return [];

  const bbox = buildRadiusBBox(lng, lat, radiusKm).join(",");
  const hints = MAPBOX_QUERY_HINTS[intent] || MAPBOX_QUERY_HINTS.food;
  const collected = [];
  const seen = new Set();

  for (const hint of hints) {
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        hint
      )}.json`;
      const response = await axios.get(endpoint, {
        params: {
          access_token: mapToken,
          proximity: `${lng},${lat}`,
          bbox,
          types: "poi",
          limit: 8,
          language: "en",
        },
        timeout: 12000,
      });

      const features = Array.isArray(response.data?.features) ? response.data.features : [];
      for (const feature of features) {
        const place = normalizeMapboxFeature(feature);
        if (!place) continue;
        const key = place.id || `${place.coordinates[0].toFixed(5)},${place.coordinates[1].toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push(place);
        if (collected.length >= 16) return collected;
      }
    } catch (_error) {
      // keep trying next query hint
    }
  }

  return collected;
}

function normalizeNominatimPlace(place) {
  const lng = Number(place?.lon);
  const lat = Number(place?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const title =
    place.name ||
    place.display_name?.split(",")?.[0]?.trim() ||
    "Nearby place";
  const subtitle = place.display_name || "";

  return {
    id: place.place_id ? `nom-${place.place_id}` : `${lng},${lat}`,
    coordinates: [lng, lat],
    title,
    subtitle,
  };
}

async function fetchNearbyPlacesFromNominatim(intent, lat, lng, radiusKm) {
  const [minLng, minLat, maxLng, maxLat] = buildRadiusBBox(lng, lat, radiusKm);
  const hints = MAPBOX_QUERY_HINTS[intent] || MAPBOX_QUERY_HINTS.food;
  const results = [];
  const seen = new Set();

  for (const hint of hints) {
    try {
      const response = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: {
          q: hint,
          format: "jsonv2",
          limit: 8,
          bounded: 1,
          viewbox: `${minLng},${maxLat},${maxLng},${minLat}`,
        },
        headers: {
          "User-Agent": "Eazy-Logistics/1.0 (nearby-poi-search)",
        },
        timeout: 12000,
      });

      const places = Array.isArray(response.data) ? response.data : [];
      for (const item of places) {
        const normalized = normalizeNominatimPlace(item);
        if (!normalized) continue;
        const key =
          normalized.id ||
          `${normalized.coordinates[0].toFixed(5)},${normalized.coordinates[1].toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(normalized);
        if (results.length >= 16) return results;
      }
    } catch (_error) {
      // continue to next hint
    }
  }

  return results;
}

// Search listings (with optional text and category)
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q?.trim() || "";
    const category = req.query.category?.trim() || "";
    const filter = {};

    if (category && category.toLowerCase() !== "all") {
      filter.category = new RegExp(`^${category}$`, "i");
    }

    let results;
    if (q) {
      results = await Listing.find(
        { $text: { $search: q }, ...filter },
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } });
    } else {
      results = await Listing.find(filter).sort({ createdAt: -1 });
    }

    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Nearby places API (server-side to avoid browser CORS / token-origin issues)
router.get("/nearby-places", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const intent = normalizeIntent(req.query.intent);
    const radiusKm = parseRadiusKm(req.query.radiusKm);
    const radiusMeters = Math.round(radiusKm * 1000);
    const query = buildOverpassQuery(intent, radiusMeters, lat, lng);
    const body = new URLSearchParams({ data: query }).toString();

    const endpointCandidates = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    let lastError = null;
    let responseData = null;

    for (const endpoint of endpointCandidates) {
      try {
        const response = await axios.post(endpoint, body, {
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          timeout: 15000,
        });
        responseData = response.data;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    const seen = new Set();
    let places = [];

    if (responseData) {
      const elements = Array.isArray(responseData.elements) ? responseData.elements : [];
      for (const element of elements) {
        const place = normalizeOverpassElement(element);
        if (!place) continue;
        const key = place.id || `${place.coordinates[0].toFixed(5)},${place.coordinates[1].toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        places.push(place);
        if (places.length >= 16) break;
      }
    }

    if (!places.length) {
      places = await fetchNearbyPlacesFromMapbox(intent, lat, lng, radiusKm);
    }

    if (!places.length) {
      places = await fetchNearbyPlacesFromNominatim(intent, lat, lng, radiusKm);
    }

    if (!places.length && !responseData && lastError) {
      return res.status(502).json({ error: lastError.message || "Nearby places provider unavailable" });
    }

    return res.json({ places });
  } catch (error) {
    console.error("Nearby places API error:", error.message || error);
    return res.status(500).json({ error: "Nearby places failed" });
  }
});

// Increment view count
router.get("/:id", async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    );
    if (!listing) return res.status(404).json({ error: "Not found" });
    return res.json(listing);
  } catch (err) {
    console.error("View count error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
