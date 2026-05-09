const Booking = require("../models/booking");
const axios = require("axios");
const { sendMail } = require("./mailer");
const { compareHashedValue, generateNumericCode, hashValue } = require("./security");
const { resolveMainAdmin } = require("./authSecurity");

function ensureSafetyState(booking) {
  if (!booking.safetyAlert) {
    booking.safetyAlert = {};
  }

  if (typeof booking.safetyAlert.isTriggered !== "boolean") {
    booking.safetyAlert.isTriggered = false;
  }

  if (typeof booking.safetyAlert.autoPoliceRequestLogged !== "boolean") {
    booking.safetyAlert.autoPoliceRequestLogged = false;
  }

  if (typeof booking.safetyAlert.dispatchStatus !== "string") {
    booking.safetyAlert.dispatchStatus = "not_requested";
  }

  if (typeof booking.safetyAlert.dispatchMessage !== "string") {
    booking.safetyAlert.dispatchMessage = "";
  }

  if (typeof booking.safetyAlert.dispatchReference !== "string") {
    booking.safetyAlert.dispatchReference = "";
  }
}

function getOverdueHours(booking, now = new Date()) {
  if (!booking?.checkOut) return 0;
  const diff = now.getTime() - new Date(booking.checkOut).getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60));
}

function deriveStayStatus(booking, now = new Date()) {
  if (!booking) return "upcoming";

  if (booking.checkedOutAt) {
    return "checked_out";
  }

  if (booking.status !== "confirmed") {
    return "upcoming";
  }

  const checkIn = new Date(booking.checkIn);
  const checkOut = new Date(booking.checkOut);
  const policeThreshold = new Date(checkOut.getTime() + 10 * 60 * 60 * 1000);

  if (now >= policeThreshold) {
    return "safety_alert";
  }

  if (now >= checkOut) {
    return "overdue";
  }

  if (now >= checkIn) {
    return "checked_in";
  }

  return "upcoming";
}

async function sendSafetyAlertEmail(booking) {
  const mainAdmin = await resolveMainAdmin();
  const recipient = process.env.POLICE_ALERT_EMAIL || mainAdmin?.email || process.env.COMPANY_EMAIL;

  if (!recipient) return false;

  const listingTitle = booking.listing?.title || "Property";
  const listingLocation = booking.listing
    ? `${booking.listing.location || ""}, ${booking.listing.country || ""}`.trim().replace(/^,|,$/g, "")
    : "Location unavailable";

  return sendMail({
    to: recipient,
    subject: `Urgent safety alert for booking ${booking._id.toString().slice(-6).toUpperCase()}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.7;">
        <h2 style="color: #b91c1c;">Urgent Safety Escalation</h2>
        <p>A guest has not completed checkout or extended the booking within 10 hours after the scheduled checkout time.</p>
        <p><strong>Booking:</strong> #${booking._id.toString().slice(-6).toUpperCase()}</p>
        <p><strong>Guest:</strong> ${booking.firstName} ${booking.lastName}</p>
        <p><strong>Listing:</strong> ${listingTitle}</p>
        <p><strong>Location:</strong> ${listingLocation}</p>
        <p><strong>Scheduled checkout:</strong> ${new Date(booking.checkOut).toLocaleString("en-IN")}</p>
        <p><strong>Admin action:</strong> Review immediately from the admin panel and contact emergency services if required.</p>
      </div>
    `,
  });
}

async function requestPoliceDispatch(booking) {
  const webhookUrl = process.env.POLICE_ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      ok: false,
      status: "not_configured",
      message: "POLICE_ALERT_WEBHOOK_URL is not configured.",
      dispatchReference: "",
    };
  }

  const payload = {
    event: "booking_safety_alert",
    triggeredAt: new Date().toISOString(),
    bookingId: booking._id?.toString(),
    bookingCode: booking._id?.toString()?.slice(-6)?.toUpperCase(),
    guest: {
      firstName: booking.firstName || "",
      lastName: booking.lastName || "",
      email: booking.email || "",
      phone: booking.phone || "",
    },
    listing: {
      id: booking.listing?._id?.toString() || "",
      title: booking.listing?.title || "Property",
      location: booking.listing?.location || "",
      country: booking.listing?.country || "",
    },
    checkOut: booking.checkOut,
    overdueHours: getOverdueHours(booking),
  };

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const dispatchReference =
      (response.data && (response.data.dispatchId || response.data.id || response.data.reference)) ||
      response.headers["x-dispatch-id"] ||
      "";

    return {
      ok: true,
      status: "sent",
      message: "Police dispatch webhook sent successfully.",
      dispatchReference: String(dispatchReference || ""),
    };
  } catch (error) {
    const statusCode = error?.response?.status;
    const responseData = error?.response?.data;
    const responseMessage =
      typeof responseData === "string"
        ? responseData.slice(0, 180)
        : String(responseData?.message || responseData?.error || "").slice(0, 180);

    const reason = statusCode ? `HTTP ${statusCode}` : error.message || "unknown error";

    return {
      ok: false,
      status: "failed",
      message: `Police dispatch webhook failed (${reason}${responseMessage ? `: ${responseMessage}` : ""}).`,
      dispatchReference: "",
    };
  }
}

