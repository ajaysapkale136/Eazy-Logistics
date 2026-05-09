const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Review = require('./review.js');

const listingSchema = new Schema({
    title: {
        type: String,
        required: true
    },

    description: {
        type: String,
        required: true
    },

    // 'images' is an array of objects, each containing a 'url' (String) and 'filename' (String)
    images: [
        {
            url: String,
            filename: String
        }
    ],

    price: {
        type: Number,
        required: true
    },

    location: {
        type: String,
        required: true
    },

    country: {
        type: String,
        required: true
    },

    viewCount: {
        type: Number,
        default: 0
    },

    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Review',
        }
    ],

    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },

    legalDocuments: [
        {
            url: String,
            filename: String,
            label: {
                type: String,
                default: "Property legal document"
            },
            uploadedAt: {
                type: Date,
                default: Date.now
            }
        }
    ],

    verificationStatus: {
        type: String,
        enum: ["not_submitted", "pending", "verified", "rejected"],
        default: "not_submitted"
    },

    verifiedAt: Date,

    verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    verificationNote: {
        type: String,
        default: ""
    },

    verificationCertificate: {
        url: String,
        filename: String,
        generatedAt: Date,
        qrTargetUrl: String
    },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "approved"
    },

    geometry: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        },
    },

    category: {
        type: String,
        enum: [
            "Trending",
            "Rooms",
            "Iconic Citys",
            "Mountain",
            "Castles",
            "Amazing Pools",
            "Camping",
            "Farms",
            "Arctic",
            "Domes",
            "Boats"
        ]
    }
});

// Middleware: Delete reviews when a listing is deleted
listingSchema.post('findOneAndDelete', async function (listing) {
    if (listing) {
        await Review.deleteMany({
            _id: { $in: listing.reviews }
        });
    }
});

// Index for Text Search
listingSchema.index(
    { title: "text", description: "text", location: "text", country: "text" },
    { weights: { title: 5, location: 3, description: 1 } }
);

// ✅ UPGRADE: Geospatial Index (Required for Map Tracking & Nearby Listings)
listingSchema.index({ geometry: '2dsphere' });

const Listing = mongoose.model('Listing', listingSchema);
module.exports = Listing;
