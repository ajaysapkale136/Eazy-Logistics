const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const AdminInviteSchema = new Schema(
  {
    codeHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    codeLastFour: {
      type: String,
      required: true,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    usedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    usedByEmail: {
      type: String,
      default: "",
    },
    usedByUsername: {
      type: String,
      default: "",
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    note: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

AdminInviteSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminInvite", AdminInviteSchema);
