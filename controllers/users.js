const User = require("../models/user.js");
const passport = require("passport");
const crypto = require("crypto");
const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} = require("@simplewebauthn/server");
const {
  adminNeedsSecurityCode,
  ensureAdminSecurityCode,
  ensureMainAdminFlag,
  verifyAdminSecurityCode,
} = require("../utils/authSecurity");
const {
  consumeAdminInviteCode,
  findActiveInviteByCode,
} = require("../utils/adminInvite");
const { sendMail } = require("../utils/mailer");

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;
const PASSWORD_RESET_TOKEN_MINUTES = 30;

function getWebAuthnContext(req) {
  const expectedOrigin =
    process.env.WEBAUTHN_ORIGIN || `${req.protocol}://${req.get("host")}`;
  const rpID = process.env.WEBAUTHN_RP_ID || req.hostname;
  const rpName = process.env.WEBAUTHN_RP_NAME || "Eazy-Logistics";

  return { expectedOrigin, rpID, rpName };
}

function loginUser(req, user) {
  return new Promise((resolve, reject) => {
    req.login(user, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

function persistSession(req) {
  return new Promise((resolve) => {
    if (!req?.session || typeof req.session.save !== "function") return resolve();
    req.session.save(() => resolve());
  });
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/.test(password);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureAuthMeta(user) {
  if (!user.authMeta) user.authMeta = {};
  if (typeof user.authMeta.failedLoginAttempts !== "number") {
    user.authMeta.failedLoginAttempts = 0;
  }
  if (!user.authMeta.passwordResetTokenHash) {
    user.authMeta.passwordResetTokenHash = "";
  }
}

async function findUserForLogin(identifier) {
  const input = String(identifier || "").trim();
  if (!input) return null;

  if (input.includes("@")) {
    const normalized = normalizeEmail(input);
    const direct = await User.findOne({ email: normalized });
    if (direct) return direct;

    return User.findOne({
      email: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" },
    });
  }

  return User.findOne({ username: input });
}

async function checkAndClearExpiredLock(user) {
  ensureAuthMeta(user);
  const lockUntil = user.authMeta.lockUntil ? new Date(user.authMeta.lockUntil) : null;
  if (lockUntil && lockUntil <= new Date()) {
    user.authMeta.lockUntil = null;
    user.authMeta.failedLoginAttempts = 0;
    await user.save();
    return false;
  }
  return Boolean(lockUntil && lockUntil > new Date());
}

async function registerFailedAttempt(user) {
  ensureAuthMeta(user);
  user.authMeta.failedLoginAttempts += 1;

  if (user.authMeta.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.authMeta.failedLoginAttempts = 0;
    user.authMeta.lockUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
  }

  await user.save();
}

async function clearFailedAttempts(user) {
  ensureAuthMeta(user);
  user.authMeta.failedLoginAttempts = 0;
  user.authMeta.lockUntil = null;
  user.authMeta.lastLoginAt = new Date();
  await user.save();
}

function authenticateLocal(req, res, next) {
  return new Promise((resolve, reject) => {
    passport.authenticate("local", (error, user, info) => {
      if (error) return reject(error);
      resolve({ user, info });
    })(req, res, next);
  });
}

module.exports.renderSignupForm = (req, res) => {
  res.render("users/signup.ejs");
};

module.exports.renderLoginForm = (req, res) => {
  res.render("users/login.ejs");
};

module.exports.renderForgotPasswordForm = (_req, res) => {
  res.render("users/forgotPassword.ejs");
};

module.exports.renderResetPasswordForm = async (req, res) => {
  const token = String(req.params.token || "");
  const tokenHash = hashToken(token);

  const user = await User.findOne({
    "authMeta.passwordResetTokenHash": tokenHash,
    "authMeta.passwordResetExpiresAt": { $gt: new Date() },
  }).lean();

  if (!user) {
    req.flash("error", "Reset link is invalid or expired.");
    return res.redirect("/forgot-password");
  }

  return res.render("users/resetPassword.ejs", { token });
};

module.exports.register = async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const requestedRole = String(req.body.role || "user");
    const role = ["user", "admin"].includes(requestedRole) ? requestedRole : "user";
    const adminPermissionCode = String(req.body.adminPermissionCode || "")
      .replace(/\s+/g, "")
      .trim();

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      req.flash("error", "Username must be 3-30 chars and only letters, numbers, underscore.");
      return res.redirect("/signup");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      req.flash("error", "Enter a valid email address.");
      return res.redirect("/signup");
    }

    if (!isStrongPassword(password)) {
      req.flash(
        "error",
        "Password must be 8+ chars with uppercase, lowercase, number, and special character."
      );
      return res.redirect("/signup");
    }

    if (password !== confirmPassword) {
      req.flash("error", "Password and confirm password must match.");
      return res.redirect("/signup");
    }

    const existingByEmail = await User.findOne({ email }).lean();
    if (existingByEmail) {
      req.flash("error", "Email already registered. Please log in.");
      return res.redirect("/login");
    }

    const existingByUsername = await User.findOne({ username }).lean();
    if (existingByUsername) {
      req.flash("error", "Username already taken. Please choose another.");
      return res.redirect("/signup");
    }

    let requiresAdminPermission = false;
    if (role === "admin") {
      const hasExistingAdmin = await User.exists({ role: "admin" });
      requiresAdminPermission = Boolean(hasExistingAdmin);

      if (requiresAdminPermission) {
        if (!/^\d{12}$/.test(adminPermissionCode)) {
          req.flash(
            "error",
            "Admin permission code is required. Ask an existing admin for a valid 12-digit code."
          );
          return res.redirect("/signup");
        }

        const invite = await findActiveInviteByCode(adminPermissionCode);
        if (!invite) {
          req.flash(
            "error",
            "Admin permission code is invalid or expired. Request a new code from an existing admin."
          );
          return res.redirect("/signup");
        }
      }
    }

    const user = new User({ email, username, role });
    await ensureMainAdminFlag(user);

    const registeredUser = await User.register(user, password);

    if (registeredUser.role === "admin" && requiresAdminPermission) {
      const consumedInvite = await consumeAdminInviteCode({
        plainCode: adminPermissionCode,
        usedByUserId: registeredUser._id,
        usedByEmail: registeredUser.email,
        usedByUsername: registeredUser.username,
      });

      if (!consumedInvite) {
        await User.findByIdAndDelete(registeredUser._id);
        req.flash(
          "error",
          "This admin permission code was already used. Ask existing admin for a fresh code."
        );
        return res.redirect("/signup");
      }
    }

    req.login(registeredUser, async (err) => {
      if (err) return next(err);

      if (registeredUser.role === "admin") {
        if (registeredUser.isMainAdmin) {
          req.session.adminSecurityVerifiedFor = String(registeredUser._id);
          req.flash("success", "Main admin account created successfully!");
          return res.redirect("/admin");
        }

        await ensureAdminSecurityCode(registeredUser, {
          regenerate: true,
          notify: true,
          context: "New admin account setup",
        });
        await registeredUser.save();

        req.session.adminSecurityPendingUserId = String(registeredUser._id);
        req.flash("success", "Admin account created. Enter the 12-digit code sent to your email.");
        return res.redirect("/login/admin/code");
      }

      req.flash("success", "Account created successfully!");
      return res.redirect("/profile/me");
    });
  } catch (e) {
    req.flash("error", e.message || "Could not create account.");
    return res.redirect("/signup");
  }
};

module.exports.handleUserLogin = async (req, res, next) => {
  try {
    const identifier = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      req.flash("error", "Enter your username/email and password.");
      return res.redirect("/login");
    }

    const account = await findUserForLogin(identifier);

    if (account) {
      const isLocked = await checkAndClearExpiredLock(account);
      if (isLocked) {
        req.flash(
          "error",
          `Too many failed attempts. Try again in ${LOGIN_LOCK_MINUTES} minutes.`
        );
        return res.redirect("/login");
      }

      req.body.username = account.username;
    }

    const { user } = await authenticateLocal(req, res, next);
    if (!user) {
      if (account) {
        await registerFailedAttempt(account);
      }
      req.flash("error", "Invalid username/email or password.");
      return res.redirect("/login");
    }

    await clearFailedAttempts(user);
    await loginUser(req, user);
    return module.exports.login(req, res);
  } catch (error) {
    return next(error);
  }
};

module.exports.handleAdminLogin = async (req, res, next) => {
  try {
    const identifier = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      req.flash("error", "Enter your admin username/email and password.");
      return res.redirect("/login");
    }

    const account = await findUserForLogin(identifier);

    if (account) {
      const isLocked = await checkAndClearExpiredLock(account);
      if (isLocked) {
        req.flash(
          "error",
          `Too many failed attempts. Try again in ${LOGIN_LOCK_MINUTES} minutes.`
        );
        return res.redirect("/login");
      }

      req.body.username = account.username;
    }

    const { user } = await authenticateLocal(req, res, next);
    if (!user) {
      if (account) {
        await registerFailedAttempt(account);
      }
      req.flash("error", "Invalid username/email or password.");
      return res.redirect("/login");
    }

    await clearFailedAttempts(user);
    await loginUser(req, user);
    return module.exports.completeAdminLogin(req, res);
  } catch (error) {
    return next(error);
  }
};

