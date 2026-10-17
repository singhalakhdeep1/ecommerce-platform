import { Request, Router } from 'express';
import { z } from 'zod';
import { optionalAuth } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { trackSafe } from '../services/analytics/analyticsService';
import { CartOwner, addItem, clearCart, getCart, mergeGuestCart, removeItem, updateItem } from '../services/commerce/cartService';
import { quoteCart } from '../services/commerce/orderService';
import { CARRIERS, SERVICE_TYPES } from '../services/commerce/shipping';
import { ORDER_TYPES } from '../services/patterns/orderFactory';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Signed-in shoppers have one cart per account. Guests get a cart token (returned as `cartToken`
 * and in the X-Cart-Token response header) that they send back in the X-Cart-Token request header;
 * at login/registration that guest cart is merged into the account cart.
 */
const router = Router();
router.use(optionalAuth);

function owner(req: Request): CartOwner {
  const token = req.header('X-Cart-Token');
  return { user: req.user ?? null, token: token && /^[a-f0-9]{48}$/.test(token) ? token : null };
}

const addSchema = z.object({ productId: s.uuid, quantity: z.number().int().min(1).max(99).default(1), variantName: z.string().max(120).default('') });

const add = asyncHandler(async (req, res) => {
  const cart = await addItem(owner(req), req.body.productId, req.body.quantity, req.body.variantName);
  if (cart.cartToken) res.setHeader('X-Cart-Token', cart.cartToken);
  trackSafe({ userId: req.user?.id, sessionId: cart.cartToken, eventType: 'add_to_cart', eventData: { productId: req.body.productId, quantity: req.body.quantity } });
  res.status(201).json({ success: true, data: cart });
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getCart(owner(req)) });
  }),
);

router.post('/', validate(addSchema), add);
router.post('/items', validate(addSchema), add);

router.put(
  '/items/:itemId',
  validate(z.object({ itemId: s.uuid }), 'params'),
  validate(z.object({ quantity: z.number().int().min(1).max(99) })),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await updateItem(owner(req), req.params.itemId, req.body.quantity) });
  }),
);

router.delete(
  '/items/:itemId',
  validate(z.object({ itemId: s.uuid }), 'params'),
  asyncHandler(async (req, res) => {
    const cart = await removeItem(owner(req), req.params.itemId);
    trackSafe({ userId: req.user?.id, sessionId: owner(req).token, eventType: 'remove_from_cart', eventData: { itemId: req.params.itemId } });
    res.json({ success: true, data: cart });
  }),
);

router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await clearCart(owner(req));
    res.json({ success: true, message: 'Cart cleared' });
  }),
);

/** Explicit merge for clients that log in before sending the guest token. */
router.post(
  '/merge',
  asyncHandler(async (req, res) => {
    if (!req.user) throw AppError.unauthorized('Sign in to merge a guest cart');
    const merged = await mergeGuestCart(req.user, owner({ ...req, user: undefined } as Request).token);
    res.json({ success: true, data: { merged, cart: await getCart({ user: req.user }) } });
  }),
);

/** Full price breakdown (discount, shipping, tax, total) for the current cart and a destination. */
router.get(
  '/quote',
  validate(
    z.object({
      country: z.string().length(2).optional(),
      state: z.string().max(50).optional(),
      zip: z.string().max(20).optional(),
      shippingProvider: z.enum(Object.keys(CARRIERS) as [string, ...string[]]).optional(),
      shippingService: z.enum(SERVICE_TYPES as [string, ...string[]]).optional(),
      discountCode: z.string().max(50).optional(),
      orderType: z.enum(ORDER_TYPES as [string, ...string[]]).optional(),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const quote = await quoteCart(owner(req), {
      address: q.country ? { country: q.country.toUpperCase(), state: q.state?.toUpperCase(), zip: q.zip } : null,
      shippingProvider: q.shippingProvider,
      shippingService: q.shippingService as never,
      discountCode: q.discountCode,
      orderType: q.orderType as never,
      userId: req.user?.id ?? null,
    });
    res.json({ success: true, data: quote });
  }),
);

export default router;
