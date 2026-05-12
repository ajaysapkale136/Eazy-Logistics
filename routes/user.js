// user.js
const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const passport = require("passport");
const { isLoggedIn, saveRedirectUrl } = require("../appMiddleware.js");
const userController = require("../controllers/users.js");

function ensureSocialStrategy(strategyName, label) {
  return (req, res, next) => {
    const strategy = passport._strategies?.[strategyName];
    if (!strategy) {
      req.flash("error", `${label} sign-in is temporarily unavailable. Please try another method.`);
      return res.redirect("/login");
    }
    return next();
  };
}

function setReturnTo(req, _res, next) {
  const returnTo = String(req.query.returnTo || "").trim();
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    req.session.redirectUrl = returnTo;
  }
  next();
}

/* =====================================================
   SIGNUP ROUTES
===================================================== */

// Render Signup Page
router.get("/signup", userController.renderSignupForm);

// Handle Signup Logic (User + Admin)
router.post("/signup", wrapAsync(userController.register));

/* =====================================================
   USER LOGIN ROUTES
===================================================== */

// Render Login Page
router.get("/login", userController.renderLoginForm);

// Handle User Login
router.post(
  "/login",
  saveRedirectUrl,
  wrapAsync(userController.handleUserLogin)
);

router.get(
  "/auth/google",
  setReturnTo,
  ensureSocialStrategy("google", "Google"),
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/auth/google/callback",
  ensureSocialStrategy("google", "Google"),
  passport.authenticate("google", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, _res, next) => {
    req.socialProvider = "Google";
    next();
  },
  wrapAsync(userController.completeSocialLogin)
);

router.get(
  "/auth/facebook",
  setReturnTo,
  ensureSocialStrategy("facebook", "Facebook"),
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/auth/facebook/callback",
  ensureSocialStrategy("facebook", "Facebook"),
  passport.authenticate("facebook", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, _res, next) => {
    req.socialProvider = "Facebook";
    next();
  },
  wrapAsync(userController.completeSocialLogin)
);

router.get(
  "/auth/linkedin",
  setReturnTo,
  ensureSocialStrategy("linkedin", "LinkedIn"),
  passport.authenticate("linkedin")
);

router.get(
  "/auth/linkedin/callback",
  ensureSocialStrategy("linkedin", "LinkedIn"),
  passport.authenticate("linkedin", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, _res, next) => {
    req.socialProvider = "LinkedIn";
    next();
  },
  wrapAsync(userController.completeSocialLogin)
);

router.get(
  "/auth/apple",
  setReturnTo,
  ensureSocialStrategy("apple", "Apple"),
  passport.authenticate("apple")
);

router.get(
  "/auth/apple/callback",
  ensureSocialStrategy("apple", "Apple"),
  passport.authenticate("apple", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, _res, next) => {
    req.socialProvider = "Apple";
    next();
  },
  wrapAsync(userController.completeSocialLogin)
);

router.post(
  "/auth/apple/callback",
  ensureSocialStrategy("apple", "Apple"),
  passport.authenticate("apple", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  (req, _res, next) => {
    req.socialProvider = "Apple";
    next();
  },
  wrapAsync(userController.completeSocialLogin)
);

/* =====================================================
   ADMIN LOGIN ROUTE
===================================================== */

router.post(
  "/login/admin",
  wrapAsync(userController.handleAdminLogin)
);

router.get("/login/admin/code", wrapAsync(userController.renderAdminCodeForm));
router.post("/login/admin/code", wrapAsync(userController.verifyAdminCode));
router.get("/forgot-password", userController.renderForgotPasswordForm);
router.post("/forgot-password", wrapAsync(userController.requestPasswordReset));
router.get("/reset-password/:token", wrapAsync(userController.renderResetPasswordForm));
router.post("/reset-password/:token", wrapAsync(userController.resetPassword));

router.post(
  "/login/passkey/options",
  wrapAsync(userController.generatePasskeyAuthenticationOptions)
);
router.post(
  "/login/face-auth/options",
  wrapAsync(userController.generatePasskeyAuthenticationOptions)
);
router.post(
  "/login/passkey/verify",
  wrapAsync(userController.verifyPasskeyAuthentication)
);
router.post(
  "/login/face-auth/verify",
  wrapAsync(userController.verifyPasskeyAuthentication)
);

router.post(
  "/passkeys/register/options",
  isLoggedIn,
  wrapAsync(userController.generatePasskeyRegistrationOptions)
);
router.post(
  "/face-auth/register/options",
  isLoggedIn,
  wrapAsync(userController.generatePasskeyRegistrationOptions)
);
router.post(
  "/passkeys/register/verify",
  isLoggedIn,
  wrapAsync(userController.verifyPasskeyRegistration)
);
router.post(
  "/face-auth/register/verify",
  isLoggedIn,
  wrapAsync(userController.verifyPasskeyRegistration)
);
router.get(
  "/passkeys/status",
  isLoggedIn,
  wrapAsync(userController.getPasskeyStatus)
);
router.get(
  "/face-auth/status",
  isLoggedIn,
  wrapAsync(userController.getPasskeyStatus)
);
router.post(
  "/passkeys/:credentialId/delete",
  isLoggedIn,
  wrapAsync(userController.removePasskey)
);
router.post(
  "/face-auth/:credentialId/delete",
  isLoggedIn,
  wrapAsync(userController.removePasskey)
);

/* =====================================================
   LOGOUT
===================================================== */

router.get("/logout", userController.logout);
router.post("/logout", userController.logout);

module.exports = router;
