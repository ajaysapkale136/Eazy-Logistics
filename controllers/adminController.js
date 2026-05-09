const Listing = require("../models/listing");
const User = require("../models/user");
const Booking = require("../models/booking");
const moment = require("moment");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const QRCode = require("qrcode");
const { PassThrough } = require("stream");
const { Parser } = require("json2csv");
const { cloudinary } = require("../cloudConfig");
const {
  ensureAdminSecurityCode,
  ensureMainAdminFlag,
} = require("../utils/authSecurity");
const {
  clampInviteMinutes,
  createAdminInvite,
} = require("../utils/adminInvite");
const {
  dispatchPoliceForBooking,
  deriveStayStatus,
  getOverdueHours,
  refreshBookingSafetyStates,
} = require("../utils/bookingSafety");

const safe = (value) => (typeof value === "number" ? value : Number(value) || 0);
const COMPANY_VERIFICATION_LABEL = "Verified by Admin / EZAY LOGISTICS";

function formatDateTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildPublicBaseUrl(req) {
  const configured = (process.env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

function buildVerificationDetailsUrl(req, listingId) {
  return `${buildPublicBaseUrl(req)}/listings/${listingId}/verification-details`;
}

async function getImageBufferFromUrl(url) {
  if (!url) return null;
  const response = await axios.get(url, { responseType: "arraybuffer", timeout: 15000 });
  return Buffer.from(response.data);
}

function getFallbackSignatureBuffer() {
  const signaturePath = path.join(__dirname, "..", "public", "images", "signature.png");
  if (!fs.existsSync(signaturePath)) return null;
  return fs.readFileSync(signaturePath);
}

async function buildVerificationPdfBuffer({
  listing,
  verifiedByName,
  verificationNote,
  qrTargetUrl,
}) {
  const qrDataUrl = await QRCode.toDataURL(qrTargetUrl, {
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  const qrBase64 = qrDataUrl.split(",")[1] || "";
  const qrBuffer = Buffer.from(qrBase64, "base64");

  const ownerName = listing.owner?.username || "Owner";
  const ownerEmail = listing.owner?.email || "N/A";
  const verifiedOnText = formatDateTime(new Date());
  const uploadedDocs = Array.isArray(listing.legalDocuments) ? listing.legalDocuments : [];

  let signatureBuffer = null;
  if (listing.owner?.signature?.url) {
    try {
      signatureBuffer = await getImageBufferFromUrl(listing.owner.signature.url);
    } catch (_error) {
      signatureBuffer = null;
    }
  }

  if (!signatureBuffer) {
    signatureBuffer = getFallbackSignatureBuffer();
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const stream = new PassThrough();
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("finish", () => resolve(Buffer.concat(chunks)));

    doc.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(20).fillColor("#0f172a").text("Property Verification Certificate", {
      align: "center",
    });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#15803d").text(COMPANY_VERIFICATION_LABEL, {
      align: "center",
    });

    doc.moveDown(1.2);
    doc.fontSize(11).fillColor("#0f172a").text(`Certificate ID: ${listing._id}`);
    doc.text(`Verified On: ${verifiedOnText}`);
    doc.text(`Verified By: ${verifiedByName || "Admin"}`);

    doc.moveDown(0.8);
    doc.fontSize(13).fillColor("#0f172a").text("Listing Registration Details");
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor("#1f2937");
    doc.text(`Listing Title: ${listing.title || "N/A"}`);
    doc.text(`Owner Name: ${ownerName}`);
    doc.text(`Owner Email: ${ownerEmail}`);
    doc.text(`Location: ${listing.location || "N/A"}, ${listing.country || "N/A"}`);
    doc.text(`Legal Documents Submitted: ${uploadedDocs.length}`);

    if (verificationNote) {
      doc.moveDown(0.2);
      doc.text(`Admin Note: ${verificationNote}`);
    }

    if (uploadedDocs.length) {
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor("#0f172a").text("Uploaded Registration Documents");
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor("#374151");

      uploadedDocs.slice(0, 10).forEach((file, index) => {
        const uploadedAt = formatDateTime(file.uploadedAt);
        const label = file.label || "Property legal document";
        const fileName = file.filename || "N/A";
        doc.text(`${index + 1}. ${label} | ${fileName} | Uploaded: ${uploadedAt}`);
      });
    }

    doc.moveDown(1.2);
    const qrY = doc.y;
    doc.fontSize(11).fillColor("#0f172a").text("Scan QR to view live verification form:", 42, qrY);
    doc.image(qrBuffer, 42, qrY + 18, { fit: [120, 120] });

    doc.rect(180, qrY + 18, 360, 120).strokeColor("#d1d5db").lineWidth(1).stroke();
    doc.fontSize(9).fillColor("#111827").text(
      `QR Destination: ${qrTargetUrl}`,
      190,
      qrY + 30,
      { width: 340 }
    );

    doc.fontSize(9).fillColor("#334155").text(
      "Any tampering in legal documents or ownership information voids this certificate.",
      190,
      qrY + 62,
      { width: 340 }
    );

    doc.moveDown(6.5);
    doc.fontSize(11).fillColor("#0f172a").text("Owner Signature", { underline: true });

    if (signatureBuffer) {
      const signatureY = doc.y + 8;
      doc.image(signatureBuffer, 42, signatureY, { fit: [180, 60] });
      doc.moveTo(42, signatureY + 62).lineTo(230, signatureY + 62).strokeColor("#334155").stroke();
      doc.fontSize(9).fillColor("#475569").text(ownerName, 42, signatureY + 66);
    } else {
      doc.fontSize(10).fillColor("#64748b").text("Signature unavailable.");
    }

    doc.end();
  });
}

async function uploadCertificatePdf(buffer, listingId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "Eazy-Logistics/verification-certificates",
        resource_type: "raw",
        public_id: `listing-${listingId}-verification-${Date.now()}`,
        format: "pdf",
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve({
          url: result.secure_url || result.url,
          filename: result.public_id,
        });
      }
    );

    stream.on("error", reject);
    stream.end(buffer);
  });
}

