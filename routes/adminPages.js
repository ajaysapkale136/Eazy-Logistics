// routes/adminPages.js
const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware");

// prevent route conflicts with /admin/api (optional)
router.use((req, res, next) => {
  if (req.originalUrl.startsWith("/admin/api")) return next("route");
  next();
});

router.get("/", isAdmin, (req, res) => res.render("admin/dashboard"));
router.get("/listings", isAdmin, (req, res) => res.render("admin/manageListings"));
router.get("/users", isAdmin, (req, res) => res.render("admin/manageUsers"));
router.get("/bookings", isAdmin, (req, res) => res.render("admin/manageBookings"));
router.get("/reports", isAdmin, (req, res) => res.render("admin/reports"));

module.exports = router;
