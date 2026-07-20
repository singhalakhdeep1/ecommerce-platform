const express = require('express');
const router = express.Router();
const { Review, Product } = require('../models');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.post('/', protect, asyncHandler(async (req, res) => {
    const { productId, rating, title, comment } = req.body;

    const review = await Review.create({
        userId: req.user.id,
        productId,
        rating,
        title,
        comment
    });

    // Update product rating
    const reviews = await Review.findAll({ where: { productId } });
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await Product.update(
        { rating: avgRating, numReviews: reviews.length },
        { where: { id: productId } }
    );

    res.status(201).json({ success: true, data: review });
}));

module.exports = router;