async function removeVerificationCertificateAsset(certificate) {
  if (!certificate?.filename) return;
  await cloudinary.uploader
    .destroy(certificate.filename, { resource_type: "raw" })
    .catch(() => null);
}

async function generateVerificationCertificate({ req, listing, verifiedByName, verificationNote }) {
  const qrTargetUrl = buildVerificationDetailsUrl(req, listing._id);
  const pdfBuffer = await buildVerificationPdfBuffer({
    listing,
    verifiedByName,
    verificationNote,
    qrTargetUrl,
  });

  const uploaded = await uploadCertificatePdf(pdfBuffer, listing._id);

  return {
    ...uploaded,
    qrTargetUrl,
    generatedAt: new Date(),
  };
}

function serializeSafetyBooking(booking) {
  return {
    _id: booking._id,
    stayStatus: booking.stayStatus,
    policeLogged: Boolean(booking.safetyAlert?.autoPoliceRequestLogged),
    dispatchStatus: booking.safetyAlert?.dispatchStatus || "not_requested",
    dispatchMessage: booking.safetyAlert?.dispatchMessage || "",
    dispatchReference: booking.safetyAlert?.dispatchReference || "",
    hoursOverdue: getOverdueHours(booking),
    guestName: `${booking.firstName || "Guest"} ${booking.lastName || ""}`.trim(),
    listingTitle: booking.listing?.title || "Unknown Listing",
    location: booking.listing
      ? `${booking.listing.location || ""}, ${booking.listing.country || ""}`.replace(/^,|,$/g, "")
      : "Unknown location",
    checkOut: booking.checkOut,
  };
}

