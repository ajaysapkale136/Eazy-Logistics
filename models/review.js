const mongoodse = require('mongoose');
const Schema = mongoodse.Schema;

const reviewSchema = new Schema({
    comment: String, // Changed 'Comment' to 'comment'
    rating: {
        type: Number,
        min: 1,
        max: 5
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
});

module.exports = mongoodse.model('Review', reviewSchema);
