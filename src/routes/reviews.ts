import { Router } from 'express';
import { Op, Transaction } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { Order, OrderItem, Product, Review } from '../models';
import { protect } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { trackSafe } from '../services/analytics/analyticsService';
import { cache } from '../services/caching/distributedCacheService';
import { getKvStore } from '../services/infra/kvStore';
import { dispatch } from '../services/notifications/webhookDispatcher';
import { syncProduct } from '../services/search/searchService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const reviewSchema = z.object({
  productId: s.uuid,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(150),
  comment: z.string().trim().min(5).max(5000),
});

/** Recomputes the product's average rating and review count (in the caller's transaction). */
async function refreshRating(productId: string, transaction: Transaction): Promise<void> {
  const [row] = (await Review.findAll({
    where: { productId },
    attributes: [
      [sequelize.fn('COALESCE', sequelize.fn('AVG', sequelize.col('rating')), 0), 'avg'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    raw: true,
    transaction,
  })) as unknown as Array<{ avg: string; count: string }>;
  await Product.update({ rating: Math.round(Number(row.avg) * 100) / 100, numReviews: Number(row.count) }, { where: { id: productId }, transaction });
}

/** A review is "verified" when the author has a paid order containing the product. */
async function hasPurchased(userId: string, productId: string): Promise<boolean> {
  const count = await OrderItem.count({
    where: { productId },
    include: [{ model: Order, as: 'order', required: true, where: { userId, paymentStatus: { [Op.in]: ['paid', 'refunded'] } } }],
  });
  return count > 0;
}

async function afterChange(productId: string) {
  await cache.invalidatePattern(`products:*`);
  await syncProduct(await Product.findByPk(productId));
}

router.post(
  '/',
  protect,
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.body.productId);
    if (!product) throw AppError.notFound('Product not found');
    const verified = await hasPurchased(req.user!.id, product.id);
    if (process.env.REVIEWS_REQUIRE_PURCHASE === 'true' && !verified) throw AppError.forbidden('Only customers who bought this product can review it');
    const review = await sequelize.transaction(async (transaction) => {
      const created = await Review.create({ ...req.body, userId: req.user!.id, verified }, { transaction });
      await refreshRating(product.id, transaction);
      return created;
    });
    await afterChange(product.id);
    trackSafe({ userId: req.user!.id, eventType: 'review_submit', eventData: { productId: product.id, rating: review.rating } });
    void dispatch('review.created', { reviewId: review.id, productId: product.id, rating: review.rating, verified });
    res.status(201).json({ success: true, data: review });
  }),
);

router.put(
  '/:id',
  protect,
  validate(s.idParam, 'params'),
  validate(reviewSchema.omit({ productId: true }).partial()),
  asyncHandler(async (req, res) => {
    const review = await Review.findByPk(req.params.id);
    if (!review || review.userId !== req.user!.id) throw AppError.notFound('Review not found');
    await sequelize.transaction(async (transaction) => {
      await review.update(req.body, { transaction });
      await refreshRating(review.productId, transaction);
    });
    await afterChange(review.productId);
    res.json({ success: true, data: review });
  }),
);

router.delete(
  '/:id',
  protect,
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const review = await Review.findByPk(req.params.id);
    if (!review || (review.userId !== req.user!.id && req.user!.role !== 'admin')) throw AppError.notFound('Review not found');
    await sequelize.transaction(async (transaction) => {
      await review.destroy({ transaction });
      await refreshRating(review.productId, transaction);
    });
    await afterChange(review.productId);
    res.json({ success: true, message: 'Review deleted' });
  }),
);

/** One helpful vote per user per review (tracked in the shared store). */
router.post(
  '/:id/helpful',
  protect,
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const review = await Review.findByPk(req.params.id);
    if (!review) throw AppError.notFound('Review not found');
    if (review.userId === req.user!.id) throw AppError.badRequest('You cannot vote on your own review');
    const first = await getKvStore().setIfAbsent(`review:helpful:${review.id}:${req.user!.id}`, '1', 365 * 86_400);
    if (first) await review.increment('helpful');
    await review.reload();
    res.json({ success: true, data: { id: review.id, helpful: review.helpful, counted: first } });
  }),
);

export default router;
