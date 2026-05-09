const AdminInvite = require("../models/adminInvite");
const {
  generateNumericCode,
  getMaskedLastFour,
  hashValue,
} = require("./security");

const DEFAULT_INVITE_MINUTES = 30;
const MIN_INVITE_MINUTES = 5;
const MAX_INVITE_MINUTES = 24 * 60;

function normalizeCode(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function clampInviteMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INVITE_MINUTES;
  const rounded = Math.round(parsed);
  return Math.max(MIN_INVITE_MINUTES, Math.min(MAX_INVITE_MINUTES, rounded));
}

function getInviteExpiry(minutes = DEFAULT_INVITE_MINUTES) {
  return new Date(Date.now() + clampInviteMinutes(minutes) * 60 * 1000);
}

function isInviteRecordActive(invite, now = new Date()) {
  if (!invite) return false;
  if (invite.usedAt) return false;
  if (invite.revokedAt) return false;
  if (!invite.expiresAt) return false;
  return new Date(invite.expiresAt) > now;
}

async function createAdminInvite({ createdByUserId, ttlMinutes, note = "" }) {
  const expiresAt = getInviteExpiry(ttlMinutes);
  const cleanNote = String(note || "").trim().slice(0, 180);

  for (let i = 0; i < 8; i += 1) {
    const plainCode = generateNumericCode(12);
    const payload = {
      codeHash: hashValue(plainCode),
      codeLastFour: getMaskedLastFour(plainCode),
      createdBy: createdByUserId,
      expiresAt,
      note: cleanNote,
    };

    try {
      const invite = await AdminInvite.create(payload);
      return { invite, plainCode };
    } catch (error) {
      if (error?.code === 11000) continue;
      throw error;
    }
  }

  throw new Error("Could not generate a unique admin permission code. Please try again.");
}

async function findActiveInviteByCode(plainCode) {
  const code = normalizeCode(plainCode);
  if (!/^\d{12}$/.test(code)) return null;
  const now = new Date();
  const codeHash = hashValue(code);
  return AdminInvite.findOne({
    codeHash,
    usedAt: null,
    revokedAt: null,
    expiresAt: { $gt: now },
  });
}

async function consumeAdminInviteCode({
  plainCode,
  usedByUserId = null,
  usedByEmail = "",
  usedByUsername = "",
}) {
  const code = normalizeCode(plainCode);
  if (!/^\d{12}$/.test(code)) return null;
  const now = new Date();
  const codeHash = hashValue(code);

  const invite = await AdminInvite.findOneAndUpdate(
    {
      codeHash,
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        usedAt: now,
        usedByUserId,
        usedByEmail: String(usedByEmail || "").trim().toLowerCase(),
        usedByUsername: String(usedByUsername || "").trim(),
      },
    },
    { new: true }
  );

  return invite;
}

module.exports = {
  DEFAULT_INVITE_MINUTES,
  MAX_INVITE_MINUTES,
  MIN_INVITE_MINUTES,
  clampInviteMinutes,
  consumeAdminInviteCode,
  createAdminInvite,
  findActiveInviteByCode,
  isInviteRecordActive,
};