async function issueCheckoutOtp(booking) {
  ensureSafetyState(booking);
  const otp = generateNumericCode(6);
  booking.checkoutOtpHash = hashValue(otp);
  booking.checkoutOtpSentAt = new Date();
  booking.checkoutOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await booking.save();

  await sendMail({
    to: booking.email,
    subject: "Your property checkout OTP",
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2 style="color: #0f172a;">Checkout OTP</h2>
        <p>Hello ${booking.firstName},</p>
        <p>Use this OTP to complete your property checkout safely.</p>
        <div style="font-size: 24px; font-weight: 700; letter-spacing: 4px; background: #eff6ff; color: #1d4ed8; padding: 12px 18px; border-radius: 10px; display: inline-block;">
          ${otp}
        </div>
        <p style="margin-top: 18px;">This OTP will expire in 15 minutes.</p>
      </div>
    `,
  });

  return otp;
}

function verifyCheckoutOtp(booking, otp) {
  if (!booking?.checkoutOtpHash || !booking.checkoutOtpExpiresAt) return false;
  if (new Date(booking.checkoutOtpExpiresAt) < new Date()) return false;
  return compareHashedValue(otp, booking.checkoutOtpHash);
}

async function refreshBookingSafetyStates() {
  const now = new Date();
  const bookings = await Booking.find({
    status: "confirmed",
    checkedOutAt: { $exists: false },
  }).populate("listing");

  for (const booking of bookings) {
    ensureSafetyState(booking);
    const nextStayStatus = deriveStayStatus(booking, now);
    let changed = false;

    if (booking.stayStatus !== nextStayStatus) {
      booking.stayStatus = nextStayStatus;
      changed = true;
    }

    booking.safetyAlert.lastEvaluatedAt = now;

    if (nextStayStatus === "safety_alert" && !booking.safetyAlert.isTriggered) {
      booking.safetyAlert.isTriggered = true;
      booking.safetyAlert.triggeredAt = now;
      booking.safetyAlert.reason = "Guest did not checkout or extend within 10 hours.";

      const dispatchResult = await requestPoliceDispatch(booking);
      booking.safetyAlert.autoPoliceRequestLogged = dispatchResult.ok;
      booking.safetyAlert.dispatchStatus = dispatchResult.status;
      booking.safetyAlert.dispatchMessage = dispatchResult.message;
      booking.safetyAlert.dispatchReference = dispatchResult.dispatchReference;
      booking.safetyAlert.dispatchAttemptedAt = now;
      if (dispatchResult.ok) {
        booking.safetyAlert.policeDispatchedAt = now;
      }

      const mailSent = await sendSafetyAlertEmail(booking);
      if (mailSent) {
        booking.safetyAlert.notifiedAt = now;
      }

      changed = true;
    }

    if (nextStayStatus !== "safety_alert" && booking.safetyAlert.isTriggered && !booking.safetyAlert.resolvedAt) {
      booking.safetyAlert.resolvedAt = now;
      changed = true;
    }

    if (changed) {
      await booking.save();
    }
  }
}

async function dispatchPoliceForBooking(bookingId) {
  const booking = await Booking.findById(bookingId).populate("listing");
  if (!booking) return null;

  ensureSafetyState(booking);
  const now = new Date();
  const dispatchResult = await requestPoliceDispatch(booking);

  booking.safetyAlert.isTriggered = true;
  booking.safetyAlert.triggeredAt = booking.safetyAlert.triggeredAt || now;
  booking.safetyAlert.autoPoliceRequestLogged = dispatchResult.ok;
  booking.safetyAlert.dispatchStatus = dispatchResult.status;
  booking.safetyAlert.dispatchMessage = dispatchResult.message;
  booking.safetyAlert.dispatchReference = dispatchResult.dispatchReference;
  booking.safetyAlert.dispatchAttemptedAt = now;
  if (dispatchResult.ok) {
    booking.safetyAlert.policeDispatchedAt = now;
  }
  booking.stayStatus = "safety_alert";

  const mailSent = await sendSafetyAlertEmail(booking);
  if (mailSent) {
    booking.safetyAlert.notifiedAt = now;
  }

  await booking.save();
  return booking;
}

module.exports = {
  dispatchPoliceForBooking,
  deriveStayStatus,
  getOverdueHours,
  issueCheckoutOtp,
  requestPoliceDispatch,
  refreshBookingSafetyStates,
  sendSafetyAlertEmail,
  verifyCheckoutOtp,
};
