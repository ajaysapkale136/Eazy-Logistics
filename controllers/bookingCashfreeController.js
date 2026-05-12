// controllers/bookingCashfreeController.js
require("dotenv").config();
const PDFDocument = require("pdfkit");
const axios = require("axios");
const Booking = require("../models/booking");
const Listing = require("../models/listing");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

/* =====================================================
   EMAIL CONFIGURATION
===================================================== */
const transporter = nodemailer.createTransport({
  service: "gmail", // or use your SMTP settings
  auth: {
    user: process.env.COMPANY_EMAIL,
    pass: process.env.COMPANY_EMAIL_PASS,
  },
});

/* =====================================================
   CASHFREE CONFIG
===================================================== */
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET = process.env.CASHFREE_SECRET_KEY;
const CASHFREE_ENV = process.env.CASHFREE_ENV || "test";

// Ensure this matches the version your Cashfree account expects
const CASHFREE_VERSION = "2023-08-01"; 

const CF_BASE =
  CASHFREE_ENV === "test"
    ? "https://sandbox.cashfree.com/pg"
    : "https://api.cashfree.com/pg";

/* =====================================================
   RECEIPT DIRECTORY
===================================================== */
const IS_VERCEL_RUNTIME = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
const RECEIPTS_DIR = IS_VERCEL_RUNTIME
  ? path.join("/tmp", "eazy-logistics-receipts")
  : path.join(__dirname, "..", "receipts");

// Vercel filesystem is read-only except /tmp.
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
}


