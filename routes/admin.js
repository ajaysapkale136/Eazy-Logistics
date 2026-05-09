// routes/admin.js
const express = require("express");
const router = express.Router();
const { isAdmin } = require("../middleware");
const adminController = require("../controllers/adminController");

// --- API ROUTES (Consumed by Dashboard AJAX) ---

// Search & Stats
router.get("/api/search", isAdmin, adminController.search);
router.get("/api/summary", isAdmin, adminController.getSummary);
router.get("/api/earnings", isAdmin, adminController.getMonthlyEarnings);
router.get("/api/earnings/monthly", isAdmin, adminController.getMonthlyEarnings);

// Listings
router.get("/api/listings", isAdmin, adminController.listListings);
router.get("/api/listings/:id", isAdmin, adminController.getListing);
router.put("/api/listings/:id", isAdmin, adminController.updateListing);
router.delete("/api/listings/:id", isAdmin, adminController.deleteListing);
router.post("/api/listings/:id/approve", isAdmin, adminController.approveListing);
router.put("/api/listings/:id/verify", isAdmin, adminController.verifyListingDocuments);
router.put("/api/listings/:id/reject", isAdmin, adminController.rejectListingDocuments);

// Users
router.get("/api/users", isAdmin, adminController.listUsers);
router.post("/api/admin-invites", isAdmin, adminController.generateAdminInviteCode);
router.put("/api/users/:id/role", isAdmin, adminController.changeUserRole);
router.post("/api/users/:id/security-code", isAdmin, adminController.regenerateAdminSecurityCode);
router.delete("/api/users/:id", isAdmin, adminController.deleteUser);

// ✅ BOOKINGS API (Updated)
router.get("/api/bookings", isAdmin, adminController.listBookings);
router.put("/api/bookings/:id/approve", isAdmin, adminController.approveBooking);
router.put("/api/bookings/:id/cancel", isAdmin, adminController.cancelBooking);
router.put("/api/bookings/:id/refund", isAdmin, adminController.refundBooking);

// Reports
router.get("/reports/csv", isAdmin, adminController.downloadCsvReport);
router.get("/reports/pdf", isAdmin, adminController.downloadPdfReport);

// --- SERVER SIDE ACTIONS (HTML Forms) ---
router.post("/listings/:id/approve", isAdmin, async (req, res, next) => {
  try {
    await adminController.approveListing(req, res, next);
    req.flash("success", "Listing approved");
    res.redirect("/admin/listings");
  } catch (err) {
    next(err);
  }
});

module.exports = router;
