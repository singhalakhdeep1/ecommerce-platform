import { Router } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { z } from 'zod';
import { Order, OrderEvent, OrderItem, PaymentTransaction, User } from '../models';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../models/Order';
import { authorize, protect } from '../middleware/auth';
import { idempotent } from '../middleware/idempotency';
import { s, validate } from '../middleware/validate';
import { cancelOrder, checkout, getOwnedOrder, placeOrder, tracking, updateStatus } from '../services/commerce/orderService';
import { CARRIERS, SERVICE_TYPES } from '../services/commerce/shipping';
import { ORDER_TYPES } from '../services/patterns/orderFactory';
import { Repository } from '../services/repository/repository';
import { asyncHandler } from '../utils/asyncHandler';

export const placeOrderSchema = z.object({
  shippingAddress: s.address,
  billingAddress: s.address.optional(),
  paymentMethod: z.enum(['card', 'paypal']).default('card'),
  shippingProvider: z.enum(Object.keys(CARRIERS) as [string, ...string[]]).default('usps'),
  shippingService: z.enum(SERVICE_TYPES as [string, ...string[]]).optional(),
  discountCode: z.string().trim().max(50).optional(),
  orderType: z.enum(ORDER_TYPES as [string, ...string[]]).default('standard'),
  notes: z.string().max(1000).optional(),
});

function placeInput(req: Parameters<Parameters<typeof asyncHandler>[0]>[0]) {
  return {
    ...req.body,
    user: req.user!,
    idempotencyKey: req.header('Idempotency-Key') ?? null,
    ip: req.ip ?? 'unknown',
    userAgent: req.header('User-Agent') ?? 'unknown',
  };
}

const router = Router();
router.use(protect);

/**
 * Customers see their own orders. Admins pass ?all=true to see every order, with status / payment /
 * fraud / search filters (order number or customer email).
 */
router.get(
  '/',
  validate(
    z.object({
      page: s.page,
      limit: s.limit(100, 20),
      all: s.bool.optional(),
      status: z.enum(ORDER_STATUSES).optional(),
      paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
      flagged: s.bool.optional(),
      q: z.string().trim().max(100).optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; all?: boolean; status?: string; paymentStatus?: string; flagged?: boolean; q?: string };
    const adminView = req.user!.role === 'admin' && q.all;
    const where: Record<string | symbol, unknown> = adminView ? {} : { userId: req.user!.id };
    if (q.status) where.status = q.status;
    if (q.paymentStatus) where.paymentStatus = q.paymentStatus;
    if (q.flagged !== undefined) where.fraudFlag = q.flagged;
    if (adminView && q.q) where[Op.or] = [{ orderNumber: { [Op.iLike]: `%${q.q}%` } }, { '$user.email$': { [Op.iLike]: `%${q.q}%` } }];
    const page = await new Repository(Order).paginate(q.page, q.limit, {
      where: where as WhereOptions,
      include: [
        { model: OrderItem, as: 'items' },
        ...(adminView ? [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }] : []),
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json({ success: true, data: page.items, pagination: page.pagination });
  }),
);

/** Places an order from the cart (payment is started separately, see /api/payments or /api/checkout). */
router.post(
  '/',
  idempotent('orders'),
  validate(placeOrderSchema),
  asyncHandler(async (req, res) => {
    const order = await placeOrder(placeInput(req));
    const full = await Order.findByPk(order.id, { include: [{ model: OrderItem, as: 'items' }] });
    res.status(201).json({ success: true, data: full });
  }),
);

router.get(
  '/:id',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    await getOwnedOrder(req.params.id, req.user!);
    const order = await Order.findByPk(req.params.id, {
      include: [
        { model: OrderItem, as: 'items' },
        { model: OrderEvent, as: 'events', separate: true, order: [['createdAt', 'ASC']] },
        { model: PaymentTransaction, as: 'transactions', separate: true, order: [['createdAt', 'ASC']] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
      ],
    });
    res.json({ success: true, data: order });
  }),
);

router.get(
  '/:id/track',
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const order = await getOwnedOrder(req.params.id, req.user!);
    res.json({ success: true, data: await tracking(order) });
  }),
);

router.post(
  '/:id/cancel',
  validate(s.idParam, 'params'),
  validate(z.object({ reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const order = await getOwnedOrder(req.params.id, req.user!);
    const cancelled = await cancelOrder(order, req.user!, req.body.reason ?? (req.user!.role === 'admin' ? 'Cancelled by admin' : 'Cancelled by customer'));
    res.json({ success: true, data: cancelled });
  }),
);

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  trackingNumber: z.string().trim().max(64).optional(),
  shippingProvider: z.enum(Object.keys(CARRIERS) as [string, ...string[]]).optional(),
  createLabel: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

const setStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await updateStatus(req.params.id, req.body, req.user!) });
});
router.patch('/:id/status', authorize('admin'), validate(s.idParam, 'params'), validate(statusSchema), setStatus);
router.put('/:id/status', authorize('admin'), validate(s.idParam, 'params'), validate(statusSchema), setStatus);

export default router;

/** POST /api/checkout: order + payment session in one call (checkout saga). */
export const checkoutRouter = Router();
checkoutRouter.post(
  '/',
  protect,
  idempotent('checkout'),
  validate(placeOrderSchema),
  asyncHandler(async (req, res) => {
    const result = await checkout(placeInput(req));
    res.status(201).json({ success: true, data: { order: result.order, payment: result.payment, sagaId: result.sagaId } });
  }),
);
