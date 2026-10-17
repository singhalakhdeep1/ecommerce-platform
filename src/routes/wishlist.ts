import { Router } from 'express';
import { z } from 'zod';
import { Product, Wishlist } from '../models';
import { protect } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { trackSafe } from '../services/analytics/analyticsService';
import { addItem } from '../services/commerce/cartService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
router.use(protect);

const PRODUCT_FIELDS = ['id', 'name', 'slug', 'price', 'comparePrice', 'images', 'stock', 'variants', 'rating'];
const withProduct = { include: [{ model: Product, as: 'product', attributes: PRODUCT_FIELDS }] };

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Wishlist.findAll({ where: { userId: req.user!.id }, ...withProduct, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: items });
  }),
);

router.post(
  '/',
  validate(z.object({ productId: s.uuid, notes: z.string().max(500).optional(), priority: z.enum(['low', 'medium', 'high']).default('medium') })),
  asyncHandler(async (req, res) => {
    if (!(await Product.findByPk(req.body.productId))) throw AppError.notFound('Product not found');
    if (await Wishlist.findOne({ where: { userId: req.user!.id, productId: req.body.productId } })) throw AppError.conflict('Product already in wishlist');
    const item = await Wishlist.create({ ...req.body, userId: req.user!.id });
    trackSafe({ userId: req.user!.id, eventType: 'wishlist_add', eventData: { productId: req.body.productId } });
    res.status(201).json({ success: true, data: await Wishlist.findByPk(item.id, withProduct) });
  }),
);

router.put(
  '/:id',
  validate(s.idParam, 'params'),
  validate(z.object({ notes: z.string().max(500).nullable().optional(), priority: z.enum(['low', 'medium', 'high']).optional() })),
  asyncHandler(async (req, res) => {
    const item = await Wishlist.findOne({ where: { id: req.params.id, userId: req.user!.id } });
    if (!item) throw AppError.notFound('Wishlist item not found');
    await item.update(req.body);
    res.json({ success: true, data: await Wishlist.findByPk(item.id, withProduct) });
  }),
);

router.delete(
  '/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const removed = await Wishlist.destroy({ where: { id: req.params.id, userId: req.user!.id } });
    if (!removed) throw AppError.notFound('Wishlist item not found');
    trackSafe({ userId: req.user!.id, eventType: 'wishlist_remove', eventData: { wishlistId: req.params.id } });
    res.json({ success: true, message: 'Item removed from wishlist' });
  }),
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await Wishlist.destroy({ where: { userId: req.user!.id } });
    res.json({ success: true, message: 'Wishlist cleared' });
  }),
);

/** Adds one unit to the cart (first variant if the product has options) and removes it from the wishlist. */
router.post(
  '/:id/move-to-cart',
  validate(s.idParam, 'params'),
  validate(z.object({ variantName: z.string().max(120).optional(), quantity: z.number().int().min(1).max(99).default(1) })),
  asyncHandler(async (req, res) => {
    const item = await Wishlist.findOne({ where: { id: req.params.id, userId: req.user!.id }, include: [{ model: Product, as: 'product' }] });
    const product = (item as unknown as { product?: Product } | null)?.product;
    if (!item || !product) throw AppError.notFound('Wishlist item not found');
    const variantName = req.body.variantName ?? (product.variants[0]?.name ?? '');
    const cart = await addItem({ user: req.user! }, product.id, req.body.quantity, variantName);
    await item.destroy();
    res.json({ success: true, message: 'Item moved to cart', data: cart });
  }),
);

export default router;
