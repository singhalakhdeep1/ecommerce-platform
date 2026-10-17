import { Request } from 'express';
import { buildSchema } from 'graphql';
import { Op } from 'sequelize';
import { Category, Order, OrderItem, Product, Review, User } from '../models';
import { userFromToken } from '../middleware/auth';
import { addItem, getCart, removeItem, updateItem } from '../services/commerce/cartService';
import { search } from '../services/search/searchService';
import { AppError } from '../utils/appError';

/** GraphQL API at /graphql (graphql-http). Auth: the same `Authorization: Bearer <jwt>` header as REST. */
export const schema = buildSchema(`
  type Category { id: ID!, name: String!, slug: String!, description: String, parentId: ID }
  type Variant { name: String!, price: Float, quantity: Int, sku: String }
  type Product {
    id: ID!, name: String!, slug: String!, description: String!, price: Float!, comparePrice: Float,
    stock: Int!, sku: String!, images: [String!]!, featured: Boolean!, rating: Float!, numReviews: Int!,
    tags: [String!]!, variants: [Variant!]!, categoryId: ID, category: Category, createdAt: String!
  }
  type ProductPage { items: [Product!]!, total: Int!, page: Int!, pages: Int! }
  type SearchHit { id: ID!, name: String!, slug: String!, price: Float!, stock: Int!, rating: Float!, category: String, image: String }
  type SearchResult { engine: String!, total: Int!, hits: [SearchHit!]! }
  type Review { id: ID!, rating: Int!, title: String!, comment: String!, verified: Boolean!, helpful: Int!, author: String, createdAt: String! }
  type User { id: ID!, name: String!, email: String!, role: String!, createdAt: String! }
  type OrderItem { id: ID!, productId: ID, name: String!, sku: String!, variantName: String!, quantity: Int!, price: Float!, total: Float! }
  type Order {
    id: ID!, orderNumber: String!, status: String!, paymentStatus: String!, orderType: String!,
    subtotal: Float!, tax: Float!, shippingCost: Float!, discount: Float!, totalAmount: Float!, currency: String!,
    trackingNumber: String, createdAt: String!, items: [OrderItem!]!
  }
  type CartProduct { id: ID!, name: String!, slug: String!, price: Float!, stock: Int! }
  type CartItem { id: ID!, productId: ID!, variantName: String!, quantity: Int!, price: Float!, lineTotal: Float!, product: CartProduct }
  type Cart { id: ID, items: [CartItem!]!, itemCount: Int!, subtotal: Float! }

  type Query {
    products(search: String, categoryId: ID, featured: Boolean, page: Int = 1, limit: Int = 12): ProductPage!
    product(id: ID, slug: String): Product
    categories: [Category!]!
    search(q: String!, limit: Int = 10): SearchResult!
    reviews(productId: ID!, limit: Int = 10): [Review!]!
    me: User
    myOrders(limit: Int = 20): [Order!]!
    order(id: ID!): Order
    cart: Cart!
  }

  type Mutation {
    addToCart(productId: ID!, quantity: Int = 1, variantName: String = ""): Cart!
    updateCartItem(itemId: ID!, quantity: Int!): Cart!
    removeCartItem(itemId: ID!): Cart!
    updateProfile(name: String, phone: String): User!
  }
`);

interface Ctx {
  user: User | null;
}

export async function context(req: Request): Promise<Ctx> {
  const header = req.headers.authorization;
  const user = header?.startsWith('Bearer ') ? await userFromToken(header.slice(7)) : null;
  return { user };
}

const requireUser = (ctx: Ctx): User => {
  if (!ctx.user) throw AppError.unauthorized('Sign in required');
  return ctx.user;
};

const iso = (d: Date | string) => new Date(d).toISOString();

function productOut(p: Product & { category?: Category | null }) {
  const json = p.toJSON() as Record<string, unknown>;
  return { ...json, createdAt: iso(p.createdAt), category: p.category ? p.category.toJSON() : null };
}

