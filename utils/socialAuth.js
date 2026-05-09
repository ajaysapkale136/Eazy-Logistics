const crypto = require("crypto");
const User = require("../models/user");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const AppleStrategy = require("passport-apple");

const providerConfig = {
  google: {
    idField: "googleId",
    name: "Google",
    envClientId: "GOOGLE_CLIENT_ID",
    envClientSecret: "GOOGLE_CLIENT_SECRET",
    envCallbackUrl: "GOOGLE_CALLBACK_URL",
    callbackPath: "/auth/google/callback",
  },
  facebook: {
    idField: "facebookId",
    name: "Facebook",
    envClientId: "FACEBOOK_CLIENT_ID",
    envClientSecret: "FACEBOOK_CLIENT_SECRET",
    envCallbackUrl: "FACEBOOK_CALLBACK_URL",
    callbackPath: "/auth/facebook/callback",
  },
  linkedin: {
    idField: "linkedinId",
    name: "LinkedIn",
    envClientId: "LINKEDIN_CLIENT_ID",
    envClientSecret: "LINKEDIN_CLIENT_SECRET",
    envCallbackUrl: "LINKEDIN_CALLBACK_URL",
    callbackPath: "/auth/linkedin/callback",
  },
  apple: {
    idField: "appleId",
    name: "Apple",
    envCallbackUrl: "APPLE_CALLBACK_URL",
    callbackPath: "/auth/apple/callback",
  },
};

function getBaseUrl() {
  const fallbackPort = process.env.PORT || 8080;
  return (process.env.BASE_URL || `http://localhost:${fallbackPort}`).replace(/\/+$/, "");
}

function getProviderCallbackUrl(provider, baseUrl = getBaseUrl()) {
  const config = providerConfig[provider] || {};
  const callbackPath = config.callbackPath || `/auth/${provider}/callback`;
  const explicitCallbackUrl = config.envCallbackUrl ? String(process.env[config.envCallbackUrl] || "").trim() : "";
  if (explicitCallbackUrl) return explicitCallbackUrl.replace(/\/+$/, "");
  return `${baseUrl}${callbackPath}`;
}

function getSocialAuthDiagnostics() {
  const baseUrl = getBaseUrl();
  return {
    baseUrl,
    callbacks: {
      google: getProviderCallbackUrl("google", baseUrl),
      facebook: getProviderCallbackUrl("facebook", baseUrl),
      linkedin: getProviderCallbackUrl("linkedin", baseUrl),
      apple: getProviderCallbackUrl("apple", baseUrl),
    },
  };
}

function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

const SOCIAL_EMAIL_DOMAIN = "social.eazy-logistics.local";

