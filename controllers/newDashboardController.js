/* controllers/newDashboardController.js */
const Booking = require("../models/booking");
const Listing = require("../models/listing");
const User = require("../models/user");
const moment = require("moment");
const qrcode = require("qrcode");

// ✅ Import the email sender from your cashfree controller
const { sendCancellationEmail } = require("./bookingCashfreeController");
const {
  deriveStayStatus,
  issueCheckoutOtp,
  refreshBookingSafetyStates,
  verifyCheckoutOtp,
} = require("../utils/bookingSafety");

module.exports = {

  /* ============================================================
     1. RENDER DASHBOARD (HOST + GUEST HYBRID STATS)
  ============================================================ */
  async renderDashboard(req, res) {
    try {
      await refreshBookingSafetyStates();

      const currUser = req.user;

      // A. FETCH LISTINGS (Properties owned by user)
      const myListings = await Listing.find({ owner: currUser._id }).lean();
      const myListingIds = myListings.map(l => l._id);

      // B. FETCH INCOMING BOOKINGS (HOST DATA)
      const hostBookings = await Booking.find({ listing: { $in: myListingIds } })
        .populate("listing")
        .populate("user") // Get the Guest's name
        .sort({ createdAt: -1 })
        .lean();

      // C. CALCULATE STATS (HOST FOCUSED)
      const stats = {
        listings: myListings.length,
        bookings: hostBookings.length, 
        revenue: hostBookings.reduce((sum, b) => b.status === 'confirmed' ? sum + (b.totalPrice || 0) : sum, 0),
        active: hostBookings.filter(b => b.status === 'confirmed' && new Date(b.checkOut) > new Date()).length
      };

      // D. GENERATE CHART DATA (REVENUE - 12 MONTHS)
      const months = 12; 
      const start = moment().startOf("month").subtract(months - 1, "months").toDate();
      
      const agg = await Booking.aggregate([
        { 
          $match: { 
            listing: { $in: myListingIds }, 
            status: 'confirmed', 
            createdAt: { $gte: start } 
          } 
        },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            amount: { $sum: "$totalPrice" },
            count: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]);

      const chartLabels = [];
      const chartRevenue = [];
      const chartCount = [];
      
      for (let i = months - 1; i >= 0; i--) {
        const d = moment().startOf("month").subtract(i, "months");
        chartLabels.push(d.format("MMM"));
        
        const found = agg.find(a => a._id.year === d.year() && a._id.month === d.month() + 1);
        chartRevenue.push(found ? found.amount : 0);
        chartCount.push(found ? found.count : 0);
      }

      // E. GENERATE QR CODES (UPDATED WITH FULL DETAILS)
      await Promise.all(hostBookings.map(async (b) => {
        // Create a Rich Data Object containing all user/booking details
        const qrData = {
            id: b._id,
            listing: b.listing ? b.listing.title : "Deleted Listing",
            guestName: b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : (b.user ? b.user.username : "Unknown"),
            phone: b.phone || "N/A",
            address: b.address || "N/A",
            checkIn: new Date(b.checkIn).toLocaleDateString('en-IN'),
            checkOut: new Date(b.checkOut).toLocaleDateString('en-IN'),
            guests: b.guests || 1,
            amount: `Rs. ${b.totalPrice}`,
            status: b.status 
        };

        const qrJson = JSON.stringify(qrData);
        b.qrCode = await qrcode.toDataURL(qrJson);
      }));

      // F. RENDER DASHBOARD
      res.render("dashboard/index.ejs", {
        currUser,
        stats,
        myBookings: hostBookings,
        chart: {
            labels: JSON.stringify(chartLabels),
            spending: JSON.stringify(chartRevenue),
            bookings: JSON.stringify(chartCount)
        }
      });

    } catch (err) {
      console.error("Dashboard Error:", err);
      req.flash("error", "Error loading dashboard");
      res.redirect("/");
    }
  },

  /* ============================================================
     2. RENDER BOOKINGS MANAGER
  ============================================================ */
  async renderBookingsManager(req, res) {
    try {
      await refreshBookingSafetyStates();

      const currUser = req.user;

      // 1. Guest View (My Trips)
      const myTrips = await Booking.find({ user: currUser._id })
        .populate({ path: "listing", populate: { path: "owner" } })
        .sort({ createdAt: -1 });

      // 2. Host View (Incoming Reservations)
      const myListings = await Listing.find({ owner: currUser._id });
      const hostBookings = await Booking.find({ listing: { $in: myListings } })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

      res.render("dashboard/bookings.ejs", { 
        currUser, 
        myTrips, 
        hostBookings 
      });

    } catch (err) {
      console.error("Booking Manager Error:", err);
      req.flash("error", "Could not load bookings manager");
      res.redirect("/dashboard");
    }
  },


  /* ============================================================
     3. PAYMENT DETAILS PAGE
  ============================================================ */
  renderDetails(req, res) {
    res.render("dashboard/details.ejs", { currUser: req.user });
  },

  async updateDetails(req, res) {
    try {
      const user = await User.findById(req.user._id);

      if (req.body.upiId) user.upiId = req.body.upiId;

      if (req.files && req.files['paymentQR']) {
        user.paymentQR = {
          url: req.files['paymentQR'][0].path,
          filename: req.files['paymentQR'][0].filename
        };
      }

      if (req.files && req.files['signature']) {
        user.signature = {
          url: req.files['signature'][0].path,
          filename: req.files['signature'][0].filename
        };
      }

      await user.save();
      req.flash("success", "Payment details updated successfully!");
      res.redirect("/dashboard/details");

    } catch (err) {
      console.error(err);
      req.flash("error", "Failed to update details");
      res.redirect("/dashboard/details");
    }
  },

  /* ============================================================
     4. HOST ACTIONS (Approve, Refund, Cancel)
  ============================================================ */
  async approveBooking(req, res) {
    try { await Booking.findByIdAndUpdate(req.params.id, { status: "confirmed" }); req.flash("success", "Approved!"); res.redirect("/dashboard/bookings"); } catch(e) { res.redirect("/dashboard/bookings"); }
  },
  
  async refundBooking(req, res) {
    try { await Booking.findByIdAndUpdate(req.params.id, { status: "refunded" }); req.flash("success", "Refunded!"); res.redirect("/dashboard/bookings"); } catch(e) { res.redirect("/dashboard/bookings"); }
  },
  
  async cancelHostBooking(req, res) {
    try { 
        // 1. Update Status
        const booking = await Booking.findByIdAndUpdate(req.params.id, { status: "cancelled" }, { new: true })
            .populate({ path: "listing", populate: { path: "owner" } });
        
        // 2. Send Cancellation Email
        await sendCancellationEmail(booking);

        req.flash("success", "Cancelled & Email Sent."); 
        res.redirect("/dashboard/bookings"); 
    } catch(e) { 
        console.error(e);
        res.redirect("/dashboard/bookings"); 
    }
  },

  /* ============================================================
     5. GUEST ACTIONS (Cancel)
  ============================================================ */
  async cancelGuestBooking(req, res) {
    try {
        // 1. Update Status
        const booking = await Booking.findByIdAndUpdate(req.params.id, { status: "cancelled" }, { new: true })
            .populate({ path: "listing", populate: { path: "owner" } });

        // 2. Send Cancellation Email
        await sendCancellationEmail(booking);

        req.flash("success", "Trip Cancelled & Receipt Sent");
        res.redirect("/dashboard/bookings");
    } catch(e) {
        console.error(e);
        res.redirect("/dashboard/bookings");
    }
  },

  async sendCheckoutOtp(req, res) {
    try {
      const booking = await Booking.findOne({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!booking || booking.status !== "confirmed") {
        req.flash("error", "Only confirmed trips can request checkout OTP.");
        return res.redirect("/dashboard/bookings");
      }

      await issueCheckoutOtp(booking);
      req.flash("success", "Checkout OTP sent to your booking email.");
      res.redirect("/dashboard/bookings");
    } catch (error) {
      console.error("Checkout OTP Error:", error);
      req.flash("error", "Could not send checkout OTP.");
      res.redirect("/dashboard/bookings");
    }
  },

  async completeCheckout(req, res) {
    try {
      const booking = await Booking.findOne({
        _id: req.params.id,
        user: req.user._id,
      });

      if (!booking || booking.status !== "confirmed") {
        req.flash("error", "Checkout is only available for confirmed trips.");
        return res.redirect("/dashboard/bookings");
      }

      const otp = String(req.body.checkoutOtp || "").trim();
      if (!verifyCheckoutOtp(booking, otp)) {
        req.flash("error", "Invalid or expired checkout OTP.");
        return res.redirect("/dashboard/bookings");
      }

      booking.checkedOutAt = new Date();
      booking.stayStatus = "checked_out";
      booking.checkoutOtpHash = "";
      booking.checkoutOtpSentAt = undefined;
      booking.checkoutOtpExpiresAt = undefined;
      if (!booking.safetyAlert) booking.safetyAlert = {};
      booking.safetyAlert.resolvedAt = new Date();

      await booking.save();

      req.flash("success", "Checkout completed successfully.");
      res.redirect("/dashboard/bookings");
    } catch (error) {
      console.error("Complete Checkout Error:", error);
      req.flash("error", "Could not complete checkout.");
      res.redirect("/dashboard/bookings");
    }
  },

  async extendGuestBooking(req, res) {
    try {
      const booking = await Booking.findOne({
        _id: req.params.id,
        user: req.user._id,
      }).populate("listing");

      if (!booking || booking.status !== "confirmed") {
        req.flash("error", "Only confirmed trips can be extended.");
        return res.redirect("/dashboard/bookings");
      }

      if (booking.stayStatus === "safety_alert") {
        req.flash("error", "This booking is already under safety escalation. Contact admin.");
        return res.redirect("/dashboard/bookings");
      }

      const nextCheckOut = new Date(req.body.newCheckOut);
      const currentCheckOut = new Date(booking.checkOut);

      if (Number.isNaN(nextCheckOut.getTime()) || nextCheckOut <= currentCheckOut) {
        req.flash("error", "Choose a new checkout date after the current one.");
        return res.redirect("/dashboard/bookings");
      }

      const previousCheckOut = new Date(booking.checkOut);
      const previousNights = booking.nights;
      const updatedNights = Math.max(
        1,
        Math.ceil((nextCheckOut - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24))
      );
      const nightlyRate =
        booking.listing?.price || Math.max(1, booking.totalPrice / Math.max(booking.nights, 1));

      booking.checkOut = nextCheckOut;
      booking.nights = updatedNights;
      booking.totalPrice = nightlyRate * updatedNights;
      booking.stayStatus = deriveStayStatus(booking);
      if (!booking.safetyAlert) booking.safetyAlert = {};
      booking.safetyAlert.resolvedAt = undefined;
      booking.extensionHistory.push({
        previousCheckOut,
        newCheckOut: nextCheckOut,
        nightsAdded: Math.max(0, updatedNights - previousNights),
      });

      await booking.save();

      req.flash("success", "Booking extended successfully.");
      res.redirect("/dashboard/bookings");
    } catch (error) {
      console.error("Extend Booking Error:", error);
      req.flash("error", "Could not extend this booking.");
      res.redirect("/dashboard/bookings");
    }
  }
};
