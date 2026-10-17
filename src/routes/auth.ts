import { Router } from 'express';
import { z } from 'zod';
import { Order, OrderItem, Review, Wishlist } from '../models';
import { User } from '../models/User';
import { protect, signToken } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { s, validate } from '../middleware/validate';
import { trackSafe } from '../services/analytics/analyticsService';
import { mergeGuestCart } from '../services/commerce/cartService';
import { structuredLog } from '../services/logging/structuredLoggingService';
import { sendEmail, templates } from '../services/notifications/email';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password needs a letter')
  .regex(/\d/, 'Password needs a digit');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password,
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  avatar: z.string().url().max(500).nullable().optional(),
  address: s.address.partial().nullable().optional(),
});

/** Guest carts follow the shopper into their account. */
const cartToken = (header: string | undefined) => (header && /^[a-f0-9]{48}$/.test(header) ? header : null);

router.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    if (await User.findOne({ where: { email: req.body.email } })) throw AppError.conflict('An account with this email already exists');
    const user = await User.create({ name: req.body.name, email: req.body.email, password: req.body.password });
    const mergedItems = await mergeGuestCart(user, cartToken(req.header('X-Cart-Token')));
    structuredLog.logAuditEvent('UserRegistered', `New account ${user.email}`, { userId: user.id });
    trackSafe({ userId: user.id, eventType: 'account_register' });
    void sendEmail({ to: user.email, ...templates.welcome(user.name) });
    res.status(201).json({ success: true, token: signToken(user), data: user.toPublic(), mergedCartItems: mergedItems });
  }),
);

router.post(
  '/login',
  authRateLimit,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user || !(await user.comparePassword(req.body.password))) {
      structuredLog.logAuditEvent('LoginFailed', `Failed login for ${req.body.email}`);
      throw AppError.unauthorized('Invalid email or password');
    }
    if (!user.isActive) throw AppError.forbidden('This account is disabled');
    await user.update({ lastLoginAt: new Date() });
    const mergedItems = await mergeGuestCart(user, cartToken(req.header('X-Cart-Token')));
    structuredLog.logAuditEvent('LoginSucceeded', `Login ${user.email}`, { userId: user.id });
    res.json({ success: true, token: signToken(user), data: user.toPublic(), mergedCartItems: mergedItems });
  }),
);

router.get('/me', protect, (req, res) => {
  res.json({ success: true, data: req.user!.toPublic() });
});

router.put(
  '/me',
  protect,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    await req.user!.update(req.body);
    res.json({ success: true, data: req.user!.toPublic() });
  }),
);

router.put(
  '/password',
  protect,
  authRateLimit,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: password })),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await user.comparePassword(req.body.currentPassword))) throw AppError.badRequest('Current password is incorrect');
    // Bumping the token version signs out every other session.
    await user.update({ password: req.body.newPassword, tokenVersion: user.tokenVersion + 1 });
    structuredLog.logAuditEvent('PasswordChanged', 'Password changed', { userId: user.id });
    res.json({ success: true, token: signToken(user), message: 'Password updated; other sessions were signed out' });
  }),
);

router.post(
  '/logout',
  protect,
  asyncHandler(async (req, res) => {
    await req.user!.update({ tokenVersion: req.user!.tokenVersion + 1 });
    res.json({ success: true, message: 'Signed out from all sessions' });
  }),
);

/** GDPR data portability. */
router.get(
  '/me/export',
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const [orders, reviews, wishlist] = await Promise.all([
      Order.findAll({ where: { userId }, include: [{ model: OrderItem, as: 'items' }], order: [['createdAt', 'DESC']] }),
      Review.findAll({ where: { userId } }),
      Wishlist.findAll({ where: { userId } }),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
    res.json({ exportedAt: new Date(), account: req.user!.toPublic(), orders, reviews, wishlist });
  }),
);

/** GDPR erasure: the account is deactivated and personal data replaced; orders stay for accounting. */
router.delete(
  '/me',
  protect,
  validate(z.object({ password: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!(await user.comparePassword(req.body.password))) throw AppError.badRequest('Password is incorrect');
    if (user.role === 'admin') throw AppError.badRequest('Admin accounts cannot be self-deleted');
    await Wishlist.destroy({ where: { userId: user.id } });
    await user.update({
      name: 'Deleted user',
      email: `deleted-${user.id}@invalid.local`,
      phone: null,
      avatar: null,
      address: null,
      isActive: false,
      tokenVersion: user.tokenVersion + 1,
      password: `${user.id}${Date.now()}`,
    });
    structuredLog.logAuditEvent('AccountDeleted', 'Account erased at user request', { userId: user.id });
    res.json({ success: true, message: 'Your account has been deleted' });
  }),
);

export default router;
