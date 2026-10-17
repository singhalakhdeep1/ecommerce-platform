import { Router } from 'express';
import { Op, WhereOptions } from 'sequelize';
import { z } from 'zod';
import { Category, Product, Review, User } from '../models';
import { adminOnly, optionalAuth } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { cache } from '../services/caching/distributedCacheService';
import { alertLowStock } from '../services/commerce/orderService';
import { syncProduct } from '../services/search/searchService';
import { Repository } from '../services/repository/repository';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const products = new Repository(Product);

const SORTABLE = ['createdAt', 'price', 'name', 'rating', 'numReviews', 'stock'] as const;

const listSchema = z.object({
  page: s.page,
  limit: s.limit(100, 12),
  category: z.string().max(150).optional(),
  minPrice: s.money.optional(),
  maxPrice: s.money.optional(),
  search: z.string().trim().max(200).optional(),
  sortBy: z.enum(SORTABLE).default('createdAt'),
  order: z.preprocess((v) => (typeof v === 'string' ? v.toUpperCase() : v), z.enum(['ASC', 'DESC'])).default('DESC'),
  featured: s.bool.optional(),
  inStock: s.bool.optional(),
  tag: z.string().max(50).optional(),
  includeUnpublished: s.bool.optional(),
});

const variantSchema = z.object({ name: z.string().trim().min(1).max(120), price: s.money.optional(), quantity: z.number().int().min(0).optional(), sku: z.string().max(64).optional() });

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().min(1).max(10_000),
  price: s.money,
  comparePrice: s.money.nullable().optional(),
  stock: z.number().int().min(0).default(0),
  sku: z.string().trim().min(2).max(64),
  barcode: z.string().max(64).nullable().optional(),
  images: z.array(z.string().url().max(2048)).max(20).default([]),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
  specifications: z.record(z.union([z.string(), z.number()])).default({}),
  variants: z.array(variantSchema).max(50).default([]),
  lowStockThreshold: z.number().int().min(0).default(10),
  weight: z.number().min(0).nullable().optional(),
  dimensions: z.object({ length: z.number().nullable(), width: z.number().nullable(), height: z.number().nullable() }).optional(),
  tags: z.array(z.string().trim().toLowerCase().max(50)).max(30).default([]),
  seoTitle: z.string().max(255).nullable().optional(),
  seoDescription: z.string().max(1000).nullable().optional(),
  categoryId: s.uuid.nullable().optional(),
});

async function categoryIds(ref: string): Promise<string[]> {
  const isUuid = z.string().uuid().safeParse(ref).success;
  const category = await Category.findOne({ where: isUuid ? { id: ref } : { slug: ref } });
  if (!category) return [];
  const children = await Category.findAll({ where: { parentId: category.id }, attributes: ['id'] });
  return [category.id, ...children.map((c) => c.id)];
}

router.get(
  '/',
  optionalAuth,
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const admin = req.user?.role === 'admin' && q.includeUnpublished;
    const cacheKey = `products:list:${JSON.stringify({ ...q, admin })}`;
    const data = await cache.getOrSet(
      cacheKey,
      async () => {
        const where: Record<string | symbol, unknown> = admin ? {} : { published: true };
        if (q.category) where.categoryId = { [Op.in]: await categoryIds(q.category) };
        if (q.featured !== undefined) where.featured = q.featured;
        if (q.inStock) where.stock = { [Op.gt]: 0 };
        if (q.tag) where.tags = { [Op.contains]: [q.tag.toLowerCase()] };
        if (q.minPrice !== undefined || q.maxPrice !== undefined) {
          where.price = { ...(q.minPrice !== undefined ? { [Op.gte]: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { [Op.lte]: q.maxPrice } : {}) };
        }
        if (q.search) {
          // Full-text match (tsvector from migration 002) or a prefix match on the name for partial words.
          where[Op.or] = [
            Product.sequelize!.literal(`search_vector @@ websearch_to_tsquery('english', ${Product.sequelize!.escape(q.search)})`),
            { name: { [Op.iLike]: `%${q.search.replace(/[%_\\]/g, '\\$&')}%` } },
          ];
        }
        const page = await products.paginate(q.page, q.limit, {
          where: where as WhereOptions,
          include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }],
          order: [[q.sortBy, q.order], ['id', 'ASC']],
        });
        return { products: page.items.map((p) => p.toJSON()), pagination: page.pagination };
      },
      60,
    );
    res.json({ success: true, data });
  }),
);

