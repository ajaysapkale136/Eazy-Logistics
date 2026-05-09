const Listing = require('./models/listing');
const Review = require('./models/review');
const ExpressError = require('./utils/ExpressError.js');
const { listingSchema, reviewSchema } = require('./schema.js');
const { adminNeedsSecurityCode } = require("./utils/authSecurity");

/* ===========================================================
   AUTH CHECK
=========================================================== */
module.exports.isLoggedIn = (req, res, next) => {
    if (!req.isAuthenticated()) {
        req.session.redirectUrl = req.originalUrl;
        req.flash('error', 'You must be logged in first!');
        return res.redirect('/login');
    }
    next();
};

/* ===========================================================
   SAVE REDIRECT URL
=========================================================== */
module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.redirectUrl) {
        res.locals.redirectUrl = req.session.redirectUrl;
    }
    next();
};

/* ===========================================================
   LISTING OWNER CHECK
=========================================================== */
module.exports.isOwner = async (req, res, next) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing.owner.equals(res.locals.currUser._id)) {
        req.flash('error', 'You are not the owner of this listing!');
        return res.redirect(`/listings/${id}`);
    }
    next();
};

/* ===========================================================
   LISTING VALIDATION
=========================================================== */
module.exports.validateListing = (req, res, next) => {
    const { error } = listingSchema.validate(req.body);

    if (error) {
        const errMsg = error.details.map(el => el.message).join(',');
        throw new ExpressError(400, errMsg);
    }
    next();
};

/* ===========================================================
   REVIEW VALIDATION
=========================================================== */
module.exports.validateReview = (req, res, next) => {
    const { error } = reviewSchema.validate(req.body);

    if (error) {
        const errMsg = error.details.map(el => el.message).join(',');
        throw new ExpressError(400, errMsg);
    }
    next();
};

/* ===========================================================
   REVIEW AUTHOR CHECK
=========================================================== */
module.exports.isReviewAuthor = async (req, res, next) => {
    const { id, reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
        req.flash('error', 'Review not found!');
        return res.redirect(`/listings/${id}`);
    }

    if (!review.author.equals(res.locals.currUser._id)) {
        req.flash('error', 'You are not the author of this review!');
        return res.redirect(`/listings/${id}`);
    }
    next();
};

/* ===========================================================
   THEME + LANGUAGE MIDDLEWARE
=========================================================== */
module.exports.themeMiddleware = (req, res, next) => {
    try {
        let theme = "light";
        let language = "en";

        if (req.user?.preferences) {
            theme = (req.user.preferences.theme || "light").toLowerCase();
            language = (req.user.preferences.language || "en").toLowerCase();
        }

        const validThemes = ["light", "dark", "midnight", "neon"];
        if (!validThemes.includes(theme)) theme = "light";

        const validLanguages = ["en", "hi"];
        if (!validLanguages.includes(language)) language = "en";

        // expose to EJS
        res.locals.theme = theme;
        res.locals.language = language;

        res.locals.t = (en, hi) => (language === "hi" ? hi : en);

        next();

    } catch (err) {
        console.error("Theme middleware error:", err);

        res.locals.theme = "light";
        res.locals.language = "en";
        res.locals.t = (en) => en;

        next();
    }
};

/* ===========================================================
   ADMIN CHECK (FINAL VERSION)
=========================================================== */
module.exports.isAdmin = (req, res, next) => {
    if (!req.user) {
        req.flash("error", "You must be logged in as admin");
        return res.redirect("/login");
    }

    // if role field exists (recommended)
    if (req.user.role && req.user.role.toLowerCase() === "admin") {
        if (
            adminNeedsSecurityCode(req.user) &&
            req.session.adminSecurityVerifiedFor !== String(req.user._id)
        ) {
            req.session.adminSecurityPendingUserId = String(req.user._id);
            req.flash("error", "Enter your 12-digit admin security code to continue.");
            return res.redirect("/login/admin/code");
        }

        return next();
    }

    // if boolean flag exists
    if (req.user.isAdmin === true) {
        return next();
    }

    req.flash("error", "Access denied: Admin only");
    return res.redirect("/");
};
