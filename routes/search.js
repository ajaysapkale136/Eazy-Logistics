const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");

// 🔍 Search with filters
router.get("/search", async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, location } = req.query;

    let filter = {};

    // Text search
    if (q && q.trim() !== "") {
      filter.$text = { $search: q };
    }

    // Category filter
    if (category && category !== "All") {
      filter.category = category;
    }

    // Price filters
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Location filter
    if (location && location.trim() !== "") {
      filter.location = new RegExp(location, "i");
    }

    const results = await Listing.find(filter);

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search error" });
  }
});

module.exports = router;
