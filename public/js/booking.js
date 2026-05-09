const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingCashfreeController");

// Reservation
router.get("/confirm/:listingId", bookingController.showBookingPage);
router.post("/confirm", bookingController.createBooking);

// Payment
router.get("/payment/:bookingId", bookingController.showPaymentPage);
router.post("/create-order", bookingController.createOrder);
router.post("/verify-payment", bookingController.verifyPayment);

// Success
router.get("/success/:bookingId", bookingController.successPage);

module.exports = router;
