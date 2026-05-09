const Listing = require('../models/listing');
const Review = require('../models/review');




module.exports.createReview = async (req, res) => {
    let listing = await Listing.findById(req.params.id);

    if (!listing) {
        req.flash('error', 'Listing not found.');
        return res.redirect('/listings');
    }

    const existingReview = await Review.findOne({
        _id: { $in: listing.reviews },
        author: req.user._id
    });

    if (existingReview) {
        existingReview.rating = req.body.review.rating;
        existingReview.comment = req.body.review.comment;
        existingReview.updatedAt = new Date();
        await existingReview.save();

        req.flash('success', 'Successfully updated your review!');
        return res.redirect(`/listings/${listing._id}`);
    }

    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    listing.reviews.push(newReview);

    await newReview.save();
    await listing.save();
    req.flash('success', 'Successfully added a new review!');
    res.redirect(`/listings/${listing._id}`);
};


module.exports.destroyReview = async (req, res) => {
    let {id ,reviewId} = req.params;

    await Listing.findByIdAndUpdate(id, {$pull: {reviews: reviewId}});
    await Review.findByIdAndDelete(reviewId);
    req.flash('success', 'Successfully deleted the review!');
    res.redirect(`/listings/${id}`);
};

module.exports.updateReview = async (req, res) => {
    const { id, reviewId } = req.params;

    const review = await Review.findByIdAndUpdate(
        reviewId,
        {
            rating: req.body.review.rating,
            comment: req.body.review.comment,
            updatedAt: new Date()
        },
        { runValidators: true, new: true }
    );

    if (!review) {
        req.flash('error', 'Review not found.');
        return res.redirect(`/listings/${id}`);
    }

    req.flash('success', 'Successfully updated your review!');
    res.redirect(`/listings/${id}`);
};
