const express = require('express');
const router = express.Router({mergeParams: true});
const wrapAsync = require('../utils/wrapAsync.js');
const ExpressError = require('../utils/ExpressError.js');
const Review = require('../models/review.js');
const Listing = require('../models/listing.js');
const { validateReview ,isLoggedIn, isReviewAuthor, } = require('../appMiddleware.js');

const reviewController = require('../controllers/reviews.js');

  
//Reviews
//Post route 
router.post('/', 
    isLoggedIn,
    validateReview, 
    wrapAsync (reviewController.createReview)
);

// Update Review route
router.put('/:reviewId',
    isLoggedIn,
    isReviewAuthor,
    validateReview,
    wrapAsync(reviewController.updateReview)
);

// Delete Review route
router.delete('/:reviewId',
    isLoggedIn,
    isReviewAuthor, 
    wrapAsync (reviewController.destroyReview)
);

module.exports = router;


