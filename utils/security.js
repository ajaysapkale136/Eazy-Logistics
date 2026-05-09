const crypto = require("crypto");

function generateNumericCode(length = 6) {
  let code = "";

  while (code.length < length) {
    code += crypto.randomInt(0, 10).toString();
  }

  return code.slice(0, length);
}

function hashValue(value = "") {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function compareHashedValue(value, hash) {
  if (!value || !hash) return false;
  return hashValue(value) === hash;
}

function getMaskedLastFour(value = "") {
  const clean = String(value);
  if (!clean) return "";
  return clean.slice(-4).padStart(4, "0");
}

module.exports = {
  compareHashedValue,
  generateNumericCode,
  getMaskedLastFour,
  hashValue,
};