/* =====================================================
   HELPER: SHARED PDF DESIGN (Used for Email & Download)
   (This ensures both PDFs look EXACTLY the same)
===================================================== */
function buildReceiptPDF(doc, booking) {
    // --- SETUP COLORS & FONTS ---
    const colorPrimary = "#a91b0d"; 
    const colorDark    = "#1f2937"; 
    const colorLight   = "#6b7280"; 
    const colorTableBg = "#f3f4f6"; 

    // --- CALCULATIONS ---
    const baseAmount = booking.totalPrice;
    const taxAmount = baseAmount * 0.18; 
    const grandTotal = baseAmount + taxAmount;
    
    // Formatting Dates
    const receiptDate = new Date().toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });
    const checkIn = new Date(booking.checkIn).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });
    const checkOut = new Date(booking.checkOut).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' });

    // --- HEADER SECTION ---
    doc.fontSize(20).fillColor(colorPrimary).font("Helvetica-Bold").text("EAZY-LOGISTICS", 50, 50);
    doc.fontSize(10).fillColor(colorLight).font("Helvetica")
       .text("123, Tech Park, Bangalore, India")
       .text("support@eazylogistics.com | +91 98765 43210");

    doc.fillColor(colorPrimary).fontSize(26).font("Helvetica-Bold").text("RECEIPT", 400, 50, { align: "right" });
    doc.fillColor(colorDark).fontSize(10).font("Helvetica-Bold")
       .text(`Receipt #: #INV-${booking._id.toString().slice(-6).toUpperCase()}`, 400, 85, { align: "right" })
       .font("Helvetica").text(`Date: ${receiptDate}`, 400, 100, { align: "right" });

    doc.moveDown(2);
    doc.strokeColor(colorPrimary).lineWidth(2).moveTo(50, 135).lineTo(545, 135).stroke();

    // --- INFO COLUMNS ---
    const startY = 160;

    // Customer Details
    doc.rect(50, startY, 200, 20).fill(colorTableBg);
    doc.fillColor(colorPrimary).fontSize(10).font("Helvetica-Bold").text("CUSTOMER DETAILS", 55, startY + 6);
    
    doc.fillColor(colorDark).font("Helvetica").fontSize(10);
    doc.text(booking.firstName + " " + booking.lastName, 50, startY + 30);
    doc.fillColor(colorLight).text(booking.email).text(booking.phone);
    doc.text(booking.address || "N/A", { width: 220 });

    // Booking Details
    doc.rect(300, startY, 245, 20).fill(colorTableBg);
    doc.fillColor(colorPrimary).fontSize(10).font("Helvetica-Bold").text("BOOKING SUMMARY", 305, startY + 6);

    let infoY = startY + 30;
    const labelX = 305, valueX = 400;

    doc.fillColor(colorLight).font("Helvetica").text("Check-In:", labelX, infoY);
    doc.fillColor(colorDark).text(checkIn, valueX, infoY, { align: "right", width: 140 });
    
    infoY += 15;
    doc.fillColor(colorLight).text("Check-Out:", labelX, infoY);
    doc.fillColor(colorDark).text(checkOut, valueX, infoY, { align: "right", width: 140 });

    infoY += 15;
    doc.fillColor(colorLight).text("Guests:", labelX, infoY);
    doc.fillColor(colorDark).text(booking.guests, valueX, infoY, { align: "right", width: 140 });

    infoY += 15;
    doc.fillColor(colorLight).text("Status:", labelX, infoY);
    doc.fillColor("green").font("Helvetica-Bold").text("CONFIRMED / PAID", valueX, infoY, { align: "right", width: 140 });

    // --- TABLE SECTION ---
    const tableTop = 300;
    doc.rect(50, tableTop, 495, 25).fill(colorTableBg);
    doc.fillColor(colorPrimary).font("Helvetica-Bold").fontSize(9);
    doc.text("DESCRIPTION", 60, tableTop + 8);
    doc.text("PRICE/NIGHT", 320, tableTop + 8, { align: "right", width: 80 });
    doc.text("NIGHTS", 420, tableTop + 8, { align: "right", width: 40 });
    doc.text("AMOUNT", 480, tableTop + 8, { align: "right", width: 60 });

    const rowY = tableTop + 35;
    doc.fillColor(colorDark).fontSize(11).font("Helvetica-Bold");
    doc.text(booking.listing ? booking.listing.title : "Accommodation Charge", 60, rowY);
    doc.fillColor(colorLight).fontSize(9).font("Helvetica");
    doc.text(`${booking.roomType || "Standard"} Room`, 60, rowY + 15);

    doc.fillColor(colorDark).fontSize(10);
    doc.text(`₹${(baseAmount / (booking.nights || 1)).toLocaleString("en-IN")}`, 320, rowY, { align: "right", width: 80 });
    doc.text(booking.nights || 1, 420, rowY, { align: "right", width: 40 });
    doc.text(`₹${baseAmount.toLocaleString("en-IN")}`, 480, rowY, { align: "right", width: 60 });

    doc.strokeColor("#e5e7eb").lineWidth(1).moveTo(50, rowY + 35).lineTo(545, rowY + 35).stroke();

    // --- TOTALS SECTION ---
    const totalY = rowY + 50;
    const totalsLabelX = 350, totalsValueX = 480, totalsWidth = 60;

    doc.font("Helvetica").fillColor(colorLight).fontSize(10);
    doc.text("Subtotal", totalsLabelX, totalY);
    doc.fillColor(colorDark).text(`₹${baseAmount.toLocaleString("en-IN")}`, totalsValueX, totalY, { align: "right", width: totalsWidth });

    doc.fillColor(colorLight).text("GST (18%)", totalsLabelX, totalY + 20);
    doc.fillColor(colorDark).text(`₹${taxAmount.toLocaleString("en-IN", {minimumFractionDigits: 2})}`, totalsValueX, totalY + 20, { align: "right", width: totalsWidth });

    doc.strokeColor(colorPrimary).lineWidth(1).moveTo(totalsLabelX, totalY + 40).lineTo(545, totalY + 40).stroke();

    doc.font("Helvetica-Bold").fontSize(14).fillColor(colorDark);
    doc.text("Grand Total", totalsLabelX, totalY + 50);
    doc.fillColor(colorPrimary).text(`₹${grandTotal.toLocaleString("en-IN", {minimumFractionDigits: 2})}`, totalsValueX, totalY + 50, { align: "right", width: totalsWidth });

    // --- FOOTER & SIGNATURE ---
    const footerY = 700;
    
    doc.fontSize(10).font("Helvetica-Oblique").fillColor(colorPrimary);
    doc.text("Thank you for your business!", 50, footerY);

    // Signature Image Logic
    const signaturePath = path.join(__dirname, "..", "public", "images", "signature.png");
    
    // Check if image exists before adding
    if (fs.existsSync(signaturePath)) {
        doc.image(signaturePath, 410, footerY - 45, { width: 100 });
    }

    // Signature Line & Text
    doc.strokeColor("#d1d5db").lineWidth(1).moveTo(380, footerY - 10).lineTo(545, footerY - 10).stroke();
    doc.fontSize(8).font("Helvetica").fillColor(colorLight);
    doc.text("Authorized Signature", 380, footerY + 5, { align: "center", width: 165 });
}


