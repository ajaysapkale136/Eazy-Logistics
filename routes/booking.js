// const express = require("express");
// const router = express.Router();
// const bookingController = require("../controllers/bookingCashfreeController");
// const { isLoggedIn } = require("../appMiddleware");

// router.get(
//   "/confirm/:listingId",
//   isLoggedIn,
//   bookingController.showBookingPage
// );

// router.post(
//   "/confirm",
//   isLoggedIn,
//   bookingController.createBooking
// );

// router.get(
//   "/payment/:id",
//   isLoggedIn,
//   bookingController.renderPaymentPage
// );

// router.get(
//   "/success/:bookingId", 
//   isLoggedIn, 
//   bookingController.successPage
// );

// router.post(
//   "/fake-pay", isLoggedIn, 
//   bookingController.fakePaymentSuccess
// );


// module.exports = router;
// routes/booking.js
const express = require("express");
const router = express.Router({ mergeParams: true });
const bookingController = require("../controllers/bookingCashfreeController");
const { isLoggedIn } = require("../appMiddleware");

// 1. Reservation Page
router.get("/confirm/:listingId", isLoggedIn, bookingController.showBookingPage);
router.post("/confirm", isLoggedIn, bookingController.createBooking);

// 2. Payment Page (✅ Ensure this line exists)
router.get("/payment/:id", isLoggedIn, bookingController.renderPaymentPage);

// 3. Payment Processing (Bypass Logic)
router.post("/fake-pay", isLoggedIn, bookingController.fakePaymentSuccess);

// 4. Success / Receipt Page
router.get("/success/:bookingId", isLoggedIn, bookingController.successPage);
router.get("/download/:id", isLoggedIn, bookingController.downloadReceipt);

module.exports = router;