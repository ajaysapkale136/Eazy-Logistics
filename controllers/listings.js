/**************************************************************************
 * LISTING CONTROLLER — CLEAN & FINAL (UPGRADED)
 **************************************************************************/

const Listing = require("../models/listing");
const Booking = require("../models/booking");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const detectCategoryAI = require("../utils/categorizer-ai");
const { cloudinary } = require("../cloudConfig");

const mapToken = process.env.MAP_TOKEN;
const geocodingClient = mapToken ? mbxGeocoding({ accessToken: mapToken }) : null;

function getUploadedFiles(req, fieldName) {
  if (!req.files || !req.files[fieldName]) return [];
  return req.files[fieldName];
}

function mapLegalDocuments(files = [], label = "") {
  return files.map((file) => ({
    url: file.path,
    filename: file.filename,
    label: label?.trim() || "Property legal document",
    uploadedAt: new Date(),
  }));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function removeCertificateFromCloudinary(certificate) {
  if (!certificate?.filename) return;
  await cloudinary.uploader
    .destroy(certificate.filename, { resource_type: "raw" })
    .catch(() => null);
}

/* =====================================================
   GET ALL LISTINGS
===================================================== */
module.exports.index = async (req, res) => {
  try {
    const allListings = await Listing.find({});
    res.render("listings/index.ejs", { allListings });
  } catch (err) {
    console.error("Index Error:", err);
    req.flash("error", "Failed to load listings.");
    res.redirect("/");
  }
};

/* =====================================================
   RENDER NEW FORM
===================================================== */
module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};

/* =====================================================
   SHOW SINGLE LISTING (WITH SMART MAP DATA)
===================================================== */
module.exports.showListing = async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await Listing.findById(id)
      .populate({
        path: "reviews",
        populate: { path: "author" }
      })
      .populate("owner")
      .populate("verifiedBy");

    if (!listing) {
      req.flash("error", "The requested listing does not exist.");
      return res.redirect("/listings");
    }

    /* ---------------- MAP SAFETY ---------------- */
    if (
      !listing.geometry ||
      !Array.isArray(listing.geometry.coordinates) ||
      listing.geometry.coordinates.length !== 2
    ) {
      console.warn("⚠️ Listing missing geometry:", listing._id.toString());
    }

    /* ---------------- CHECK BOOKING STATUS ---------------- */
    const today = new Date();

    const activeBooking = await Booking.findOne({
      listing: listing._id,
      status: "confirmed",
      checkIn: { $lte: today },
      checkOut: { $gt: today }
    });

    const lastBooking = await Booking.findOne({
      listing: listing._id,
      status: "confirmed",
      checkOut: { $gt: today }
    }).sort({ checkOut: -1 });

    /* ---------------- FETCH NEARBY LISTINGS (10–50 KM) ---------------- */
    let nearbyListings = [];

    if (listing.geometry && listing.geometry.coordinates) {
      try {
        nearbyListings = await Listing.find({
          _id: { $ne: listing._id },
          geometry: {
            $near: {
              $geometry: listing.geometry,
              $minDistance: 10000, // 10 km
              $maxDistance: 50000  // 50 km
            }
          }
        })
          .select("title price location images image geometry") // optimization
          .limit(8);
      } catch (e) {
        console.log("Geo Error:", e.message);
      }
    }

    const currentUserReview = req.user
      ? listing.reviews.find((review) => review.author?._id?.equals(req.user._id))
      : null;

    res.render("listings/show.ejs", {
      listing,
      activeBooking,
      lastBooking,
      nearbyListings,
      mapToken: process.env.MAP_TOKEN,
      currUser: req.user || null,
      currentUserReview
    });

  } catch (err) {
    console.error("Show Listing Error:", err);
    req.flash("error", "Unable to display listing.");
    res.redirect("/listings");
  }
};

/* =====================================================
   CREATE LISTING
===================================================== */
module.exports.createListing = async (req, res) => {
  try {
    const { listing: listingData } = req.body;

    const listing = new Listing(listingData);

    const imageFiles = getUploadedFiles(req, "listing[images]");
    const legalDocumentFiles = getUploadedFiles(req, "listing[legalDocuments]");

    if (imageFiles.length) {
      listing.images = imageFiles.map(f => ({
        url: f.path,
        filename: f.filename
      }));
    }

    if (legalDocumentFiles.length) {
      listing.legalDocuments = mapLegalDocuments(
        legalDocumentFiles,
        listingData.legalDocumentLabel
      );
      listing.verificationStatus = "pending";
      listing.verificationNote = "";
    }

    listing.owner = req.user._id;

    if (geocodingClient) {
      const geoResponse = await geocodingClient
        .forwardGeocode({
          query: listingData.location,
          limit: 1
        })
        .send();

      if (geoResponse.body.features.length) {
        listing.geometry = geoResponse.body.features[0].geometry;
      }
    }

    listing.category = await detectCategoryAI(
      listing.title || "",
      `${listing.description || ""} ${listing.location || ""}`.trim()
    );

    await listing.save();

    req.flash("success", "Listing created successfully.");
    res.redirect("/listings");

  } catch (err) {
    console.error("Create Listing Error:", err);
    req.flash("error", "Error creating listing.");
    res.redirect("/listings/new");
  }
};