/* =====================================================
   ✅ HELPER: CANCELLATION PDF DESIGN
===================================================== */
function buildCancellationPDF(doc, booking) {
    const colorDanger = "#dc2626"; // Red for cancellation
    const colorDark   = "#1f2937";
    const colorLight  = "#6b7280";

    const baseAmount = booking.totalPrice;
    
    doc.fontSize(20).fillColor(colorDanger).font("Helvetica-Bold").text("EAZY-LOGISTICS", 50, 50);
    doc.fontSize(10).fillColor(colorLight).font("Helvetica").text("123, Tech Park, Bangalore, India").text("support@eazylogistics.com");

    doc.fillColor(colorDanger).fontSize(26).font("Helvetica-Bold").text("CANCELLED", 400, 50, { align: "right" });
    doc.fillColor(colorDark).fontSize(10).font("Helvetica-Bold").text(`#CNL-${booking._id.toString().slice(-6).toUpperCase()}`, 400, 85, { align: "right" });

    doc.moveDown(2).strokeColor(colorDanger).lineWidth(2).moveTo(50, 135).lineTo(545, 135).stroke();

    doc.fontSize(12).fillColor(colorDark).text(`Dear ${booking.firstName},`, 50, 160);
    doc.fontSize(10).fillColor(colorLight).text("This email confirms that your booking has been cancelled.", 50, 180);
    
    doc.rect(50, 210, 495, 100).fill("#fef2f2"); // Light red bg
    doc.fillColor(colorDanger).fontSize(12).font("Helvetica-Bold").text("CANCELLATION DETAILS", 70, 230);
    
    doc.fillColor(colorDark).fontSize(10).font("Helvetica");
    doc.text(`Listing: ${booking.listing ? booking.listing.title : 'N/A'}`, 70, 255);
    doc.text(`Original Dates: ${new Date(booking.checkIn).toLocaleDateString()} to ${new Date(booking.checkOut).toLocaleDateString()}`, 70, 275);
    doc.text(`Refund Amount: ₹${baseAmount.toLocaleString("en-IN")}`, 70, 295);

    doc.fontSize(10).fillColor(colorLight).text("Any applicable refund will be processed within 5-7 business days.", 50, 340);
    doc.fontSize(10).font("Helvetica-Oblique").fillColor(colorDark).text("We hope to see you again soon.", 50, 700);
}


/* =====================================================
   HELPER: SEND RECEIPT EMAIL
   (Generates PDF in background and emails it)
===================================================== */
async function sendReceiptEmail(booking) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];
        
        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", async () => {
            const pdfData = Buffer.concat(buffers);
            
            try {
                await transporter.sendMail({
                    from: `"Eazy-Logistics" <${process.env.COMPANY_EMAIL}>`,
                    to: booking.email,
                    subject: `Booking Confirmed - #${booking._id.toString().slice(-6).toUpperCase()}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333;">
                            <h2 style="color: #a91b0d;">Booking Confirmed!</h2>
                            <p>Hi ${booking.firstName},</p>
                            <p>Thank you for booking with Eazy-Logistics. Your payment was successful.</p>
                            <p>Please find your official receipt attached.</p>
                            <br>
                            <p><strong>Check-in:</strong> ${new Date(booking.checkIn).toLocaleDateString()}</p>
                            <p><strong>Check-out:</strong> ${new Date(booking.checkOut).toLocaleDateString()}</p>
                            <br>
                            <p>Best Regards,<br>Eazy-Logistics Team</p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: `Receipt_${booking._id}.pdf`,
                            content: pdfData
                        }
                    ]
                });
                console.log(`Email sent successfully to ${booking.email}`);
                resolve(true);
            } catch (error) {
                console.error("Email Error:", error);
                resolve(false); // Resolve false so we don't block the user flow
            }
        });

        // Use shared helper to build PDF content
        buildReceiptPDF(doc, booking);
        doc.end();
    });
}


/* =====================================================
   ✅ EXPORTED HELPER: SEND CANCELLATION EMAIL
   (Can be called from other controllers)
===================================================== */
exports.sendCancellationEmail = async (booking) => {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];
        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", async () => {
            try {
                await transporter.sendMail({
                    from: `"Eazy-Logistics" <${process.env.COMPANY_EMAIL}>`,
                    to: booking.email,
                    subject: `Booking Cancelled - #${booking._id.toString().slice(-6).toUpperCase()}`,
                    html: `
                        <div style="font-family: Arial; color: #333;">
                            <h2 style="color: #dc2626;">Booking Cancelled</h2>
                            <p>Hi ${booking.firstName},</p>
                            <p>Your booking for <strong>${booking.listing ? booking.listing.title : 'Property'}</strong> has been cancelled.</p>
                            <p>Please find the cancellation receipt attached.</p>
                            <br><p>Regards,<br>Eazy-Logistics Team</p>
                        </div>
                    `,
                    attachments: [{ filename: `Cancellation_${booking._id}.pdf`, content: Buffer.concat(buffers) }]
                });
                console.log(`Cancellation email sent to ${booking.email}`);
                resolve(true);
            } catch (e) { console.error("Email Error:", e); resolve(false); }
        });
        buildCancellationPDF(doc, booking); // Generate Cancel PDF
        doc.end();
    });
};


