// routes/adminApi.js
const express = require("express");
const router = express.Router();
const { isAdmin } = require("../appMiddleware");
const adminController = require("../controllers/adminController");

// SUMMARY + CHARTS
router.get('/search', isAdmin, adminController.search);
router.get("/summary", isAdmin, adminController.getSummary);
router.get("/earnings/monthly", isAdmin, adminController.getMonthlyEarnings);
router.get("/earnings", isAdmin, adminController.getMonthlyEarnings);

// LISTINGS
router.get("/listings", isAdmin, adminController.listListings);
router.get("/listings/:id", isAdmin, adminController.getListing);
router.put("/listings/:id", isAdmin, adminController.updateListing);
router.delete("/listings/:id", isAdmin, adminController.deleteListing);
router.post("/listings/:id/approve", isAdmin, adminController.approveListing);
router.put("/listings/:id/verify", isAdmin, adminController.verifyListingDocuments);
router.put("/listings/:id/reject", isAdmin, adminController.rejectListingDocuments);

// USERS
router.get("/users", isAdmin, adminController.listUsers);
router.post("/admin-invites", isAdmin, adminController.generateAdminInviteCode);
router.put("/users/:id/role", isAdmin, adminController.changeUserRole);
router.post("/users/:id/security-code", isAdmin, adminController.regenerateAdminSecurityCode);
router.delete("/users/:id", isAdmin, adminController.deleteUser);

// BOOKINGS
router.get("/bookings", isAdmin, adminController.listBookings);
router.put("/bookings/:id/approve", isAdmin, adminController.approveBooking);
router.put("/bookings/:id/cancel", isAdmin, adminController.cancelBooking);
router.put("/bookings/:id/refund", isAdmin, adminController.refundBooking);
router.post("/bookings/:id/dispatch-police", isAdmin, adminController.dispatchPoliceAlert);

// REPORTS
router.get("/reports/csv", isAdmin, adminController.downloadCsvReport);
router.get("/reports/pdf", isAdmin, adminController.downloadPdfReport);

module.exports = router;
