const express = require("express");
const router = express.Router();

const wrapAsync = require("../utils/wrapAsync");
const ListingController = require("../controllers/listings");
const Listing = require("../models/listing");

const { isLoggedIn, isOwner, validateListing } = require("../middleware");

const multer = require("multer");
const { storage } = require("../cloudConfig");
const upload = multer({ storage });
const listingUpload = upload.fields([
  { name: "listing[images]", maxCount: 10 },
  { name: "listing[legalDocuments]", maxCount: 5 },
]);

/* -------------------------------------------------------
   LISTINGS ROUTES (CLEAN + MULTI IMAGE)
------------------------------------------------------- */

// GET all listings + CREATE listing
router
  .route("/")
  .get(wrapAsync(ListingController.index))
  .post(
    isLoggedIn,
    listingUpload,
    validateListing,
    wrapAsync(ListingController.createListing)
  );

// NEW listing form
router.get("/new", isLoggedIn, ListingController.renderNewForm);
router.get("/:id/verification-details", wrapAsync(ListingController.showVerificationDetails));

/* -------------------------------------------------------
   🔍 SEARCH Route (must be ABOVE /:id)
------------------------------------------------------- */
router.get("/search", async (req, res) => {
  const { q, location, category, min, max } = req.query;
  let filter = {};

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // ❗ If all fields are empty → show flash + redirect
  if (!q && !location && !category && !min && !max) {
    req.flash("error", "Please enter something to search.");
    return res.redirect("/listings");
  }

  // 🔍 Keyword Search
  if (q && q.trim() !== "") {
    const regex = { $regex: esc(q.trim()), $options: "i" };
    filter.$or = [
      { title: regex },
      { location: regex },
      { country: regex },
      { description: regex },
    ];
  }

  // 📍 Location Search
  if (location && location.trim() !== "") {
    filter.location = { $regex: esc(location.trim()), $options: "i" };
  }

  // 🏷 Category Search
  if (category && category.trim() !== "") {
    filter.category = category;
  }

  // 💰 Price Filter
  if (min || max) {
    filter.price = {};
    if (min) filter.price.$gte = Number(min);
    if (max) filter.price.$lte = Number(max);
  }

  // Fetch matching listings
  const allListings = await Listing.find(filter);

  // Render SAME INDEX PAGE (old structure)
  res.render("listings/index", {
    allListings,
    q,
    location,
    category,
    min,
    max,
  });
});


/* -------------------------------------------------------
   SHOW / UPDATE / DELETE (MUST BE ONE BLOCK)
------------------------------------------------------- */

router
  .route("/:id")
  .get(wrapAsync(ListingController.showListing))
  .put(
    isLoggedIn,
    isOwner,
    listingUpload,
    validateListing,
    wrapAsync(ListingController.updateListing)
  )
  .delete(
    isLoggedIn,
    isOwner,
    wrapAsync(ListingController.destroyListing)
  );

// EDIT PAGE
router.get(
  "/:id/edit",
  isLoggedIn,
  isOwner,
  wrapAsync(ListingController.renderEditForm)
);

module.exports = router;

