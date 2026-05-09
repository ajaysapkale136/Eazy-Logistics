const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

/*
|--------------------------------------------------------------------------
| USER SCHEMA (Admin + User Roles Enabled)
|--------------------------------------------------------------------------
*/

const UserSchema = new Schema(
  {
    // BASIC USER INFO
    email: {
      type: String,
      required: true,
      unique: true,
    },

    // ADMIN ROLE (added)
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    isMainAdmin: {
      type: Boolean,
      default: false,
    },

    // PROFILE IMAGE
    profileImage: {
      url: {
        type: String,
        default: "/images/default-avatar.png",
      },
      filename: {
        type: String,
        default: "",
      },
    },

    // ✅ NEW FIELDS FOR HOST DETAILS
    paymentQR: {
      url: String,
      filename: String
    },

    signature: {
      url: String,
      filename: String
   },
   
    upiId: { type: String }, // Optional: Text UPI ID
    isHost: { type: Boolean, default: false }, // Host status
   
    // PERSONAL DETAILS
    phone: { type: String, default: "" },
    bio: { type: String, default: "" },
    address: { type: String, default: "" },

    // SOCIAL LINKS
    socialLinks: {
      instagram: { type: String, default: "" },
      linkedin: { type: String, default: "" },
    },

    socialAuth: {
      googleId: { type: String, default: null },
      facebookId: { type: String, default: null },
      linkedinId: { type: String, default: null },
      appleId: { type: String, default: null },
    },

    authMeta: {
      failedLoginAttempts: {
        type: Number,
        default: 0,
      },
      lockUntil: Date,
      passwordResetTokenHash: {
        type: String,
        default: "",
      },
      passwordResetExpiresAt: Date,
      lastLoginAt: Date,
    },

    adminSecurity: {
      requiresCode: {
        type: Boolean,
        default: false,
      },
      codeHash: {
        type: String,
        default: "",
      },
      codeLastFour: {
        type: String,
        default: "",
      },
      codeIssuedAt: Date,
      codeSentAt: Date,
      lastVerifiedAt: Date,
    },

    passkeys: [
      {
        id: {
          type: String,
          required: true,
        },
        publicKey: {
          type: String,
          required: true,
        },
        counter: {
          type: Number,
          default: 0,
        },
        transports: [
          {
            type: String,
          },
        ],
        deviceType: {
          type: String,
          default: "multiDevice",
        },
        backedUp: {
          type: Boolean,
          default: false,
        },
        label: {
          type: String,
          default: "Face / Device Login",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        lastUsedAt: Date,
      },
    ],

    // USER PREFERENCES
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark", "midnight", "neon"],
        default: "light",
      },
      language: {
        type: String,
        default: "en",
      },
      notifications: {
        enabled: {
          type: Boolean,
          default: true,
        },
      },
    },
  },

  // TIMESTAMPS
  {
    timestamps: true,
  }
);

// PASSPORT AUTH
UserSchema.plugin(passportLocalMongoose);

UserSchema.index({ "socialAuth.googleId": 1 }, { unique: true, sparse: true });
UserSchema.index({ "socialAuth.facebookId": 1 }, { unique: true, sparse: true });
UserSchema.index({ "socialAuth.linkedinId": 1 }, { unique: true, sparse: true });
UserSchema.index({ "socialAuth.appleId": 1 }, { unique: true, sparse: true });
UserSchema.index({ "authMeta.passwordResetTokenHash": 1 }, { sparse: true });

module.exports = mongoose.model("User", UserSchema);
