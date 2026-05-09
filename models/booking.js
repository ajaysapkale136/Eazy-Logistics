// models/booking.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema(
  {
    // Relations
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    /* =========================
       Guest Details (from confirm.ejs)
    ========================= */
    firstName: { type: String, required: true },
    lastName:  { type: String, required: true },
    email:     { type: String, required: true },
    phone:     { type: String, required: true },
    address:   { type: String, required: true },
    city:      { type: String, required: true },
    state:     { type: String, required: true },
    zip:       { type: String, required: true },

    /* =========================
       Booking Details
    ========================= */
    checkIn:  { type: Date, required: true },
    checkOut: { type: Date, required: true },
    guests:   { type: Number, required: true, min: 1 },

    roomType: {
      type: String,
      enum: ["Standard", "Deluxe", "Suite"],
      default: "Standard"
    },

    nights: {
      type: Number,
      required: true,
      min: 1
    },

    /* =========================
       Financials
    ========================= */
    totalPrice: {
      type: Number,
      required: true
    },

    mapRoute: {
      origin: {
        type: {
          type: String,
          enum: ["Point"],
        },
        coordinates: [Number]
      },
      source: String,
      travelMode: String,
      distanceKm: Number,
      durationMin: Number
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "refunded"],
      default: "pending"
    },

    stayStatus: {
      type: String,
      enum: ["upcoming", "checked_in", "checked_out", "overdue", "safety_alert"],
      default: "upcoming"
    },

    checkoutOtpHash: {
      type: String,
      default: ""
    },

    checkoutOtpSentAt: Date,
    checkoutOtpExpiresAt: Date,
    checkedOutAt: Date,

    extensionHistory: [
      {
        previousCheckOut: Date,
        newCheckOut: Date,
        nightsAdded: Number,
        extendedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    safetyAlert: {
      isTriggered: {
        type: Boolean,
        default: false
      },
      triggeredAt: Date,
      notifiedAt: Date,
      resolvedAt: Date,
      lastEvaluatedAt: Date,
      autoPoliceRequestLogged: {
        type: Boolean,
        default: false
      },
      dispatchStatus: {
        type: String,
        enum: ["not_requested", "not_configured", "sent", "failed"],
        default: "not_requested"
      },
      dispatchMessage: {
        type: String,
        default: ""
      },
      dispatchReference: {
        type: String,
        default: ""
      },
      dispatchAttemptedAt: Date,
      policeDispatchedAt: Date,
      reason: {
        type: String,
        default: ""
      }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