/* =====================================================
   SHOW CONFIRM BOOKING PAGE
===================================================== */
exports.showBookingPage = async (req, res) => {
  try {
    const { listingId } = req.params;
    const listing = await Listing.findById(listingId).lean();

    if (!listing) {
      req.flash("error", "Listing not found");
      return res.redirect("/listings");
    }

    let previewImage = "/images/default.jpg";
    if (listing.images && listing.images.length > 0) {
      previewImage = listing.images[0].url;
    } else if (listing.image?.url) {
      previewImage = listing.image.url;
    }

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    const checkIn = req.query.checkIn || today;
    const checkOut = req.query.checkOut || tomorrow;
    const guests = req.query.guests || 1;
    const mapRoute = {
      lng: req.query.lng || "",
      lat: req.query.lat || "",
      source: req.query.locationSource || "",
      travelMode: req.query.travelMode || "",
      distanceKm: req.query.distanceKm || "",
      durationMin: req.query.durationMin || ""
    };

    res.render("bookings/confirm.ejs", {
      listingId: listing._id,
      listingTitle: listing.title,
      listingImage: previewImage,
      checkIn,
      checkOut,
      guests,
      pricePerNight: listing.price,
      amount: listing.price,
      mapRoute
    });

  } catch (err) {
    console.error("Confirm Page Error:", err);
    req.flash("error", "Unable to load booking page");
    res.redirect("/listings");
  }
};

/* =====================================================
   CREATE BOOKING (PENDING → PAYMENT PAGE)
===================================================== */
exports.createBooking = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please login first");
      return res.redirect("/login");
    }

    const {
      listingId, checkIn, checkOut, guests, amount,
      firstName, lastName, email, phone, address, city, state, zip, roomType,
      mapLng, mapLat, mapSource, mapTravelMode, mapDistanceKm, mapDurationMin
    } = req.body;

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

    const mapRoute = {};
    const lng = Number(mapLng);
    const lat = Number(mapLat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      mapRoute.origin = {
        type: "Point",
        coordinates: [lng, lat]
      };
      mapRoute.source = mapSource || "";
      mapRoute.travelMode = mapTravelMode || "";
      mapRoute.distanceKm = Number(mapDistanceKm) || undefined;
      mapRoute.durationMin = Number(mapDurationMin) || undefined;
    }

    const booking = await Booking.create({
      listing: listingId,
      user: req.user._id,
      firstName, lastName, email, phone, address, city, state, zip, roomType,
      checkIn: start, checkOut: end, guests, nights, totalPrice: amount,
      mapRoute,
      status: "pending" 
    });

    res.redirect(`/bookings/payment/${booking._id}`);

  } catch (err) {
    console.error("Create Booking Error:", err);
    req.flash("error", "Booking failed");
    res.redirect("back");
  }
};

/* =====================================================
   RENDER PAYMENT PAGE
===================================================== */
exports.renderPaymentPage = async (req, res) => {
  try {
    const { id } = req.params;
    
    // ✅ FIXED: Using Deep Population so 'booking.listing.owner' is a User object
    const booking = await Booking.findById(id).populate({
        path: "listing",
        populate: { path: "owner" }
    });

    if (!booking) {
      req.flash("error", "Booking not found");
      return res.redirect("/listings");
    }

    res.render("bookings/payment.ejs", {
      booking: booking,
      amount: booking.totalPrice,
      CASHFREE_APP_ID: process.env.CASHFREE_APP_ID
    });

  } catch (err) {
    console.error("Payment Page Error:", err);
    req.flash("error", "Unable to open payment page");
    res.redirect("/listings");
  }
};

