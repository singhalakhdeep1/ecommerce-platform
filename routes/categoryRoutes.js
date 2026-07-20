const express = require('express');
const router = express.Router();
const { Category } = require('../models');
const asyncHandler = require('../utils/asyncHandler');

router.get('/', asyncHandler(async (req, res) => {
    const categories = await Category.findAll({
        where: { published: true },
        include: ['products']
    });

    res.json({ success: true, data: categories });
}));

router.post('/', asyncHandler(async (req, res) => {
    const category = await Category.create(req.body);
    res.status(201).json({ success: true, data: category });
}));

module.exports = router;