module.exports.requestPasswordReset = async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    req.flash("error", "Enter your account email.");
    return res.redirect("/forgot-password");
  }

  const user = await User.findOne({ email });

  if (user) {
    ensureAuthMeta(user);

    const token = crypto.randomBytes(32).toString("hex");
    user.authMeta.passwordResetTokenHash = hashToken(token);
    user.authMeta.passwordResetExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_TOKEN_MINUTES * 60 * 1000
    );

    await user.save();

    const baseUrl =
      (process.env.BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const resetUrl = `${baseUrl}/reset-password/${token}`;

    await sendMail({
      to: email,
      subject: "Reset your Eazy-Logistics password",
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
          <h2 style="color: #be123c;">Password Reset Request</h2>
          <p>Hello ${user.username || "User"},</p>
          <p>We received a request to reset your password.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block; padding:10px 16px; background:#0f172a; color:white; text-decoration:none; border-radius:8px;">
              Reset Password
            </a>
          </p>
          <p>This link expires in ${PASSWORD_RESET_TOKEN_MINUTES} minutes.</p>
          <p>If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    });
  }

  req.flash(
    "success",
    "If your email exists in our system, a password reset link has been sent."
  );
  return res.redirect("/login");
};

module.exports.resetPassword = async (req, res) => {
  const token = String(req.params.token || "");
  const newPassword = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");

  if (!isStrongPassword(newPassword)) {
    req.flash(
      "error",
      "Password must be 8+ chars with uppercase, lowercase, number, and special character."
    );
    return res.redirect(`/reset-password/${token}`);
  }

  if (newPassword !== confirmPassword) {
    req.flash("error", "Password and confirm password must match.");
    return res.redirect(`/reset-password/${token}`);
  }

  const tokenHash = hashToken(token);
  const user = await User.findOne({
    "authMeta.passwordResetTokenHash": tokenHash,
    "authMeta.passwordResetExpiresAt": { $gt: new Date() },
  });

  if (!user) {
    req.flash("error", "Reset link is invalid or expired.");
    return res.redirect("/forgot-password");
  }

  await user.setPassword(newPassword);
  ensureAuthMeta(user);
  user.authMeta.passwordResetTokenHash = "";
  user.authMeta.passwordResetExpiresAt = null;
  user.authMeta.failedLoginAttempts = 0;
  user.authMeta.lockUntil = null;
  await user.save();

  req.flash("success", "Password updated successfully. Please log in.");
  return res.redirect("/login");
};