function orderOut(o: Order) {
  return {
    ...o.toJSON(),
    createdAt: iso(o.createdAt),
    items: (o.items ?? []).map((i: OrderItem) => ({ ...i.toJSON(), name: i.productSnapshot.name, sku: i.productSnapshot.sku })),
  };
}

export const rootValue = {
  products: async (args: { search?: string; categoryId?: string; featured?: boolean; page: number; limit: number }) => {
    const limit = Math.min(Math.max(args.limit, 1), 100);
    const page = Math.max(args.page, 1);
    const where: Record<string | symbol, unknown> = { published: true };
    if (args.categoryId) where.categoryId = args.categoryId;
    if (args.featured !== undefined && args.featured !== null) where.featured = args.featured;
    if (args.search) where.name = { [Op.iLike]: `%${args.search.replace(/[%_\\]/g, '\\$&')}%` };
    const { count, rows } = await Product.findAndCountAll({ where, include: [{ model: Category, as: 'category' }], limit, offset: (page - 1) * limit, order: [['createdAt', 'DESC']] });
    return { items: rows.map(productOut), total: count, page, pages: Math.ceil(count / limit) };
  },
  product: async (args: { id?: string; slug?: string }) => {
    if (!args.id && !args.slug) throw AppError.badRequest('Pass id or slug');
    const p = await Product.findOne({ where: args.id ? { id: args.id, published: true } : { slug: args.slug!, published: true }, include: [{ model: Category, as: 'category' }] });
    return p ? productOut(p) : null;
  },
  categories: async () => (await Category.findAll({ where: { published: true }, order: [['sortOrder', 'ASC']] })).map((c) => c.toJSON()),
  search: async (args: { q: string; limit: number }) => search({ q: args.q, limit: Math.min(args.limit, 50) }),
  reviews: async (args: { productId: string; limit: number }) =>
    (await Review.findAll({ where: { productId: args.productId }, include: [{ model: User, as: 'user', attributes: ['name'] }], order: [['createdAt', 'DESC']], limit: Math.min(args.limit, 50) })).map((r) => ({
      ...r.toJSON(),
      author: (r as unknown as { user?: User }).user?.name ?? null,
      createdAt: iso(r.createdAt),
    })),
  me: (_: unknown, ctx: Ctx) => (ctx.user ? { ...ctx.user.toPublic(), createdAt: iso(ctx.user.createdAt) } : null),
  myOrders: async (args: { limit: number }, ctx: Ctx) => {
    const user = requireUser(ctx);
    const orders = await Order.findAll({ where: { userId: user.id }, include: [{ model: OrderItem, as: 'items' }], order: [['createdAt', 'DESC']], limit: Math.min(args.limit, 100) });
    return orders.map(orderOut);
  },
  order: async (args: { id: string }, ctx: Ctx) => {
    const user = requireUser(ctx);
    const order = await Order.findByPk(args.id, { include: [{ model: OrderItem, as: 'items' }] });
    if (!order || (order.userId !== user.id && user.role !== 'admin')) return null;
    return orderOut(order);
  },
  cart: async (_: unknown, ctx: Ctx) => getCart({ user: requireUser(ctx) }),
  addToCart: async (args: { productId: string; quantity: number; variantName: string }, ctx: Ctx) => addItem({ user: requireUser(ctx) }, args.productId, args.quantity, args.variantName),
  updateCartItem: async (args: { itemId: string; quantity: number }, ctx: Ctx) => updateItem({ user: requireUser(ctx) }, args.itemId, args.quantity),
  removeCartItem: async (args: { itemId: string }, ctx: Ctx) => removeItem({ user: requireUser(ctx) }, args.itemId),
  updateProfile: async (args: { name?: string; phone?: string }, ctx: Ctx) => {
    const user = requireUser(ctx);
    if (args.name !== undefined && (args.name.trim().length < 2 || args.name.length > 100)) throw AppError.badRequest('Name must be 2-100 characters');
    await user.update({ ...(args.name ? { name: args.name.trim() } : {}), ...(args.phone !== undefined ? { phone: args.phone } : {}) });
    return { ...user.toPublic(), createdAt: iso(user.createdAt) };
  },
};
