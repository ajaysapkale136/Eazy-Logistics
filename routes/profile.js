const express = require("express");
const router = express.Router();
const multer = require("multer");
const { storage } = require("../cloudConfig");
const upload = multer({ storage });

const User = require("../models/user");
const Listing = require("../models/listing");
const { isLoggedIn } = require("../middleware");

/* ============================================================
   REDIRECT /profile → /profile/me
============================================================ */
router.get("/", isLoggedIn, (req, res) => {
  return res.redirect("/profile/me");
});

/* ============================================================
   PROFILE OVERVIEW
============================================================ */
router.get("/me", isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.render("profile/index", { user, active: "overview" });
  } catch (err) {
    console.error("Profile load error:", err);
    req.flash("error", "Failed to load profile.");
    res.redirect("/listings");
  }
});

/* ============================================================
   USER LISTINGS
============================================================ */
router.get("/listings", isLoggedIn, async (req, res) => {
  try {
    const listings = await Listing.find({ owner: req.user._id }).sort({ createdAt: -1 });
    res.render("profile/listings", { listings, active: "listings" });
  } catch (err) {
    console.error("User listings error:", err);
    req.flash("error", "Failed to load your listings.");
    res.redirect("/profile/me");
  }
});

/* ============================================================
   PASSWORD (GET)
============================================================ */
router.get("/password", isLoggedIn, (req, res) => {
  res.render("profile/password", { user: req.user, active: "password" });
});

/* ============================================================
   PASSWORD (PUT)
============================================================ */
router.put("/password", isLoggedIn, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || newPassword !== confirmPassword) {
      req.flash("error", "New password and confirm password must match.");
      return res.redirect("/profile/password");
    }

    const user = await User.findById(req.user._id);

    await user.changePassword(currentPassword, newPassword);
    await user.save();

    req.flash("success", "Password updated successfully. Please log in again.");

    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/login");
    });

  } catch (err) {
    console.error("Password update error:", err);
    req.flash("error", "Failed to change password. Check your current password.");
    res.redirect("/profile/password");
  }
});

/* ============================================================
   SETTINGS (GET)
============================================================ */
router.get("/settings", isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.render("profile/settings", { user, active: "settings" });
  } catch (err) {
    console.error("Settings load error:", err);
    req.flash("error", "Failed to load settings.");
    res.redirect("/profile/me");
  }
});

/* ============================================================
   SETTINGS (PUT) — FIXED FOR MIDNIGHT + NEON
============================================================ */
router.put("/settings", isLoggedIn, async (req, res) => {
  try {
    const { theme, language, notificationsEnabled } = req.body;

    const user = await User.findById(req.user._id);

    // apply new values
    user.preferences.theme = theme;            // <-- FIX (allow midnight, neon)
    user.preferences.language = language;
    user.preferences.notifications.enabled = notificationsEnabled === "true";

    await user.save();

    req.flash("success", "Settings saved.");
    res.redirect("/profile/settings");

  } catch (err) {
    console.error("Settings save error:", err);
    req.flash("error", "Failed to save settings.");
    res.redirect("/profile/settings");
  }
});

/* ============================================================
   NOTIFICATIONS
============================================================ */
router.post("/notifications/seen", isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.preferences.notifications.lastSeenAt = new Date();
    await user.save();
    res.json({ ok: true });
  } catch (err) {
    console.error("Notification seen error:", err);
    res.status(500).json({ ok: false });
  }
});

/* ============================================================
   EDIT PROFILE (GET)
============================================================ */
router.get("/edit", isLoggedIn, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.render("profile/edit", { user, active: "edit" });
  } catch (err) {
    console.error("Edit profile load error:", err);
    req.flash("error", "Failed to load edit form.");
    res.redirect("/profile/me");
  }
});

/* ============================================================
   EDIT PROFILE (PUT)
============================================================ */
router.put("/", isLoggedIn, upload.single("profileImage"), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Basic fields
    user.username = req.body.username?.trim() || user.username;
    user.phone = req.body.phone?.trim() || user.phone;
    user.bio = req.body.bio?.trim() || user.bio;
    user.address = req.body.address?.trim() || user.address;

    // Social links
    user.socialLinks.instagram = req.body.instagram?.trim() || "";
    user.socialLinks.linkedin = req.body.linkedin?.trim() || "";

    // Image upload
    if (req.file) {
      user.profileImage = {
        url: req.file.path,
        filename: req.file.filename
      };
    }

    // Remove image
    if (req.body.removeImage === "1") {
      user.profileImage = {
        url: "/images/default-avatar.png",
        filename: ""
      };
    }

    await user.save();

    req.flash("success", "Profile updated successfully.");
    res.redirect("/profile/me");

  } catch (err) {
    console.error("Profile update error:", err);
    req.flash("error", "Failed to update profile.");
    res.redirect("/profile/edit");
  }
});

/* ============================================================
   EXPORT ROUTER
============================================================ */
module.exports = router;