function normalizeProviderId(providerId = "") {
  return String(providerId)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildSyntheticEmail(provider, providerId) {
  const safeProvider = String(provider || "social")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "social";

  const safeId = (normalizeProviderId(providerId) || crypto.randomBytes(8).toString("hex")).slice(
    0,
    40
  );
  return `${safeProvider}_${safeId}@${SOCIAL_EMAIL_DOMAIN}`;
}

function isSyntheticSocialEmail(email) {
  return normalizeEmail(email).endsWith(`@${SOCIAL_EMAIL_DOMAIN}`);
}

function makeUsernameSeed({ email, displayName, providerName }) {
  const raw = (email && email.split("@")[0]) || displayName || `${providerName}user`;
  const normalized = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || `${providerName}user`;
}

async function createUniqueUsername(seed) {
  const base = seed.slice(0, 24) || "user";

  for (let i = 0; i < 25; i += 1) {
    const suffix = i === 0 ? "" : `_${Math.floor(1000 + Math.random() * 9000)}`;
    const candidate = `${base}${suffix}`.slice(0, 30);
    const exists = await User.exists({ username: candidate });
    if (!exists) return candidate;
  }

  return `user_${Date.now().toString().slice(-8)}`;
}

function profilePhoto(profile) {
  return profile?.photos?.[0]?.value || "";
}

function profileEmail(profile) {
  return normalizeEmail(profile?.emails?.[0]?.value);
}

function parseJwtPayload(token) {
  if (!token || typeof token !== "string") return {};
  const parts = token.split(".");
  if (parts.length < 2) return {};

  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(payload + padding, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (_error) {
    return {};
  }
}

async function upsertSocialUser({ provider, profile }) {
  const config = providerConfig[provider];
  const providerId = String(profile?.id || "").trim();

  if (!providerId) {
    throw new Error(`${config.name} did not return a valid account id.`);
  }

  const fieldPath = `socialAuth.${config.idField}`;
  const providerEmail = profileEmail(profile);
  const email = providerEmail || buildSyntheticEmail(provider, providerId);
  const avatar = profilePhoto(profile);
  const displayName = String(profile?.displayName || "").trim();

  let user = await User.findOne({ [fieldPath]: providerId });

  if (!user && providerEmail) {
    user = await User.findOne({ email: providerEmail });
  }

  if (user) {
    let changed = false;

    if (user.socialAuth?.[config.idField] !== providerId) {
      user.socialAuth = user.socialAuth || {};
      user.socialAuth[config.idField] = providerId;
      changed = true;
    }

    const hasDefaultAvatar =
      !user.profileImage?.url || user.profileImage.url === "/images/default-avatar.png";
    if (avatar && hasDefaultAvatar) {
      user.profileImage = { url: avatar, filename: "" };
      changed = true;
    }

    if (
      providerEmail &&
      user.email !== providerEmail &&
      isSyntheticSocialEmail(user.email)
    ) {
      const emailTaken = await User.exists({
        _id: { $ne: user._id },
        email: providerEmail,
      });

      if (!emailTaken) {
        user.email = providerEmail;
        changed = true;
      }
    }

    if (changed) {
      await user.save();
    }

    return user;
  }

  const username = await createUniqueUsername(
    makeUsernameSeed({
      email: providerEmail || email,
      displayName,
      providerName: provider,
    })
  );

  const userData = {
    email,
    username,
    socialAuth: {
      [config.idField]: providerId,
    },
  };

  if (avatar) {
    userData.profileImage = {
      url: avatar,
      filename: "",
    };
  }

  const randomPassword = crypto.randomBytes(32).toString("hex");
  const created = new User(userData);
  return User.register(created, randomPassword);
}

function strategyEnabled(provider) {
  if (provider === "apple") {
    const hasBaseConfig =
      Boolean(process.env.APPLE_CLIENT_ID) &&
      Boolean(process.env.APPLE_TEAM_ID) &&
      Boolean(process.env.APPLE_KEY_ID);

    const hasPrivateKey =
      Boolean(process.env.APPLE_PRIVATE_KEY) ||
      Boolean(process.env.APPLE_PRIVATE_KEY_PATH);

    return hasBaseConfig && hasPrivateKey;
  }

  const config = providerConfig[provider];
  if (!config?.envClientId || !config?.envClientSecret) return false;
  return Boolean(process.env[config.envClientId] && process.env[config.envClientSecret]);
}

function strategyHint(provider) {
  switch (provider) {
    case "google":
      return "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET";
    case "facebook":
      return "FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET";
    case "linkedin":
      return "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET";
    case "apple":
      return "APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_PATH";
    default:
      return "provider credentials";
  }
}

function configureSocialAuthStrategies(passport) {
  const baseUrl = getBaseUrl();
  const callbacks = {
    google: getProviderCallbackUrl("google", baseUrl),
    facebook: getProviderCallbackUrl("facebook", baseUrl),
    linkedin: getProviderCallbackUrl("linkedin", baseUrl),
    apple: getProviderCallbackUrl("apple", baseUrl),
  };

  if (strategyEnabled("google")) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: callbacks.google,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await upsertSocialUser({ provider: "google", profile });
            done(null, user);
          } catch (error) {
            done(null, false, { message: error.message });
          }
        }
      )
    );
  } else {
    console.warn(`[SocialAuth] Google strategy disabled. Configure ${strategyHint("google")}.`);
  }

  if (strategyEnabled("facebook")) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_CLIENT_ID,
          clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
          callbackURL: callbacks.facebook,
          profileFields: ["id", "emails", "name", "displayName", "photos"],
          enableProof: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await upsertSocialUser({ provider: "facebook", profile });
            done(null, user);
          } catch (error) {
            done(null, false, { message: error.message });
          }
        }
      )
    );
  } else {
    console.warn(`[SocialAuth] Facebook strategy disabled. Configure ${strategyHint("facebook")}.`);
  }

  if (strategyEnabled("linkedin")) {
    passport.use(
      new LinkedInStrategy(
        {
          clientID: process.env.LINKEDIN_CLIENT_ID,
          clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          callbackURL: callbacks.linkedin,
          scope: ["r_emailaddress", "r_liteprofile"],
          state: true,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const user = await upsertSocialUser({ provider: "linkedin", profile });
            done(null, user);
          } catch (error) {
            done(null, false, { message: error.message });
          }
        }
      )
    );
  } else {
    console.warn(`[SocialAuth] LinkedIn strategy disabled. Configure ${strategyHint("linkedin")}.`);
  }

  if (strategyEnabled("apple")) {
    passport.use(
      new AppleStrategy(
        {
          clientID: process.env.APPLE_CLIENT_ID,
          teamID: process.env.APPLE_TEAM_ID,
          callbackURL: callbacks.apple,
          keyID: process.env.APPLE_KEY_ID,
          privateKeyLocation: process.env.APPLE_PRIVATE_KEY_PATH || undefined,
          privateKeyString: process.env.APPLE_PRIVATE_KEY
            ? process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n")
            : undefined,
        },
        async (req, _accessToken, _refreshToken, idToken, _profile, done) => {
          try {
            const decoded = parseJwtPayload(idToken);
            const firstName = req.appleProfile?.name?.firstName || "";
            const lastName = req.appleProfile?.name?.lastName || "";
            const fullName = `${firstName} ${lastName}`.trim();

            const appleProfile = {
              id: decoded.sub || "",
              displayName: fullName || "Apple User",
              emails: decoded.email ? [{ value: decoded.email }] : [],
              photos: [],
            };

            const user = await upsertSocialUser({ provider: "apple", profile: appleProfile });
            done(null, user);
          } catch (error) {
            done(null, false, { message: error.message });
          }
        }
      )
    );
  } else {
    console.warn(`[SocialAuth] Apple strategy disabled. Configure ${strategyHint("apple")}.`);
  }
}

module.exports = {
  configureSocialAuthStrategies,
  getSocialAuthDiagnostics,
  strategyEnabled,
};