router.get(
  '/:idOrSlug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const ref = req.params.idOrSlug;
    const isUuid = z.string().uuid().safeParse(ref).success;
    const data = await cache.getOrSet(`products:detail:${ref}`, async () => {
      const product = await Product.findOne({
        where: isUuid ? { id: ref } : { slug: ref },
        include: [
          { model: Category, as: 'category', attributes: ['id', 'name', 'slug', 'parentId'] },
          { model: Review, as: 'reviews', separate: true, limit: 20, order: [['createdAt', 'DESC']], include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }] },
        ],
      });
      if (!product) return null;
      const related = product.categoryId
        ? await Product.findAll({ where: { categoryId: product.categoryId, published: true, id: { [Op.ne]: product.id } }, limit: 4, order: [['rating', 'DESC']] })
        : [];
      return { ...product.toJSON(), related: related.map((r) => r.toJSON()) };
    }, 60);
    if (!data || (!(data as { published: boolean }).published && req.user?.role !== 'admin')) throw AppError.notFound('Product not found');
    res.json({ success: true, data });
  }),
);

router.get(
  '/:id/reviews',
  validate(s.idParam, 'params'),
  validate(z.object({ page: s.page, limit: s.limit(50, 10), sort: z.enum(['newest', 'helpful', 'rating']).default('newest') }), 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; sort: 'newest' | 'helpful' | 'rating' };
    const order = q.sort === 'helpful' ? [['helpful', 'DESC']] : q.sort === 'rating' ? [['rating', 'DESC']] : [['createdAt', 'DESC']];
    const page = await new Repository(Review).paginate(q.page, q.limit, {
      where: { productId: req.params.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'avatar'] }],
      order: order as [string, string][],
    });
    const distribution = await Review.count({ where: { productId: req.params.id }, group: ['rating'] });
    res.json({ success: true, data: { reviews: page.items, pagination: page.pagination, distribution } });
  }),
);

async function invalidate(product: Product | null, deletedId?: string) {
  await cache.invalidatePattern('products:*');
  await cache.invalidatePattern('categories:*');
  await syncProduct(product, deletedId);
}

router.post(
  '/',
  ...adminOnly,
  validate(productSchema),
  asyncHandler(async (req, res) => {
    const product = await Product.create({ ...req.body, sellerId: req.user!.id });
    await invalidate(product);
    res.status(201).json({ success: true, data: product });
  }),
);

router.put(
  '/:id',
  ...adminOnly,
  validate(s.idParam, 'params'),
  validate(productSchema.partial()),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) throw AppError.notFound('Product not found');
    await product.update(req.body);
    await invalidate(product);
    res.json({ success: true, data: product });
  }),
);

router.delete(
  '/:id',
  ...adminOnly,
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) throw AppError.notFound('Product not found');
    // Order history keeps a snapshot, and order_items.product_id is SET NULL on delete.
    await product.destroy();
    await invalidate(null, req.params.id);
    res.json({ success: true, message: 'Product deleted' });
  }),
);

router.patch(
  '/:id/inventory',
  ...adminOnly,
  validate(s.idParam, 'params'),
  validate(
    z.union([
      z.object({ stock: z.number().int().min(0) }),
      z.object({ adjustment: z.number().int(), reason: z.string().max(200).optional() }),
    ]),
  ),
  asyncHandler(async (req, res) => {
    const product = await Product.findByPk(req.params.id);
    if (!product) throw AppError.notFound('Product not found');
    const next = 'stock' in req.body ? req.body.stock : product.stock + req.body.adjustment;
    if (next < 0) throw AppError.badRequest(`Adjustment would make stock negative (current ${product.stock})`);
    await product.update({ stock: next });
    await invalidate(product);
    await alertLowStock([product.id]);
    res.json({ success: true, data: { id: product.id, sku: product.sku, stock: product.stock, lowStock: product.stock <= product.lowStockThreshold } });
  }),
);

export default router;
