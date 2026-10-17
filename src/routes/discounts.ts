import { Router } from 'express';
import { z } from 'zod';
import { Discount, DiscountRedemption } from '../models';
import { adminOnly, optionalAuth } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { findCart } from '../services/commerce/cartService';
import { evaluateDiscount, PricedLine } from '../services/commerce/discountService';
import { Category, Product } from '../models';
import { Repository } from '../services/repository/repository';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const discountSchema = z
  .object({
    code: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, - and _ only'),
    type: z.enum(['percentage', 'fixed', 'free_shipping']),
    value: s.money.default(0),
    description: z.string().max(500).nullable().optional(),
    minimumPurchase: s.money.default(0),
    maxDiscount: s.money.nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    userLimit: z.number().int().min(1).default(1),
    applicableProducts: z.array(s.uuid).default([]),
    applicableCategories: z.array(s.uuid).default([]),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.endDate > d.startDate, { message: 'endDate must be after startDate', path: ['endDate'] })
  .refine((d) => d.type !== 'percentage' || (d.value > 0 && d.value <= 100), { message: 'Percentage must be between 0 and 100', path: ['value'] });

/**
 * Checks a code against the shopper's current cart (signed-in or guest via X-Cart-Token), or against
 * an explicit list of items for callers without a cart.
 */
router.post(
  '/validate',
  optionalAuth,
  validate(
    z.object({
      code: z.string().trim().min(1).max(50),
      items: z.array(z.object({ productId: s.uuid, quantity: z.number().int().min(1), price: s.money.optional() })).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    let lines: PricedLine[];
    if (req.body.items?.length) {
      const products = await Product.findAll({ where: { id: req.body.items.map((i: { productId: string }) => i.productId) } });
      const categories = await Category.findAll({ where: { id: products.map((p) => p.categoryId).filter(Boolean) as string[] } });
      lines = req.body.items.map((i: { productId: string; quantity: number }) => {
        const p = products.find((x) => x.id === i.productId);
        if (!p) throw AppError.badRequest(`Unknown product ${i.productId}`);
        return { productId: p.id, categoryId: p.categoryId, parentCategoryId: categories.find((c) => c.id === p.categoryId)?.parentId ?? null, lineTotal: Number(p.price) * i.quantity };
      });
    } else {
      const token = req.header('X-Cart-Token');
      const cart = await findCart({ user: req.user ?? null, token: token ?? null });
      if (!cart || cart.items.length === 0) throw AppError.badRequest('Cart is empty');
      const categories = await Category.findAll({ where: { id: cart.items.map((i) => i.product.categoryId).filter(Boolean) as string[] } });
      lines = cart.items.map((i) => ({
        productId: i.productId,
        categoryId: i.product.categoryId,
        parentCategoryId: categories.find((c) => c.id === i.product.categoryId)?.parentId ?? null,
        lineTotal: Number(i.price) * i.quantity,
      }));
    }
    const result = await evaluateDiscount(req.body.code, req.user?.id ?? null, lines);
    const d = result.discount;
    res.json({
      success: true,
      data: {
        discount: { id: d.id, code: d.code, type: d.type, value: Number(d.value), description: d.description },
        discountAmount: result.amount,
        freeShipping: result.freeShipping,
        eligibleSubtotal: result.eligibleSubtotal,
        applicable: true,
      },
    });
  }),
);

router.use(...adminOnly);

router.get(
  '/',
  validate(z.object({ page: s.page, limit: s.limit(100, 20), active: s.bool.optional() }), 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; active?: boolean };
    const page = await new Repository(Discount).paginate(q.page, q.limit, { where: q.active === undefined ? {} : { isActive: q.active }, order: [['createdAt', 'DESC']] });
    res.json({ success: true, data: { discounts: page.items, pagination: page.pagination } });
  }),
);

router.get(
  '/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const discount = await Discount.findByPk(req.params.id);
    if (!discount) throw AppError.notFound('Discount not found');
    const redemptions = await DiscountRedemption.findAll({ where: { discountId: discount.id }, order: [['createdAt', 'DESC']], limit: 50 });
    res.json({ success: true, data: { ...discount.toJSON(), redemptions } });
  }),
);

router.post(
  '/',
  validate(discountSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await Discount.create(req.body) });
  }),
);

router.put(
  '/:id',
  validate(s.idParam, 'params'),
  validate(discountSchema.innerType().innerType().partial()),
  asyncHandler(async (req, res) => {
    const discount = await Discount.findByPk(req.params.id);
    if (!discount) throw AppError.notFound('Discount not found');
    const start = req.body.startDate ?? discount.startDate;
    const end = req.body.endDate ?? discount.endDate;
    if (end <= start) throw AppError.badRequest('endDate must be after startDate');
    await discount.update(req.body);
    res.json({ success: true, data: discount });
  }),
);

router.delete(
  '/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const discount = await Discount.findByPk(req.params.id);
    if (!discount) throw AppError.notFound('Discount not found');
    // Codes that were used are deactivated instead of deleted, so order history keeps its reference.
    if (discount.usageCount > 0) {
      await discount.update({ isActive: false });
      return void res.json({ success: true, message: 'Discount was used before, so it was deactivated instead of deleted' });
    }
    await discount.destroy();
    res.json({ success: true, message: 'Discount deleted' });
  }),
);

export default router;
