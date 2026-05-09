const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");

// 🗂 Get categories + trending
router.get("/all", async (req, res) => {
  try {
    const categories = [
        { key: "Trending", icon: "🔥" },
        { key: "Rooms", icon: "🛏️" },
        { key: "Iconic Citys", icon: "🏙️" },
        { key: "Mountain", icon: "⛰️" },
        { key: "Castles", icon: "🏰" },
        { key: "Amazing Pools", icon: "🏊" },
        { key: "Camping", icon: "⛺" },
        { key: "Farms", icon: "🌾" },
        { key: "Arctic", icon: "❄️" },
        { key: "Domes", icon: "🎪" },
        { key: "Boats", icon: "🚤" }
      ];

    const trending = await Listing.find()
      .sort({ viewCount: -1 })
      .limit(6)
      .lean();

    res.json({ categories, trending });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
