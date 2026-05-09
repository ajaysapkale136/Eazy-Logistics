const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");

// 🔍 Search listings (with optional text and category)
router.get("/search", async (req, res) => {
  try {
    const q = req.query.q?.trim() || "";
    const category = req.query.category?.trim() || "";
    const filter = {};

    // ✅ Category filter (case-insensitive, ignores "All")
    if (category && category.toLowerCase() !== "all") {
      // use case-insensitive regex for flexibility
      filter.category = new RegExp(`^${category}$`, "i");
    }

    let results;

    if (q) {
      // ✅ Text search combined with category
      results = await Listing.find(
        { $text: { $search: q }, ...filter },
        { score: { $meta: "textScore" } }
      ).sort({ score: { $meta: "textScore" } });
    } else {
      // ✅ Only category filter
      results = await Listing.find(filter).sort({ createdAt: -1 });
    }

    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 📈 Increment view count
router.get("/:id", async (req, res) => {
  try {
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    );
    if (!listing) return res.status(404).json({ error: "Not found" });
    res.json(listing);
  } catch (err) {
    console.error("View count error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
