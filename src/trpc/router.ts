import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Category, Order, OrderItem, Product, User } from '../models';
import { userFromToken } from '../middleware/auth';
import { addItem, getCart, removeItem, updateItem } from '../services/commerce/cartService';
import { tracking } from '../services/commerce/orderService';
import { AppError } from '../utils/appError';

/** tRPC API at /trpc for TypeScript clients (types come from `AppRouter`). */
export async function createContext({ req }: CreateExpressContextOptions): Promise<{ user: User | null }> {
  const header = req.headers.authorization;
  return { user: header?.startsWith('Bearer ') ? await userFromToken(header.slice(7)) : null };
}

const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create({
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    return { ...shape, data: { ...shape.data, appStatus: cause instanceof AppError ? cause.statusCode : undefined } };
  },
});

/** Maps AppError statuses to tRPC codes so clients get NOT_FOUND / CONFLICT instead of INTERNAL. */
const errorMapping = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof AppError) {
    const status = result.error.cause.statusCode;
    const code = status === 400 ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'INTERNAL_SERVER_ERROR';
    throw new TRPCError({ code, message: result.error.cause.message, cause: result.error.cause });
  }
  return result;
});

const publicProcedure = t.procedure.use(errorMapping);
const authed = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in required' });
  return next({ ctx: { user: ctx.user } });
});
const admin = authed.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admins only' });
  return next();
});

export const appRouter = t.router({
  product: t.router({
    list: publicProcedure
      .input(z.object({ search: z.string().max(200).optional(), categoryId: z.string().uuid().optional(), page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(100).default(12) }).default({}))
      .query(async ({ input }) => {
        const where: Record<string | symbol, unknown> = { published: true };
        if (input.categoryId) where.categoryId = input.categoryId;
        if (input.search) where.name = { [Op.iLike]: `%${input.search.replace(/[%_\\]/g, '\\$&')}%` };
        const { count, rows } = await Product.findAndCountAll({ where, limit: input.limit, offset: (input.page - 1) * input.limit, order: [['createdAt', 'DESC']] });
        return { items: rows.map((r) => r.toJSON()), total: count, page: input.page, pages: Math.ceil(count / input.limit) };
      }),
    byId: publicProcedure.input(z.string().uuid()).query(async ({ input }) => {
      const product = await Product.findOne({ where: { id: input, published: true }, include: [{ model: Category, as: 'category' }] });
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      return product.toJSON();
    }),
    setStock: admin.input(z.object({ id: z.string().uuid(), stock: z.number().int().min(0) })).mutation(async ({ input }) => {
      const product = await Product.findByPk(input.id);
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      await product.update({ stock: input.stock });
      return { id: product.id, stock: product.stock };
    }),
  }),
  category: t.router({
    list: publicProcedure.query(async () => (await Category.findAll({ where: { published: true }, order: [['sortOrder', 'ASC']] })).map((c) => c.toJSON())),
  }),
  cart: t.router({
    get: authed.query(({ ctx }) => getCart({ user: ctx.user })),
    add: authed
      .input(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99).default(1), variantName: z.string().max(120).default('') }))
      .mutation(({ ctx, input }) => addItem({ user: ctx.user }, input.productId, input.quantity, input.variantName)),
    update: authed.input(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).mutation(({ ctx, input }) => updateItem({ user: ctx.user }, input.itemId, input.quantity)),
    remove: authed.input(z.object({ itemId: z.string().uuid() })).mutation(({ ctx, input }) => removeItem({ user: ctx.user }, input.itemId)),
  }),
  order: t.router({
    mine: authed.input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).default({})).query(async ({ ctx, input }) =>
      (await Order.findAll({ where: { userId: ctx.user.id }, include: [{ model: OrderItem, as: 'items' }], order: [['createdAt', 'DESC']], limit: input.limit })).map((o) => o.toJSON()),
    ),
    track: authed.input(z.string().uuid()).query(async ({ ctx, input }) => {
      const order = await Order.findByPk(input);
      if (!order || (order.userId !== ctx.user.id && ctx.user.role !== 'admin')) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      return tracking(order);
    }),
  }),
  user: t.router({
    me: authed.query(({ ctx }) => ctx.user.toPublic()),
  }),
});

export type AppRouter = typeof appRouter;