module.exports = {
  async search(req, res) {
    const q = req.query.q || "";
    const regex = new RegExp(q, "i");

    const [users, listings, bookings] = await Promise.all([
      User.find({
        $or: [{ username: regex }, { email: regex }],
      }).lean(),
      Listing.find({
        $or: [{ title: regex }, { location: regex }],
      }).lean(),
      Booking.find({
        $or: [{ firstName: regex }, { lastName: regex }, { email: regex }],
      })
        .populate("listing")
        .lean(),
    ]);

    res.json({ users, listings, bookings });
  },

  async getSummary(req, res, next) {
    try {
      await refreshBookingSafetyStates();

      const [
        listingsCount,
        usersCount,
        bookingsCount,
        pendingDocumentReviews,
        safetyAlertCount,
        overdueCount,
        securedAdmins,
        passkeyAdmins,
      ] = await Promise.all([
        Listing.countDocuments(),
        User.countDocuments(),
        Booking.countDocuments(),
        Listing.countDocuments({ verificationStatus: "pending" }),
        Booking.countDocuments({ stayStatus: "safety_alert" }),
        Booking.countDocuments({ stayStatus: "overdue" }),
        User.countDocuments({
          role: "admin",
          $or: [{ isMainAdmin: true }, { "adminSecurity.codeHash": { $nin: ["", null] } }],
        }),
        User.countDocuments({
          role: "admin",
          "passkeys.0": { $exists: true },
        }),
      ]);

      const revAgg = await Booking.aggregate([
        { $match: { status: "confirmed", totalPrice: { $exists: true } } },
        { $group: { _id: null, revenue: { $sum: "$totalPrice" } } },
      ]);
      const revenue = revAgg.length ? safe(revAgg[0].revenue) : 0;

      const topCities = await Listing.aggregate([
        { $match: { location: { $exists: true, $ne: "" } } },
        { $group: { _id: "$location", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]);

      const rawRecentBookings = await Booking.find({})
        .populate("listing")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();

      const recentBookings = rawRecentBookings.map((booking) => ({
        _id: booking._id,
        totalPrice: booking.totalPrice,
        createdAt: booking.createdAt,
        listingTitle: booking.listing ? booking.listing.title : "Unknown Listing",
        guestName: booking.firstName
          ? `${booking.firstName} ${booking.lastName}`
          : "Guest",
      }));

      const rawSafetyAlerts = await Booking.find({
        stayStatus: { $in: ["overdue", "safety_alert"] },
      })
        .populate("listing")
        .sort({ checkOut: 1 })
        .limit(5)
        .lean();

      const safetyAlerts = rawSafetyAlerts.map(serializeSafetyBooking);

      res.json({
        ok: true,
        listingsCount,
        usersCount,
        bookingsCount,
        revenue,
        topCities,
        recentBookings,
        pendingDocumentReviews,
        safetyAlertCount,
        overdueCount,
        securedAdmins,
        passkeyAdmins,
        safetyAlerts,
      });
    } catch (err) {
      next(err);
    }
  },

  async getMonthlyEarnings(req, res, next) {
    try {
      const months = Number(req.query.months) || 6;
      const start = moment().startOf("month").subtract(months - 1, "months").toDate();

      const agg = await Booking.aggregate([
        { $match: { createdAt: { $gte: start } } },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            revenue: { $sum: "$totalPrice" },
            bookings: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);

      const labels = [];
      const revenue = [];
      const bookings = [];

      for (let i = months - 1; i >= 0; i--) {
        const date = moment().startOf("month").subtract(i, "months");
        labels.push(date.format("MMM"));
        const match = agg.find(
          (row) => row._id.year === date.year() && row._id.month === date.month() + 1
        );
        revenue.push(match ? safe(match.revenue) : 0);
        bookings.push(match ? match.bookings : 0);
      }

      res.json({ ok: true, labels, revenue, bookings });
    } catch (err) {
      next(err);
    }
  },

  async listListings(req, res, next) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 12;
      const q = req.query.q || "";
      const status = req.query.status || "";
      const filter = {};

      if (q) {
        filter.$or = [
          { title: { $regex: q, $options: "i" } },
          { location: { $regex: q, $options: "i" } },
        ];
      }

      if (status) filter.status = status;

      const total = await Listing.countDocuments(filter);
      const listings = await Listing.find(filter)
        .populate("owner", "username email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      res.json({ ok: true, total, listings });
    } catch (err) {
      next(err);
    }
  },

  async getListing(req, res, next) {
    try {
      const listing = await Listing.findById(req.params.id)
        .populate("owner", "username email")
        .populate("verifiedBy", "username email")
        .lean();

      if (!listing) {
        return res.status(404).json({ error: "Listing not found" });
      }

      res.json(listing);
    } catch (err) {
      next(err);
    }
  },

  async updateListing(req, res, next) {
    try {
      const listing = await Listing.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });
      res.json({ ok: true, listing });
    } catch (err) {
      next(err);
    }
  },

  async deleteListing(req, res, next) {
    try {
      await Listing.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  async approveListing(req, res, next) {
    try {
      const listing = await Listing.findById(req.params.id);
      if (!listing) {
        return res.status(404).json({ ok: false, error: "Listing not found" });
      }

      listing.status = "approved";
      await listing.save();
      res.json({ ok: true, listing });
    } catch (err) {
      next(err);
    }
  },

  async verifyListingDocuments(req, res, next) {
    try {
      const listing = await Listing.findById(req.params.id).populate(
        "owner",
        "username email signature"
      );

      if (!listing) {
        return res.status(404).json({ ok: false, error: "Listing not found" });
      }

      if (!Array.isArray(listing.legalDocuments) || listing.legalDocuments.length === 0) {
        return res.status(400).json({
          ok: false,
          error: "Owner must upload registration documents before verification.",
        });
      }

      const verificationNote = (req.body.note || "").trim();
      const verifiedByName = req.user?.username || req.user?.email || "Admin";

      await removeVerificationCertificateAsset(listing.verificationCertificate);

      const certificate = await generateVerificationCertificate({
        req,
        listing,
        verifiedByName,
        verificationNote,
      });

      listing.verificationStatus = "verified";
      listing.verifiedAt = new Date();
      listing.verifiedBy = req.user._id;
      listing.verificationNote = verificationNote;
      listing.verificationCertificate = certificate;
      listing.status = "approved";

      await listing.save();
      res.json({ ok: true, listing });
    } catch (err) {
      next(err);
    }
  },

  async rejectListingDocuments(req, res, next) {
    try {
      const listing = await Listing.findById(req.params.id);
      if (!listing) {
        return res.status(404).json({ ok: false, error: "Listing not found" });
      }

      listing.verificationStatus = "rejected";
      listing.verifiedAt = undefined;
      listing.verifiedBy = req.user._id;
      listing.verificationNote = (req.body.note || "Documents require correction.").trim();
      await removeVerificationCertificateAsset(listing.verificationCertificate);
      listing.verificationCertificate = undefined;

      await listing.save();
      res.json({ ok: true, listing });
    } catch (err) {
      next(err);
    }
  },

  async generateAdminInviteCode(req, res, next) {
    try {
      const ttlMinutes = clampInviteMinutes(req.body?.ttlMinutes || 30);
      const note = String(req.body?.note || "").trim();

      const { invite, plainCode } = await createAdminInvite({
        createdByUserId: req.user._id,
        ttlMinutes,
        note,
      });

      res.json({
        ok: true,
        inviteCode: plainCode,
        expiresAt: invite.expiresAt,
        ttlMinutes,
        lastFour: invite.codeLastFour,
      });
    } catch (err) {
      next(err);
    }
  },

  async listUsers(req, res, next) {
    try {
      const q = req.query.q || "";
      const filter = q
        ? {
            $or: [
              { username: { $regex: q, $options: "i" } },
              { email: { $regex: q, $options: "i" } },
            ],
          }
        : {};

      const users = await User.find(filter).sort({ createdAt: -1 }).lean();
      res.json({ ok: true, total: users.length, users });
    } catch (err) {
      next(err);
    }
  },

  async changeUserRole(req, res, next) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }

      const nextRole = req.body.role === "admin" ? "admin" : "user";

      if (user.isMainAdmin && nextRole !== "admin") {
        return res.status(400).json({
          ok: false,
          error: "Main admin cannot be demoted until another main admin exists.",
        });
      }

      user.role = nextRole;

      if (nextRole === "admin") {
        await ensureMainAdminFlag(user);

        if (!user.isMainAdmin) {
          await ensureAdminSecurityCode(user, {
            regenerate: true,
            notify: true,
            context: "Admin role activation",
          });
        }
      } else {
        user.isMainAdmin = false;
        user.adminSecurity.requiresCode = false;
        user.adminSecurity.codeHash = "";
        user.adminSecurity.codeLastFour = "";
        user.adminSecurity.codeIssuedAt = undefined;
        user.adminSecurity.codeSentAt = undefined;
        user.adminSecurity.lastVerifiedAt = undefined;
      }

      await user.save();
      res.json({ ok: true, user, securityCodeSent: nextRole === "admin" && !user.isMainAdmin });
    } catch (err) {
      next(err);
    }
  },

  async regenerateAdminSecurityCode(req, res, next) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }

      if (user.role !== "admin" || user.isMainAdmin) {
        return res.status(400).json({
          ok: false,
          error: "Only non-main admin accounts need a generated security code.",
        });
      }

      await ensureAdminSecurityCode(user, {
        regenerate: true,
        notify: true,
        context: "Admin security code reset",
      });
      await user.save();

      res.json({ ok: true, user });
    } catch (err) {
      next(err);
    }
  },

  async deleteUser(req, res, next) {
    try {
      await User.findByIdAndDelete(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },

  async listBookings(req, res, next) {
    try {
      await refreshBookingSafetyStates();

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 12;
      const status = req.query.status || "";
      const q = req.query.q || "";

      const query = {};

      if (status) query.status = status;
      if (q) {
        query.$or = [
          { firstName: { $regex: q, $options: "i" } },
          { lastName: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
        ];
      }

      const total = await Booking.countDocuments(query);

      const bookings = await Booking.find(query)
        .populate("listing")
        .populate("user", "username email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const data = bookings.map((booking) => ({
        ...booking,
        hoursOverdue: getOverdueHours(booking),
        stayStatus: booking.stayStatus || deriveStayStatus(booking),
        policeLogged: Boolean(booking.safetyAlert?.autoPoliceRequestLogged),
        dispatchStatus: booking.safetyAlert?.dispatchStatus || "not_requested",
        dispatchMessage: booking.safetyAlert?.dispatchMessage || "",
        dispatchReference: booking.safetyAlert?.dispatchReference || "",
      }));

      res.json({ ok: true, total, bookings: data });
    } catch (err) {
      next(err);
    }
  },

  async approveBooking(req, res, next) {
    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) {
        return res.status(404).json({ ok: false, error: "Booking not found" });
      }

      booking.status = "confirmed";
      booking.stayStatus = deriveStayStatus(booking);
      await booking.save();

      res.json({ ok: true, booking });
    } catch (err) {
      next(err);
    }
  },

  async cancelBooking(req, res, next) {
    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) {
        return res.status(404).json({ ok: false, error: "Booking not found" });
      }

      booking.status = "cancelled";
      booking.stayStatus = "checked_out";
      await booking.save();

      res.json({ ok: true, booking });
    } catch (err) {
      next(err);
    }
  },

  async refundBooking(req, res, next) {
    try {
      const booking = await Booking.findById(req.params.id);
      if (!booking) {
        return res.status(404).json({ ok: false, error: "Booking not found" });
      }

      booking.status = "refunded";
      booking.stayStatus = "checked_out";
      await booking.save();

      res.json({ ok: true, booking });
    } catch (err) {
      next(err);
    }
  },

  async dispatchPoliceAlert(req, res, next) {
    try {
      const booking = await dispatchPoliceForBooking(req.params.id);
      if (!booking) {
        return res.status(404).json({ ok: false, error: "Booking not found" });
      }

      const payload = booking.toObject();
      payload.hoursOverdue = getOverdueHours(booking);
      payload.stayStatus = booking.stayStatus || deriveStayStatus(booking);
      payload.policeLogged = Boolean(booking.safetyAlert?.autoPoliceRequestLogged);
      payload.dispatchStatus = booking.safetyAlert?.dispatchStatus || "not_requested";
      payload.dispatchMessage = booking.safetyAlert?.dispatchMessage || "";
      payload.dispatchReference = booking.safetyAlert?.dispatchReference || "";

      res.json({ ok: true, booking: payload });
    } catch (err) {
      next(err);
    }
  },

  async downloadCsvReport(req, res, next) {
    try {
      const type = req.query.type || "bookings";
      let data = [];

      if (type === "bookings") data = await Booking.find({}).lean();
      if (type === "users") data = await User.find({}).lean();
      if (type === "listings") data = await Listing.find({}).lean();

      const parser = new Parser();
      const csv = parser.parse(data);

      res.header("Content-Type", "text/csv");
      res.attachment(`${type}.csv`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },

  async downloadPdfReport(req, res, next) {
    try {
      const type = req.query.type || "bookings";
      let data = [];

      if (type === "bookings") data = await Booking.find({}).lean();
      if (type === "users") data = await User.find({}).lean();
      if (type === "listings") data = await Listing.find({}).lean();

      const doc = new PDFDocument();
      res.setHeader("Content-Type", "application/pdf");
      doc.pipe(res);

      doc.fontSize(18).text(`${type.toUpperCase()} REPORT`);
      doc.moveDown();

      data.forEach((item) => {
        doc.fontSize(10).text(JSON.stringify(item));
        doc.moveDown();
      });

      doc.end();
    } catch (err) {
      next(err);
    }
  },
};
