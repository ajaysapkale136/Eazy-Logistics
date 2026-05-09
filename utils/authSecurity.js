const User = require("../models/user");
const { sendMail } = require("./mailer");
const {
  compareHashedValue,
  generateNumericCode,
  getMaskedLastFour,
  hashValue,
} = require("./security");

function adminNeedsSecurityCode(user) {
  return Boolean(user && user.role === "admin" && !user.isMainAdmin);
}

function ensureAdminSecurityState(user) {
  if (!user.adminSecurity) {
    user.adminSecurity = {};
  }

  if (typeof user.adminSecurity.requiresCode !== "boolean") {
    user.adminSecurity.requiresCode = false;
  }

  if (!user.adminSecurity.codeHash) user.adminSecurity.codeHash = "";
  if (!user.adminSecurity.codeLastFour) user.adminSecurity.codeLastFour = "";
}

async function resolveMainAdmin() {
  const configuredEmail = (process.env.MAIN_ADMIN_EMAIL || "").trim().toLowerCase();

  if (configuredEmail) {
    return User.findOne({ email: configuredEmail });
  }

  return User.findOne({ isMainAdmin: true });
}

async function ensureMainAdminFlag(user) {
  if (!user || user.role !== "admin") return false;
  ensureAdminSecurityState(user);

  const configuredEmail = (process.env.MAIN_ADMIN_EMAIL || "").trim().toLowerCase();

  if (configuredEmail && user.email.toLowerCase() === configuredEmail) {
    user.isMainAdmin = true;
  } else {
    const existingMainAdmin = await User.findOne({
      isMainAdmin: true,
      _id: { $ne: user._id },
    }).lean();

    if (!existingMainAdmin) {
      user.isMainAdmin = true;
    }
  }

  if (user.isMainAdmin) {
    user.adminSecurity.requiresCode = false;
    user.adminSecurity.codeHash = "";
    user.adminSecurity.codeLastFour = "";
  }

  return user.isMainAdmin;
}

async function sendAdminSecurityCodeEmail(user, plainCode, context = "Admin login access") {
  if (!user?.email || !plainCode) return false;

  return sendMail({
    to: user.email,
    subject: "Your 12-digit admin security code",
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2 style="color: #be123c;">Admin Security Code</h2>
        <p>Hello ${user.username || "Admin"},</p>
        <p>Your 12-digit admin security code is ready for <strong>${context}</strong>.</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; background: #fff1f2; color: #9f1239; padding: 14px 18px; border-radius: 12px; display: inline-block;">
          ${plainCode}
        </div>
        <p style="margin-top: 18px;">Enter this code after your admin login to unlock the admin panel.</p>
        <p>If you did not expect this code, please contact the main admin immediately.</p>
      </div>
    `,
  });
}

async function ensureAdminSecurityCode(user, options = {}) {
  const { regenerate = false, notify = true, context = "Admin login access" } = options;
  ensureAdminSecurityState(user);

  if (!adminNeedsSecurityCode(user)) {
    user.adminSecurity.requiresCode = false;
    return { generated: false, notified: false, code: null };
  }

  let code = null;
  const hasCode = Boolean(user.adminSecurity?.codeHash);

  if (!hasCode || regenerate) {
    code = generateNumericCode(12);
    user.adminSecurity.requiresCode = true;
    user.adminSecurity.codeHash = hashValue(code);
    user.adminSecurity.codeLastFour = getMaskedLastFour(code);
    user.adminSecurity.codeIssuedAt = new Date();
  }

  let notified = false;
  if (notify) {
    if (!code && hasCode) {
      code = generateNumericCode(12);
      user.adminSecurity.codeHash = hashValue(code);
      user.adminSecurity.codeLastFour = getMaskedLastFour(code);
      user.adminSecurity.codeIssuedAt = new Date();
    }

    user.adminSecurity.codeSentAt = new Date();
    notified = await sendAdminSecurityCodeEmail(user, code, context);
  }

  return {
    generated: Boolean(code),
    notified,
    code,
  };
}

function verifyAdminSecurityCode(user, code) {
  return compareHashedValue(code, user?.adminSecurity?.codeHash);
}

module.exports = {
  adminNeedsSecurityCode,
  ensureAdminSecurityCode,
  ensureMainAdminFlag,
  resolveMainAdmin,
  sendAdminSecurityCodeEmail,
  verifyAdminSecurityCode,
};
