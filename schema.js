const Joi = require("joi");

/* ======================================================
   LISTING VALIDATION SCHEMA (FINAL + CLEAN)
====================================================== */

module.exports.listingSchema = Joi.object({
  listing: Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    location: Joi.string().required(),
    country: Joi.string().required(),

    price: Joi.number().required().min(0),

    // ✔ Allow multiple images (Cloudinary URLs)
    images: Joi.array().items(Joi.string()).optional(),

    // ✔ Backward compatibility for old single-image structure
    image: Joi.string().allow("", null),

    // ✔ Optional category
    category: Joi.string().allow("", null),
    legalDocumentLabel: Joi.string().allow("", null),
  }).required(),

  /* -----------------------------------------------------
     DELETE IMAGES FIX:
     Accept BOTH array and string  
     (single checkbox → string, multiple → array)
  ------------------------------------------------------ */
  deleteImages: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string()), // multiple selected
      Joi.string()                    // only one selected
    )
    .optional(),
});


/* ======================================================
   REVIEW VALIDATION SCHEMA (CLEAN)
====================================================== */

module.exports.reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().required().min(1).max(5),
    comment: Joi.string().required(),
  }).required(),
});