module.exports.renderAdminCodeForm = async (req, res) => {
  const pendingUserId =
    req.session.adminSecurityPendingUserId ||
    (adminNeedsSecurityCode(req.user) ? String(req.user._id) : null);

  if (!pendingUserId) {
    req.flash("error", "Admin verification session not found.");
    return res.redirect("/login");
  }

  const user = await User.findById(pendingUserId).lean();

  if (!user || !adminNeedsSecurityCode(user)) {
    req.flash("error", "Admin verification is not required for this account.");
    return res.redirect("/login");
  }

  res.render("users/adminCode.ejs", {
    pendingAdmin: user,
  });
};

module.exports.login = async (req, res) => {
  req.flash("success", "Welcome back to Eazy-Logistics!");
  const redirectUrl = res.locals.redirectUrl || "/listings";
  await persistSession(req);
  res.redirect(redirectUrl);
};

module.exports.completeSocialLogin = async (req, res) => {
  if (!req.user) {
    req.flash("error", "Social login failed. Please try again.");
    return res.redirect("/login");
  }

  const provider = req.socialProvider || "Social account";
  await clearFailedAttempts(req.user);

    if (req.user.role === "admin") {
      if (!adminNeedsSecurityCode(req.user)) {
        req.session.adminSecurityVerifiedFor = String(req.user._id);
        req.flash("success", `${provider} login successful. Welcome Admin!`);
        await persistSession(req);
        return res.redirect("/admin");
      }

    await ensureAdminSecurityCode(req.user, {
      regenerate: true,
      notify: true,
      context: "Admin social sign-in",
    });
    await req.user.save();

      req.session.adminSecurityPendingUserId = String(req.user._id);
      delete req.session.adminSecurityVerifiedFor;

      req.flash("success", "Admin security code sent to your email.");
      await persistSession(req);
      return res.redirect("/login/admin/code");
    }

  const redirectUrl = req.session.redirectUrl || "/listings";
  delete req.session.redirectUrl;

  req.flash("success", `${provider} login successful.`);
  await persistSession(req);
  return res.redirect(redirectUrl);
};