/* =====================================================
   RENDER EDIT FORM
===================================================== */
module.exports.renderEditForm = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }
    res.render("listings/edit.ejs", { listing });
  } catch (err) {
    console.error("Edit Form Error:", err);
    req.flash("error", "Unable to load edit form.");
    res.redirect("/listings");
  }
};

/* =====================================================
   UPDATE LISTING
===================================================== */
module.exports.updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }

    Object.assign(listing, req.body.listing);

    const imageFiles = getUploadedFiles(req, "listing[images]");
    const legalDocumentFiles = getUploadedFiles(req, "listing[legalDocuments]");

    if (imageFiles.length) {
      listing.images.push(
        ...imageFiles.map(f => ({
          url: f.path,
          filename: f.filename
        }))
      );
    }

    if (legalDocumentFiles.length) {
      await removeCertificateFromCloudinary(listing.verificationCertificate);

      for (const document of listing.legalDocuments || []) {
        if (document.filename) {
          await cloudinary.uploader.destroy(document.filename, { resource_type: "raw" }).catch(() => null);
          await cloudinary.uploader.destroy(document.filename, { resource_type: "image" }).catch(() => null);
        }
      }

      listing.legalDocuments = mapLegalDocuments(
        legalDocumentFiles,
        req.body.listing?.legalDocumentLabel
      );
      listing.verificationStatus = "pending";
      listing.verifiedAt = undefined;
      listing.verifiedBy = undefined;
      listing.verificationNote = "";
      listing.verificationCertificate = undefined;
    } else if (!listing.legalDocuments?.length) {
      await removeCertificateFromCloudinary(listing.verificationCertificate);
      listing.verificationStatus = "not_submitted";
      listing.verificationCertificate = undefined;
    }

    if (req.body.deleteImages) {
      const deleteList = Array.isArray(req.body.deleteImages)
        ? req.body.deleteImages
        : [req.body.deleteImages];

      for (const filename of deleteList) {
        await cloudinary.uploader.destroy(filename);
      }

      listing.images = listing.images.filter(
        img => !deleteList.includes(img.filename)
      );
    }

    if (!listing.category || !listing.category.trim()) {
      listing.category = await detectCategoryAI(
        listing.title || "",
        `${listing.description || ""} ${listing.location || ""}`.trim()
      );
    }

    await listing.save();

    req.flash("success", "Listing updated successfully.");
    res.redirect(`/listings/${id}`);

  } catch (err) {
    console.error("Update Listing Error:", err);
    req.flash("error", "Failed to update listing.");
    res.redirect("/listings");
  }
};

/* =====================================================
   DELETE LISTING
===================================================== */
module.exports.destroyListing = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }

    for (const img of listing.images) {
      await cloudinary.uploader.destroy(img.filename);
    }

    for (const document of listing.legalDocuments || []) {
      if (document.filename) {
        await cloudinary.uploader.destroy(document.filename, { resource_type: "raw" }).catch(() => null);
        await cloudinary.uploader.destroy(document.filename, { resource_type: "image" }).catch(() => null);
      }
    }

    await removeCertificateFromCloudinary(listing.verificationCertificate);

    await Listing.findByIdAndDelete(id);

    req.flash("success", "Listing deleted successfully.");
    res.redirect("/listings");

  } catch (err) {
    console.error("Delete Listing Error:", err);
    req.flash("error", "Unable to delete listing.");
    res.redirect("/listings");
  }
};

/* =====================================================
   PUBLIC VERIFICATION DETAILS (FOR QR SCAN)
===================================================== */
module.exports.showVerificationDetails = async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate("owner", "username email signature")
      .populate("verifiedBy", "username email");

    if (!listing) {
      req.flash("error", "Listing not found.");
      return res.redirect("/listings");
    }

    if (listing.verificationStatus !== "verified") {
      req.flash("error", "Verification details are not available for this listing.");
      return res.redirect(`/listings/${listing._id}`);
    }

    res.render("listings/verificationDetails.ejs", {
      listing,
      verifiedOnText: formatDate(listing.verifiedAt),
      certificateGeneratedOnText: formatDate(listing.verificationCertificate?.generatedAt),
    });
  } catch (err) {
    console.error("Verification Details Error:", err);
    req.flash("error", "Unable to load verification details.");
    res.redirect("/listings");
  }
};
