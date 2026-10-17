import { Router } from 'express';
import { QueryTypes } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../config/database';
import { Category } from '../models';
import { adminOnly } from '../middleware/auth';
import { s, validate } from '../middleware/validate';
import { cache } from '../services/caching/distributedCacheService';
import { AppError } from '../utils/appError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).nullable().optional(),
  image: z.string().url().max(2048).nullable().optional(),
  parentId: s.uuid.nullable().optional(),
  sortOrder: z.number().int().default(0),
  published: z.boolean().default(true),
});

interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  productCount: number;
  children: CategoryNode[];
}

/** Whole category tree with published product counts (a parent's count includes its children). */
async function tree(): Promise<CategoryNode[]> {
  const rows = await sequelize.query<Omit<CategoryNode, 'children' | 'productCount'> & { productCount: string }>(
    `SELECT c.id, c.name, c.slug, c.description, c.image, c.parent_id AS "parentId",
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.published) AS "productCount"
       FROM categories c WHERE c.published ORDER BY c.sort_order, c.name`,
    { type: QueryTypes.SELECT },
  );
  const nodes = new Map<string, CategoryNode>(rows.map((r) => [r.id, { ...r, productCount: Number(r.productCount), children: [] }]));
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  for (const root of roots) root.productCount += root.children.reduce((sum, c) => sum + c.productCount, 0);
  return roots;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const roots = await cache.getOrSet('categories:tree', tree, 300);
    if (req.query.flat === 'true') {
      const flat = roots.flatMap((r) => [{ ...r, children: undefined }, ...r.children.map((c) => ({ ...c, children: undefined, parentName: r.name }))]);
      return void res.json({ success: true, data: flat });
    }
    res.json({ success: true, data: roots });
  }),
);

router.get(
  '/:idOrSlug',
  asyncHandler(async (req, res) => {
    const ref = req.params.idOrSlug;
    const isUuid = z.string().uuid().safeParse(ref).success;
    const category = await Category.findOne({
      where: isUuid ? { id: ref } : { slug: ref },
      include: [
        { model: Category, as: 'children' },
        { model: Category, as: 'parent', attributes: ['id', 'name', 'slug'] },
      ],
    });
    if (!category) throw AppError.notFound('Category not found');
    res.json({ success: true, data: category });
  }),
);

async function assertParent(parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw AppError.badRequest('A category cannot be its own parent');
  const parent = await Category.findByPk(parentId);
  if (!parent) throw AppError.badRequest('Parent category not found');
  // The storefront supports two levels (department > category).
  if (parent.parentId) throw AppError.badRequest('Categories can only be nested one level deep');
}

router.post(
  '/',
  ...adminOnly,
  validate(categorySchema),
  asyncHandler(async (req, res) => {
    await assertParent(req.body.parentId);
    const category = await Category.create(req.body);
    await cache.invalidatePattern('categories:*');
    res.status(201).json({ success: true, data: category });
  }),
);

router.put(
  '/:id',
  ...adminOnly,
  validate(s.idParam, 'params'),
  validate(categorySchema.partial()),
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.params.id);
    if (!category) throw AppError.notFound('Category not found');
    await assertParent(req.body.parentId, category.id);
    await category.update(req.body);
    await cache.invalidatePattern('categories:*');
    await cache.invalidatePattern('products:*');
    res.json({ success: true, data: category });
  }),
);

router.delete(
  '/:id',
  ...adminOnly,
  validate(s.idParam, 'params'),
  asyncHandler(async (req, res) => {
    const category = await Category.findByPk(req.params.id);
    if (!category) throw AppError.notFound('Category not found');
    // Products and child categories are detached (ON DELETE SET NULL), not deleted.
    await category.destroy();
    await cache.invalidatePattern('categories:*');
    await cache.invalidatePattern('products:*');
    res.json({ success: true, message: 'Category deleted' });
  }),
);

export default router;
