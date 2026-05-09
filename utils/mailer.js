const nodemailer = require("nodemailer");

let cachedTransporter;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.COMPANY_EMAIL;
  const pass = process.env.COMPANY_EMAIL_PASS;

  if (!user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  return cachedTransporter;
}

async function sendMail(options = {}) {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn("Mailer skipped: COMPANY_EMAIL credentials are missing.");
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"Eazy-Logistics" <${process.env.COMPANY_EMAIL}>`,
      ...options,
    });
    return true;
  } catch (error) {
    console.error("Mail send error:", error.message || error);
    return false;
  }
}

module.exports = {
  getTransporter,
  sendMail,
};
