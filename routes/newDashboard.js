/* routes/newDashboard.js */
const express = require("express");
const router = express.Router();
const dashController = require("../controllers/newDashboardController");
const { isLoggedIn } = require("../appMiddleware");
const multer = require("multer");
const { storage } = require("../cloudConfig");
const upload = multer({ storage });

/* ============================================================
   DASHBOARD ROUTES
============================================================ */
router.get("/dashboard", isLoggedIn, dashController.renderDashboard);
router.get("/user/dashboard", isLoggedIn, dashController.renderDashboard);
router.get("/profile/dashboard", isLoggedIn, dashController.renderDashboard);

/* ============================================================
   BOOKING MANAGER ROUTES
============================================================ */
router.get("/dashboard/bookings", isLoggedIn, dashController.renderBookingsManager);
router.get("/bookings", isLoggedIn, dashController.renderBookingsManager);

/* ============================================================
   HOST ACTIONS
============================================================ */
router.post("/dashboard/host/booking/:id/approve", isLoggedIn, dashController.approveBooking);
router.post("/dashboard/host/booking/:id/refund", isLoggedIn, dashController.refundBooking);
router.post("/dashboard/host/booking/:id/cancel", isLoggedIn, dashController.cancelHostBooking);

/* ============================================================
   GUEST ACTIONS
============================================================ */
router.post("/dashboard/booking/:id/cancel", isLoggedIn, dashController.cancelGuestBooking);
router.post("/dashboard/booking/:id/checkout-otp", isLoggedIn, dashController.sendCheckoutOtp);
router.post("/dashboard/booking/:id/checkout", isLoggedIn, dashController.completeCheckout);
router.post("/dashboard/booking/:id/extend", isLoggedIn, dashController.extendGuestBooking);

/* ============================================================
   PAYMENT DETAILS ROUTES
============================================================ */
router.get("/dashboard/details", isLoggedIn, dashController.renderDetails);
router.post(
  "/dashboard/details",
  isLoggedIn,
  upload.fields([
    { name: "paymentQR", maxCount: 1 },
    { name: "signature", maxCount: 1 },
  ]),
  dashController.updateDetails
);

module.exports = router;