/* =====================================================
   CREATE CASHFREE ORDER
===================================================== */
exports.createOrder = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const booking = await Booking.findById(bookingId);
    
    if (!booking) return res.json({ success: false, message: "Booking not found" });

    const orderRes = await axios.post(
      `${CF_BASE}/orders`,
      {
        order_id: `ORDER_${booking._id}_${Date.now()}`,
        order_amount: booking.totalPrice,
        order_currency: "INR",
        customer_details: {
          customer_id: `CUST_${booking.user}`,
          customer_name: `${booking.firstName} ${booking.lastName}`,
          customer_email: booking.email,
          customer_phone: booking.phone
        },
        order_meta: {
           return_url: `${process.env.BASE_URL || 'http://localhost:8080'}/bookings/success/${bookingId}`
        }
      },
      {
        headers: {
          "x-client-id": CASHFREE_APP_ID,
          "x-client-secret": CASHFREE_SECRET,
          "Content-Type": "application/json",
          "x-api-version": CASHFREE_VERSION
        }
      }
    );

    const orderId = orderRes.data.order_id;
    const sessionRes = await axios.post(
      `${CF_BASE}/orders/${orderId}/payment_session`,
      {},
      {
        headers: {
          "x-client-id": CASHFREE_APP_ID,
          "x-client-secret": CASHFREE_SECRET,
          "Content-Type": "application/json",
          "x-api-version": CASHFREE_VERSION
        }
      }
    );

    return res.json({
      success: true,
      paymentSessionId: sessionRes.data.payment_session_id,
      orderId: orderId
    });

  } catch (err) {
    console.error("Payment init error:", err.response?.data || err.message);
    return res.json({ success: false });
  }
};

/* =====================================================
   VERIFY PAYMENT
===================================================== */
exports.verifyPayment = async (req, res) => {
  try {
    const { bookingId, paymentResponse } = req.body;

    if (paymentResponse.payment_status !== "SUCCESS") {
      return res.status(400).json({ error: "Payment failed" });
    }

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: "confirmed", paymentId: paymentResponse.cf_payment_id },
      { new: true }
    );
    
    // Send Receipt Email
    sendReceiptEmail(booking);

    res.json({ success: true, bookingId: booking._id });

  } catch (err) {
    console.error("Verify Payment Error:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
};

/* =====================================================
   FAKE PAYMENT (UPDATED WITH EMAIL)
===================================================== */
exports.fakePaymentSuccess = async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ success: false });

    // ✅ FIXED: Deep population here too, so the email/receipt has access to owner details if needed
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: "confirmed" },
      { new: true }
    ).populate({ path: "listing", populate: { path: "owner" } }); 

    if (!booking) return res.status(404).json({ success: false });

    // ✅ SEND EMAIL (Background process, does not block response)
    sendReceiptEmail(booking);

    res.json({
      success: true,
      redirectUrl: `/bookings/success/${booking._id}`
    });

  } catch (err) {
    console.error("Fake payment error:", err);
    res.status(500).json({ success: false });
  }
};

/* =====================================================
   SUCCESS PAGE
===================================================== */
exports.successPage = async (req, res) => {
  // ✅ FIXED: Deep Population to show Owner Signature on Receipt
  const booking = await Booking.findById(req.params.bookingId)
      .populate({ path: "listing", populate: { path: "owner" } })
      .lean();
      
  if (!booking) return res.redirect("/listings");
  res.render("bookings/success.ejs", { booking });
};

/* =====================================================
   DOWNLOAD RECEIPT (Updated to use Shared Helper)
===================================================== */
exports.downloadReceipt = async (req, res) => {
  try {
    // ✅ FIXED: Deep Population to show Owner Signature on PDF
    const booking = await Booking.findById(req.params.id)
        .populate({ path: "listing", populate: { path: "owner" } });

    if (!booking) {
      req.flash("error", "Booking not found");
      return res.redirect("back");
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const filename = `Receipt_${booking._id}.pdf`;
    
    res.setHeader("Content-disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-type", "application/pdf");
    doc.pipe(res);

    // Use shared helper to ensure identical design as Email PDF
    buildReceiptPDF(doc, booking);

    doc.end();

  } catch (err) {
    console.error("Download Receipt Error:", err);
    req.flash("error", "Unable to download receipt");
    res.redirect("back");
  }
};
