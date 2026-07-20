const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get all products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *       - in: query
 *         name: limit
 *       - in: query
 *         name: category
 *       - in: query
 *         name: search
 */
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProduct);

// Protected routes (Admin only)
router.post('/', protect, authorize('admin'), productController.createProduct);
router.put('/:id', protect, authorize('admin'), productController.updateProduct);
router.delete('/:id', protect, authorize('admin'), productController.deleteProduct);
router.patch('/:id/inventory', protect, authorize('admin'), productController.updateInventory);

module.exports = router;