module.exports.completeAdminLogin = async (req, res) => {
  if (!req.user) {
    req.flash("error", "Please login again.");
    return res.redirect("/login");
  }

  if (req.user.role !== "admin") {
    req.logout(() => {});
    req.flash("error", "You are not an admin.");
    return res.redirect("/login");
  }

  if (!adminNeedsSecurityCode(req.user)) {
    req.session.adminSecurityVerifiedFor = String(req.user._id);
    req.flash("success", "Welcome Admin!");
    return res.redirect("/admin");
  }

  await ensureAdminSecurityCode(req.user, {
    regenerate: true,
    notify: true,
    context: "Admin sign-in",
  });
  await req.user.save();

  req.session.adminSecurityPendingUserId = String(req.user._id);
  delete req.session.adminSecurityVerifiedFor;

  req.flash("success", "A 12-digit admin security code was sent to your email.");
  return res.redirect("/login/admin/code");
};

module.exports.verifyAdminCode = async (req, res) => {
  const pendingUserId =
    req.session.adminSecurityPendingUserId ||
    (adminNeedsSecurityCode(req.user) ? String(req.user._id) : null);

  if (!pendingUserId) {
    req.flash("error", "Admin verification session expired.");
    return res.redirect("/login");
  }

  const user = await User.findById(pendingUserId);

  if (!user || !adminNeedsSecurityCode(user)) {
    req.flash("error", "Admin verification is not required for this account.");
    return res.redirect("/login");
  }

  const submittedCode = String(req.body.securityCode || "").trim();

  if (!/^\d{12}$/.test(submittedCode)) {
    req.flash("error", "Enter the full 12-digit security code.");
    return res.redirect("/login/admin/code");
  }

  if (!verifyAdminSecurityCode(user, submittedCode)) {
    req.flash("error", "Invalid security code.");
    return res.redirect("/login/admin/code");
  }

  user.adminSecurity.lastVerifiedAt = new Date();
  await user.save();

  req.session.adminSecurityVerifiedFor = String(user._id);
  delete req.session.adminSecurityPendingUserId;

  req.flash("success", "Admin security verified.");
  return res.redirect("/admin");
};

module.exports.generatePasskeyRegistrationOptions = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "Login required" });
  }

  const user = await User.findById(req.user._id);
  const { rpID, rpName } = getWebAuthnContext(req);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userID: Buffer.from(String(user._id)),
    userDisplayName: user.email || user.username,
    attestationType: "none",
    excludeCredentials: (user.passkeys || []).map((passkey) => ({
      id: passkey.id,
      transports: passkey.transports || [],
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
  });

  req.session.passkeyRegistration = {
    challenge: options.challenge,
    userId: String(user._id),
  };

  res.json({ ok: true, options });
};

module.exports.verifyPasskeyRegistration = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "Login required" });
  }

  const sessionData = req.session.passkeyRegistration;
  if (!sessionData?.challenge || sessionData.userId !== String(req.user._id)) {
    return res.status(400).json({ ok: false, message: "Registration session expired" });
  }

  const user = await User.findById(req.user._id);
  const { expectedOrigin, rpID } = getWebAuthnContext(req);

  const verification = await verifyRegistrationResponse({
    response: req.body.credential || req.body,
    expectedChallenge: sessionData.challenge,
    expectedOrigin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return res.status(400).json({ ok: false, message: "Face authentication setup failed" });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const exists = user.passkeys.some((passkey) => passkey.id === credential.id);
  if (!exists) {
    user.passkeys.push({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: req.body.credential?.response?.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label:
        credentialDeviceType === "singleDevice"
          ? "Face Authentication Login (This device)"
          : "Face Authentication Login",
    });
  }

  await user.save();

  const passkeys = user.passkeys.map((passkey) => ({
    id: passkey.id,
    label: passkey.label || "Face Authentication Login",
    deviceType: passkey.deviceType || "multiDevice",
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  }));

  delete req.session.passkeyRegistration;

  return res.json({
    ok: true,
    created: !exists,
    message: "Face authentication enabled successfully.",
    passkeys,
  });
};

module.exports.getPasskeyStatus = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ ok: false, message: "Login required" });
  }

  const user = await User.findById(req.user._id).lean();
  const passkeys = (user?.passkeys || []).map((passkey) => ({
    id: passkey.id,
    label: passkey.label || "Face Authentication Login",
    deviceType: passkey.deviceType || "multiDevice",
    createdAt: passkey.createdAt,
    lastUsedAt: passkey.lastUsedAt,
  }));

  return res.json({
    ok: true,
    hasPasskeys: passkeys.length > 0,
    passkeys,
  });
};

module.exports.generatePasskeyAuthenticationOptions = async (req, res) => {
  const { rpID } = getWebAuthnContext(req);

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });

  req.session.passkeyAuthentication = {
    challenge: options.challenge,
  };

  res.json({ ok: true, options });
};

module.exports.verifyPasskeyAuthentication = async (req, res, next) => {
  try {
    const sessionData = req.session.passkeyAuthentication;
    if (!sessionData?.challenge) {
      return res.status(400).json({ ok: false, message: "Login session expired" });
    }

    const credentialResponse = req.body.credential || req.body;
    const user = await User.findOne({ "passkeys.id": credentialResponse.id });

    if (!user) {
      return res.status(404).json({ ok: false, message: "No face-authentication account matched" });
    }

    const passkey = user.passkeys.find((item) => item.id === credentialResponse.id);
    const { expectedOrigin, rpID } = getWebAuthnContext(req);

    const verification = await verifyAuthenticationResponse({
      response: credentialResponse,
      expectedChallenge: sessionData.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        transports: passkey.transports || [],
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ ok: false, message: "Face authentication failed" });
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.lastUsedAt = new Date();
    await user.save();

    await loginUser(req, user);
    await clearFailedAttempts(user);

    delete req.session.passkeyAuthentication;

    if (adminNeedsSecurityCode(user)) {
      await ensureAdminSecurityCode(user, {
        regenerate: true,
        notify: true,
        context: "Admin sign-in",
      });
      await user.save();

      req.session.adminSecurityPendingUserId = String(user._id);
      delete req.session.adminSecurityVerifiedFor;

      return res.json({
        ok: true,
        redirectUrl: "/login/admin/code",
        message: "Admin code sent to your email.",
      });
    }

    req.session.adminSecurityVerifiedFor = String(user._id);

    return res.json({
      ok: true,
      redirectUrl: user.role === "admin" ? "/admin" : "/listings",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports.removePasskey = async (req, res) => {
  const credentialId = req.params.credentialId;
  const user = await User.findById(req.user._id);

  user.passkeys = user.passkeys.filter((passkey) => passkey.id !== credentialId);
  await user.save();

  if ((req.headers.accept || "").includes("application/json")) {
    return res.json({
      ok: true,
      passkeys: user.passkeys.map((passkey) => ({
        id: passkey.id,
        label: passkey.label || "Face Authentication Login",
        deviceType: passkey.deviceType || "multiDevice",
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
      })),
    });
  }

  req.flash("success", "Face authentication removed.");
  res.redirect("/profile/settings");
};

module.exports.logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    delete req.session.adminSecurityPendingUserId;
    delete req.session.adminSecurityVerifiedFor;
    delete req.session.passkeyRegistration;
    delete req.session.passkeyAuthentication;

    req.flash("success", "Logged out successfully!");
    req.session.save(() => {
      res.redirect("/listings");
    });
  });
};
